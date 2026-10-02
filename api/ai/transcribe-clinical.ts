import { getGenAI, parseModelJson } from '../_ai.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: any) {
  const code = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.message || '').toLowerCase();
  return code === 408 || code === 429 || code === 500 || code === 502 || code === 503 || code === 504 ||
    message.includes('timeout') || message.includes('unavailable') || message.includes('high demand') || message.includes('temporarily');
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out.')), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

async function transcribeWithFallback(ai: any, mimeType: string, data: string) {
  const prompt = [
    'Transcribe this clinician recording exactly as spoken.',
    'The clinician may speak Egyptian Arabic, Modern Standard Arabic, English, or mixed Arabic/English with code-switching.',
    'Do not summarize, infer, diagnose, or add facts.',
    'Preserve numbers, units, medication names, doses, anatomy, ECG terminology, laboratory values, abbreviations, dates, and durations exactly.',
    'Use automatic language detection and code-switching.',
    'Return only the verified spoken transcription text.'
  ].join(' ');

  const errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
        config: {
          audioTranscriptionConfig: {
            mode: 'VERBATIM',
            languageCodes: [],
            customVocabulary: [
              'ECG','EKG','STEMI','NSTEMI','troponin','CK-MB','PCI','CABG','stent',
              'AF','RVR','HFrEF','HFpEF','COPD','DVT','PE','ARDS','GCS','RASS','SOFA'
            ]
          }
        }
      }), 45_000);
      const transcript = String(response.text || '').trim();
      if (transcript) return transcript;
      errors.push('gemini-3.5-transcribe: empty response');
      break;
    } catch (error: any) {
      errors.push(String(error?.message || error || 'transcription failed').slice(0, 240));
      if (!isRetryable(error) || attempt === 1) break;
      await sleep(800);
    }
  }

  console.error('Clinical voice transcription failed:', errors.join(' | '));
  return '';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64 : '';
    const field = typeof body?.field === 'string' ? body.field : 'clinical_note';

    if (!audioBase64) return Response.json({ error: 'Recorded clinical audio is required.' }, { status: 400 });

    const match = audioBase64.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return Response.json({ error: 'Unsupported audio format. Supported formats include WebM, AAC, M4A, OGG, WAV and MP3.' }, { status: 400 });
    if (match[2].length > 14_000_000) return Response.json({ error: 'Recorded audio is too large. Please keep the recording shorter.' }, { status: 413 });

    const ai = getGenAI();
    const mimeType = match[1];
    const data = match[2];

    const transcript = await transcribeWithFallback(ai, mimeType, data);
    if (!transcript) {
      return Response.json({ error: 'AI could not transcribe the recording. Please try again.' }, { status: 502 });
    }

    let normalizedEnglish = transcript;
    let sourceLanguage: 'ar' | 'en' | 'mixed' | 'unknown' = 'unknown';
    let confidence: 'low' | 'moderate' | 'high' = 'moderate';
    let warnings: string[] = [];

    try {
      const normalizeResponse = await withTimeout(ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [[
          'You are a medical documentation editor for CardioVault.',
          'Convert the verified clinician transcript into concise professional Medical English appropriate for the requested field.',
          'Preserve meaning exactly. Do not invent, infer, diagnose, add medications, add doses, or add findings.',
          'Preserve every number, unit, drug name, dose, anatomy term, ECG term, laboratory value, date, and abbreviation.',
          'For Egyptian Arabic or mixed Arabic/English, translate only what was said into clear Medical English.',
          'If a word or number is unclear, do not guess; keep the uncertain wording and add a warning.',
          'The result is a documentation draft and must be reviewed by the clinician before saving.',
          'Return ONLY valid JSON with keys: normalizedEnglish, sourceLanguage (ar|en|mixed|unknown), confidence (low|moderate|high), warnings (array).',
          'TARGET FIELD: ' + field,
          'VERIFIED TRANSCRIPT:',
          transcript
        ].join('\n')],
        config: { responseMimeType: 'application/json' }
      }), 30_000);

      const parsed = parseModelJson(String(normalizeResponse.text || ''));
      normalizedEnglish = String(parsed?.normalizedEnglish || transcript).trim() || transcript;
      sourceLanguage = ['ar', 'en', 'mixed', 'unknown'].includes(parsed?.sourceLanguage) ? parsed.sourceLanguage : 'unknown';
      confidence = ['low', 'moderate', 'high'].includes(parsed?.confidence) ? parsed.confidence : 'moderate';
      warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).filter(Boolean) : [];
    } catch (error) {
      console.warn('Clinical voice normalization failed; returning verified transcript:', error);
      warnings = ['Medical-English normalization was unavailable; the verified transcription was returned.'];
    }

    return Response.json({ transcript, normalizedEnglish, sourceLanguage, confidence, warnings });
  } catch (error: any) {
    console.error('Clinical voice transcription error:', error);
    return Response.json({ error: String(error?.message || 'Clinical voice transcription failed.') }, { status: 500 });
  }
}
