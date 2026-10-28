import type { Unit } from '../types/clinical';
import type {
  InstitutionSetupDraft,
  InstitutionUnitDraft,
  SetupValidation,
  UnitTypeId,
} from '../types/departmentTeam';
import type { PaymentMethodChoice, SubscriptionRequestType } from '../types/clinicArea';
import {
  buildUnitFromDraft,
  builtinUnitType,
  defaultCapabilitiesFor,
  defaultBedCountFor,
  normalizeUnitTypeId,
  validateUnitDraft,
} from './unitCatalog.ts';
import {
  ReadOnlyAreaError,
  computeUnitEntitlementState,
  subscriptionHistoryExists,
  type SubscriptionStorage,
} from './subscriptionRequests.ts';

/**
 * Institution setup draft: a resumable, device-local wizard state.
 *
 * Nothing in this module talks to Firestore or to the app's unit actions. It
 * only validates the draft and, on request, hands back plain `Unit` objects for
 * the caller to review. The storage layer is injected so the whole flow works in
 * a browser, in a test, and on a device where localStorage is unavailable — in
 * that last case an in-memory map keeps the wizard usable for the session.
 */

export const INSTITUTION_SETUP_STORAGE_KEY = 'cardiovault_dt_institution_setup_v1';
export const REQUIRED_STEPS = ['institution', 'units', 'team', 'plan'] as const;
export type SetupStep = (typeof REQUIRED_STEPS)[number];

/**
 * Companion record for the subscription-request fields typed in the wizard.
 *
 * The read-only `InstitutionSetupDraft` contract (types/departmentTeam.ts) is
 * NOT extended: everything the first "Request" step and the "Payment" step
 * collect — and the per-unit receivesOperations flags — lives in a SEPARATE
 * device-local record keyed by the draft id 'current'. That keeps the existing
 * draft type, its stored shape and every old stored JSON loadable unchanged
 * (all companion fields are optional and loadDraft never needs them).
 */
export const SETUP_COMPANION_STORAGE_KEY = 'cardiovault_dt_institution_setup_companion_v1';

export interface SetupCompanionRecord {
  id: 'current';
  /** Request step: نوع الطلب. */
  requestType?: SubscriptionRequestType;
  /** Request step: contact phone (validated at submission: >=7 digits). */
  phone?: string;
  /** Payment step: chosen payment method (instapay -> EGP, visa -> USD). */
  paymentMethod?: PaymentMethodChoice;
  /** Clinic (or both): requested doctor count. */
  doctorsCount?: number;
  /** Clinic (or both): selected service labels. */
  clinicServices?: string[];
  /** Per-unit flag for the "وحدة تستقبل عمليات" checkbox, by unit tempId. */
  receivesOperationsByUnit?: Record<string, boolean>;
  /** Set on the first successful submission; prevents duplicate requests. */
  lastSubmittedRequestId?: string;
  lastSubmittedAtMs?: number;
  /**
   * When the owner-side copy of `lastSubmittedRequestId` was confirmed written.
   * Unset means "not delivered yet", so pressing Save again retries the delivery
   * instead of leaving the request on this device. Additive: an older stored
   * record simply has no value.
   */
  lastRequestDeliveredAtMs?: number;
  updatedAtMs: number;
  schemaVersion: number;
}

/** Small helper for the unit's display label used in summaries and submission. */
export function unitTypeLabel(
  unit?: Pick<InstitutionUnitDraft, 'typeId' | 'customTypeName'> | null,
): string {
  if (!unit) return 'Unit';
  if (unit.typeId === 'custom') {
    const custom = typeof unit.customTypeName === 'string' ? unit.customTypeName.trim() : '';
    return custom || 'Custom';
  }
  return builtinUnitType(unit.typeId)?.label || 'Unit';
}

export const MIN_INSTITUTION_NAME = 2;
export const MAX_INSTITUTION_NAME = 120;
export const MIN_ADMIN_NAME = 2;
export const MAX_ADMIN_NAME = 80;
export const MAX_TEAM_SIZE = 10_000;
/**
 * The clinic service list is stored on the subscription request, and the
 * security rules accept at most this many entries. Keeping the cap here means
 * the form can never build a request the rules would refuse.
 */
export const MAX_CLINIC_SERVICES = 20;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStore = new Map<string, string>();

