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
  String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '');
export const cleanProjectId = (value: unknown): string =>
  String(value ?? '').trim().replace(/[^a-z0-9-]/gi, '');

// TEMPORARY - remove after diagnosis
// Builds one diagnostic line for a non-2xx Gemini response. It may include
// only: upstream HTTP status, error.status, a 200-char error.message with
// base64-like runs redacted, model, mime type, audio byte length, and the
// integer lengths of key/pid raw and cleaned. NEVER the key, audio bytes,
// transcripts, or response text.
const DIAG_BASE64_RUN = /[A-Za-z0-9+/=_-]{40,}/g;
export function geminiFailureDiagLine(input: {
  upStatus: number;
  body: string;
  model: string;
  mimeType: string;
  audioBytes: number;
  keyLen: number;
  keyCleanLen: number;
  pidRawLen: number;
  pidCleanLen: number;
}): string {
  let errStatus = 'unknown';
  let errMessage = '';
  try {
    const parsed = JSON.parse(input.body) as {
      error?: { status?: unknown; message?: unknown };
    };
    if (typeof parsed?.error?.status === 'string') errStatus = parsed.error.status;
    if (typeof parsed?.error?.message === 'string') errMessage = parsed.error.message;
  } catch {
    errMessage = '';
  }
  // Redact base64-like runs first, then truncate, so a long token can never
  // survive truncation. Model/mime/status must match a safe charset or are
  // replaced with "invalid".
  const msg = errMessage.replace(DIAG_BASE64_RUN, '[redacted]').slice(0, 200);
  const safe = (value: string, re: RegExp, max: number): string =>
    re.test(value) ? value.slice(0, max) : 'invalid';
  return (
    `voice-proxy gemini-diag up_status=${input.upStatus}` +
    ` err_status=${safe(errStatus, /^[A-Za-z_]{1,40}$/, 40)}` +
    ` msg="${msg}"` +
    ` model=${safe(input.model, /^[A-Za-z0-9._-]{1,60}$/, 60)}` +
    ` mime=${safe(input.mimeType, /^[A-Za-z0-9/;=+._-]{1,60}$/, 60)}` +
    ` bytes=${input.audioBytes}` +
    ` key_len=${input.keyLen} key_clean_len=${input.keyCleanLen}` +
    ` pid_raw_len=${input.pidRawLen} pid_clean_len=${input.pidCleanLen}`
  );
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

async function callGemini(opts: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
  prompt: string;
}): Promise<{ status: number; body: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const payload = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: opts.mimeType, data: opts.audioBase64 } },
          { text: opts.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };
  let last = { status: 0, body: '' };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify(payload),
      });
    } catch {
      last = { status: 0, body: '' };
      continue;
    }
    const body = await res.text();
    if (res.ok) return { status: res.status, body };
    last = { status: res.status, body };
    if (res.status !== 429 && res.status !== 500 && res.status !== 503) break;
  }
  return last;
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
    const done = (status: number, reason: string, uidHash: string, code = ''): void => {
      const suffix = CODE_RE.test(code) ? ` ${code}` : '';
      console.log(`voice-proxy ${status} ${reason} ${Date.now() - started}ms ${uidHash}${suffix}`);
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
      // TEMPORARY - remove after diagnosis: name which secret is empty at
      // runtime. Secret NAMES only — never values, keys, or audio data.
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
    const gemini = await callGemini({ apiKey, model, audioBase64, mimeType, prompt });
    if (gemini.status < 200 || gemini.status >= 300) {
      // TEMPORARY - remove after diagnosis
      console.log(
        geminiFailureDiagLine({
          upStatus: gemini.status,
          body: gemini.body,
          model,
          mimeType,
          audioBytes,
          keyLen: keyRaw.length,
          keyCleanLen: apiKey.length,
          pidRawLen: pidRaw.length,
          pidCleanLen: projectId.length,
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
    return json({ ...parsed, warnings }, 200, origin, env);
  },
};
