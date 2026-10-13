// Firebase Auth ID token verification for the voice proxy.
// Runs on Cloudflare Workers; pure enough to unit-test under node:test
// by injecting a local JWKS (production uses Google's securetoken keys).
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SECURETOKEN_KEYS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface FirebaseIdClaims {
  uid: string;
}

type VerifyKey = Parameters<typeof jwtVerify>[1];

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  key?: VerifyKey,
): Promise<FirebaseIdClaims> {
  if (!token || !projectId) throw new Error('Missing token or project id.');
  const jwks = key ?? createRemoteJWKSet(new URL(SECURETOKEN_KEYS_URL));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid) throw new Error('Token has no subject.');
  return { uid };
}
