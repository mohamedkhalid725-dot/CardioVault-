// Cloudflare Worker: Android-only voice → medical English proxy.
// Web never calls this (it uses Firebase AI Logic directly).
// Privacy: NEVER log audio, transcripts, patient data, tokens, claims,
// names, or keys. One line per request: status, failure-category reason,
// duration, and uid hash. A jose code may be appended only if it matches
// /^ERR_[A-Z_]+$/. Client responses stay generic.
import { VerifyError, verifyFirebaseIdToken } from './auth.ts';
import { isAllowedOrigin } from './cors.ts';
import { CARDIO_GLOSSARY } from './glossary.ts';
import { numberPostCheck } from './numbers.ts';
import { RESPONSE_SCHEMA, buildTranscribePrompt } from './prompt.ts';
import { RATE_LIMIT_PER_HOUR, RATE_WINDOW_SECONDS, hashUid, rateLimitKey } from './rateLimit.ts';

interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  FIREBASE_PROJECT_ID?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
  GEMINI_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  VOICE_RL?: KvStore;
}

const DEFAULT_MODEL = 'gemini-3.6-flash'; // SAME as web AI_MODEL (src/config/aiConfig.ts)
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const RETRY_DELAYS_MS = [800, 2000];

// Secret hygiene: strip whitespace and any invisible/formatting characters
// that copy-paste into the Cloudflare dashboard can smuggle in (e.g. U+200F
// RIGHT-TO-LEFT MARK, zero-width space, newlines). Exported for unit tests.
export const cleanApiKey = (value: unknown): string =>
  String(value ?? '').trim().replace(/[^A-Za-z0-9._-]/g, '');
export const cleanProjectId = (value: unknown): string =>
  String(value ?? '').trim().replace(/[^a-z0-9-]/gi, '');

// Permanent diagnostic line for a non-2xx Gemini response. Fixed fields
// only: upstream HTTP status, error.status from a fixed enum (anything else
// is "unknown"), model name, mime type, and audio byte length. NEVER the
// key, audio bytes, transcripts, messages, or response text.
const GEMINI_ERR_STATUSES = new Set([
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'RESOURCE_EXHAUSTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'UNKNOWN',
]);
export function geminiFailureDiagLine(input: {
  upStatus: number;
  body: string;
  model: string;
  mimeType: string;
  audioBytes: number;
}): string {
  let errStatus = 'unknown';
  try {
    const parsed = JSON.parse(input.body) as { error?: { status?: unknown } };
    const s = parsed?.error?.status;
    if (typeof s === 'string' && GEMINI_ERR_STATUSES.has(s)) errStatus = s;
  } catch {
    // keep 'unknown'; the body is never echoed
  }
  const safe = (value: string, re: RegExp, max: number): string =>
    re.test(value) ? value.slice(0, max) : 'invalid';
  const up = Number.isInteger(input.upStatus) ? input.upStatus : 0;
  const bytes =
    Number.isInteger(input.audioBytes) && input.audioBytes >= 0 ? input.audioBytes : 0;
  return (
    `voice-proxy gemini-diag up_status=${up}` +
    ` err_status=${errStatus}` +
    ` model=${safe(input.model, /^[A-Za-z0-9._-]{1,60}$/, 60)}` +
    ` mime=${safe(input.mimeType, /^[A-Za-z0-9/;=+._-]{1,60}$/, 60)}` +
    ` bytes=${bytes}`
  );
}

export function safeModelName(value: string): string {
  return /^[A-Za-z0-9._-]{1,60}$/.test(value) ? value.slice(0, 60) : 'invalid';
}

function json(data: unknown, status: number, origin: string | null, env: Env): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (origin && isAllowedOrigin(origin, env.ALLOWED_ORIGINS ?? '')) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  // 204 (CORS preflight) must carry no body — the runtime rejects one.
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TOTAL_BUDGET_MS = 25000; // overall upstream time budget per request

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;
const defaultFetch: FetchImpl = (url, init) => fetch(url, init);

export interface GeminiCallOpts {
  apiKey: string;
  model: string;
  fallbackModel: string;
  audioBase64: string;
  mimeType: string;
  prompt: string;
  deadline: number; // epoch ms; no new upstream attempt starts at/after this
  fetchImpl?: FetchImpl; // injected by unit tests; production uses global fetch
}

