// CORS allowlist for POST /transcribe. Always allows the Firebase Hosting
// suffixes and the Capacitor Android origins; extra hosts come from the
// ALLOWED_ORIGINS env var (comma-separated, exact match). Requests without
// an Origin header (native clients) are allowed.
export function isAllowedOrigin(origin: string | null, extraCsv: string): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost') return true;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return true;
  const extra = extraCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin.trim());
}
