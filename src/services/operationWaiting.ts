/**
 * Operation waiting list (قائمة انتظار العمليات) — local preview service.
 *
 * Scope and safety (mirrors waitingList.ts):
 *  - A SEPARATE, operation-specific list. It is not the per-unit clinical
 *    waiting list (src/services/waitingList.ts) and never writes to it.
 *  - localStorage only (key `cardiovault_dt_op_waiting_v1`); no Firebase, no
 *    network, no React. Persistence is an injected key/value store with a
 *    blocked-storage memory fallback so a failed write never loses the
 *    in-session data silently.
 *  - Booking is IDEMPOTENT and never deletes anything: a booked entry stays in
 *    storage with `status: 'booked'` and its booking record.
 *  - Booking does NOT move or mutate the patient's StorageService clinical
 *    record — census integration is a separate product decision.
 */

import type {
  OperationAttachment,
  OperationBookingRecord,
  OperationWaitState,
  OperationWaitingEntry,
  OperationWaitingStatus,
} from '../types/clinicArea.ts';
import { previewNowMs } from './previewClock.ts';

export const OPERATION_WAITING_STORAGE_KEY = 'cardiovault_dt_op_waiting_v1';

/** Stamped on every entry this module creates. */
export const OPERATION_WAITING_SCHEMA_VERSION = 1;

/** Files at or below this size keep their data URL in the entry (cap owned by the view). */
export const ATTACHMENT_DATA_URL_LIMIT_BYTES = 400 * 1024;

export interface OperationWaitingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/* ─── Storage ─────────────────────────────────────────────────────────────── */

/** Module-level shadow, kept so a blocked/failed write never loses session data. */
const memoryValues = new Map<string, string>();

function defaultStorage(): OperationWaitingStorage | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const probeKey = `${OPERATION_WAITING_STORAGE_KEY}__probe`;
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      return localStorage;
    }
  } catch {
    /* Private mode or a blocked WebView: fall through to memory. */
  }
  return null;
}

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toMs = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed) : fallback;
};

const OPERATION_STATES: OperationWaitState[] = ['urgent', 'waiting', 'pending', 'preparing'];

const OPERATION_STATUSES: OperationWaitingStatus[] = ['active', 'booked'];

function normalizeAttachment(value: unknown): OperationAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = toText(raw.id);
  const name = toText(raw.name);
  const sizeBytes = Number(raw.sizeBytes);
  if (!id || !name || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  const dataUrl = toText(raw.dataUrl) || undefined;
  const blobKey = toText(raw.blobKey) || undefined;
  const metadataOnly = raw.metadataOnly === true || (!dataUrl && !blobKey);
  return {
    id,
    name,
    mimeType: toText(raw.mimeType) || 'application/octet-stream',
    sizeBytes,
    ...(dataUrl ? { dataUrl } : {}),
    ...(blobKey ? { blobKey } : {}),
    ...(metadataOnly ? { metadataOnly: true } : { metadataOnly: false }),
  };
}

function normalizeBooking(value: unknown): OperationBookingRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const unitId = toText(raw.unitId);
  if (!unitId) return undefined;
  return {
    unitId,
    atMs: toMs(raw.atMs, 0),
    bookedBy: toText(raw.bookedBy),
  };
}

