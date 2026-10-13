// Firebase Auth ID token verification for the voice proxy.
// Runs on Cloudflare Workers; pure enough to unit-test under node:test
// by injecting a local JWKS (production uses Google's securetoken keys).
import { createRemoteJWKSet, jwtVerify } from 'jose';

// JWKS (JSON) endpoint for Firebase securetoken keys. This must be the
// service_accounts/v1/jwk URL — NOT the robot/v1/metadata/x509 URL, which
// serves PEM certificates that a JWKS client cannot parse.
export const SECURETOKEN_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface FirebaseIdClaims {
  uid: string;
}

export type VerifyFailureReason =
  | 'missing_token'
  | 'bad_signature'
  | 'expired'
  | 'iss_mismatch'
  | 'aud_mismatch'
  | 'jwks_fetch_failed'
  | 'missing_subject'
  | 'unknown_verify_error';

export class VerifyError extends Error {
  readonly reason: VerifyFailureReason;
  readonly code: string;
  constructor(reason: VerifyFailureReason, code = '') {
    super(`Token rejected: ${reason}`);
    this.name = 'VerifyError';
    this.reason = reason;
    this.code = code;
  }
}

type VerifyKey = Parameters<typeof jwtVerify>[1];

export function mapVerifyError(error: unknown): { reason: VerifyFailureReason; code: string } {
  const code = String((error as { code?: unknown })?.code || '');
  const msg = String((error as { message?: unknown })?.message || error || '');
  if (code === 'ERR_JWT_EXPIRED') return { reason: 'expired', code };
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    if (msg.includes('"aud"')) return { reason: 'aud_mismatch', code };
    if (msg.includes('"iss"')) return { reason: 'iss_mismatch', code };
    return { reason: 'unknown_verify_error', code };
  }
  if (
    code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ||
    code === 'ERR_JWS_INVALID' ||
    code === 'ERR_JWT_MALFORMED' ||
    code === 'ERR_JWKS_NO_MATCHING_KEY'
  ) {
    return { reason: 'bad_signature', code };
  }
  if (code.startsWith('ERR_JWKS')) return { reason: 'jwks_fetch_failed', code };
  return { reason: 'unknown_verify_error', code };
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  key?: VerifyKey,
): Promise<FirebaseIdClaims> {
  if (!token || !projectId) throw new VerifyError('missing_token');
  const jwks = key ?? createRemoteJWKSet(new URL(SECURETOKEN_KEYS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }));
  } catch (error) {
    const mapped = mapVerifyError(error);
    throw new VerifyError(mapped.reason, mapped.code);
  }
  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid) throw new VerifyError('missing_subject');
  return { uid };
}
