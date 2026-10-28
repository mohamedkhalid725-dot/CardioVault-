/**
 * Master patient file (الملف الأم) — local preview service.
 *
 * Approved semantics (plan §15/§16/§18):
 *  - One master file per patient per authorized scope; recall appends new
 *    DATED events to the same file. Existing history is never deleted or
 *    replaced by application code.
 *  - Records are matched by name AND (age or national id). Matching by name
 *    alone is forbidden; ambiguous matches throw instead of merging.
 *  - Search results never display a full national ID — only `****` + last 4.
 *  - A file is visible to a doctor only when one of its context ids (unit or
 *    clinic) is inside the doctor's own authorized set (plan §20 interpretation).
 *
 * Storage is local preview-only (localStorage with a blocked-storage fallback).
 * No Firebase, no network.
 */

import type {
  MasterPatientFile,
  MasterTimelineEvent,
  MasterFileSearchResult,
  MasterFileSearchHit,
  CareContext,
  TimelineEventKind,
  OperationAttachment,
} from '../types/clinicArea';
import { previewNowMs } from './previewClock.ts';

export const MASTER_FILES_KEY = 'cardiovault_dt_master_files_v1';
export const MASTER_FILE_SCHEMA_VERSION = 1;

export interface MasterFileStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const memoryStore = new Map<string, string>();
let storageBroken = false;

function defaultStorage(): MasterFileStorage | null {
  if (typeof window === 'undefined') return null;
  const store = window.localStorage;
  if (!store) return null;
  if (storageBroken) return null;
  try {
    const probeKey = `${MASTER_FILES_KEY}__probe`;
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return store;
  } catch {
    storageBroken = true;
    return null;
  }
}

export function loadMasterFiles(storage?: MasterFileStorage | null): MasterPatientFile[] {
  const store = storage !== undefined ? storage : defaultStorage();
  if (!store) {
    const raw = memoryStore.get(MASTER_FILES_KEY);
    return raw ? safeParseList(raw) : [];
  }
  const raw = store.getItem(MASTER_FILES_KEY);
  return raw ? safeParseList(raw) : [];
}

function safeParseList(raw: string): MasterPatientFile[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Corrupt or foreign entries are dropped, never thrown on.
    return parsed.filter(
      (item): item is MasterPatientFile =>
        !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string'
    );
  } catch {
    return [];
  }
}

export function saveMasterFiles(files: MasterPatientFile[], storage?: MasterFileStorage | null): boolean {
  const store = storage !== undefined ? storage : defaultStorage();
  const serialized = JSON.stringify(sortByCreated(files));
  if (!store) {
    memoryStore.set(MASTER_FILES_KEY, serialized);
    return false;
  }
  try {
    store.setItem(MASTER_FILES_KEY, serialized);
    return true;
  } catch {
    storageBroken = true;
    memoryStore.set(MASTER_FILES_KEY, serialized);
    return false;
  }
}

function sortByCreated(files: MasterPatientFile[]): MasterPatientFile[] {
  return [...files].sort((a, b) => a.createdAtMs - b.createdAtMs);
}

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

export function maskNationalId(file: MasterPatientFile | null | undefined): string {
  const id = String(file?.nationalId || '').trim();
  if (!id) return '';
  const last4 = id.slice(-4);
  return `****${last4}`;
}