const memoryStorage: SetupStorage = {
  getItem: (key) => (memoryStore.has(key) ? (memoryStore.get(key) as string) : null),
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
};

function looksLikeStorage(candidate: unknown): candidate is SetupStorage {
  const value = candidate as SetupStorage | null;
  return (
    !!value &&
    typeof value.getItem === 'function' &&
    typeof value.setItem === 'function' &&
    typeof value.removeItem === 'function'
  );
}

/**
 * Resolves the storage to use, lazily and defensively. localStorage is never
 * touched at import time and a throwing implementation (private mode, blocked
 * storage on a device) falls back to the in-memory map instead of failing.
 */
export function resolveSetupStorage(candidate?: SetupStorage | null): SetupStorage {
  if (looksLikeStorage(candidate)) return candidate;
  try {
    const local = globalThis.localStorage;
    if (looksLikeStorage(local)) return local;
  } catch {
    /* storage is blocked; the wizard still works for this session */
  }
  return memoryStorage;
}

function readRaw(storage: SetupStorage): string | null {
  try {
    return storage.getItem(INSTITUTION_SETUP_STORAGE_KEY);
  } catch {
    return memoryStore.get(INSTITUTION_SETUP_STORAGE_KEY) ?? null;
  }
}

function writeRaw(storage: SetupStorage, value: string): void {
  memoryStore.set(INSTITUTION_SETUP_STORAGE_KEY, value);
  try {
    storage.setItem(INSTITUTION_SETUP_STORAGE_KEY, value);
  } catch {
    /* the in-memory copy above is the fallback, never a reason to throw */
  }
}

function removeRaw(storage: SetupStorage): void {
  memoryStore.delete(INSTITUTION_SETUP_STORAGE_KEY);
  try {
    storage.removeItem(INSTITUTION_SETUP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Companion record storage (see SetupCompanionRecord above)
// ---------------------------------------------------------------------------

const COMPANION_REQUEST_TYPES: SubscriptionRequestType[] = ['department', 'clinic', 'both'];

function readRawCompanion(storage: SetupStorage): string | null {
  try {
    return storage.getItem(SETUP_COMPANION_STORAGE_KEY);
  } catch {
    return memoryStore.get(SETUP_COMPANION_STORAGE_KEY) ?? null;
  }
}

function writeRawCompanion(storage: SetupStorage, value: string): void {
  memoryStore.set(SETUP_COMPANION_STORAGE_KEY, value);
  try {
    storage.setItem(SETUP_COMPANION_STORAGE_KEY, value);
  } catch {
    /* the in-memory copy above is the fallback, never a reason to throw */
  }
}

function parseCompanion(raw: string | null): SetupCompanionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SetupCompanionRecord> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record: SetupCompanionRecord = {
      id: 'current',
      updatedAtMs: Math.max(0, safeNumber(parsed.updatedAtMs, 0)),
      schemaVersion: 1,
    };
    const requestType = clean(parsed.requestType);
    if ((COMPANION_REQUEST_TYPES as string[]).includes(requestType)) {
      record.requestType = requestType as SubscriptionRequestType;
    }
    const phone = clean(parsed.phone);
    if (phone) record.phone = phone;
    const paymentMethod = clean(parsed.paymentMethod);
    if (paymentMethod === 'instapay' || paymentMethod === 'visa') {
      record.paymentMethod = paymentMethod;
    }
    const doctorsCount = Math.trunc(safeNumber(parsed.doctorsCount, -1));
    if (Number.isInteger(doctorsCount) && doctorsCount >= 0) record.doctorsCount = doctorsCount;
    if (Array.isArray(parsed.clinicServices)) {
      record.clinicServices = parsed.clinicServices.map((entry) => clean(entry)).filter(Boolean);
    }
    if (parsed.receivesOperationsByUnit && typeof parsed.receivesOperationsByUnit === 'object') {
      const flags: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed.receivesOperationsByUnit)) {
        if (typeof key === 'string' && key) flags[key] = !!value;
      }
      record.receivesOperationsByUnit = flags;
    }
    const lastSubmittedRequestId = clean(parsed.lastSubmittedRequestId);
    if (lastSubmittedRequestId) record.lastSubmittedRequestId = lastSubmittedRequestId;
    const lastSubmittedAtMs = Math.trunc(safeNumber(parsed.lastSubmittedAtMs, -1));
    if (lastSubmittedAtMs >= 0) record.lastSubmittedAtMs = lastSubmittedAtMs;
    const lastRequestDeliveredAtMs = Math.trunc(safeNumber(parsed.lastRequestDeliveredAtMs, 0));
    if (lastRequestDeliveredAtMs > 0) record.lastRequestDeliveredAtMs = lastRequestDeliveredAtMs;
    return record;
  } catch {
    return null;
  }
}