function buildGeminiPayload(audioBase64: string, mimeType: string, prompt: string): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
}

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

// One upstream attempt with its own AbortController, bounded by the overall
// deadline. Returns the Response; throws only on network/abort failures.
async function fetchGeminiOnce(
  url: string,
  apiKey: string,
  payload: string,
  deadline: number,
  fetchImpl: FetchImpl,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, deadline - Date.now()));
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: payload,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiPrimary(opts: GeminiCallOpts): Promise<{ status: number; body: string }> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const url = geminiUrl(opts.model);
  const payload = buildGeminiPayload(opts.audioBase64, opts.mimeType, opts.prompt);
  let last = { status: 0, body: '' };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (opts.deadline - Date.now() <= 0) break;
    if (attempt > 0) {
      await sleep(Math.min(RETRY_DELAYS_MS[attempt - 1], Math.max(1, opts.deadline - Date.now())));
      if (opts.deadline - Date.now() <= 0) break;
    }
    let res: Response;
    try {
      res = await fetchGeminiOnce(url, opts.apiKey, payload, opts.deadline, fetchImpl);
    } catch {
      last = { status: 0, body: '' };
      continue;
    }
    let text = '';
    try {
      text = await res.text();
    } catch {
      last = { status: 0, body: '' };
      continue;
    }
    if (res.ok) return { status: res.status, body: text };
    last = { status: res.status, body: text };
    if (res.status !== 429 && res.status !== 500 && res.status !== 503) break;
  }
  return last;
}

const FALLBACKABLE_STATUSES = new Set([429, 500, 503]);

// Primary (with its retries) first; if it still fails with 429/500/503 and a
// fallback model is configured, try the fallback ONCE within the budget.
// Behavior is unchanged when the fallback is empty.
export async function callGeminiWithFallback(
  opts: GeminiCallOpts,
): Promise<{ status: number; body: string; modelUsed: string }> {
  const primary = await callGeminiPrimary(opts);
  if (primary.status >= 200 && primary.status < 300) return { ...primary, modelUsed: opts.model };
  const fallback = opts.fallbackModel.trim();
  if (!fallback || !FALLBACKABLE_STATUSES.has(primary.status) || opts.deadline - Date.now() <= 0) {
    return { ...primary, modelUsed: opts.model };
  }
  try {
    const res = await fetchGeminiOnce(
      geminiUrl(fallback),
      opts.apiKey,
      buildGeminiPayload(opts.audioBase64, opts.mimeType, opts.prompt),
      opts.deadline,
      opts.fetchImpl ?? defaultFetch,
    );
    let text = '';
    try {
      text = await res.text();
    } catch {
      return { ...primary, modelUsed: opts.model };
    }
    return { status: res.status, body: text, modelUsed: fallback };
  } catch {
    return { ...primary, modelUsed: opts.model };
  }
}