/** One entry from storage. Corrupt or foreign shapes are dropped, never thrown on. */
function normalizeEntry(value: unknown): OperationWaitingEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = toText(raw.id);
  const unitId = toText(raw.unitId);
  const patientFileId = toText(raw.patientFileId);
  const patientName = toText(raw.patientName);
  const operationName = toText(raw.operationName);
  if (!id || !unitId || !patientFileId || !patientName || !operationName) return null;
  const ageYears = Math.trunc(Number(raw.ageYears));
  if (!Number.isFinite(ageYears) || ageYears < 0 || ageYears > 130) return null;
  const createdAtMs = toMs(raw.createdAtMs, toMs(raw.updatedAtMs, 0));
  const state: OperationWaitState = OPERATION_STATES.includes(raw.state as OperationWaitState)
    ? (raw.state as OperationWaitState)
    : 'waiting';
  const status: OperationWaitingStatus = OPERATION_STATUSES.includes(raw.status as OperationWaitingStatus)
    ? (raw.status as OperationWaitingStatus)
    : 'active';
  return {
    id,
    unitId,
    patientFileId,
    patientName,
    ageYears,
    history: toText(raw.history),
    riskFactors: Array.isArray(raw.riskFactors)
      ? raw.riskFactors.map((item) => toText(item)).filter(Boolean)
      : [],
    complaint: toText(raw.complaint),
    operationName,
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
          .map(normalizeAttachment)
          .filter((attachment): attachment is OperationAttachment => attachment !== null)
      : [],
    missingTests: Array.isArray(raw.missingTests)
      ? raw.missingTests.map((item) => toText(item)).filter(Boolean)
      : [],
    testsComplete: raw.testsComplete === true,
    state,
    status,
    ...(normalizeBooking(raw.booking) ? { booking: normalizeBooking(raw.booking) } : {}),
    createdAtMs,
    createdBy: toText(raw.createdBy),
    updatedAtMs: toMs(raw.updatedAtMs, createdAtMs),
    schemaVersion: Number(raw.schemaVersion) || OPERATION_WAITING_SCHEMA_VERSION,
  };
}

function parseList(raw: string | null | undefined): OperationWaitingEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is OperationWaitingEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Reads the stored entries. Corrupt JSON, junk rows, a totally blocked store
 * or a throwing read all degrade to `[]` (or the memory shadow) — load never
 * throws and never hides real data behind a crash.
 */
export function loadOperationEntries(storage?: OperationWaitingStorage | null): OperationWaitingEntry[] {
  let store: OperationWaitingStorage | null;
  try {
    store = storage !== undefined ? storage : defaultStorage();
  } catch {
    store = null;
  }
  if (!store) return parseList(memoryValues.get(OPERATION_WAITING_STORAGE_KEY));
  let raw: string | null = null;
  try {
    raw = store.getItem(OPERATION_WAITING_STORAGE_KEY);
  } catch {
    return parseList(memoryValues.get(OPERATION_WAITING_STORAGE_KEY));
  }
  if (!raw) return [];
  return parseList(raw);
}

/**
 * Writes the entries. Keeps an in-memory shadow on every call, so if the device
 * store is missing or refuses the write the session keeps working. Returns
 * `persisted: false`-style signal (`false`) exactly when the disk copy failed.
 */
