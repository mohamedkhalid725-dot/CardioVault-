export type ClinicalVoiceField =
  | 'chief_complaint'
  | 'hpi'
  | 'pmh'
  | 'examination'
  | 'progress_note'
  | 'consultation'
  | 'procedure'
  | 'cardiology'
  | 'icu'
  | 'handover'
  | 'discharge_summary';

export interface ClinicalVoiceResult {
  transcript: string;
  normalizedEnglish: string;
  sourceLanguage: 'ar' | 'en' | 'mixed' | 'unknown';
  confidence: 'low' | 'moderate' | 'high';
  warnings: string[];
}

export async function transcribeClinicalAudio(
  blob: Blob,
  field: ClinicalVoiceField,
): Promise<ClinicalVoiceResult> {
  const base64 = await blobToDataUrl(blob);
  const response = await fetch('/api/ai/transcribe-clinical', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      audioBase64: base64,
      field,
    }),
  });

  const contentType=response.headers.get('content-type')||'';
  let data: any = {};
  if(contentType.includes('application/json')){
    try { data = await response.json(); } catch {}
  }else{
    await response.text();
    throw new Error(response.status===404
      ? 'AI voice service is not available on this deployment.'
      : `AI voice service returned an unexpected response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(String(data?.error || 'Clinical voice transcription failed.'));
  }

  return {
    transcript: String(data?.transcript || ''),
    normalizedEnglish: String(data?.normalizedEnglish || data?.transcript || ''),
    sourceLanguage: ['ar','en','mixed','unknown'].includes(data?.sourceLanguage) ? data.sourceLanguage : 'unknown',
    confidence: ['low','moderate','high'].includes(data?.confidence) ? data.confidence : 'moderate',
    warnings: Array.isArray(data?.warnings) ? data.warnings.map(String).filter(Boolean) : [],
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}
