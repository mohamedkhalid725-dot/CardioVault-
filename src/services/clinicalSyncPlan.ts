/**
 * Pure planning for the clinical cloud sync.
 *
 * The bridge used to re-upload every unit, bed and patient on every local save
 * and to list the whole remote collection to find deletions. On the Firebase
 * Spark plan that is enough write/read traffic to exhaust the daily quota, and a
 * failed upload then blocked admissions at the UI. This module decides what a
 * single sync must actually send: only documents whose content changed, plus
 * explicit deletions (tombstones). It has no I/O so it can be unit tested.
 */

export type SyncCollection = 'units' | 'beds' | 'patients';

export interface SyncWriteOperation {
  collection: SyncCollection;
  id: string;
  data: Record<string, unknown>;
}

export interface SyncDeleteOperation {
  collection: SyncCollection;
  id: string;
}

export interface SyncManifest {
  workspaceId: string;
  docs: Record<string, string>;
}

export interface ComputeSyncPlanInput {
  workspaceId: string;
  manifest: SyncManifest | null;
  units: Array<Record<string, unknown>>;
  beds: Array<Record<string, unknown>>;
  patients: Array<Record<string, unknown>>;
  /** Per-collection scope filter; mirrors what the Firestore rules allow. */
  scope: (collection: SyncCollection, record: Record<string, unknown>) => boolean;
  /** Deletions the user performed locally, waiting to be applied remotely. */
  tombstones?: SyncDeleteOperation[];
}

export interface ComputeSyncPlanResult {
  writes: SyncWriteOperation[];
  deletes: SyncDeleteOperation[];
  nextManifest: SyncManifest;
  /** Records skipped because their hash matches the previous upload. */
  unchanged: number;
}

export const SYNC_COLLECTIONS: SyncCollection[] = ['units', 'beds', 'patients'];

export function recordKey(collection: SyncCollection, id: string): string {
  return `${collection}/${id}`;
}

function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return JSON.stringify(String(value));
  if (typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (typeof value !== 'object') return 'null';
  if (seen.has(value as object)) return 'null';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item, seen)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key], seen)}`).join(',')}}`;
}

/** Stable content hash: key order never changes it, so a no-op save is visible. */
export function hashRecord(record: unknown): string {
  const text = stableStringify(record);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}:${text.length.toString(36)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

export function computeSyncPlan(input: ComputeSyncPlanInput): ComputeSyncPlanResult {
  const previous = input.manifest && input.manifest.workspaceId === input.workspaceId
    ? input.manifest.docs
    : {};
  const docs: Record<string, string> = {};
  const writes: SyncWriteOperation[] = [];
  let unchanged = 0;

  const consider = (collection: SyncCollection, records: Array<Record<string, unknown>>) => {
    for (const record of records) {
      const id = String(record?.id ?? '').trim();
      if (!id) continue;
      if (!input.scope(collection, record)) continue;
      const key = recordKey(collection, id);
      const hash = hashRecord(record);
      docs[key] = hash;
      if (previous[key] === hash) {
        unchanged += 1;
        continue;
      }
      writes.push({ collection, id, data: record });
    }
  };

  consider('units', input.units);
  consider('beds', input.beds);
  consider('patients', input.patients);

  const deletes: SyncDeleteOperation[] = [];
  const seenDeletes = new Set<string>();
  for (const tombstone of input.tombstones ?? []) {
    if (!tombstone || !SYNC_COLLECTIONS.includes(tombstone.collection)) continue;
    const id = String(tombstone.id ?? '').trim();
    if (!id) continue;
    const key = recordKey(tombstone.collection, id);
    if (seenDeletes.has(key)) continue;
    seenDeletes.add(key);
    // A document that still exists locally is not deleted, even if a stale
    // tombstone survived a crash: the live record wins.
    if (docs[key]) continue;
    delete docs[key];
    deletes.push({ collection: tombstone.collection, id });
  }

  // Keys that existed before but are neither uploaded nor tombstoned are left in
  // the manifest: local data may simply be filtered out for this account scope,
  // and remote documents are never deleted from "missing locally" alone.
  for (const key of Object.keys(previous)) {
    if (!docs[key] && !seenDeletes.has(key)) docs[key] = previous[key];
  }

  return { writes, deletes, nextManifest: { workspaceId: input.workspaceId, docs }, unchanged };
}

export function chunkOperations<T>(operations: T[], size = 400): T[][] {
  const limit = Math.max(1, Math.trunc(size));
  const chunks: T[][] = [];
  for (let index = 0; index < operations.length; index += limit) {
    chunks.push(operations.slice(index, index + limit));
  }
  return chunks;
}

export function scopeRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(record);
}
