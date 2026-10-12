// Two-layer voice pipeline for mixed Arabic-English clinical dictation.
// Layer 1 (device, free, no quota): live on-device speech recognition.
// Layer 2 (cloud free-tier): raw text polished into Medical English.
// Nothing is fabricated: empty or unclear recognition is reported, never guessed.
import { Capacitor } from '@capacitor/core';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile was shut down by Groq on 2026-08-16; gpt-oss-120b is
// the vendor-recommended replacement for the free/developer tier.
const GROQ_MODEL = 'openai/gpt-oss-120b';
// Single-locale v1: mixed utterances are recognized under ar-EG and reviewed
// by the physician. A second en-US pass was rejected (double recording UX).
export const PIPELINE_SPEECH_LOCALE = 'ar-EG';

// VA-1: the native voice start chain hung forever on some Android builds
// (awaits that never resolve nor reject). Every await in the voice start
// path races a watchdog so the mic button can never spin forever; each
// timeout names its stage so field reports identify the hanging call.
export const VOICE_START_TIMEOUT_MS = 15000;
export function withVoiceTimeout<T>(work: Promise<T>, stage: string, timeoutMs = VOICE_START_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Voice start timed out at ${stage}. Please try again.`)), timeoutMs);
  });
  return Promise.race([work.finally(() => { if (timer !== undefined) clearTimeout(timer); }), timeout]);
}

// Launch consent: voice audio leaves the device for speech recognition and
// AI transcription. Asked once per session; audio clips are never stored.
const VOICE_CONSENT_KEY = 'cardiovault_voice_consent_v1';
export function hasVoiceConsent(): boolean {
  try { return sessionStorage.getItem(VOICE_CONSENT_KEY) === '1'; } catch { return false; }
}
export function requestVoiceConsent(): boolean {
  if (hasVoiceConsent()) return true;
  const ok = window.confirm(
    'Voice dictation sends speech audio to speech-recognition and AI transcription services to produce text. Audio clips are not stored.\nالإملاء الصوتي يرسل الصوت لخدمات التفريغ النصي. لا نحفظ التسجيلات الصوتية.'
  );
  try { if (ok) sessionStorage.setItem(VOICE_CONSENT_KEY, '1'); } catch { /* session-only */ }
  return ok;
}

// Launch scrub: exact-match patient identifiers are replaced locally before
// any transcript text reaches a cloud model. Nothing is guessed: only the
// supplied tokens are replaced, everything else passes through untouched.
export function scrubIdentifiers(text: string, tokens: Array<string | undefined>): { text: string; redacted: boolean } {
  let out = text;
  let redacted = false;
  for (const raw of tokens) {
    const token = String(raw || '').trim();
    if (token.length < 2) continue;
    const placeholder = /^\d+$/.test(token) ? '[ID]' : '[NAME]';
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = out.replace(new RegExp(escaped, 'g'), placeholder);
    if (next !== out) { out = next; redacted = true; }
  }
  return { text: out, redacted };
}

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
  const { SpeechRecognition } = await withVoiceTimeout(import('@capacitor-community/speech-recognition'), 'speech plugin load');
  const permission = await withVoiceTimeout(SpeechRecognition.requestPermissions(), 'permission request');
  const granted = (permission as { speechRecognition?: string }).speechRecognition === 'granted';
  if (!granted) throw new Error('Speech recognition permission was denied.');

  // B-C: native partials proved unreliable in the field (garbage ar-EG text
  // while Chrome on the same utterances was exact). On native, use the system
  // popup instead: start() resolves with final server-processed matches and
  // no unstable partial is ever kept. Web keeps the live-partials flow below.
  if (Capacitor.isNativePlatform()) {
    let finished = false;
    let finalize: (text: string) => void = () => {};
    let fail: (error: unknown) => void = () => {};
    const done = new Promise<string>((resolve, reject) => { finalize = resolve; fail = reject; });
    const settleResolve = (text: string) => { if (!finished) { finished = true; finalize(text); } };
    const settleReject = (error: unknown) => { if (!finished) { finished = true; fail(error); } };
    // User-paced dictation: long watchdog (naming the stage) so long speech
    // is never cut, while a hung plugin call still cannot spin forever.
    withVoiceTimeout(SpeechRecognition.start({
      language: PIPELINE_SPEECH_LOCALE,
      maxResults: 5,
      popup: true,
    }), 'native finals', 120000).then(
      (result: { matches?: string[] }) => {
        const top = String(result?.matches?.[0] || '').trim();
        if (top) settleResolve(top);
        else settleReject(new Error('No speech was recognized. Please try again.'));
      },
      (error: unknown) => {
        settleReject(error instanceof Error ? error : new Error('Live speech recognition could not start.'));
      },
    );
    return {
      stop: async () => {
        if (!finished) {
          try {
            await withVoiceTimeout(SpeechRecognition.stop(), 'recognition stop', 8000);
          } catch {
            // stop() may reject when the popup already closed; the pending
            // start() settlement still resolves or rejects done exactly once.
          }
        }
        return done;
      },
    };
  }

  let best = '';
  let settled = false;
  const listener = await withVoiceTimeout(SpeechRecognition.addListener('partialResults', (data: { matches?: string[] }) => {
    const top = data?.matches?.[0] || '';
    if (top.trim()) {
      best = top;
      onPartial?.(top);
    }
  }), 'result listener');
  try {
    // partialResults:true resolves start() immediately; results arrive via listener.
    await withVoiceTimeout(SpeechRecognition.start({
      language: PIPELINE_SPEECH_LOCALE,
      maxResults: 5,
      partialResults: true,
      popup: false,
    }), 'recognition start');
  } catch (error) {
    await listener.remove();
    throw error instanceof Error ? error : new Error('Live speech recognition could not start.');
  }
  return {
    stop: async () => {
      if (settled) throw new Error('Recognition already stopped.');
      settled = true;
      try {
        await withVoiceTimeout(SpeechRecognition.stop(), 'recognition stop', 8000);
      } catch {
        // stop() may reject when nothing is listening; still return what we heard.
      }
      await listener.remove();
      if (!best.trim()) throw new Error('No speech was recognized. Please try again.');
      return best;
    },
  };
}

export async function polishToMedicalEnglish(transcription: string, fieldLabel: string, redactTokens?: Array<string | undefined>): Promise<string> {
  const clean = transcription.trim();
  if (!clean) throw new Error('Nothing was recognized to polish.');
  // Patient identifiers never reach the cloud model: exact-match local scrub.
  const scrubbed = scrubIdentifiers(clean, redactTokens || []).text;
  const cached = cachedPolish(scrubbed);
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
      messages: [{ role: 'user', content: buildPolishPrompt(scrubbed, fieldLabel) }],
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
  storePolish(scrubbed, medicalEnglish);
  return medicalEnglish;
}

// Full pipeline helper for single-shot callers: listens until stopped
// externally is not possible in one call, so this helper is intentionally
// absent — use startLiveRecognition + polishToMedicalEnglish instead.