export function saveOperationEntries(
  entries: OperationWaitingEntry[],
  storage?: OperationWaitingStorage | null
): boolean {
  const list = Array.isArray(entries) ? entries : [];
  const serialized = JSON.stringify(list);
  memoryValues.set(OPERATION_WAITING_STORAGE_KEY, serialized);
  let store: OperationWaitingStorage | null;
  try {
    store = storage !== undefined ? storage : defaultStorage();
  } catch {
    store = null;
  }
  if (!store) return false;
  try {
    store.setItem(OPERATION_WAITING_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

/** Clears storage AND the memory shadow. Preview reset only; never throws. */
export function clearOperationEntries(storage?: OperationWaitingStorage | null): void {
  memoryValues.delete(OPERATION_WAITING_STORAGE_KEY);
  let store: OperationWaitingStorage | null = null;
  try {
    store = storage !== undefined ? storage : defaultStorage();
  } catch {
    store = null;
  }
  if (!store) return;
  try {
    store.removeItem(OPERATION_WAITING_STORAGE_KEY);
  } catch {
    /* Preview reset must never throw. */
  }
}

/* ─── Creation ────────────────────────────────────────────────────────────── */

export interface CreateOperationEntryInput {
  unitId: string;
  /** Master patient file id — never a name-only link. */
  patientFileId: string;
  patientName: string;
  ageYears: number;
  operationName: string;
  createdBy: string;
  history?: string;
  riskFactors?: string[];
  complaint?: string;
  attachments?: OperationAttachment[];
  missingTests?: string[];
  /** Independent boolean. Default: true when no missing tests were listed. */
  testsComplete?: boolean;
  state?: OperationWaitState;
}

export class DuplicateOperationEntryError extends Error {
  constructor(operationName: string, patientName: string) {
    super(
      `duplicate-operation-entry: "${patientName}" already has an active operation waiting entry for "${operationName}". ` +
        'Change the operation name or book the existing entry first.'
    );
    this.name = 'DuplicateOperationEntryError';
  }
}

const normalizeNameKey = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

function nextEntryId(nowMs: number, existing: OperationWaitingEntry[]): string {
  const base = `opw-${nowMs}`;
  const used = existing
    .map((entry) => entry?.id || '')
    .filter((id) => id.startsWith(`${base}-`))
    .map((id) => Number(id.slice(base.length + 1)))
    .filter((value) => Number.isInteger(value) && value >= 0);
  const next = used.length ? Math.max(...used) + 1 : 0;
  return `${base}-${next}`;
}

function assertAttachmentValid(attachment: OperationAttachment): void {
  if (
    !attachment ||
    !toText(attachment.id) ||
    !toText(attachment.name) ||
    !Number.isFinite(attachment.sizeBytes) ||
    attachment.sizeBytes < 0
  ) {
    throw new Error('attachment-invalid');
  }
}

/**
 * Creates an operation waiting entry.
 *
 * Signature follows `waitingList.createWaitingEntry(input, existing, nowMs)`:
 * the existing list is passed in for duplicate protection only (same master
 * file + still active + same NORMALIZED operation name -> throws
 * DuplicateOperationEntryError; a BOOKED entry with the same name is fine).
 */
export function createOperationEntry(
  input: CreateOperationEntryInput,
  existing: OperationWaitingEntry[] = [],
  nowMs: number = previewNowMs()
): OperationWaitingEntry {
  const unitId = toText(input?.unitId);
  const patientFileId = toText(input?.patientFileId);
  const patientName = toText(input?.patientName);
  const operationName = toText(input?.operationName);
  const createdBy = toText(input?.createdBy);
  if (!unitId) throw new Error('unitId-required');
  if (!patientFileId) throw new Error('patientFileId-required');
  if (!patientName) throw new Error('patient-name-required');
  if (patientName.length < 2) throw new Error('patient-name-short');
  const ageYears = Number(input?.ageYears);
  if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 130) throw new Error('age-invalid');
  if (!operationName) throw new Error('operationName-required');
  if (!createdBy) throw new Error('createdBy-required');

  const list = Array.isArray(existing) ? existing : [];
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());

  const attachments = Array.isArray(input?.attachments)
    ? input.attachments.slice()
    : [];
  attachments.forEach(assertAttachmentValid);

  const missingTests = Array.isArray(input?.missingTests)
    ? input.missingTests.map((item) => toText(item)).filter(Boolean)
    : [];
  // testsComplete is an INDEPENDENT boolean field, deliberately not derived
  // from missingTests after creation. Default only when the caller omits it.
  const testsComplete = typeof input?.testsComplete === 'boolean' ? input.testsComplete : missingTests.length === 0;
  const state: OperationWaitState = OPERATION_STATES.includes(input?.state as OperationWaitState)
    ? (input.state as OperationWaitState)
    : 'waiting';

  const operationKey = normalizeNameKey(operationName);
  const duplicate = list.some(
    (candidate) =>
      candidate &&
      candidate.patientFileId === patientFileId &&
      candidate.status === 'active' &&
      normalizeNameKey(candidate.operationName) === operationKey
  );
  if (duplicate) throw new DuplicateOperationEntryError(operationName, patientName);

  return {
    id: nextEntryId(timestamp, list),
    unitId,
    patientFileId,
    patientName,
    ageYears,
    history: toText(input?.history),
    riskFactors: Array.isArray(input?.riskFactors)
      ? input.riskFactors.map((item) => String(item).trim()).filter(Boolean)
      : [],
    complaint: toText(input?.complaint),
    operationName,
    attachments,
    missingTests,
    testsComplete,
    state,
    status: 'active',
    createdAtMs: timestamp,
    createdBy,
    updatedAtMs: timestamp,
    schemaVersion: OPERATION_WAITING_SCHEMA_VERSION,
  };
}

/* ─── State ───────────────────────────────────────────────────────────────── */

/**
 * Every state may transition to every state (fully reversible by design — the
 * user decides, the app never infers). Only ACTIVE entries may change state.
 * Returns the new array plus the updated entry; never mutates the input.
 */
export function setState(
  entries: OperationWaitingEntry[],
  entryId: string,
  to: OperationWaitState,
  nowMs: number = previewNowMs()
): { entries: OperationWaitingEntry[]; entry: OperationWaitingEntry } {
  if (!OPERATION_STATES.includes(to)) throw new Error('invalid-state');
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) throw new Error('entry-not-found');
  const entry = list[index];
  if (entry.status !== 'active') throw new Error('entry-not-active');
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());
  const updated: OperationWaitingEntry = { ...entry, state: to, updatedAtMs: timestamp };
  const next = [...list];
  next[index] = updated;
  return { entries: next, entry: updated };
}

