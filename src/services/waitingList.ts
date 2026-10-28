/**
 * Unit waiting list — pure local-preview logic.
 *
 * PRODUCT LIMIT (do not change without a product decision):
 * this repository defines NO clinical priority model. There is deliberately no
 * `priority`, `urgency`, `triageLevel` or score field on a waiting entry, and no
 * role-based permission rules live here. A waiting list is a queue of requests
 * for a service, ordered by time, not a triage instrument. Adding priority is a
 * clinical/product decision, not an implementation detail.
 *
 * The module is storage-agnostic: it never touches Firebase, never imports React
 * and never reads `window` at import time. Persistence is a tiny injected
 * key/value store so tests and the local preview can share the same code.
 */

import {
  DEPARTMENT_TEAM_SCHEMA_VERSION,
  type PatientEncounter,
  type UnitCapabilities,
  type WaitingEntry,
  type WaitingEvent,
  type WaitingStatus,
} from '../types/departmentTeam.ts';
import type { Unit } from '../types/clinical.ts';

export const WAITING_STORAGE_KEY = 'cardiovault_dt_waiting_v1';

/* ─── Storage ─────────────────────────────────────────────────────────────── */

export interface WaitingListStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Fallback used in Node/tests and whenever localStorage is unavailable. */
const memoryValues = new Map<string, string>();
const memoryStorage: WaitingListStorage = {
  getItem: (key) => (memoryValues.has(key) ? String(memoryValues.get(key)) : null),
  setItem: (key, value) => {
    memoryValues.set(key, value);
  },
  removeItem: (key) => {
    memoryValues.delete(key);
  },
};

function defaultStorage(): WaitingListStorage {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {
    /* Private mode or a blocked WebView: fall through to memory. */
  }
  return memoryStorage;
}

function resolveStorage(storage?: WaitingListStorage | null): WaitingListStorage {
  return storage || defaultStorage();
}

/* ─── Capability ──────────────────────────────────────────────────────────── */

/**
 * Waiting lists are opt-in. A unit exposes one only when its stored
 * configuration says so. Units created before the config existed may carry the
 * legacy `features: ['waiting-list']` flag instead; that flag is only consulted
 * when the unit has no `config` at all, so an explicit "off" in unit settings
 * always wins.
 */
export function unitSupportsWaitingList(unit: Partial<Unit> | null | undefined): boolean {
  if (!unit) return false;
  const capabilities = (unit.config as { capabilities?: Partial<UnitCapabilities> } | undefined)?.capabilities;
  if (capabilities && typeof capabilities.waitingList === 'boolean') {
    return capabilities.waitingList === true;
  }
  const features = Array.isArray(unit.features) ? unit.features : [];
  return features.some((feature) => String(feature).trim().toLowerCase() === 'waiting-list');
}

/* ─── Persistence ─────────────────────────────────────────────────────────── */

const WAITING_STATUSES: WaitingStatus[] = ['waiting', 'ready', 'deferred', 'cancelled', 'admitted'];

const isStatus = (value: unknown): value is WaitingStatus =>
  typeof value === 'string' && (WAITING_STATUSES as string[]).includes(value);

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toMs = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

function normalizeHistory(value: unknown): WaitingEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((event): event is Record<string, unknown> => !!event && typeof event === 'object')
    .map((event) => {
      const actorName = toText(event.actorName);
      const reason = toText(event.reason);
      return {
        atMs: toMs(event.atMs, 0),
        actorUid: toText(event.actorUid),
        ...(actorName ? { actorName } : {}),
        from: isStatus(event.from) ? event.from : null,
        to: isStatus(event.to) ? event.to : 'waiting',
        ...(reason ? { reason } : {}),
      };
    });
}

