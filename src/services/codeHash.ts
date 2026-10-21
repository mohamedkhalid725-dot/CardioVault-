// Single source of truth for the SHA-256 code hashing used by every access code
// and invite code. The hash doubles as the Firestore document id
// (/accessCodes/{hash}, /invites/{hash}, workspaces/{ws}/invites/{hash}), so the
// algorithm must stay byte-identical to the one the old Unit Access Codes used:
// trim, upper-case, UTF-8 encode, SHA-256, lower-case hex.
//
// The same value is what the security rules read back out of
// `request.resource.data.accessCodeHash` / `inviteId` when they look the code up,
// so changing the normalisation here would invalidate every code already issued.
export async function sha256Hex(value: string): Promise<string> {
  const normalized = String(value ?? '').trim().toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