/* ─── Attachments ─────────────────────────────────────────────────────────── */

/**
 * Service-side attachment handling is deliberately dumb: it validates that at
 * least the metadata is present and replaces the attachments array. The data
 * URL / 400KB cap logic lives in the VIEW (FileReader), not here.
 */
export function addAttachment(
  entries: OperationWaitingEntry[],
  entryId: string,
  attachment: OperationAttachment,
  nowMs: number = previewNowMs()
): { entries: OperationWaitingEntry[]; entry: OperationWaitingEntry } {
  assertAttachmentValid(attachment);
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) throw new Error('entry-not-found');
  const entry = list[index];
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());
  const updated: OperationWaitingEntry = {
    ...entry,
    attachments: [...entry.attachments, attachment],
    updatedAtMs: timestamp,
  };
  const next = [...list];
  next[index] = updated;
  return { entries: next, entry: updated };
}

/** Removes one attachment by id. Unknown ids are a lenient no-op (idempotent UX). */
export function removeAttachment(
  entries: OperationWaitingEntry[],
  entryId: string,
  attachmentId: string,
  nowMs: number = previewNowMs()
): { entries: OperationWaitingEntry[]; entry: OperationWaitingEntry } {
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) throw new Error('entry-not-found');
  const entry = list[index];
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());
  const updated: OperationWaitingEntry = {
    ...entry,
    attachments: entry.attachments.filter((attachment) => attachment.id !== attachmentId),
    updatedAtMs: timestamp,
  };
  const next = [...list];
  next[index] = updated;
  return { entries: next, entry: updated };
}

/* ─── Missing tests ───────────────────────────────────────────────────────── */

/**
 * Sets the missing-tests list and the testsComplete flag. The two are stored
 * INDEPENDENTLY (testsComplete is never derived here), so a caller may keep a
 * list while marking completion or clear both.
 */
export function setMissingTests(
  entries: OperationWaitingEntry[],
  entryId: string,
  tests: string[],
  testsComplete: boolean,
  nowMs: number = previewNowMs()
): { entries: OperationWaitingEntry[]; entry: OperationWaitingEntry } {
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) throw new Error('entry-not-found');
  const entry = list[index];
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());
  const updated: OperationWaitingEntry = {
    ...entry,
    missingTests: (Array.isArray(tests) ? tests : []).map((item) => toText(item)).filter(Boolean),
    testsComplete: testsComplete === true,
    updatedAtMs: timestamp,
  };
  const next = [...list];
  next[index] = updated;
  return { entries: next, entry: updated };
}

