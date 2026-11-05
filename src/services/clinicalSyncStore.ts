/**
 * Persistence for the clinical sync engine: the per-workspace fingerprint
 * manifest, explicit deletion tombstones, and a durable record of the last cloud
 * failure. Nothing here talks to Firestore, so every helper is unit-testable.
 */

import type { SyncDeleteOperation, SyncManifest } from './clinicalSyncPlan';

export const SYNC_MANIFEST_KEY = 'cardiovault_cloud_sync_manifest_v2';
export const PENDING_DELETES_KEY = 'cardiovault_pending_deletes_v1';
export const CLOUD_HEALTH_KEY = 'cardiovault_cloud_health_v1';
export const QUOTA_COOLDOWN_KEY = 'cardiovault_cloud_quota_cooldown_until';
export const PENDING_LIFECYCLE_KEY = 'cardiovault_pending_master_lifecycle_v1';
export const LAST_SYNC_KEY = 'cardiovault_last_cloud_sync';
export const LAST_ERROR_KEY = 'cardiovault_last_cloud_sync_error';
export const LAST_ERROR_DETAIL_KEY = 'cardiovault_last_cloud_sync_error_detail';

export type SyncErrorKind = 'quota' | 'permission' | 'auth' | 'unreachable' | 'deadline' | 'unknown';

export interface CloudHealth {
  lastErrorAt: string;
  lastErrorDetail: string;
  lastErrorKind: SyncErrorKind | 'none';
  lastSyncAt: string;
  pendingLifecycle: number;
  pendingDeletes: number;
  quotaCooldownUntil: number;
  quotaCoolingDown: boolean;
}

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: non-fatal */ }
};

const notifyHealthChanged = (): void => {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cardiovault-cloud-health-changed'));
  } catch { /* non-browser context */ }
};

/** Error classification drives retry/cooldown behaviour in the bridge. */
export function classifySyncError(error: unknown): SyncErrorKind {
  const value = error as any;
  const code = String(value?.code || value?.errorCode || '').toLowerCase();
  const message = String(value?.message || value?.errorMessage || error || '').toLowerCase();
  const text = `${code} ${message}`;
  if (text.includes('resource-exhausted') || text.includes('quota') || text.includes('exceeded')) return 'quota';
  if (text.includes('permission-denied') || text.includes('missing or insufficient permissions')) return 'permission';
  if (text.includes('unauthenticated') || text.includes('auth/') || text.includes('not signed in')) return 'auth';
  if (text.includes('deadline') || text.includes('timed out') || text.includes('timeout')) return 'deadline';
  if (text.includes('unavailable') || text.includes('network') || text.includes('offline') || text.includes('failed to get document') || text.includes('could not reach')) return 'unreachable';
  return 'unknown';
}

export function loadManifest(workspaceId: string): SyncManifest | null {
  const manifests = readJson<Record<string, SyncManifest>>(SYNC_MANIFEST_KEY);
  const stored = manifests?.[workspaceId];
  return stored && stored.workspaceId === workspaceId ? stored : null;
}

export function saveManifest(manifest: SyncManifest): void {
  const manifests = readJson<Record<string, SyncManifest>>(SYNC_MANIFEST_KEY) ?? {};
  manifests[manifest.workspaceId] = manifest;
  writeJson(SYNC_MANIFEST_KEY, manifests);
}

export function clearManifest(workspaceId?: string): void {
  if (!workspaceId) { localStorage.removeItem(SYNC_MANIFEST_KEY); return; }
  const manifests = readJson<Record<string, SyncManifest>>(SYNC_MANIFEST_KEY) ?? {};
  delete manifests[workspaceId];
  writeJson(SYNC_MANIFEST_KEY, manifests);
}

export function enqueueDeletion(operation: SyncDeleteOperation): void {
  const queue = readJson<SyncDeleteOperation[]>(PENDING_DELETES_KEY) ?? [];
  const key = `${operation.collection}/${operation.id}`;
  if (queue.some(item => `${item.collection}/${item.id}` === key)) return;
  queue.push({ collection: operation.collection, id: operation.id });
  writeJson(PENDING_DELETES_KEY, queue.slice(-500));
}

export function peekDeletions(): SyncDeleteOperation[] {
  return readJson<SyncDeleteOperation[]>(PENDING_DELETES_KEY) ?? [];
}

export function removeDeletions(operations: SyncDeleteOperation[]): void {
  const done = new Set(operations.map(item => `${item.collection}/${item.id}`));
  const remaining = peekDeletions().filter(item => !done.has(`${item.collection}/${item.id}`));
  writeJson(PENDING_DELETES_KEY, remaining);
}

