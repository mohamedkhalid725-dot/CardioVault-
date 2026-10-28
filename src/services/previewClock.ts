/**
 * Preview clock override for local lifecycle testing.
 *
 * The approved verification list requires demonstrating the 3-day trial, the
 * 30-day code period, the 3-day grace and the read-only transition without
 * waiting real days. This module lets the test UI pin a "simulated now" value
 * in localStorage; all new clinic-area services read their clock from here so
 * the whole lifecycle can be fast-forwarded safely.
 *
 * Local preview only. Never used by production code paths.
 */

export const CLOCK_OVERRIDE_KEY = 'cardiovault_dt_preview_clock_override_v1';

export function readClockOverrideMs(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): number | null {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return null;
    const raw = store.getItem(CLOCK_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = Number(JSON.parse(raw).nowMs);
    if (!Number.isFinite(parsed) || parsed <= 24 * 3600 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeClockOverrideMs(nowMs: number, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): void {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return;
    if (!Number.isFinite(nowMs)) return;
    store.setItem(CLOCK_OVERRIDE_KEY, JSON.stringify({ nowMs: Math.floor(nowMs) }));
  } catch {
    /* storage may be blocked in restrictive browsers; ignore */
  }
}

export function clearClockOverrideMs(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): void {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return;
    store.removeItem(CLOCK_OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

/** The clock every new clinic-area service must use instead of Date.now(). */
export function previewNowMs(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): number {
  const override = readClockOverrideMs(storage);
  if (override !== null) return override;
  return Date.now();
}