function normalizeEntry(value: unknown): WaitingEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = toText(raw.id);
  const unitId = toText(raw.unitId);
  const patientId = toText(raw.patientId);
  if (!id || !unitId || !patientId || !isStatus(raw.status)) return null;
  const createdAtMs = toMs(raw.createdAtMs, 0);
  const createdByName = toText(raw.createdByName);
  const referredBy = toText(raw.referredBy);
  const notes = toText(raw.notes);
  const admittedEncounterId = toText(raw.admittedEncounterId);
  const admittedBedId = toText(raw.admittedBedId);
  const sourceOperationEntryId = toText(raw.sourceOperationEntryId);
  const cancelledReason = toText(raw.cancelledReason);
  const deferredReason = toText(raw.deferredReason);
  return {
    id,
    workspaceId: toText(raw.workspaceId),
    unitId,
    patientId,
    patientName: toText(raw.patientName),
    service: toText(raw.service),
    status: raw.status,
    createdAtMs,
    updatedAtMs: toMs(raw.updatedAtMs, createdAtMs),
    createdBy: toText(raw.createdBy),
    ...(createdByName ? { createdByName } : {}),
    ...(referredBy ? { referredBy } : {}),
    ...(notes ? { notes } : {}),
    ...(admittedEncounterId ? { admittedEncounterId } : {}),
    ...(admittedBedId ? { admittedBedId } : {}),
    ...(sourceOperationEntryId ? { sourceOperationEntryId } : {}),
    ...(cancelledReason ? { cancelledReason } : {}),
    ...(deferredReason ? { deferredReason } : {}),
    history: normalizeHistory(raw.history),
    schemaVersion: Number(raw.schemaVersion) || DEPARTMENT_TEAM_SCHEMA_VERSION,
  };
}

