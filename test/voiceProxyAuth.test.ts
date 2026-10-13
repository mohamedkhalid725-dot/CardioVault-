import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyFirebaseIdToken } from '../voice-proxy/src/auth.ts';
import { isAllowedOrigin } from '../voice-proxy/src/cors.ts';
import { hashUid, RATE_LIMIT_PER_HOUR } from '../voice-proxy/src/rateLimit.ts';

const PROJECT = 'ccu-notebook-test';

async function signedJwt(opts: {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: string;
  key?: CryptoKey;
  kid?: string;
}): Promise<{ token: string; jwks: ReturnType<typeof createLocalJWKSet> }> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const kid = opts.kid ?? 'test-key-1';
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] });
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ sub: opts.sub === undefined ? 'doctor-uid-1' : opts.sub })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT);
  if (opts.exp === 'past') jwt.setExpirationTime(now - 60);
  else jwt.setExpirationTime(now + 3600);
  const token = await jwt.sign(opts.key ?? privateKey);
  return { token, jwks };
}

test('valid Firebase ID token returns the uid', async () => {
  const { token, jwks } = await signedJwt({});
  const out = await verifyFirebaseIdToken(token, PROJECT, jwks);
  assert.equal(out.uid, 'doctor-uid-1');
});

test('wrong audience is rejected', async () => {
  const { token, jwks } = await signedJwt({ aud: 'some-other-project' });
  await assert.rejects(() => verifyFirebaseIdToken(token, PROJECT, jwks));
});

test('wrong issuer is rejected', async () => {
  const { token, jwks } = await signedJwt({ iss: 'https://securetoken.google.com/evil' });
  await assert.rejects(() => verifyFirebaseIdToken(token, PROJECT, jwks));
});

test('expired token is rejected', async () => {
  const { token, jwks } = await signedJwt({ exp: 'past' });
  await assert.rejects(() => verifyFirebaseIdToken(token, PROJECT, jwks));
});

test('empty sub is rejected', async () => {
  const { token, jwks } = await signedJwt({ sub: '' });
  await assert.rejects(() => verifyFirebaseIdToken(token, PROJECT, jwks));
});

test('garbage token is rejected', async () => {
  const { jwks } = await signedJwt({});
  await assert.rejects(() => verifyFirebaseIdToken('not.a.jwt', PROJECT, jwks));
});

test('token signed by another key is rejected', async () => {
  const { token } = await signedJwt({});
  const other = await generateKeyPair('RS256');
  const otherJwk = await exportJWK(other.publicKey);
  const otherSet = createLocalJWKSet({ keys: [{ ...otherJwk, kid: 'other', alg: 'RS256', use: 'sig' }] });
  await assert.rejects(() => verifyFirebaseIdToken(token, PROJECT, otherSet));
});

test('CORS allows app origins and localhost, rejects others', () => {
  assert.equal(isAllowedOrigin('https://localhost', ''), true);
  assert.equal(isAllowedOrigin('http://localhost', ''), true);
  assert.equal(isAllowedOrigin('https://ccu-notebook.web.app', ''), true);
  assert.equal(isAllowedOrigin('https://ccu-notebook.firebaseapp.com', ''), true);
  assert.equal(isAllowedOrigin(null, ''), true);
  assert.equal(isAllowedOrigin('https://evil.example.com', ''), false);
  assert.equal(isAllowedOrigin('https://preview-123.example.com', 'https://preview-123.example.com'), true);
});

test('uid hash is stable, opaque, and limit constant is sane', async () => {
  const a = await hashUid('doctor-uid-1');
  assert.equal(a, await hashUid('doctor-uid-1'));
  assert.notEqual(a, await hashUid('doctor-uid-2'));
  assert.ok(!a.includes('doctor-uid-1'));
  assert.equal(RATE_LIMIT_PER_HOUR, 60);
});
