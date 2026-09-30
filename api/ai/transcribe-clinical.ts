import { getGenAI, parseModelJson } from '../_ai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64 : '';
    const field = typeof body?.field === 'string' ? body.field : 'clinical_note';

    if (!audioBase64) return Response.json({ error: 'Recorded clinical audio is required.' }, { status: 400 });

    const match = audioBase64.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return Response.json({ error: 'Unsupported audio format.' }, { status: 400 });
    if (match[2].length > 14_000_000) return Response.json({ error: 'Recorded audio is too large.' }, { status: 413 });

    const prompt = [
      'You are a medical documentation transcription assistant for a physician.',
      'The clinician may speak Egyptian Arabic, Modern Standard Arabic, English, or a mixture.',
      'Transcribe what is actually spoken, then normalize it into concise professional Medical English.',
      'Field: ' + field,
      'Rules:',
      '1. Do NOT invent, infer, diagnose, or add facts that were not spoken.',
      '2. Preserve numbers, units, drug names, doses, anatomy, ECG terminology, laboratory values, and abbreviations accurately.',
      '3. Recognize ECG/EKG, ST elevation, STEMI, NSTEMI, troponin, CK-MB, PCI, CABG, AF/RVR, HFrEF/HFpEF, COPD, DVT, PE, ARDS, GCS, RASS, SOFA and medications.',
      '4. Convert Arabic clinical speech into clear Medical English while preserving meaning.',
      '5. For mixed-language speech, produce one coherent Medical English note.',
      '6. If a word or number is genuinely unclear, do not guess. Flag it.',
      '7. Documentation assistance only, not clinical decision support.',
      'Return ONLY valid JSON with keys: transcript, normalizedEnglish, sourceLanguage (ar|en|mixed|unknown), confidence (low|moderate|high), warnings (array).'
    ].join('\n');

    const ai = getGenAI();
    const models = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let raw = '';
    let lastError: any = null;

    for (const modelName of models) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }],
          config: { responseMimeType: 'application/json' },
        });
        raw = String(response.text || '').trim();
        if (raw) break;
      } catch (error: any) {
        lastError = error;
      }
    }

    if (!raw && lastError) throw lastError;
    if (!raw) return Response.json({ error: 'AI returned an empty transcription.' }, { status: 502 });

    const parsed = parseModelJson(raw);
    const transcript = String(parsed?.transcript || '');
    const normalizedEnglish = String(parsed?.normalizedEnglish || transcript);
    if (!transcript && !normalizedEnglish) {
      return Response.json({ error: 'AI returned an empty transcription. Please record again.' }, { status: 502 });
    }

    return Response.json({
      transcript,
      normalizedEnglish,
      sourceLanguage: ['ar','en','mixed','unknown'].includes(parsed?.sourceLanguage) ? parsed.sourceLanguage : 'unknown',
      confidence: ['low','moderate','high'].includes(parsed?.confidence) ? parsed.confidence : 'moderate',
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).filter(Boolean) : [],
    });
  } catch (error: any) {
    console.error('Clinical voice transcription error:', error);
    return Response.json({ error: 'Clinical voice transcription failed. Please try again.' }, { status: 500 });
  }
}
