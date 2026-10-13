// Per-uid soft rate limit bookkeeping. Only the uid HASH is ever stored or
// logged — never the raw uid, audio, transcripts, or patient data.
export const RATE_LIMIT_PER_HOUR = 60;
export const RATE_WINDOW_SECONDS = 3600;

export async function hashUid(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export function rateLimitKey(uidHash: string): string {
  return `voice-rl:${uidHash}`;
}
