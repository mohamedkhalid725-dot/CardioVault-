import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker, { callGeminiWithFallback, cleanApiKey, cleanProjectId } from '../voice-proxy/src/index.ts';
import { mapVerifyError, verifyFirebaseIdToken } from '../voice-proxy/src/auth.ts';

const PROJECT = 'ccu-notebook-test';
const ENV = { FIREBASE_PROJECT_ID: PROJECT, GEMINI_API_KEY: 'test-key-not-used' };

async function keySet() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] });
  return { privateKey, jwks };
}

async function sign(opts: {
  privateKey: CryptoKey;
  iss?: string;
  aud?: string;
  sub?: string;
  expPast?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ sub: opts.sub ?? 'uid-1' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt(now)
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT);
  if (opts.expPast) jwt.setExpirationTime(now - 60);
  else jwt.setExpirationTime(now + 3600);
  return jwt.sign(opts.privateKey);
}

async function captureLogs(work: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await work();
  } finally {
    console.log = orig;
  }
  return lines;
}

test('garbage token: generic 401, bad_signature logged, token never logged', async () => {
  const FAKE = 'not.a.real.jwt.value-xyz';
  let status = 0;
  let body = '';
  const lines = await captureLogs(async () => {
    const res = await worker.fetch(
      new Request('https://worker/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FAKE}` },
        body: '{}',
      }),
      ENV,
    );
    status = res.status;
    body = await res.text();
  });
  assert.equal(status, 401);
  assert.ok(body.includes('unauthorized_sign_in_again'));
  assert.ok(!body.includes(FAKE));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('401'));
  assert.ok(lines[0].includes('bad_signature'));
  assert.ok(!lines[0].includes(FAKE));
});

test('missing token logs missing_token with generic 401', async () => {
  let status = 0;
  const lines = await captureLogs(async () => {
    const res = await worker.fetch(
      new Request('https://worker/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      ENV,
    );
    status = res.status;
  });
  assert.equal(status, 401);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('missing_token'));
});

test('locally signed tokens produce each reason', async () => {
  const { privateKey, jwks } = await keySet();
  const other = await generateKeyPair('RS256');

  await assert.rejects(
    verifyFirebaseIdToken(await sign({ privateKey, expPast: true }), PROJECT, jwks),
    /expired/,
  );
  await assert.rejects(
    verifyFirebaseIdToken(await sign({ privateKey, aud: 'other-project' }), PROJECT, jwks),
    /aud_mismatch/,
  );
  await assert.rejects(
    verifyFirebaseIdToken(
      await sign({ privateKey, iss: 'https://securetoken.google.com/evil' }),
      PROJECT,
      jwks,
    ),
    /iss_mismatch/,
  );
  const otherJwk = await exportJWK(other.publicKey);
  const otherSet = createLocalJWKSet({
    keys: [{ ...otherJwk, kid: 'other', alg: 'RS256', use: 'sig' }],
  });
  await assert.rejects(
    verifyFirebaseIdToken(await sign({ privateKey }), PROJECT, otherSet),
    /bad_signature/,
  );
});