export function pendingLifecycleCount(): number {
  const queue = readJson<Array<Record<string, unknown>>>(PENDING_LIFECYCLE_KEY) ?? [];
  return Array.isArray(queue) ? queue.length : 0;
}

export function isQuotaCoolingDown(now = Date.now()): boolean {
  const until = Number(localStorage.getItem(QUOTA_COOLDOWN_KEY) || 0);
  return Number.isFinite(until) && until > now;
}

export function setQuotaCooldown(ms: number, now = Date.now()): void {
  localStorage.setItem(QUOTA_COOLDOWN_KEY, String(now + Math.max(0, ms)));
  notifyHealthChanged();
}

export function clearQuotaCooldown(): void {
  localStorage.removeItem(QUOTA_COOLDOWN_KEY);
}

export function recordCloudSuccess(workspaceId?: string): void {
  const now = new Date().toISOString();
  localStorage.setItem(LAST_SYNC_KEY, now);
  // The last failure is intentionally kept: a later success must not erase the
  // evidence the user needs to report a problem. Only an explicit dismiss clears it.
  const health = readJson<Record<string, unknown>>(CLOUD_HEALTH_KEY) ?? {};
  writeJson(CLOUD_HEALTH_KEY, { ...health, lastSyncAt: now, workspaceId: workspaceId ?? health.workspaceId ?? null });
  clearQuotaCooldown();
  notifyHealthChanged();
}

export function recordCloudFailure(error: unknown, kind: SyncErrorKind = classifySyncError(error)): void {
  const now = new Date().toISOString();
  const detail = String((error as any)?.message || (error as any)?.errorMessage || error || 'Unknown cloud error').slice(0, 500);
  localStorage.setItem(LAST_ERROR_KEY, now);
  localStorage.setItem(LAST_ERROR_DETAIL_KEY, detail);
  const health = readJson<Record<string, unknown>>(CLOUD_HEALTH_KEY) ?? {};
  writeJson(CLOUD_HEALTH_KEY, { ...health, lastErrorAt: now, lastErrorDetail: detail, lastErrorKind: kind });
  notifyHealthChanged();
}

export function dismissCloudError(): void {
  localStorage.removeItem(LAST_ERROR_KEY);
  localStorage.removeItem(LAST_ERROR_DETAIL_KEY);
  const health = readJson<Record<string, unknown>>(CLOUD_HEALTH_KEY) ?? {};
  writeJson(CLOUD_HEALTH_KEY, { ...health, lastErrorAt: '', lastErrorDetail: '', lastErrorKind: 'none' });
  notifyHealthChanged();
}

export function getCloudHealth(now = Date.now()): CloudHealth {
  const health = readJson<Record<string, unknown>>(CLOUD_HEALTH_KEY) ?? {};
  const cooldownUntil = Number(localStorage.getItem(QUOTA_COOLDOWN_KEY) || 0);
  return {
    lastErrorAt: String(health.lastErrorAt || localStorage.getItem(LAST_ERROR_KEY) || ''),
    lastErrorDetail: String(health.lastErrorDetail || localStorage.getItem(LAST_ERROR_DETAIL_KEY) || ''),
    lastErrorKind: (String(health.lastErrorKind || 'none') as SyncErrorKind | 'none'),
    lastSyncAt: String(health.lastSyncAt || localStorage.getItem(LAST_SYNC_KEY) || ''),
    pendingLifecycle: pendingLifecycleCount(),
    pendingDeletes: peekDeletions().length,
    quotaCooldownUntil: cooldownUntil,
    quotaCoolingDown: cooldownUntil > now,
  };
}

export function clearCloudHealth(): void {
  localStorage.removeItem(CLOUD_HEALTH_KEY);
  localStorage.removeItem(LAST_ERROR_KEY);
  localStorage.removeItem(LAST_ERROR_DETAIL_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(QUOTA_COOLDOWN_KEY);
}

/**
 * The pending master-file events live in AppContext, but both sync bridges (web
 * and native) must flush them after a successful upload. The handler is
 * registered once at app start and shared through this module.
 */
let lifecycleFlushHandler: ((workspaceId: string) => Promise<void>) | null = null;

export function setLifecycleFlushHandler(handler: ((workspaceId: string) => Promise<void>) | null): void {
  lifecycleFlushHandler = handler;
}

export async function runLifecycleFlush(workspaceId: string): Promise<void> {
  if (!lifecycleFlushHandler) return;
  try { await lifecycleFlushHandler(workspaceId); }
  catch (error) { console.warn('Pending lifecycle event flush failed:', error); }
}
