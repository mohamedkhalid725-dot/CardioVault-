// Two-layer voice pipeline for mixed Arabic-English clinical dictation.
// Layer 1 (device, free, no quota): live on-device speech recognition.
// Layer 2 (cloud free-tier): raw text polished into Medical English.
// Nothing is fabricated: empty or unclear recognition is reported, never guessed.
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
// Single-locale v1: mixed utterances are recognized under ar-EG and reviewed
// by the physician. A second en-US pass was rejected (double recording UX).
export const PIPELINE_SPEECH_LOCALE = 'ar-EG';

const polishCache = new Map<string, string>();

export function normalizePolishKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cachedPolish(text: string): string | null {
  return polishCache.get(normalizePolishKey(text)) ?? null;
}

export function storePolish(text: string, polished: string): void {
  const clean = polished.trim();
  if (!text.trim() || !clean) return;
  if (polishCache.size > 200) polishCache.clear();
  polishCache.set(normalizePolishKey(text), clean);
}

// Short prompt: the model converts, never invents. Full fact-preservation
// rules live in aiLogic.transcribeMedicalVoice for the cloud-only path.
export function buildPolishPrompt(transcription: string, fieldLabel: string): string {
  return [
    'You are a clinical transcription assistant. Convert the dictated text below into concise professional Medical English.',
    'HARD RULES: never add, infer, diagnose, negate, or complete any clinical fact that was not explicitly stated.',
    'Preserve every number, dose, unit, drug name, and negation exactly in meaning.',
    'If a word is unclear, keep it and mark [unclear]. Do not identify any patient.',
    `Target field context (do not use it to fill gaps): ${fieldLabel}`,
    'Return JSON only: {"medicalEnglish": "..."}.',
    '',
    'DICTATED TEXT:',
    transcription,
  ].join('\n');
}

export interface LiveRecognitionSession {
  // Stops listening and resolves with the best transcript heard so far.
  stop: () => Promise<string>;
}

// Starts on-device listening. The caller stops it (mic button second press)
// and then polishes the returned text. Split this way because recording is
// user-paced, not a single awaited call.
export async function startLiveRecognition(
  onPartial?: (text: string) => void,
): Promise<LiveRecognitionSession> {
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  const permission = await SpeechRecognition.requestPermissions();
  const granted = (permission as { speechRecognition?: string }).speechRecognition === 'granted';
  if (!granted) throw new Error('Speech recognition permission was denied.');

  let best = '';
  let settled = false;
  const listener = await SpeechRecognition.addListener('partialResults', (data: { matches?: string[] }) => {
    const top = data?.matches?.[0] || '';
    if (top.trim()) {
      best = top;
      onPartial?.(top);
    }
  });
  try {
    // partialResults:true resolves start() immediately; results arrive via listener.
    await SpeechRecognition.start({
      language: PIPELINE_SPEECH_LOCALE,
      maxResults: 5,
      partialResults: true,
      popup: false,
    });
  } catch (error) {
    await listener.remove();
    throw error instanceof Error ? error : new Error('Live speech recognition could not start.');
  }
  return {
    stop: async () => {
      if (settled) throw new Error('Recognition already stopped.');
      settled = true;
      try {
        await SpeechRecognition.stop();
      } catch {
        // stop() may reject when nothing is listening; still return what we heard.
      }
      await listener.remove();
      if (!best.trim()) throw new Error('No speech was recognized. Please try again.');
      return best;
    },
  };
}

export async function polishToMedicalEnglish(transcription: string, fieldLabel: string): Promise<string> {
  const clean = transcription.trim();
  if (!clean) throw new Error('Nothing was recognized to polish.');
  const cached = cachedPolish(clean);
  if (cached) return cached;
  const apiKey = String(import.meta.env.VITE_GROQ_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Voice polish is not configured. Add VITE_GROQ_API_KEY and try again.');
  }
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildPolishPrompt(clean, fieldLabel) }],
    }),
  });
  if (response.status === 429) throw new Error('Voice polish limit reached. Please wait a little and try again.');
  if (!response.ok) throw new Error(`Voice polish failed (HTTP ${response.status}).`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = String(data?.choices?.[0]?.message?.content || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Voice polish returned an invalid response.');
  let medicalEnglish = '';
  try {
    medicalEnglish = String(JSON.parse(raw.slice(start, end + 1)).medicalEnglish || '').trim();
  } catch {
    throw new Error('Voice polish returned an invalid response.');
  }
  if (!medicalEnglish) throw new Error('Voice polish returned an empty response.');
  storePolish(clean, medicalEnglish);
  return medicalEnglish;
}

// Full pipeline helper for single-shot callers: listens until stopped
// externally is not possible in one call, so this helper is intentionally
// absent — use startLiveRecognition + polishToMedicalEnglish instead.
