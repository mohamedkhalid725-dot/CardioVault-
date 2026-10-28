import type { EncounterKind, PatientEncounter } from '../types/departmentTeam';
import type { PastAdmission } from '../types/clinical';

export type { EncounterKind, PatientEncounter } from '../types/departmentTeam';

/**
 * Explicit encounter / stay records.
 *
 * The patient document stays the single master identity. An encounter only
 * records where that same patient physically stayed and when, so a transfer
 * closes one stay and opens another without ever copying or rewriting the
 * patient. Everything here is pure and local: no React, no Firebase, no
 * network. The optional storage argument keeps the module testable with a fake
 * storage and usable in the browser alike.
 */

export const STORAGE_KEY = 'cardiovault_dt_encounters_v1';

export interface EncounterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Minimal storage used when neither an injected storage nor localStorage works. */
const memoryValues = new Map<string, string>();

const memoryStorage: EncounterStorage = {
  getItem: (key) => (memoryValues.has(key) ? String(memoryValues.get(key)) : null),
  setItem: (key, value) => {
    memoryValues.set(key, String(value));
  },
  removeItem: (key) => {
    memoryValues.delete(key);
  },
};

/**
 * A browser localStorage that really works. Node and private-mode browsers can
 * expose the object but throw on use, so it is probed once, never trusted.
 */