/* ─── Booking ─────────────────────────────────────────────────────────────── */

export interface BookEntryPureResult {
  entries: OperationWaitingEntry[];
  entry: OperationWaitingEntry;
  alreadyBooked: boolean;
}

/**
 * PURE booking core (no storage, no DOM) so tests can check idempotency.
 *  - Not booked yet: sets status 'booked' + booking record, preserves ALL
 *    other fields, keeps the record (never a hard delete).
 *  - Already booked: returns the entries UNCHANGED with alreadyBooked: true —
 *    retries add no duplicate booking and no extra storage movement.
 */
export function bookEntryPure(
  entries: OperationWaitingEntry[],
  entryId: string,
  targetUnitId: string,
  nowMs: number = previewNowMs(),
  bookedBy?: string
): BookEntryPureResult {
  const unitId = toText(targetUnitId);
  if (!unitId) throw new Error('targetUnitId-required');
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) throw new Error('entry-not-found');
  const entry = list[index];
  if (entry.status === 'booked') {
    return { entries: list, entry, alreadyBooked: true };
  }
  const timestamp = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(Number(nowMs)) : Math.floor(previewNowMs());
  const booking: OperationBookingRecord = {
    unitId,
    atMs: timestamp,
    bookedBy: toText(bookedBy) || entry.createdBy,
  };
  const updated: OperationWaitingEntry = {
    ...entry,
    status: 'booked',
    booking,
    updatedAtMs: timestamp,
  };
  const next = [...list];
  next[index] = updated;
  return { entries: next, entry: updated, alreadyBooked: false };
}

export interface BookIntoUnitResult {
  alreadyBooked: boolean;
  entry: OperationWaitingEntry;
  /** True when either nothing needed saving or the save reached storage. */
  saved: boolean;
}

/**
 * Storage-level booking wrapper. Idempotent: an already-booked entry is
 * returned untouched (alreadyBooked: true) and no write is attempted.
 */
export function bookIntoUnit(
  entryId: string,
  targetUnitId: string,
  existingEntries?: OperationWaitingEntry[],
  nowMs: number = previewNowMs(),
  bookedBy?: string,
  storage?: OperationWaitingStorage | null
): BookIntoUnitResult {
  const entries = existingEntries !== undefined ? existingEntries : loadOperationEntries(storage);
  const { entries: next, entry, alreadyBooked } = bookEntryPure(entries, entryId, targetUnitId, nowMs, bookedBy);
  if (alreadyBooked) return { alreadyBooked, entry, saved: true };
  const saved = saveOperationEntries(next, storage);
  return { alreadyBooked, entry, saved };
}

/* ─── Selectors ───────────────────────────────────────────────────────────── */

export function entriesForUnit(entries: OperationWaitingEntry[], unitId: string): OperationWaitingEntry[] {
  if (!Array.isArray(entries) || !unitId) return [];
  return entries.filter((entry) => entry && entry.unitId === unitId);
}

/** Entries still on the operation waiting list. */
export function activeEntries(entries: OperationWaitingEntry[]): OperationWaitingEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && entry.status === 'active');
}

/** Booked entries, newest booking first. Never deleted, only archived here. */
export function bookedHistory(entries: OperationWaitingEntry[]): OperationWaitingEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && entry.status === 'booked')
    .slice()
    .sort((a, b) => (b.booking?.atMs ?? b.updatedAtMs) - (a.booking?.atMs ?? a.updatedAtMs));
}

/** Counts by state over whatever slice is passed. */
export function stateCounts(entries: OperationWaitingEntry[]): Record<OperationWaitState, number> {
  const counts: Record<OperationWaitState, number> = { urgent: 0, waiting: 0, pending: 0, preparing: 0 };
  if (!Array.isArray(entries)) return counts;
  entries.forEach((entry) => {
    if (entry && OPERATION_STATES.includes(entry.state)) counts[entry.state] += 1;
  });
  return counts;
}