function parseGeminiResult(body: string): {
  raw_transcript: string;
  clean_english: string;
  uncertain: string[];
} | null {
  try {
    const data = JSON.parse(body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('');
    if (!text) return null;
    const value = JSON.parse(text) as {
      raw_transcript?: unknown;
      clean_english?: unknown;
      uncertain?: unknown;
    };
    return {
      raw_transcript: typeof value.raw_transcript === 'string' ? value.raw_transcript : '',
      clean_english: typeof value.clean_english === 'string' ? value.clean_english : '',
      uncertain: Array.isArray(value.uncertain)
        ? value.uncertain.filter((u): u is string => typeof u === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const CODE_RE = /^ERR_[A-Z_]+$/;
    let modelUsed = '';
    const done = (status: number, reason: string, uidHash: string, code = ''): void => {
      const suffix = CODE_RE.test(code) ? ` ${code}` : '';
      const modelSuffix = modelUsed ? ` model_used=${safeModelName(modelUsed)}` : '';
      console.log(`voice-proxy ${status} ${reason} ${Date.now() - started}ms ${uidHash}${suffix}${modelSuffix}`);
    };
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return json({}, 204, origin, env);
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/transcribe') {
      done(404, 'not_found', 'none');
      return json({ error: 'not_found' }, 404, origin, env);
    }
    if (origin && !isAllowedOrigin(origin, env.ALLOWED_ORIGINS ?? '')) {
      done(403, 'origin_not_allowed', 'none');
      return json({ error: 'origin_not_allowed' }, 403, origin, env);
    }

    const pidRaw = (env.FIREBASE_PROJECT_ID ?? '').trim();
    const keyRaw = (env.GEMINI_API_KEY ?? '').trim();
    const projectId = cleanProjectId(pidRaw);
    const apiKey = cleanApiKey(keyRaw);
    if (!projectId || !apiKey) {
      // Names the secret that is empty at runtime. Secret NAMES only —
      // never values, keys, or audio data.
      const missing: string[] = [];
      if (!projectId) missing.push('missing_config:firebase_project_id');
      if (!apiKey) missing.push('missing_config:gemini_api_key');
      done(500, `proxy_not_configured:${missing.join('+')}`, 'none');
      return json({ error: 'proxy_not_configured' }, 500, origin, env);
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    let uid = '';
    try {
      uid = (await verifyFirebaseIdToken(idToken, projectId)).uid;
    } catch (error) {
      const reason = error instanceof VerifyError ? error.reason : 'unknown_verify_error';
      const code = error instanceof VerifyError ? error.code : '';
      done(401, reason, 'none', code);
      return json({ error: 'unauthorized_sign_in_again' }, 401, origin, env);
    }
    const uidHash = await hashUid(uid);

    if (env.VOICE_RL) {
      const key = rateLimitKey(uidHash);
      const count = Number((await env.VOICE_RL.get(key)) ?? 0);
      if (Number.isFinite(count) && count >= RATE_LIMIT_PER_HOUR) {
        done(429, 'rate_limited', uidHash);
        return json({ error: 'quota_exceeded_retry_later' }, 429, origin, env);
      }
      await env.VOICE_RL.put(key, String((Number.isFinite(count) ? count : 0) + 1), {
        expirationTtl: RATE_WINDOW_SECONDS,
      });
    }

    let body: { audioBase64?: unknown; mimeType?: unknown; fieldName?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      done(400, 'invalid_request', uidHash);
      return json({ error: 'invalid_request' }, 400, origin, env);
    }
    const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
    const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'audio/aac';
    const fieldName =
      typeof body.fieldName === 'string' && body.fieldName.trim()
        ? body.fieldName.trim().slice(0, 120)
        : 'clinical field';
    const audioBytes = Math.floor(audioBase64.length * 3 / 4);
    if (!audioBase64 || audioBytes > MAX_AUDIO_BYTES) {
      const tooLarge = !!audioBase64;
      done(tooLarge ? 413 : 400, tooLarge ? 'audio_too_large' : 'invalid_request', uidHash);
      return json({ error: audioBase64 ? 'audio_too_large' : 'invalid_request' }, audioBase64 ? 413 : 400, origin, env);
    }

    const prompt = buildTranscribePrompt(fieldName, CARDIO_GLOSSARY);
    const model = (env.GEMINI_MODEL ?? '').trim() || DEFAULT_MODEL;
    const fallbackModel = (env.GEMINI_FALLBACK_MODEL ?? '').trim();
    const gemini = await callGeminiWithFallback({
      apiKey,
      model,
      fallbackModel,
      audioBase64,
      mimeType,
      prompt,
      deadline: Date.now() + TOTAL_BUDGET_MS,
    });
    modelUsed = gemini.modelUsed;
    if (gemini.status < 200 || gemini.status >= 300) {
      console.log(
        geminiFailureDiagLine({
          upStatus: gemini.status,
          body: gemini.body,
          model: modelUsed,
          mimeType,
          audioBytes,
        }),
      );
      done(gemini.status || 502, 'gemini_error', uidHash);
      if (gemini.status === 429) return json({ error: 'quota_exceeded_retry_later' }, 429, origin, env);
      return json({ error: 'ai_unavailable_retry_later' }, 502, origin, env);
    }
    const parsed = parseGeminiResult(gemini.body);
    if (!parsed) {
      done(502, 'gemini_error', uidHash);
      return json({ error: 'ai_unavailable_retry_later' }, 502, origin, env);
    }
    const warnings = numberPostCheck(parsed.raw_transcript, parsed.clean_english);
    if (!parsed.raw_transcript && !parsed.clean_english) warnings.push('unintelligible_audio');
    done(200, 'ok', uidHash);
    return json({ ...parsed, warnings, model_used: modelUsed }, 200, origin, env);
  },
};
