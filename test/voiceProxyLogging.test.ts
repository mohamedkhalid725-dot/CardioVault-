import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker, { cleanApiKey, cleanProjectId, geminiFailureDiagLine } from '../voice-proxy/src/index.ts';
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
    assert.ok(/key_raw_len=\d+ key_clean_len=\d+/.test(line));
  }
});

test('gemini failure diag line leaks no key, audio, or response text', () => {
  const KEY = 'AIzaSyFAKEKEYfakeKEYfakeKEYfakeKEYfake1234';
  const AUDIO = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eg';
  const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.SECRETPAYLOAD.SIGNATURE';
  const body = JSON.stringify({
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: `Request contains an invalid argument: ${AUDIO} and key ${KEY}`,
      details: [{ transcript: TOKEN }],
    },
  });
  const line = geminiFailureDiagLine({
    upStatus: 400,
    body,
    model: 'gemini-3.6-flash',
    mimeType: 'audio/aac',
    audioBytes: 12345,
    keyLen: 45,
    keyCleanLen: 43,
    pidRawLen: 12,
    pidCleanLen: 12,
  });
  assert.ok(line.includes('up_status=400'));
  assert.ok(line.includes('err_status=INVALID_ARGUMENT'));
  assert.ok(line.includes('[redacted]'));
  assert.ok(!line.includes(AUDIO));
  assert.ok(!line.includes(KEY));
  assert.ok(!line.includes(KEY.slice(0, 20)));
  assert.ok(!line.includes(TOKEN));
  assert.ok(line.includes('key_len=45'));
  assert.ok(line.includes('key_clean_len=43'));
  assert.ok(line.includes('pid_raw_len=12'));
  assert.ok(line.includes('pid_clean_len=12'));
});

test('gemini diag line reports unparseable body as unknown without echoing it', () => {
  const RAW = 'AUDIO_BYTES_' + 'A'.repeat(80);
  const line = geminiFailureDiagLine({
    upStatus: 502,
    body: RAW,
    model: 'gemini-3.6-flash',
    mimeType: 'weird type!',
    audioBytes: 7,
    keyLen: 5,
    keyCleanLen: 5,
    pidRawLen: 5,
    pidCleanLen: 5,
  });
  assert.ok(line.includes('err_status=unknown'));
  assert.ok(line.includes('mime=invalid'));
  assert.ok(!line.includes(RAW));
});