test('reason mapping covers jwks and unknown errors', () => {
  assert.equal(mapVerifyError({ code: 'ERR_JWKS_TIMEOUT' }).reason, 'jwks_fetch_failed');
  assert.equal(mapVerifyError({ code: 'ERR_JWKS_NO_MATCHING_KEY' }).reason, 'bad_signature');
  assert.equal(mapVerifyError(new Error('boom')).reason, 'unknown_verify_error');
  assert.equal(mapVerifyError({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', message: 'x' }).reason, 'unknown_verify_error');
});

test('secret cleaning strips invisible characters', () => {
  assert.equal(cleanProjectId('ccu-notebook\u200f'), 'ccu-notebook'); // RLM
  assert.equal(cleanProjectId('\u200bccu-notebook\n'), 'ccu-notebook'); // ZWSP + newline
  assert.equal(cleanProjectId('ccu-notebook-test'), 'ccu-notebook-test');
  assert.equal(cleanProjectId('ccu-notebook'), 'ccu-notebook');
  assert.equal(cleanApiKey('abc-DEF_123\u200f\n'), 'abc-DEF_123');
  assert.equal(cleanApiKey(' \t AIza-9_x \u200b '), 'AIza-9_x');
  const fullKey = `AIza${'A'.repeat(35)}`; // fake 39-char key, real charset
  assert.equal(fullKey.length, 39);
  assert.equal(cleanApiKey(fullKey), fullKey);
  const dottedKey = `AQ.${'B'.repeat(36)}`; // fake AQ.-style key containing a dot
  assert.equal(cleanApiKey(dottedKey), dottedKey);
  assert.notEqual(cleanApiKey(dottedKey).length, 0);
  assert.equal(cleanApiKey('‏‌صمغ'), ''); // only RLM + ZWJ + Arabic letters
  assert.equal(cleanApiKey('‏'), ''); // only invisible chars
});

test('missing config logs WHICH secret is empty, never its value', async () => {
  const lines = await captureLogs(async () => {
    const resNoKey = await worker.fetch(
      new Request('https://worker/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { FIREBASE_PROJECT_ID: PROJECT },
    );
    assert.equal(resNoKey.status, 500);
    assert.ok((await resNoKey.text()).includes('proxy_not_configured'));
    const resNoPid = await worker.fetch(
      new Request('https://worker/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { GEMINI_API_KEY: 'fake-key-value' },
    );
    assert.equal(resNoPid.status, 500);
  });
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('missing_config:gemini_api_key'));
  assert.ok(lines[1].includes('missing_config:firebase_project_id'));
  for (const line of lines) {
    assert.ok(!line.includes(PROJECT));
    assert.ok(!line.includes('fake-key-value'));
    assert.ok(!line.includes('fake-key'));
    assert.ok(!line.includes('key_raw_len'));
    assert.ok(!line.includes('key_clean_len'));
    assert.ok(!line.includes('pid_'));
  }
});

test('primary 429s fall back to the fallback model and succeed', async () => {
  const okBody = JSON.stringify({
    candidates: [
      { content: { parts: [{ text: '{"raw_transcript":"r","clean_english":"c","uncertain":[]}' }] } },
    ],
  });
  const stub = stubFetch((_url, call) =>
    call < 4
      ? new Response(fbErrBody('RESOURCE_EXHAUSTED'), { status: 429 })
      : new Response(okBody, { status: 200 }),
  );
  const res = await callGeminiWithFallback(fbOpts({ fetchImpl: stub.impl }));
  assert.equal(res.status, 200);
  assert.equal(res.modelUsed, FB_FALLBACK);
  assert.equal(stub.urls.length, 4); // 3 primary attempts + fallback first try
  assert.ok(stub.urls[3].includes(encodeURIComponent(FB_FALLBACK)));
});

test('both models failing returns the last error with the fallback named', async () => {
  const stub = stubFetch(() => new Response(fbErrBody('UNAVAILABLE'), { status: 503 }));
  const res = await callGeminiWithFallback(fbOpts({ fetchImpl: stub.impl }));
  assert.equal(res.status, 503);
  assert.equal(res.modelUsed, FB_FALLBACK);
  assert.equal(stub.urls.length, 5); // 3 primary attempts + fallback + 1 short retry
  assert.ok(stub.urls[3].includes(encodeURIComponent(FB_FALLBACK)));
  assert.ok(stub.urls[4].includes(encodeURIComponent(FB_FALLBACK)));
});

const FB_PRIMARY = 'gemini-3.6-flash';
const FB_FALLBACK = 'gemini-3.5-flash-lite';
const fbErrBody = (status: string): string =>
  JSON.stringify({ error: { code: 503, status, message: 'busy' } });

function stubFetch(
  handler: (url: string, call: number) => Response,
): { impl: (url: string, init: RequestInit) => Promise<Response>; urls: string[] } {
  const urls: string[] = [];
  let n = 0;
  const impl = (url: string, _init: RequestInit): Promise<Response> => {
    n += 1;
    urls.push(url);
    return Promise.resolve(handler(url, n));
  };
  return { impl, urls };
}

function fbOpts(overrides: {
  fallbackModel?: string;
  deadline?: number;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}): Parameters<typeof callGeminiWithFallback>[0] {
  return {
    apiKey: 'fake-key',
    model: FB_PRIMARY,
    fallbackModel: overrides.fallbackModel ?? FB_FALLBACK,
    audioBase64: 'AAA=',
    mimeType: 'audio/aac',
    prompt: 'p',
    deadline: overrides.deadline ?? Date.now() + 25000,
    fetchImpl: overrides.fetchImpl,
  };
}

test('fallback model succeeds after primary 503s', async () => {
  const okBody = JSON.stringify({
    candidates: [
      { content: { parts: [{ text: '{"raw_transcript":"r","clean_english":"c","uncertain":[]}' }] } },
    ],
  });
  const stub = stubFetch((_url, call) =>
    call < 4 ? new Response(fbErrBody('UNAVAILABLE'), { status: 503 }) : new Response(okBody, { status: 200 }),
  );
  const res = await callGeminiWithFallback(fbOpts({ fetchImpl: stub.impl }));
  assert.equal(res.status, 200);
  assert.equal(res.modelUsed, FB_FALLBACK);
  assert.equal(stub.urls.length, 4); // 3 primary attempts + 1 fallback
  assert.ok(stub.urls[3].includes(encodeURIComponent(FB_FALLBACK)));
});

test('no fallback on 400/401, or when the var is empty', async () => {
  for (const status of [400, 401]) {
    const stub = stubFetch(() => new Response(fbErrBody('INVALID_ARGUMENT'), { status }));
    const res = await callGeminiWithFallback(fbOpts({ fetchImpl: stub.impl }));
    assert.equal(res.status, status);
    assert.equal(res.modelUsed, FB_PRIMARY);
    assert.equal(stub.urls.length, 1);
  }
  const stubEmpty = stubFetch(() => new Response(fbErrBody('UNAVAILABLE'), { status: 503 }));
  const resEmpty = await callGeminiWithFallback(fbOpts({ fallbackModel: '', fetchImpl: stubEmpty.impl }));
  assert.equal(resEmpty.status, 503);
  assert.equal(resEmpty.modelUsed, FB_PRIMARY);
  assert.equal(stubEmpty.urls.length, 3); // primary retries only, no fallback
});

test('total time budget is respected when upstream hangs', async () => {
  const hanging = (_url: string, init: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      const signal = init.signal;
      const abort = (): void => reject(new DOMException('aborted', 'AbortError'));
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  const start = Date.now();
  const res = await callGeminiWithFallback(fbOpts({ deadline: start + 400, fetchImpl: hanging }));
  const elapsed = Date.now() - start;
  assert.equal(res.status, 0);
  assert.equal(res.modelUsed, FB_PRIMARY);
  assert.ok(elapsed < 8000, `budget exceeded: ${elapsed}ms`);
});