/** Reads the stored entries. Corrupt JSON, a wrong shape or a blocked store all yield []. */
export function loadWaitingEntries(storage?: WaitingListStorage | null): WaitingEntry[] {
  try {
    const raw = resolveStorage(storage).getItem(WAITING_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((entry): entry is WaitingEntry => entry !== null);
  } catch {
    return [];
  }
}

/** Writes the entries. Returns false when the store refused the write; never throws. */
export function saveWaitingEntries(
  entries: WaitingEntry[],
  storage?: WaitingListStorage | null
): boolean {
  try {
    resolveStorage(storage).setItem(WAITING_STORAGE_KEY, JSON.stringify(entries || []));
    return true;
  } catch {
    return false;
  }
}

/** Clears the stored entries. Returns false when the store refused; never throws. */
export function clearWaitingEntries(storage?: WaitingListStorage | null): boolean {
  try {
    resolveStorage(storage).removeItem(WAITING_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ─── Creation ────────────────────────────────────────────────────────────── */

export interface CreateWaitingEntryInput {
  workspaceId: string;
  unitId: string;
  patientId: string;
  patientName: string;
  service: string;
  createdBy: string;
  createdByName?: string;
  referredBy?: string;
  notes?: string;
  sourceOperationEntryId?: string;
}

export interface CreateWaitingEntryResult {
  entry: WaitingEntry;
  warnings: string[];
}

export const DUPLICATE_SERVICE_WARNING = 'duplicate-service';
export const SERVICE_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 500;

function nextEntryId(nowMs: number, existing: WaitingEntry[]): string {
  const base = `wait-${nowMs}`;
  const used = existing
    .map((entry) => entry?.id || '')
    .filter((id) => id.startsWith(`${base}-`))
    .map((id) => Number(id.slice(base.length + 1)))
    .filter((value) => Number.isInteger(value) && value >= 0);
  const next = used.length ? Math.max(...used) + 1 : 0;
  return `${base}-${next}`;
}

/**
 * Creates a waiting entry.
 *
 * A patient may hold several independent entries for the same service (for
 * example two separate procedures), so a duplicate is only ever a warning — it
 * is never merged and never blocked.
 */
export function createWaitingEntry(
  input: CreateWaitingEntryInput,
  existing: WaitingEntry[] = [],
  nowMs: number = Date.now()
): CreateWaitingEntryResult {
  const workspaceId = toText(input?.workspaceId);
  const unitId = toText(input?.unitId);
  const patientId = toText(input?.patientId);
  const patientName = toText(input?.patientName);
  const service = toText(input?.service);
  const createdBy = toText(input?.createdBy);

  if (!workspaceId) throw new Error('workspaceId-required');
  if (!unitId) throw new Error('unitId-required');
  if (!patientId) throw new Error('patientId-required');
  if (!patientName) throw new Error('patientName-required');
  if (!service) throw new Error('service-required');
  if (service.length > SERVICE_MAX_LENGTH) throw new Error('service-too-long');
  if (!createdBy) throw new Error('createdBy-required');

  const notes = toText(input?.notes);
  if (notes.length > NOTES_MAX_LENGTH) throw new Error('notes-too-long');

  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Number(nowMs) : Date.now();
  const list = Array.isArray(existing) ? existing : [];

  const entry: WaitingEntry = {
    id: nextEntryId(timestamp, list),
    workspaceId,
    unitId,
    patientId,
    patientName,
    service,
    status: 'waiting',
    createdAtMs: timestamp,
    updatedAtMs: timestamp,
    createdBy,
    createdByName: toText(input?.createdByName) || undefined,
    referredBy: toText(input?.referredBy) || undefined,
    notes: notes || undefined,
    ...(toText(input?.sourceOperationEntryId) ? { sourceOperationEntryId: toText(input.sourceOperationEntryId) } : {}),
    history: [
      {
        atMs: timestamp,
        actorUid: createdBy,
        actorName: toText(input?.createdByName) || undefined,
        from: null,
        to: 'waiting',
      },
    ],
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };

  const serviceKey = service.toLowerCase();
  const duplicate = list.some(
    (candidate) =>
      candidate &&
      candidate.patientId === patientId &&
      candidate.unitId === unitId &&
      (candidate.status === 'waiting' || candidate.status === 'ready') &&
      toText(candidate.service).toLowerCase() === serviceKey
  );

  return { entry, warnings: duplicate ? [DUPLICATE_SERVICE_WARNING] : [] };
}

/* ─── Transitions ─────────────────────────────────────────────────────────── */

/**
 * Allowed state machine. `cancelled` and `admitted` are terminal: a cancelled
 * request is re-created rather than reopened, and an admitted request already
 * produced an encounter.
 */
export const ALLOWED_TRANSITIONS: Record<WaitingStatus, WaitingStatus[]> = {
  waiting: ['ready', 'deferred', 'cancelled', 'admitted'],
  ready: ['waiting', 'deferred', 'cancelled', 'admitted'],
  deferred: ['waiting', 'cancelled'],
  cancelled: [],
  admitted: [],
};

export interface TransitionOptions {
  actorUid: string;
  actorName?: string;
  /** Mandatory (non-blank) when moving to `deferred` or `cancelled`. */
  reason?: string;
  nowMs?: number;
}

export function canTransition(from: WaitingStatus, to: WaitingStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * Applies a state change and returns a NEW entry. The input entry is never
 * mutated. Throws `Error('reason-required')` when a reason is mandatory and
 * missing, and `Error('invalid-transition')` for any state-machine violation.
 */
export function transitionWaitingEntry(
  entry: WaitingEntry,
  to: WaitingStatus,
  options: TransitionOptions
): WaitingEntry {
  if (!entry || !isStatus(entry.status)) throw new Error('invalid-transition');
  if (!isStatus(to) || !canTransition(entry.status, to)) throw new Error('invalid-transition');

  const reason = toText(options?.reason);
  if ((to === 'deferred' || to === 'cancelled') && !reason) {
    throw new Error('reason-required');
  }

  const timestamp =
    Number.isFinite(options?.nowMs) && Number(options?.nowMs) > 0
      ? Number(options?.nowMs)
      : Date.now();

  const history: WaitingEvent[] = [
    ...(Array.isArray(entry.history) ? entry.history : []),
    {
      atMs: timestamp,
      actorUid: toText(options?.actorUid),
      actorName: toText(options?.actorName) || undefined,
      from: entry.status,
      to,
      reason: reason || undefined,
    },
  ];

  return {
    ...entry,
    status: to,
    updatedAtMs: timestamp,
    // The oldest reason is kept when a request is deferred more than once: the
    // history array holds every reason, these fields hold the latest one.
    cancelledReason: to === 'cancelled' ? reason : entry.cancelledReason,
    deferredReason: to === 'deferred' ? reason : entry.deferredReason,
    history,
  };
}

/* ─── Admission conversion ────────────────────────────────────────────────── */

export interface ConvertToAdmissionOptions {
  encounterId: string;
  bedId?: string;
  actorUid: string;
  actorName?: string;
  nowMs?: number;
}

export interface ConvertToAdmissionResult {
  entry: WaitingEntry;
  encounter: PatientEncounter;
}

/**
 * Converts a waiting|ready entry into a real admission. Patient demographics are
 * referenced by `patientId` only — this never copies patient data into the
 * encounter or the waiting entry.
 */
export function convertWaitingToAdmission(
  entry: WaitingEntry,
  options: ConvertToAdmissionOptions
): ConvertToAdmissionResult {
  if (!entry || (entry.status !== 'waiting' && entry.status !== 'ready')) {
    throw new Error('invalid-transition');
  }

  const encounterId = toText(options?.encounterId);
  if (!encounterId) throw new Error('encounterId-required');

  const timestamp =
    Number.isFinite(options?.nowMs) && Number(options?.nowMs) > 0
      ? Number(options?.nowMs)
      : Date.now();

  const actorUid = toText(options?.actorUid);
  const actorName = toText(options?.actorName) || undefined;
  const bedId = toText(options?.bedId) || undefined;

  const converted: WaitingEntry = {
    ...entry,
    status: 'admitted',
    updatedAtMs: timestamp,
    admittedEncounterId: encounterId,
    admittedBedId: bedId,
    history: [
      ...(Array.isArray(entry.history) ? entry.history : []),
      {
        atMs: timestamp,
        actorUid,
        actorName,
        from: entry.status,
        to: 'admitted',
      },
    ],
  };

  const encounter: PatientEncounter = {
    id: encounterId,
    workspaceId: entry.workspaceId,
    patientId: entry.patientId,
    unitId: entry.unitId,
    bedId,
    kind: 'admission',
    startedAtMs: timestamp,
    sourceWaitingEntryId: entry.id,
    createdBy: actorUid,
    createdAtMs: timestamp,
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };

  return { entry: converted, encounter };
}

/* ─── Selectors ───────────────────────────────────────────────────────────── */

export function entriesForUnit(entries: WaitingEntry[], unitId: string): WaitingEntry[] {
  if (!Array.isArray(entries) || !unitId) return [];
  return entries.filter((entry) => entry && entry.unitId === unitId);
}

/**
 * Non-terminal entries. `deferred` is included: the request is paused, not
 * finished, and it can be resumed from the list.
 */
export const ACTIVE_WAITING_STATUSES: WaitingStatus[] = ['waiting', 'ready', 'deferred'];

export function activeEntries(entries: WaitingEntry[]): WaitingEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && ACTIVE_WAITING_STATUSES.includes(entry.status));
}

export function statusCounts(entries: WaitingEntry[]): Record<WaitingStatus, number> {
  const counts: Record<WaitingStatus, number> = {
    waiting: 0,
    ready: 0,
    deferred: 0,
    cancelled: 0,
    admitted: 0,
  };
  if (!Array.isArray(entries)) return counts;
  entries.forEach((entry) => {
    if (entry && isStatus(entry.status)) counts[entry.status] += 1;
  });
  return counts;
}
