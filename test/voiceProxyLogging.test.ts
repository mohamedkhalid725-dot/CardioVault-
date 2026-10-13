import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from '../voice-proxy/src/index.ts';
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