/** Reads the companion record. Missing, corrupt or empty yields the defaults. */
export function loadSetupCompanion(storage?: SetupStorage | null): SetupCompanionRecord {
  const target = resolveSetupStorage(storage);
  return parseCompanion(readRawCompanion(target)) ?? { id: 'current', updatedAtMs: 0, schemaVersion: 1 };
}

/** Merges the patch into the stored companion record and persists per keystroke. */
export function saveSetupCompanion(
  patch: Partial<SetupCompanionRecord>,
  storage?: SetupStorage | null,
): SetupCompanionRecord {
  const target = resolveSetupStorage(storage);
  const current = loadSetupCompanion(target);
  const saved: SetupCompanionRecord = {
    ...current,
    ...patch,
    id: 'current',
    clinicServices: Array.isArray(patch?.clinicServices)
      ? patch.clinicServices.map((entry) => clean(entry)).filter(Boolean).slice(0, MAX_CLINIC_SERVICES)
      : Array.isArray(current.clinicServices)
        ? [...current.clinicServices].slice(0, MAX_CLINIC_SERVICES)
        : [],
    receivesOperationsByUnit: {
      ...(current.receivesOperationsByUnit || {}),
      ...(patch?.receivesOperationsByUnit || {}),
    },
    updatedAtMs: Date.now(),
    schemaVersion: 1,
  };
  writeRawCompanion(target, JSON.stringify(saved));
  return saved;
}

