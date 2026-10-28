import type { LocalAuditEvent } from '../types/departmentTeam';

/**
 * Local, append-only audit buffer for the Department Team preview.
 *
 * Scope and limits (deliberate):
 *  - This module is pure TypeScript: no React, no Firebase, no network. It is
 *    the *local* half of the audit story and it never claims to be the durable
 *    cloud copy (`unitAudit.ts` owns that).
 *  - A failed remote write is NEVER silently swallowed. The event stays in this
 *    buffer with `unsynced: true` and the caller is told, in the return value,
 *    that the event was not persisted remotely.
 *  - History is append-only. No function edits the content of an existing event
 *    or removes a single event; `markSynced` only flips the `unsynced` flag and
 *    `clearAuditLog` wipes the whole preview buffer (documented as preview-only).
 *  - There is no storage guarantee. If `localStorage` is missing, blocked, full
 *    or corrupt, the event is kept in an in-memory buffer and the next append
 *    retries the write. `persisted: false` means exactly "not on disk".
 *
 * Storage is injected in tests (and may be injected by callers); the default is
 * `globalThis.localStorage` when it is usable.
 */

export const AUDIT_STORAGE_KEY = 'cardiovault_dt_audit_v1';

/** Schema version stamped on every event this module creates. */
export const AUDIT_SCHEMA_VERSION = 1;

/** Default number of events returned by `listAuditEvents`. */
export const DEFAULT_AUDIT_LIST_LIMIT = 200;

/**
 * Keys removed from `meta` before anything is stored. Matching is a
 * case-insensitive SUBSTRING test, so `authToken`, `apiKey` and `cardNumber`
 * are all stripped. The substring rule is intentionally blunt: a false positive
 * loses one meta field, a false negative would persist a credential.
 */
export const FORBIDDEN_META_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'card',
  'cvv',
  'pin',
] as const;

/** The minimal storage contract this module needs. */
export interface AuditStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuditEventInput {
  workspaceId: string;
  unitId: string;
  actorUid: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  result: 'success' | 'failure';
  summary: string;
  meta?: Record<string, string | number | boolean>;
  /** Injected clock; defaults to `Date.now()`. */
  nowMs?: number;
}

export interface AppendAuditResult {
  event: LocalAuditEvent;
  /** True when the event reached the injected/default storage. */
  persisted: boolean;
  /** Meta keys that were removed (forbidden or not a primitive value). */
  metaStripped: string[];
}

export interface RemoteAuditResult {
  event: LocalAuditEvent;
  /** True only when `remoteWriter` resolved. */
  remotePersisted: boolean;
  /** Present only when the remote write failed. Never empty on failure. */
  error?: string;
}

export interface AuditFilter {
  unitId?: string;
  actorUid?: string;
  result?: 'success' | 'failure';
  /** Newest-first window size. Defaults to 200; 0 returns no rows. */
  limit?: number;
}

export interface MarkSyncedResult {
  updated: number;
  persisted: boolean;
}

type ReadState = { ok: boolean; events: LocalAuditEvent[] };

/**
 * Events that could not be written to storage. They are re-offered on every
 * later append/markSynced, and they are always visible to readers, so a failed
 * write never hides an audit event from the person looking at the screen.
 */
let memoryEvents: LocalAuditEvent[] = [];

let idCounter = 0;

const MAX_SUMMARY_LENGTH = 200;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isForbiddenKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return FORBIDDEN_META_KEYS.some((forbidden) => lower.includes(forbidden));
};

const defaultStorage = (): AuditStorage | null => {
  // Access happens lazily, inside try/catch: importing this module must never
  // throw, even in an environment without `localStorage` (Node test runner).
  try {
    const candidate = (globalThis as { localStorage?: AuditStorage }).localStorage;
    if (
      !candidate ||
      typeof candidate.getItem !== 'function' ||
      typeof candidate.setItem !== 'function' ||
      typeof candidate.removeItem !== 'function'
    ) {
      return null;
    }
    const probeKey = `${AUDIT_STORAGE_KEY}__probe`;
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch {
    return null;
  }
};

const isStoredEvent = (value: unknown): value is LocalAuditEvent => {
  const event = value as Partial<LocalAuditEvent> | null;
  return (
    !!event &&
    typeof event === 'object' &&
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    typeof event.atMs === 'number' &&
    Number.isFinite(event.atMs)
  );
};

/**
 * Reads the storage copy.
 *
 * `ok: false` means the storage could not be read at all (missing or throwing).
 * The caller then writes nothing: valid data it could not read must not be
 * overwritten by a partial in-memory copy.
 *
 * Corrupt JSON is a different case: it is reported as an empty log (`ok: true`),
 * matching the documented "corrupt JSON reads as []" rule, so the next append
 * can repair the key.
 */
const readState = (storage?: AuditStorage): ReadState => {
  const store = storage || defaultStorage();
  if (!store) return { ok: false, events: [] };
  let raw: string | null;
  try {
    raw = store.getItem(AUDIT_STORAGE_KEY);
  } catch {
    return { ok: false, events: [] };
  }
  if (raw === null || raw === undefined || raw === '') return { ok: true, events: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: true, events: [] };
    return { ok: true, events: parsed.filter(isStoredEvent) };
  } catch {
    return { ok: true, events: [] };
  }
};

