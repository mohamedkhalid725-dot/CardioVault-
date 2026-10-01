import { getGenAI } from '../_ai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64 : '';
    const field = typeof body?.field === 'string' ? body.field : 'clinical_note';

    if (!audioBase64) return Response.json({ error: 'Recorded clinical audio is required.' }, { status: 400 });

    const match = audioBase64.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return Response.json({ error: 'Unsupported audio format.' }, { status: 400 });
    if (match[2].length > 14_000_000) return Response.json({ error: 'Recorded audio is too large.' }, { status: 413 });

    const ai = getGenAI();
    const mimeType = match[1];
    const data = match[2];

    let transcript = '';
    let transcriptionError: unknown = null;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [{
          role: 'user',
          parts: [
            { text: [
              'Transcribe the clinician audio exactly as spoken.',
              'The clinician may speak Egyptian Arabic, Modern Standard Arabic, English, or mixed Arabic/English.',
              'Do not summarize, infer, diagnose, or add facts.',
              'Preserve numbers, units, medication names, doses, anatomy, ECG terminology, laboratory values, and abbreviations accurately.',
              'Return only the transcription text.'
            ].join(' ') },
            { inlineData: { mimeType, data } }
          ]
        }]
      });
      transcript = String(response.text || '').trim();
    } catch (error) {
      transcriptionError = error;
    }

    if (!transcript) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{
            role: 'user',
            parts: [
              { text: [
                'Transcribe the clinician audio exactly as spoken.',
                'The clinician may speak Egyptian Arabic, Modern Standard Arabic, English, or mixed Arabic/English.',
                'Do not infer or add clinical facts.',
                'Return only the transcription text.'
              ].join(' ') },
              { inlineData: { mimeType, data } }
            ]
          }]
        });
        transcript = String(response.text || '').trim();
      } catch (error) {
        transcriptionError = error;
      }
    }

    if (!transcript) {
      console.error('Clinical voice transcription failed:', transcriptionError);
      return Response.json({ error: 'AI could not transcribe the recording. Please try again.' }, { status: 502 });
    }

    let normalizedEnglish = transcript;
    let sourceLanguage: 'ar' | 'en' | 'mixed' | 'unknown' = 'unknown';
    let confidence: 'low' | 'moderate' | 'high' = 'moderate';
    let warnings: string[] = [];

    try {
      const normalizeResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [[
          'You are a medical documentation editor.',
          'Convert the supplied clinician transcript into concise professional Medical English.',
          'Preserve meaning exactly. Do not invent, infer, diagnose, add medications, add doses, or add findings.',
          'Preserve numbers, units, drug names, anatomy, ECG terms, laboratory values, and abbreviations.',
          'For Egyptian Arabic or mixed Arabic/English, translate into clear Medical English without changing meaning.',
          'If any word or number is unclear from the transcript, keep it uncertain and list a warning instead of guessing.',
          'Return ONLY valid JSON with keys: normalizedEnglish, sourceLanguage (ar|en|mixed|unknown), confidence (low|moderate|high), warnings (array).',
          'FIELD: ' + field,
          'TRANSCRIPT:',
          transcript
        ].join('\n')],
        config: { responseMimeType: 'application/json' }
      });

      const raw = String(normalizeResponse.text || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const parsed = JSON.parse(raw);
      normalizedEnglish = String(parsed?.normalizedEnglish || transcript).trim() || transcript;
      sourceLanguage = ['ar', 'en', 'mixed', 'unknown'].includes(parsed?.sourceLanguage) ? parsed.sourceLanguage : 'unknown';
      confidence = ['low', 'moderate', 'high'].includes(parsed?.confidence) ? parsed.confidence : 'moderate';
      warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).filter(Boolean) : [];
    } catch (error) {
      console.warn('Clinical voice normalization failed; returning transcript:', error);
      warnings = ['Medical-English normalization was unavailable; the verified transcript was returned.'];
    }

    return Response.json({ transcript, normalizedEnglish, sourceLanguage, confidence, warnings });
  } catch (error: any) {
    console.error('Clinical voice transcription error:', error);
    return Response.json({ error: 'Clinical voice transcription failed. Please try again.' }, { status: 500 });
  }
}