function normalizeName(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDigitsOnly(value: string): boolean {
  return /^[0-9]{4,}$/.test(String(value || '').trim());
}

// ---------------------------------------------------------------------------
// Create / append (append-only history)
// ---------------------------------------------------------------------------

export interface CreateMasterFileInput {
  name: string;
  ageYears: number;
  nationalId?: string;
  phone?: string;
  sourcePatientIds?: string[];
  riskFactors?: string[];
  history?: string;
  pastOperations?: string[];
  pastImaging?: string[];
  /** Contexts (unit/clinic ids) this file belongs to. */
  contextIds: string[];
  createdBy: string;
  context?: CareContext;
}

export function validateMasterFileInput(input: CreateMasterFileInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeName(input.name) || normalizeName(input.name).length < 2) {
    errors.name = 'Patient name is required (2+ characters).';
  }
  if (!Number.isInteger(input.ageYears) || input.ageYears < 0 || input.ageYears > 130) {
    errors.ageYears = 'Age must be a whole number between 0 and 130.';
  }
  const id = String(input.nationalId || '').trim();
  if (id && !/^[0-9]{6,20}$/.test(id)) {
    errors.nationalId = 'National ID must be 6-20 digits.';
  }
  if (!Array.isArray(input.contextIds) || input.contextIds.length === 0) {
    errors.contextIds = 'The file needs at least one authorized unit/clinic context.';
  }
  return errors;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMasterFile(
  input: CreateMasterFileInput,
  nowMs: number = previewNowMs(),
  storage?: MasterFileStorage | null
): { file: MasterPatientFile; saved: boolean } {
  const file: MasterPatientFile = {
    id: newId('mpf'),
    name: normalizeName(input.name),
    ageYears: Math.trunc(input.ageYears),
    nationalId: String(input.nationalId || '').trim() || undefined,
    phone: String(input.phone || '').trim() || undefined,
    sourcePatientIds: [...new Set((input.sourcePatientIds || []).map((id) => String(id).trim()).filter(Boolean))],
    riskFactors: (input.riskFactors || []).map((item) => String(item).trim()).filter(Boolean),
    history: String(input.history || '').trim(),
    pastOperations: (input.pastOperations || []).map((item) => String(item).trim()).filter(Boolean),
    pastImaging: (input.pastImaging || []).map((item) => String(item).trim()).filter(Boolean),
    contextIds: [...new Set((input.contextIds || []).map((item) => String(item).trim()).filter(Boolean))],
    timeline: [],
    createdAtMs: Math.floor(nowMs),
    createdBy: input.createdBy,
    updatedAtMs: Math.floor(nowMs),
    schemaVersion: MASTER_FILE_SCHEMA_VERSION,
  };
  const files = loadMasterFiles(storage);
  const saved = saveMasterFiles([...files, file], storage);
  return { file, saved };
}

export interface TimelineEventInput {
  kind: TimelineEventKind;
  title: string;
  summary: string;
  detail: string;
  createdBy: string;
  context: CareContext;
  atMs?: number;
  refId?: string;
  attachments?: OperationAttachment[];
}

/**
 * Appends a dated event to a file and returns the updated list. The pure core
 * (no persistence) so callers can batch and decide when to save.
 */
export function appendTimelineEvent(
  files: MasterPatientFile[],
  fileId: string,
  input: TimelineEventInput
): { files: MasterPatientFile[]; event: MasterTimelineEvent | null } {
  const index = files.findIndex((file) => file.id === fileId);
  if (index === -1) return { files, event: null };
  const nowMs = input.atMs !== undefined ? Math.floor(input.atMs) : previewNowMs();
  const event: MasterTimelineEvent = {
    id: newId('ev'),
    kind: input.kind,
    atMs: nowMs,
    title: String(input.title || '').trim() || 'Timeline event',
    summary: String(input.summary || '').trim(),
    detail: String(input.detail || '').trim(),
    createdBy: input.createdBy,
    context: input.context || {},
    refId: input.refId,
    attachments: Array.isArray(input.attachments) ? input.attachments.map((attachment) => ({ ...attachment })) : undefined,
    schemaVersion: MASTER_FILE_SCHEMA_VERSION,
  };
  const next = [...files];
  next[index] = { ...next[index], timeline: [...next[index].timeline, event], updatedAtMs: nowMs };
  return { files: next, event };
}

export function persistTimelineEvent(
  fileId: string,
  input: TimelineEventInput,
  storage?: MasterFileStorage | null
): { saved: boolean; event: MasterTimelineEvent | null } {
  const files = loadMasterFiles(storage);
  const { files: next, event } = appendTimelineEvent(files, fileId, input);
  if (!event) return { saved: false, event: null };
  const saved = saveMasterFiles(next, storage);
  return { saved, event };
}

// ---------------------------------------------------------------------------
// Authorized search / recall
// ---------------------------------------------------------------------------

export interface SearchMasterFilesInput {
  query: string;
  /** Unit/clinic ids the CURRENT doctor is allowed to see. */
  authorizedContextIds: string[];
  files: MasterPatientFile[];
}

/**
 * Search is confined to the authorized contexts (plan §12/§20). Name-only
 * matching never links or merges anything — it only lists candidates, which the
 * caller must disambiguate using age + last-4 of the national id.
 */
export function searchMasterFiles(input: SearchMasterFilesInput): MasterFileSearchResult {
  const scope = [...new Set((input.authorizedContextIds || []).map((id) => String(id)))];
  const authorized = input.files.filter((file) => file.contextIds.some((id) => scope.includes(id)));
  const query = String(input.query || '').trim();
  if (!query) return { hits: [], ambiguous: false, searchedScopeIds: scope };
  const lowered = query.replace(/\s+/g, ' ').toLowerCase();

  let matches: MasterPatientFile[];
  let ambiguous = false;
  if (isDigitsOnly(query)) {
    matches = authorized.filter((file) => {
      const id = String(file.nationalId || '').trim();
      if (!id) return false;
      return id === query || id.endsWith(query);
    });
  } else {
    matches = authorized.filter((file) => normalizeName(file.name) === lowered || normalizeName(file.name).includes(lowered));
    // Same-name candidates inside one scope are ambiguous; the caller must show
    // age + last4 and let the user pick. Never auto-merge.
    const nameGroups = new Map<string, MasterPatientFile[]>();
    for (const file of matches) {
      const key = normalizeName(file.name);
      nameGroups.set(key, [...(nameGroups.get(key) || []), file]);
    }
    for (const [, group] of nameGroups) if (group.length > 1) ambiguous = true;
  }

  const hits: MasterFileSearchHit[] = matches.map((file) => ({ file, maskedNationalId: maskNationalId(file) }));
  return { hits, ambiguous, searchedScopeIds: scope };
}

export class AmbiguousPatientMatchError extends Error {
  constructor() {
    super(
      'ambiguous-patient-match: more than one existing file matches this name in your scope. Pick the file by age and last-4 digits instead of merging by name.'
    );
    this.name = 'AmbiguousPatientMatchError';
  }
}

/**
 * Used by the operation-waiting intake (and any other flow): find the existing
 * authorized file for a patient or create one. Matching requires the name AND
 * (equal age or equal national id). If two files match by name alone, the
 * caller must resolve the ambiguity manually — this function throws instead of
 * guessing (approved decision: never merge by name alone).
 */
export interface LinkOrCreateInput {
  identity: {
    name: string;
    ageYears: number;
    nationalId?: string;
    phone?: string;
    sourcePatientId?: string;
    riskFactors?: string[];
    history?: string;
    pastOperations?: string[];
    pastImaging?: string[];
  };
  /** Contexts the CURRENT doctor is authorized for (union of their units/clinics). */
  authorizedContextIds: string[];
  /** Context the new event happens in (created file gets this context). */
  defaultContextId: string;
  createdBy: string;
  nowMs?: number;
}

export function linkOrCreateForIntake(
  input: LinkOrCreateInput,
  storage?: MasterFileStorage | null
): { file: MasterPatientFile; created: boolean } | { error: 'ambiguous' } {
  const files = loadMasterFiles(storage);
  const scope = [...new Set(input.authorizedContextIds.map((id) => String(id)))];
  const authorized = files.filter((file) => file.contextIds.some((id) => scope.includes(id)));
  const nameKey = normalizeName(input.identity.name);
  const id = String(input.identity.nationalId || '').trim();
  const sourcePatientId = String(input.identity.sourcePatientId || '').trim();

  const updateExisting = (file: MasterPatientFile): MasterPatientFile => {
    const timestamp = input.nowMs ?? previewNowMs();
    const newHistory = String(input.identity.history || '').trim();
    const currentHistory = String(file.history || '').trim();
    const history = newHistory && !currentHistory.includes(newHistory)
      ? [currentHistory, `[${new Date(timestamp).toLocaleDateString()}] ${newHistory}`].filter(Boolean).join('\n')
      : currentHistory;
    const mergeList = (existing: string[], incoming?: string[]): string[] => {
      const values = new Map(existing.map((value) => [value.toLowerCase(), value]));
      (incoming || []).map((value) => String(value || '').trim()).filter(Boolean).forEach((value) => values.set(value.toLowerCase(), value));
      return [...values.values()];
    };
    return {
      ...file,
      name: normalizeName(input.identity.name),
      ageYears: Math.trunc(input.identity.ageYears),
      nationalId: id || file.nationalId,
      phone: String(input.identity.phone || '').trim() || file.phone,
      riskFactors: mergeList(file.riskFactors || [], input.identity.riskFactors),
      history,
      pastOperations: mergeList(file.pastOperations || [], input.identity.pastOperations),
      pastImaging: mergeList(file.pastImaging || [], input.identity.pastImaging),
      contextIds: [...new Set([...(file.contextIds || []), input.defaultContextId])],
      sourcePatientIds: [...new Set([...(file.sourcePatientIds || []), ...(sourcePatientId ? [sourcePatientId] : [])])],
      updatedAtMs: timestamp,
    };
  };

  if (sourcePatientId) {
    const sourceMatches = authorized.filter((file) => (file.sourcePatientIds || []).includes(sourcePatientId));
    if (sourceMatches.length > 1) return { error: 'ambiguous' };
    if (sourceMatches.length === 1) {
      const updated = updateExisting(sourceMatches[0]);
      saveMasterFiles(files.map((file) => file.id === updated.id ? updated : file), storage);
      return { file: updated, created: false };
    }
  }

  // National ID is the strongest patient identifier. Keep the lookup inside
  // the authorized unit/clinic scope and refuse to silently rewrite a record
  // when the same ID is entered under a different name.
  if (id) {
    const nationalIdMatches = authorized.filter((file) => String(file.nationalId || '').trim() === id);
    if (nationalIdMatches.length > 1) return { error: 'ambiguous' };
    if (nationalIdMatches.length === 1) {
      const match = nationalIdMatches[0];
      if (normalizeName(match.name) !== nameKey) return { error: 'ambiguous' };
      const updated = updateExisting(match);
      saveMasterFiles(files.map((file) => file.id === updated.id ? updated : file), storage);
      return { file: updated, created: false };
    }
  }

  const direct = authorized.filter(
    (file) =>
      normalizeName(file.name) === nameKey &&
      (id ? String(file.nationalId || '').trim() === id : Math.trunc(file.ageYears) === Math.trunc(input.identity.ageYears))
  );
  if (direct.length === 1) {
    const updated = updateExisting(direct[0]);
    saveMasterFiles(files.map((file) => file.id === updated.id ? updated : file), storage);
    return { file: updated, created: false };
  }
  if (direct.length > 1) return { error: 'ambiguous' };

  // Name-only matches are candidates: if they exist they are ambiguous and the
  // user must pick manually. Otherwise create a fresh file.
  const sameName = authorized.filter((file) => normalizeName(file.name) === nameKey);
  if (sameName.length > 0) return { error: 'ambiguous' };

  const { file } = createMasterFile(
    {
      name: input.identity.name,
      ageYears: input.identity.ageYears,
      nationalId: input.identity.nationalId,
      phone: input.identity.phone,
      sourcePatientIds: sourcePatientId ? [sourcePatientId] : [],
      riskFactors: input.identity.riskFactors,
      history: input.identity.history,
      pastOperations: input.identity.pastOperations,
      pastImaging: input.identity.pastImaging,
      contextIds: [input.defaultContextId, ...scope.filter((contextId) => contextId === input.defaultContextId)],
      createdBy: input.createdBy,
    },
    input.nowMs ?? previewNowMs(),
    storage
  );
  return { file, created: true };
}

// ---------------------------------------------------------------------------
// Convenience mirrors for other services (used by operation waiting booking)
// ---------------------------------------------------------------------------

export function getMasterFile(files: MasterPatientFile[], fileId: string): MasterPatientFile | null {
  return files.find((file) => file.id === fileId) || null;
}

export function scrubProtectedFieldsForAudits(input: string): string {
  // Audit summaries must never carry a full national ID.
  const trimmed = String(input || '');
  return trimmed.replace(/\b[0-9]{6,20}\b/g, (match) => `****${match.slice(-4)}`);
}