function usableBrowserStorage(): EncounterStorage | null {
  try {
    const candidate = (globalThis as any)?.localStorage as EncounterStorage | undefined;
    if (
      !candidate ||
      typeof candidate.getItem !== 'function' ||
      typeof candidate.setItem !== 'function' ||
      typeof candidate.removeItem !== 'function'
    ) {
      return null;
    }
    const probe = '__cardiovault_dt_probe__';
    candidate.setItem(probe, '1');
    const echoed = candidate.getItem(probe);
    candidate.removeItem(probe);
    return echoed === '1' ? candidate : null;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: EncounterStorage | null): EncounterStorage {
  if (storage) return storage;
  return usableBrowserStorage() || memoryStorage;
}

const asText = (value: unknown): string => String(value ?? '').trim();

function requireText(value: unknown, field: string): string {
  const text = asText(value);
  if (!text) throw new Error(`${field}-required`);
  return text;
}

function nowOrDefault(value: unknown): number {
  if (value === undefined || value === null) return Date.now();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

const KINDS: ReadonlyArray<EncounterKind> = ['admission', 'transfer', 'clinic-visit'];

export function isOpenEncounter(encounter: PatientEncounter | null | undefined): boolean {
  if (!encounter) return false;
  return encounter.endedAtMs === undefined || encounter.endedAtMs === null;
}

function isInpatientEncounter(encounter: PatientEncounter): boolean {
  return encounter.kind === 'admission' || encounter.kind === 'transfer';
}

/** Latest open admission/transfer stay of the patient, if one exists. */
function findOpenInpatient(
  encounters: ReadonlyArray<PatientEncounter>,
  patientId: string,
): PatientEncounter | null {
  let found: PatientEncounter | null = null;
  for (const encounter of encounters) {
    if (!encounter || encounter.patientId !== patientId) continue;
    if (!isInpatientEncounter(encounter) || !isOpenEncounter(encounter)) continue;
    if (!found || encounter.startedAtMs >= found.startedAtMs) found = encounter;
  }
  return found;
}

export interface StartEncounterInput {
  workspaceId: string;
  patientId: string;
  unitId: string;
  bedId?: string;
  kind: EncounterKind;
  fromUnitId?: string;
  sourceWaitingEntryId?: string;
  createdBy: string;
  nowMs?: number;
}

/**
 * Opens a new stay. A patient can only be in one open admission/transfer at a
 * time, so a second one is refused; a clinic visit is deliberately allowed
 * alongside an inpatient stay. The id is deterministic for the same millisecond
 * and the same existing list, which keeps tests and retries stable.
 */
export function startEncounter(
  input: StartEncounterInput,
  existing: ReadonlyArray<PatientEncounter>,
): PatientEncounter {
  const workspaceId = requireText(input?.workspaceId, 'workspaceId');
  const patientId = requireText(input?.patientId, 'patientId');
  const unitId = requireText(input?.unitId, 'unitId');
  const createdBy = requireText(input?.createdBy, 'createdBy');
  const kind = input?.kind;
  if (!KINDS.includes(kind)) throw new Error('invalid-kind');

  const current = Array.isArray(existing) ? existing.filter(Boolean) : [];
  const nowMs = nowOrDefault(input?.nowMs);

  if (kind !== 'clinic-visit' && findOpenInpatient(current, patientId)) {
    throw new Error('patient-already-in-encounter');
  }

  const prefix = `enc-${nowMs}-`;
  let counter = 1;
  while (current.some((encounter) => encounter.id === `${prefix}${counter}`)) counter += 1;

  const bedId = asText(input?.bedId);
  const fromUnitId = asText(input?.fromUnitId);
  const sourceWaitingEntryId = asText(input?.sourceWaitingEntryId);

  return {
    id: `${prefix}${counter}`,
    workspaceId,
    patientId,
    unitId,
    ...(bedId ? { bedId } : {}),
    kind,
    startedAtMs: nowMs,
    ...(fromUnitId ? { fromUnitId } : {}),
    ...(sourceWaitingEntryId ? { sourceWaitingEntryId } : {}),
    createdBy,
    createdAtMs: nowMs,
    schemaVersion: 1,
  };
}

/** Closes a stay. Ending twice is refused so a history can never be rewritten. */
export function endEncounter(encounter: PatientEncounter, nowMs?: number): PatientEncounter {
  if (!encounter) throw new Error('encounter-required');
  if (!isOpenEncounter(encounter)) throw new Error('already-ended');
  const endedAtMs = nowOrDefault(nowMs);
  return { ...encounter, endedAtMs };
}

export interface PlanTransferInput {
  existing: ReadonlyArray<PatientEncounter>;
  patientId: string;
  fromUnitId: string;
  toUnitId: string;
  bedId?: string;
  actorUid: string;
  workspaceId: string;
  nowMs?: number;
}

export interface PlanTransferResult {
  /** Zero or one encounter: the stay that was open until this transfer. */
  closed: PatientEncounter[];
  created: PatientEncounter;
}

/**
 * Plans a move between units: the open stay is closed at the same instant the
 * transfer stay opens. The patient object is never touched, so the master file
 * and its unitIds stay exactly as they were.
 */
export function planTransfer(input: PlanTransferInput): PlanTransferResult {
  const workspaceId = requireText(input?.workspaceId, 'workspaceId');
  const patientId = requireText(input?.patientId, 'patientId');
  const fromUnitId = requireText(input?.fromUnitId, 'fromUnitId');
  const toUnitId = requireText(input?.toUnitId, 'toUnitId');
  const actorUid = requireText(input?.actorUid, 'actorUid');
  if (fromUnitId === toUnitId) throw new Error('same-unit');

  const current = Array.isArray(input?.existing) ? input.existing.filter(Boolean) : [];
  const nowMs = nowOrDefault(input?.nowMs);
  const open = findOpenInpatient(current, patientId);
  const closed: PatientEncounter[] = open ? [endEncounter(open, nowMs)] : [];
  const remaining = open ? current.filter((encounter) => encounter.id !== open.id) : current;
  const created = startEncounter(
    {
      workspaceId,
      patientId,
      unitId: toUnitId,
      bedId: input?.bedId,
      kind: 'transfer',
      fromUnitId,
      createdBy: actorUid,
      nowMs,
    },
    remaining,
  );
  return { closed, created };
}

/**
 * Migrates the read-only PastAdmission snapshots into encounter history.
 *
 * The ids are derived from the patient id and the array index, so running the
 * migration again (or on a second device) produces the exact same records and
 * can never add a duplicate stay. The snapshot array is only read.
 */
export function migratePastAdmissions(
  patientId: string,
  pastAdmissions: PastAdmission[] | undefined,
  workspaceId: string,
  actorUid: string,
): PatientEncounter[] {
  const patient = asText(patientId);
  const workspace = asText(workspaceId);
  if (!patient || !workspace || !Array.isArray(pastAdmissions) || pastAdmissions.length === 0) {
    return [];
  }
  const encounters: PatientEncounter[] = [];
  pastAdmissions.forEach((admission, index) => {
    if (!admission || typeof admission !== 'object') return;
    const parsedStart = Date.parse(String(admission.admissionDate ?? ''));
    const startedAtMs = Number.isFinite(parsedStart) ? parsedStart : 0;
    const parsedEnd = Date.parse(String(admission.dischargeDate ?? ''));
    const unitName = asText(admission.unitName);
    encounters.push({
      id: `enc-migrated-${patient}-${index}`,
      workspaceId: workspace,
      patientId: patient,
      unitId: unitName,
      kind: 'admission',
      startedAtMs,
      ...(Number.isFinite(parsedEnd) ? { endedAtMs: parsedEnd } : {}),
      createdBy: 'migration',
      createdAtMs: startedAtMs,
      schemaVersion: 1,
    });
  });
  // `actorUid` is part of the contract for callers; the snapshot stays owned by
  // 'migration' so a later actor edit can never rewrite whose history this is.
  void actorUid;
  return encounters;
}

export function listEncountersForPatient(
  encounters: ReadonlyArray<PatientEncounter>,
  patientId: string,
): PatientEncounter[] {
  const patient = asText(patientId);
  if (!patient) return [];
  return (encounters || []).filter((encounter) => encounter && encounter.patientId === patient);
}

export function listEncountersForUnit(
  encounters: ReadonlyArray<PatientEncounter>,
  unitId: string,
): PatientEncounter[] {
  const unit = asText(unitId);
  if (!unit) return [];
  return (encounters || []).filter((encounter) => encounter && encounter.unitId === unit);
}

/**
 * The stay that currently holds the patient. An inpatient stay always wins over
 * an open clinic visit, because that is the one a transfer has to close.
 */
export function openEncounterForPatient(
  encounters: ReadonlyArray<PatientEncounter>,
  patientId: string,
): PatientEncounter | null {
  const patient = asText(patientId);
  if (!patient) return null;
  const inpatient = findOpenInpatient(encounters || [], patient);
  if (inpatient) return inpatient;
  let clinic: PatientEncounter | null = null;
  for (const encounter of encounters || []) {
    if (!encounter || encounter.patientId !== patient) continue;
    if (encounter.kind !== 'clinic-visit' || !isOpenEncounter(encounter)) continue;
    if (!clinic || encounter.startedAtMs > clinic.startedAtMs) clinic = encounter;
  }
  return clinic;
}

/** Full history, oldest first. Ties keep a stable order by id. */
export function encounterHistory(
  encounters: ReadonlyArray<PatientEncounter>,
  patientId: string,
): PatientEncounter[] {
  return listEncountersForPatient(encounters, patientId).sort((left, right) => {
    if (left.startedAtMs !== right.startedAtMs) return left.startedAtMs - right.startedAtMs;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function sanitize(parsed: unknown): PatientEncounter[] {
  if (!Array.isArray(parsed)) return [];
  const out: PatientEncounter[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const id = asText(raw.id);
    const patientId = asText(raw.patientId);
    const unitId = asText(raw.unitId);
    const workspaceId = asText(raw.workspaceId);
    const createdBy = asText(raw.createdBy);
    const kind = raw.kind as EncounterKind;
    const startedAtMs = Number(raw.startedAtMs);
    if (!id || !patientId || !unitId || !workspaceId || !createdBy) continue;
    if (!KINDS.includes(kind) || !Number.isFinite(startedAtMs)) continue;
    const endedAtMs = Number(raw.endedAtMs);
    out.push({
      id,
      workspaceId,
      patientId,
      unitId,
      ...(asText(raw.bedId) ? { bedId: asText(raw.bedId) } : {}),
      kind,
      startedAtMs,
      ...(raw.endedAtMs !== undefined && raw.endedAtMs !== null && Number.isFinite(endedAtMs)
        ? { endedAtMs }
        : {}),
      ...(asText(raw.fromUnitId) ? { fromUnitId: asText(raw.fromUnitId) } : {}),
      ...(asText(raw.sourceWaitingEntryId)
        ? { sourceWaitingEntryId: asText(raw.sourceWaitingEntryId) }
        : {}),
      createdBy,
      createdAtMs: Number.isFinite(Number(raw.createdAtMs))
        ? Number(raw.createdAtMs)
        : startedAtMs,
      schemaVersion: 1,
    });
  }
  return out;
}

/** Never throws: a corrupt or foreign payload simply reads as an empty list. */
export function loadEncounters(storage?: EncounterStorage): PatientEncounter[] {
  const target = resolveStorage(storage);
  let raw: string | null = null;
  try {
    raw = target.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Returns true only when the write really happened. */
export function saveEncounters(
  encounters: ReadonlyArray<PatientEncounter>,
  storage?: EncounterStorage,
): boolean {
  const target = resolveStorage(storage);
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(sanitize(encounters)));
    return true;
  } catch {
    return false;
  }
}

export function clearEncounters(storage?: EncounterStorage): boolean {
  const target = resolveStorage(storage);
  try {
    target.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