/** Companion clearing lives with clearDraft so a reset wipes both records. */
function removeRawCompanion(storage: SetupStorage): void {
  memoryStore.delete(SETUP_COMPANION_STORAGE_KEY);
  try {
    storage.removeItem(SETUP_COMPANION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The unit flags map for one unit row, used by the wizard UI and submission. */
export function unitReceivesOperations(
  companion: SetupCompanionRecord,
  tempId: string,
): boolean {
  return !!(companion?.receivesOperationsByUnit && companion.receivesOperationsByUnit[tempId]);
}

/**
 * Companion-field validation for the Request step (the draft fields stay in
 * validateInstitutionSetup):
 *  - a request type must be chosen;
 *  - the contact phone needs >= 7 digits;
 *  - clinic/both needs a doctor count 1..200;
 *  - with `unitCount` given (save time), department/both needs >= 1 unit.
 */
export function validateSetupCompanion(
  companion: SetupCompanionRecord,
  unitCount?: number,
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!companion?.requestType) {
    errors.requestType = 'Choose the request type: department, clinic, or both.';
  }
  const digits = (clean(companion?.phone).match(/\d/g) || []).length;
  if (digits < 7) {
    errors.phone = 'Enter a valid phone number (at least 7 digits).';
  }
  const type = companion?.requestType;
  if (type === 'clinic' || type === 'both') {
    const doctorsCount = Number(companion?.doctorsCount);
    if (!Number.isInteger(doctorsCount) || doctorsCount < 1 || doctorsCount > 200) {
      errors.doctorsCount = 'Clinic doctor count must be a whole number between 1 and 200.';
    }
  }
  if (typeof unitCount === 'number' && (type === 'department' || type === 'both') && unitCount < 1) {
    errors.units = 'Add at least one unit in the Units step for a department request.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let tempCounter = 0;

/** Stable-enough temp id for a new draft row. */
export function newUnitDraftId(typeId: UnitTypeId = 'custom'): string {
  tempCounter += 1;
  return `draft-${typeId}-${Date.now()}-${tempCounter}`;
}

export function emptyUnitDraft(typeId: UnitTypeId = 'cardiology'): InstitutionUnitDraft {
  return {
    tempId: newUnitDraftId(typeId),
    name: '',
    typeId,
    beds: defaultBedCountFor(typeId),
  };
}

export function emptyDraft(): InstitutionSetupDraft {
  return {
    id: 'current',
    institutionName: '',
    adminName: '',
    adminEmail: '',
    unitDrafts: [],
    teamSize: 0,
    completedSteps: [],
    updatedAtMs: 0,
    schemaVersion: 1,
  };
}

function normalizeUnitDraft(raw: unknown, index: number): InstitutionUnitDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<InstitutionUnitDraft>;
  const typeId = normalizeUnitTypeId(source.typeId);
  const draft: InstitutionUnitDraft = {
    tempId: clean(source.tempId) || `draft-restored-${index + 1}`,
    name: clean(source.name),
    typeId,
    beds: Math.max(0, Math.trunc(safeNumber(source.beds, 0))),
  };
  const customTypeName = clean(source.customTypeName);
  if (customTypeName) draft.customTypeName = customTypeName;
  return draft;
}

/** Parses whatever was stored into a usable draft, or `null` when unusable. */
function parseDraft(raw: string | null): InstitutionSetupDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InstitutionSetupDraft> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const unitDrafts = Array.isArray(parsed.unitDrafts)
      ? parsed.unitDrafts
          .map((entry, index) => normalizeUnitDraft(entry, index))
          .filter((entry): entry is InstitutionUnitDraft => entry !== null)
      : [];
    const completedSteps = Array.isArray(parsed.completedSteps)
      ? Array.from(new Set(parsed.completedSteps.filter((step): step is string => typeof step === 'string' && !!step.trim()).map((step) => step.trim())))
      : [];
    const draft: InstitutionSetupDraft = {
      id: 'current',
      institutionName: clean(parsed.institutionName),
      adminName: clean(parsed.adminName),
      adminEmail: clean(parsed.adminEmail),
      unitDrafts,
      teamSize: Math.max(0, Math.trunc(safeNumber(parsed.teamSize, 0))),
      completedSteps,
      updatedAtMs: Math.max(0, safeNumber(parsed.updatedAtMs, 0)),
      schemaVersion: 1,
    };
    const planId = clean(parsed.planId);
    if (planId) draft.planId = planId;
    return draft;
  } catch {
    return null;
  }
}

/** Reads the saved draft. Missing or corrupt data yields a clean empty draft. */
export function loadDraft(storage?: SetupStorage | null): InstitutionSetupDraft {
  const target = resolveSetupStorage(storage);
  const parsed = parseDraft(readRaw(target));
  return parsed ?? emptyDraft();
}

/** Persists a copy with a fresh timestamp and returns it, so the wizard resumes. */
export function saveDraft(draft: InstitutionSetupDraft, storage?: SetupStorage | null): InstitutionSetupDraft {
  const target = resolveSetupStorage(storage);
  const saved: InstitutionSetupDraft = {
    ...emptyDraft(),
    ...draft,
    id: 'current',
    unitDrafts: Array.isArray(draft?.unitDrafts) ? draft.unitDrafts.map((unit) => ({ ...unit })) : [],
    completedSteps: Array.isArray(draft?.completedSteps) ? Array.from(new Set(draft.completedSteps)) : [],
    updatedAtMs: Date.now(),
    schemaVersion: 1,
  };
  writeRaw(target, JSON.stringify(saved));
  return saved;
}

export function clearDraft(storage?: SetupStorage | null): void {
  const target = resolveSetupStorage(storage);
  removeRaw(target);
  // The reset must not leave companion request/payment fields behind either.
  removeRawCompanion(target);
}

/** Adds a step once, keeping every other completed step. */
export function markStepCompleted(draft: InstitutionSetupDraft, step: string): InstitutionSetupDraft {
  const target = clean(step);
  const steps = Array.isArray(draft?.completedSteps) ? draft.completedSteps : [];
  const completedSteps = target && !steps.includes(target) ? [...steps, target] : [...steps];
  return { ...draft, completedSteps };
}

/**
 * How many required steps are recorded as done.
 */
export function completedRequiredSteps(draft: InstitutionSetupDraft): SetupStep[] {
  const steps = Array.isArray(draft?.completedSteps) ? draft.completedSteps : [];
  return REQUIRED_STEPS.filter((step) => steps.includes(step));
}

function validUnitDraftCount(draft: InstitutionSetupDraft): number {
  const units = Array.isArray(draft?.unitDrafts) ? draft.unitDrafts : [];
  return units.filter((unit) =>
    validateUnitDraft({
      name: unit.name,
      typeId: unit.typeId,
      customTypeName: unit.customTypeName,
      beds: unit.beds,
    }).ok,
  ).length;
}

/**
 * Progress in 0..100, deterministic:
 *  - 60 points split evenly across the four required steps (15 each);
 *  - 40 points for valid unit rows, capped at three rows (13.33 each), because
 *    three units already prove the institution has a working starting set.
 *  - A draft with ANY validation error is capped below 100: an invalid draft
 *    must never look finished, even when every step has been visited.
 * Rounded down so the bar never shows 100 before it really is.
 *
 * `requestType` (from the companion request record) is optional: for a
 * clinic-only request the minimum-unit rule is relaxed, and the progress math
 * is unchanged otherwise.
 */
export function setupProgress(
  draft: InstitutionSetupDraft,
  requestType?: SubscriptionRequestType | null,
): number {
  const stepPoints = (completedRequiredSteps(draft).length / REQUIRED_STEPS.length) * 60;
  const unitPoints = (Math.min(validUnitDraftCount(draft), 3) / 3) * 40;
  const validation = validateInstitutionSetup(draft, requestType);
  const cap = validation.ok ? 100 : 89;
  return Math.max(0, Math.min(cap, Math.floor(stepPoints + unitPoints)));
}

/** Sum of the bed counts in the draft. Invalid values count as zero. */
export function draftTotalBeds(draft: InstitutionSetupDraft): number {
  const units = Array.isArray(draft?.unitDrafts) ? draft.unitDrafts : [];
  return units.reduce((total, unit) => {
    const beds = Math.trunc(safeNumber(unit?.beds, 0));
    return total + (beds > 0 ? beds : 0);
  }, 0);
}

/**
 * Validates the whole setup.
 *
 * Unit errors are namespaced `unit.<tempId>.<field>` so the form can show them
 * on the right row, and duplicate names (case-insensitive) are reported once as
 * `units.duplicate`. `ok` also requires every required step to be completed:
 * a valid form is not a finished wizard.
 *
 * `requestType` (companion request record) is optional for backward
 * compatibility: undefined keeps the old behavior (>= 1 unit always required);
 * 'clinic' relaxes ONLY that minimum-unit rule because the subscription line
 * for the clinic area is about doctors, not department units.
 */
export function validateInstitutionSetup(
  draft: InstitutionSetupDraft,
  requestType?: SubscriptionRequestType | null,
): SetupValidation {
  const errors: Record<string, string> = {};
  const institutionName = clean(draft?.institutionName);
  const adminName = clean(draft?.adminName);
  const adminEmail = clean(draft?.adminEmail);
  const teamSize = Number(draft?.teamSize);

  if (institutionName.length < MIN_INSTITUTION_NAME || institutionName.length > MAX_INSTITUTION_NAME) {
    errors.institutionName = `Institution name must be ${MIN_INSTITUTION_NAME}-${MAX_INSTITUTION_NAME} characters.`;
  }

  if (adminName.length < MIN_ADMIN_NAME || adminName.length > MAX_ADMIN_NAME) {
    errors.adminName = `Admin name must be ${MIN_ADMIN_NAME}-${MAX_ADMIN_NAME} characters.`;
  }

  if (!EMAIL_PATTERN.test(adminEmail)) {
    errors.adminEmail = 'Enter a valid email address.';
  }

  if (!Number.isInteger(teamSize) || teamSize < 0 || teamSize > MAX_TEAM_SIZE) {
    errors.teamSize = `Team size must be a whole number between 0 and ${MAX_TEAM_SIZE}.`;
  }

  const units = Array.isArray(draft?.unitDrafts) ? draft.unitDrafts : [];
  const minimumUnitsRequired = requestType !== 'clinic';
  if (minimumUnitsRequired && units.length < 1) errors.units = 'Add at least one unit.';
  if (requestType === 'clinic' && units.length > 0) {
    errors.units = 'A clinic-only request cannot include department units. Select “Department and clinic” or remove the units.';
  }

  const seenNames = new Set<string>();
  let duplicate = false;
  units.forEach((unit, index) => {
    const check = validateUnitDraft({
      name: unit?.name,
      typeId: unit?.typeId,
      customTypeName: unit?.customTypeName,
      beds: unit?.beds,
    });
    const prefix = `unit.${clean(unit?.tempId) || `row-${index + 1}`}`;
    for (const [field, message] of Object.entries(check.errors)) {
      errors[`${prefix}.${field}`] = message;
    }
    const name = clean(unit?.name).toLowerCase();
    if (name) {
      if (seenNames.has(name)) duplicate = true;
      else seenNames.add(name);
    }
  });
  if (duplicate) errors['units.duplicate'] = 'Unit names must be unique.';

  const steps = Array.isArray(draft?.completedSteps) ? draft.completedSteps : [];
  const missingSteps = REQUIRED_STEPS.filter((step) => !steps.includes(step));
  if (missingSteps.length) errors.steps = `Not finished yet: ${missingSteps.join(', ')}.`;

  return {
    ok: Object.keys(errors).length === 0 && missingSteps.length === 0,
    errors,
    totalBeds: draftTotalBeds(draft),
  };
}

/** True when the setup may be turned into units. */
export function canCreateUnits(
  draft: InstitutionSetupDraft,
  requestType?: SubscriptionRequestType | null,
): boolean {
  return validateInstitutionSetup(draft, requestType).ok;
}

function uniqueUnitName(desired: string, taken: Set<string>): string {
  const base = clean(desired) || 'Unit';
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Turns a valid draft into new `Unit` objects.
 *
 * Returns ONLY the new units — the existing array is read, never modified. Ids
 * and names never collide with what the institution already has, and the draft
 * order is preserved. Throws when the draft is not ready, because creating units
 * from an incomplete setup is exactly the state this module exists to prevent.
 *
 * Read-only checks are scoped to each unit because renewals can select only one
 * unit. Stable draft IDs also connect this object to its request and code.
 */
export function createUnitsFromDraft(
  draft: InstitutionSetupDraft,
  existingUnits: Unit[] = [],
  subscriptionStorage?: SubscriptionStorage | null,
  subscriberId?: string,
): Unit[] {
  const requestType = loadSetupCompanion(subscriptionStorage).requestType;
  const validation = validateInstitutionSetup(draft, requestType);
  if (!validation.ok) {
    const fields = Object.keys(validation.errors);
    throw new Error(`Institution setup is incomplete (${fields.join(', ')}).`);
  }
  const existing = Array.isArray(existingUnits) ? existingUnits : [];
  const takenIds = new Set(existing.map((unit) => clean(unit?.id)).filter(Boolean));
  const takenNames = new Set(existing.map((unit) => clean(unit?.name).toLowerCase()).filter(Boolean));
  const stamp = Date.now();
  const result: Unit[] = [];

  draft.unitDrafts.forEach((row, index) => {
    const stableId = clean(row.tempId) || `unit-draft-${stamp}-${index + 1}`;
    if (takenIds.has(stableId)) return;
    if (subscriptionHistoryExists(subscriptionStorage, subscriberId) && computeUnitEntitlementState(stableId, undefined, subscriptionStorage, subscriberId) === 'read-only') {
      throw new ReadOnlyAreaError(
        `read-only-area: Unit “${clean(row.name) || stableId}” is read-only until its own trial or subscription is active.`,
      );
    }
    const typeId = normalizeUnitTypeId(row.typeId);
    let id = stableId;
    let attempt = 1;
    while (takenIds.has(id)) {
      attempt += 1;
      id = `unit-${typeId}-${stamp}-${index + 1}-${attempt}`;
    }
    takenIds.add(id);

    const name = uniqueUnitName(row.name, takenNames);
    result.push(
      buildUnitFromDraft(
        {
          name,
          typeId,
          customTypeName: row.customTypeName,
          beds: row.beds,
          capabilities: defaultCapabilitiesFor(typeId),
        },
        { id },
      ),
    );
  });

  return result;
}

/** Convenience flag used by the UI to enable the save button. */
export function isSetupComplete(
  draft: InstitutionSetupDraft,
  requestType?: SubscriptionRequestType | null,
): boolean {
  return validateInstitutionSetup(draft, requestType).ok;
}