const writeState = (storage: AuditStorage | undefined, events: LocalAuditEvent[]): boolean => {
  const store = storage || defaultStorage();
  if (!store) return false;
  try {
    store.setItem(AUDIT_STORAGE_KEY, JSON.stringify(sortOldestFirst(events)));
    return true;
  } catch {
    return false;
  }
};

const sortOldestFirst = (events: LocalAuditEvent[]): LocalAuditEvent[] =>
  [...events].sort((a, b) => a.atMs - b.atMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const sortNewestFirst = (events: LocalAuditEvent[]): LocalAuditEvent[] =>
  [...events].sort((a, b) => b.atMs - a.atMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

/** Deduplicates by id; the later copy wins (memory over disk, new over old). */
const mergeUnique = (events: LocalAuditEvent[]): LocalAuditEvent[] => {
  const byId = new Map<string, LocalAuditEvent>();
  for (const event of events) {
    if (event && typeof event.id === 'string' && event.id) byId.set(event.id, event);
  }
  return [...byId.values()];
};

const nextId = (nowMs: number, existingIds: Set<string>): string => {
  let candidate = '';
  do {
    idCounter += 1;
    candidate = `audit-${nowMs}-${idCounter}`;
  } while (existingIds.has(candidate));
  return candidate;
};

const sanitizeMeta = (
  meta: Record<string, unknown> | undefined,
): { meta?: Record<string, string | number | boolean>; stripped: string[] } => {
  if (!meta || typeof meta !== 'object') return { stripped: [] };
  const clean: Record<string, string | number | boolean> = {};
  const stripped: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (isForbiddenKey(key)) {
      stripped.push(key);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
      continue;
    }
    // Nested objects/arrays could hide a credential one level down. They are
    // dropped rather than stringified, and reported like a forbidden key.
    stripped.push(key);
  }
  return Object.keys(clean).length ? { meta: clean, stripped } : { stripped };
};

const fail = (): never => {
  throw new Error('invalid-audit-event');
};

const createEvent = (
  input: AuditEventInput,
  existingIds: Set<string>,
): { event: LocalAuditEvent; metaStripped: string[] } => {
  const workspaceId = text(input?.workspaceId);
  const unitId = text(input?.unitId);
  const actorUid = text(input?.actorUid);
  const action = text(input?.action);
  const entityType = text(input?.entityType);
  const entityId = text(input?.entityId);
  if (!workspaceId || !unitId || !actorUid || !action || !entityType || !entityId) fail();
  if (input?.result !== 'success' && input?.result !== 'failure') fail();

  const nowMs = Number.isFinite(input?.nowMs) ? Math.floor(Number(input.nowMs)) : Date.now();
  const { meta, stripped } = sanitizeMeta(input?.meta);
  const actorName = text(input?.actorName);

  const event: LocalAuditEvent = {
    id: nextId(nowMs, existingIds),
    atMs: nowMs,
    workspaceId,
    unitId,
    actorUid,
    action,
    entityType,
    entityId,
    result: input.result,
    summary: String(input?.summary ?? '').trim().slice(0, MAX_SUMMARY_LENGTH),
    schemaVersion: AUDIT_SCHEMA_VERSION,
  };
  if (actorName) event.actorName = actorName;
  if (meta) event.meta = meta;
  return { event, metaStripped: stripped };
};

/** Writes one event, folding in anything still waiting in memory. */
const commitEvent = (
  event: LocalAuditEvent,
  storage: AuditStorage | undefined,
  read: ReadState,
): boolean => {
  const combined = sortOldestFirst(mergeUnique([...(read.ok ? read.events : []), ...memoryEvents, event]));
  if (!read.ok) {
    // The previous log could not be read. Attempting a write here would replace
    // data we never saw, so the failure is surfaced and retried on a later call.
    memoryEvents = combined;
    return false;
  }
  const persisted = writeState(storage, combined);
  // On failure the combined list (including the events that were on disk) stays
  // in memory so the next append re-writes the whole log instead of losing it.
  memoryEvents = persisted ? [] : combined;
  return persisted;
};

const currentEvents = (read: ReadState): LocalAuditEvent[] =>
  mergeUnique([...(read.ok ? read.events : []), ...memoryEvents]);

const errorText = (error: unknown): string => {
  const value = error as { message?: unknown } | null;
  const message = String(value?.message ?? error ?? '').trim();
  return message.slice(0, 500) || 'audit-remote-write-failed';
};

/**
 * Appends one event to the local buffer.
 *
 * Throws `Error('invalid-audit-event')` only for an invalid input (a coding
 * mistake). Storage problems never throw: they return `persisted: false` and the
 * event is retained in memory.
 */
export function appendAuditEvent(input: AuditEventInput, storage?: AuditStorage): AppendAuditResult {
  const read = readState(storage);
  const existingIds = new Set(currentEvents(read).map((event) => event.id));
  const { event, metaStripped } = createEvent(input, existingIds);
  const persisted = commitEvent(event, storage, read);
  return { event, persisted, metaStripped };
}

/**
 * Writes through an injected remote writer (the caller owns Firestore).
 *
 * Success: the event is marked synced (`unsynced: false`) and nothing is added
 * to the local buffer; `remotePersisted` is true.
 * Failure: the event is appended locally with `unsynced: true` and the failure
 * is reported through `remotePersisted: false` plus `error`. It is never
 * swallowed and the caller must not show it as saved to the cloud.
 */
export async function writeRemoteWithAudit(
  input: AuditEventInput,
  remoteWriter: (event: LocalAuditEvent) => Promise<void>,
  storage?: AuditStorage,
): Promise<RemoteAuditResult> {
  const read = readState(storage);
  const existingIds = new Set(currentEvents(read).map((event) => event.id));
  const { event } = createEvent(input, existingIds);

  try {
    if (typeof remoteWriter !== 'function') throw new Error('audit-remote-writer-missing');
    await remoteWriter(event);
    event.unsynced = false;
    return { event, remotePersisted: true };
  } catch (error) {
    event.unsynced = true;
    commitEvent(event, storage, read);
    return { event, remotePersisted: false, error: errorText(error) };
  }
}

/** Newest first. Filters are exact matches; `limit` defaults to 200. */
export function listAuditEvents(filter: AuditFilter = {}, storage?: AuditStorage): LocalAuditEvent[] {
  const read = readState(storage);
  const limitValue = filter?.limit;
  const limit = Number.isFinite(limitValue)
    ? Math.max(0, Math.floor(Number(limitValue)))
    : DEFAULT_AUDIT_LIST_LIMIT;
  return sortNewestFirst(
    currentEvents(read).filter(
      (event) =>
        (!filter?.unitId || event.unitId === filter.unitId) &&
        (!filter?.actorUid || event.actorUid === filter.actorUid) &&
        (!filter?.result || event.result === filter.result),
    ),
  ).slice(0, limit);
}

/** Events whose remote write failed and that are still only local. */
export function pendingUnsynced(storage?: AuditStorage): LocalAuditEvent[] {
  const read = readState(storage);
  return sortNewestFirst(currentEvents(read).filter((event) => event.unsynced === true));
}

/**
 * Flips `unsynced` to false for the given ids. Content, timestamps and order are
 * untouched; nothing is deleted and unknown ids are ignored.
 */
export function markSynced(ids: string[], storage?: AuditStorage): MarkSyncedResult {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
  const read = readState(storage);
  let updated = 0;
  const next = sortOldestFirst(currentEvents(read)).map((event) => {
    if (event.unsynced === true && wanted.has(event.id)) {
      updated += 1;
      return { ...event, unsynced: false };
    }
    return event;
  });
  if (updated === 0 && memoryEvents.length === 0) {
    return { updated: 0, persisted: read.ok };
  }
  if (!read.ok) {
    memoryEvents = next;
    return { updated, persisted: false };
  }
  const persisted = writeState(storage, next);
  memoryEvents = persisted ? [] : next;
  return { updated, persisted };
}

/**
 * PREVIEW-ONLY. Empties the whole local buffer (memory included). It is meant
 * for demo reset only: it is the single destructive entry point in this module
 * and it never pretends to touch the cloud copy.
 */
export function clearAuditLog(storage?: AuditStorage): void {
  memoryEvents = [];
  const store = storage || defaultStorage();
  if (!store) return;
  try {
    store.removeItem(AUDIT_STORAGE_KEY);
  } catch {
    // A preview reset must never throw; the in-memory copy is already empty.
  }
}
