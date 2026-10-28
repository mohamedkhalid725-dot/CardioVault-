import type { Unit } from '../types/clinical';
import type { UnitCapabilities, UnitConfig, UnitTypeId } from '../types/departmentTeam';

/**
 * Unit catalogue for institution setup.
 *
 * Pure module: no React, no storage, no network. It answers three questions:
 * what unit types exist, what a legacy free-text unit means in that vocabulary,
 * and how a setup draft becomes a `Unit` without touching the record it came
 * from.
 *
 * Nothing here is policy. The capability defaults below are proposals the owner
 * can flip per unit — a cath lab may well have a couple of recovery beds, and a
 * cardiology ward may run without a clinic. The defaults only save the owner
 * from starting every toggle by hand.
 */

export const UNIT_SCHEMA_VERSION = 1;
export const MAX_UNIT_BEDS = 200;
export const MIN_UNIT_NAME_LENGTH = 2;
export const MAX_UNIT_NAME_LENGTH = 80;
export const MAX_CUSTOM_TYPE_NAME_LENGTH = 60;
export const MAX_FUNCTION_NAME_LENGTH = 120;

export interface BuiltinUnitType {
  id: Exclude<UnitTypeId, 'custom'>;
  label: string;
  /** Proposed defaults. Edit as product decisions evolve; owners override them. */
  capabilities: UnitCapabilities;
  /** Bed count proposed in the setup form. Never a capacity limit. */
  defaultBeds: number;
}

/**
 * Capability defaults — EDITABLE PRODUCT PROPOSALS, not policy:
 *  - beds: physical inpatient units (cardiology, ccu, icu, surgery, ward) start
 *    with beds on; cath lab, dialysis and endoscopy start with beds off because
 *    they are mostly procedure areas;
 *  - waitingList: cath lab, dialysis and endoscopy start with a waiting list on;
 *  - clinicMode: cardiology and dialysis start with clinic mode on.
 * Every toggle stays editable for the owner.
 */
export const BUILTIN_UNIT_TYPES: BuiltinUnitType[] = [
  {
    id: 'cardiology',
    label: 'Cardiology',
    capabilities: { beds: true, waitingList: false, clinicMode: true },
    defaultBeds: 12,
  },
  {
    id: 'ccu',
    label: 'CCU (Coronary Care)',
    capabilities: { beds: true, waitingList: false, clinicMode: false },
    defaultBeds: 6,
  },
  {
    id: 'icu',
    label: 'ICU (Intensive Care)',
    capabilities: { beds: true, waitingList: false, clinicMode: false },
    defaultBeds: 8,
  },
  {
    id: 'surgery',
    label: 'Surgery',
    capabilities: { beds: true, waitingList: false, clinicMode: false },
    defaultBeds: 10,
  },
  {
    id: 'inpatient-ward',
    label: 'Inpatient Ward',
    capabilities: { beds: true, waitingList: false, clinicMode: false },
    defaultBeds: 20,
  },
  {
    id: 'cath-lab',
    label: 'Cath Lab',
    capabilities: { beds: false, waitingList: true, clinicMode: false },
    defaultBeds: 0,
  },
  {
    id: 'dialysis',
    label: 'Dialysis',
    capabilities: { beds: false, waitingList: true, clinicMode: true },
    defaultBeds: 0,
  },
  {
    id: 'endoscopy',
    label: 'Endoscopy',
    capabilities: { beds: false, waitingList: true, clinicMode: false },
    defaultBeds: 0,
  },
];

/** Capabilities a brand-new custom unit starts with. Same rules: editable. */
export const CUSTOM_UNIT_CAPABILITIES: UnitCapabilities = { beds: true, waitingList: false, clinicMode: false };

/** How an unknown or custom unit behaves before the owner configures it. */
export const FALLBACK_CAPABILITIES: UnitCapabilities = { beds: true, waitingList: false, clinicMode: false };

const BUILTIN_BY_ID = new Map<string, BuiltinUnitType>(BUILTIN_UNIT_TYPES.map((entry) => [entry.id, entry]));

/**
 * Legacy free-text `Unit.type` values already present in departmentService.ts.
 * Keys are lowercase and trimmed.
 */
export const LEGACY_TYPE_MAP: Record<string, UnitTypeId> = {
  'critical care / ccu': 'ccu',
  'critical care / icu': 'icu',
  'critical care': 'icu',
  'intensive care unit': 'icu',
  'intensive care': 'icu',
  'coronary care': 'ccu',
  'step-down / inpatient': 'inpatient-ward',
  'step-down': 'inpatient-ward',
  'step down': 'inpatient-ward',
  cardiology: 'cardiology',
  ccu: 'ccu',
  icu: 'icu',
  surgery: 'surgery',
  'inpatient ward': 'inpatient-ward',
  ward: 'inpatient-ward',
  'cath lab': 'cath-lab',
  'cath-lab': 'cath-lab',
  dialysis: 'dialysis',
  endoscopy: 'endoscopy',
  custom: 'custom',
};

/**
 * Tolerant substring rules, checked in this order. Order matters: "ward" is
 * tested after the specific procedure areas, so "Cardiology Inpatient Ward"
 * becomes an inpatient ward rather than a cardiology unit, and ccu/coronary are
 * tested before the shorter "icu" fragment.
 */
const SUBSTRING_RULES: Array<{ match: string[]; id: UnitTypeId }> = [
  { match: ['cath'], id: 'cath-lab' },
  { match: ['dialysis', 'haemodialysis', 'hemodialysis'], id: 'dialysis' },
  { match: ['endoscopy', 'scope unit'], id: 'endoscopy' },
  { match: ['surgical', 'surgery', 'operating theatre', 'operating room'], id: 'surgery' },
  { match: ['coronary', 'ccu'], id: 'ccu' },
  { match: ['intensive', 'icu', 'critical care'], id: 'icu' },
  { match: ['ward', 'inpatient', 'step-down', 'step down'], id: 'inpatient-ward' },
];

export function isBuiltinUnitTypeId(value: unknown): value is Exclude<UnitTypeId, 'custom'> {
  return typeof value === 'string' && BUILTIN_BY_ID.has(value.trim().toLowerCase());
}

export function builtinUnitType(id: UnitTypeId): BuiltinUnitType | undefined {
  if (id === 'custom') return undefined;
  return BUILTIN_BY_ID.get(id);
}

/** Capability defaults for a type. Custom and unknown types get the fallback. */
export function defaultCapabilitiesFor(typeId: UnitTypeId): UnitCapabilities {
  if (typeId === 'custom') return { ...CUSTOM_UNIT_CAPABILITIES };
  const builtin = builtinUnitType(typeId);
  return builtin ? { ...builtin.capabilities } : { ...FALLBACK_CAPABILITIES };
}

/** Default bed count proposed for a type. */
export function defaultBedCountFor(typeId: UnitTypeId): number {
  return builtinUnitType(typeId)?.defaultBeds ?? 0;
}

/**
 * A fresh config with the type defaults filled in. `capabilities` may be a
 * partial override, so callers can flip one toggle without restating the rest.
 */
export function DEFAULT_UNIT_CONFIG(
  capabilities: Partial<UnitCapabilities> = {},
  typeId: UnitTypeId = 'custom',
): UnitConfig {
  return {
    typeId,
    capabilities: { ...defaultCapabilitiesFor(typeId), ...pickCapabilities(capabilities) },
    settings: {},
    schemaVersion: UNIT_SCHEMA_VERSION,
  };
}

/**
 * Maps any stored or typed value to a unit type id.
 * Unknown values become 'custom' instead of guessing.
 */
export function normalizeUnitTypeId(value: unknown): UnitTypeId {
  if (typeof value !== 'string') return 'custom';
  const raw = value.trim();
  if (!raw) return 'custom';
  const lower = raw.toLowerCase();

  if (isBuiltinUnitTypeId(lower)) return lower as UnitTypeId;
  const exact = LEGACY_TYPE_MAP[lower];
  if (exact) return exact;

  for (const rule of SUBSTRING_RULES) {
    if (rule.match.some((fragment) => lower.includes(fragment))) return rule.id;
  }
  // A free-text type we do not recognise is still a real unit; keep it as custom
  // so its label survives in customTypeName rather than being dropped.
  return 'custom';
}

function pickCapabilities(source: Partial<UnitCapabilities> | undefined): Partial<UnitCapabilities> {
  const out: Partial<UnitCapabilities> = {};
  if (!source || typeof source !== 'object') return out;
  if (typeof source.beds === 'boolean') out.beds = source.beds;
  if (typeof source.waitingList === 'boolean') out.waitingList = source.waitingList;
  if (typeof source.clinicMode === 'boolean') out.clinicMode = source.clinicMode;
  return out;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveBedCount(value: unknown): number | undefined {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count) || count <= 0) return undefined;
  return Math.min(count, MAX_UNIT_BEDS);
}

/**
 * The config a unit should carry. Non-destructive: an existing `config` is
 * copied and only missing capability keys are filled from the type defaults.
 * The unit object itself is never mutated and no field becomes required.
 */
export function unitConfigFor(unit: Partial<Unit>): UnitConfig {
  const source = unit?.config;
  const fallbackTypeId = normalizeUnitTypeId(unit?.unitTypeId ?? unit?.type);

  if (source && typeof source === 'object') {
    const typeId = normalizeUnitTypeId(source.typeId ?? unit?.unitTypeId ?? unit?.type);
    const resolvedType = source.typeId === 'custom' ? 'custom' : typeId;
    const capabilities: UnitCapabilities = {
      ...defaultCapabilitiesFor(resolvedType),
      ...pickCapabilities(source.capabilities),
    };
    const settings = { ...(source.settings || {}) };
    if (settings.defaultBedCount === undefined) {
      const carried = positiveBedCount(unit?.totalBeds);
      if (carried !== undefined) settings.defaultBedCount = carried;
    }
    const customTypeName = cleanString(source.customTypeName);
    const config: UnitConfig = {
      typeId: resolvedType,
      capabilities,
      settings,
      schemaVersion: UNIT_SCHEMA_VERSION,
    };
    if (customTypeName) config.customTypeName = customTypeName;
    return config;
  }

  const typeId = fallbackTypeId;
  const settings: UnitConfig['settings'] = {};
  const carried = positiveBedCount(unit?.totalBeds);
  if (carried !== undefined) settings.defaultBedCount = carried;
  const config: UnitConfig = {
    typeId,
    capabilities: defaultCapabilitiesFor(typeId),
    settings,
    schemaVersion: UNIT_SCHEMA_VERSION,
  };
  if (typeId === 'custom') {
    const legacyLabel = cleanString(unit?.type);
    if (legacyLabel) config.customTypeName = legacyLabel.slice(0, MAX_CUSTOM_TYPE_NAME_LENGTH);
  }
  return config;
}

/** Human label for a unit: custom name, then builtin label, then legacy type. */
export function unitDisplayType(unit: Partial<Unit>): string {
  const config = unit?.config;
  const typeId = normalizeUnitTypeId(config?.typeId ?? unit?.unitTypeId ?? unit?.type);
  if (typeId === 'custom') {
    const customName = cleanString(config?.customTypeName);
    if (customName) return customName;
    const legacy = cleanString(unit?.type);
    if (legacy) return legacy;
    return 'Unit';
  }
  return builtinUnitType(typeId)?.label || cleanString(unit?.type) || 'Unit';
}

export interface UnitDraftInput {
  name?: unknown;
  typeId?: unknown;
  customTypeName?: unknown;
  beds?: unknown;
  functionName?: unknown;
  capabilities?: Partial<UnitCapabilities>;
}

export interface UnitDraftValidation {
  ok: boolean;
  errors: Record<string, string>;
}

/**
 * Validates one unit row. `capabilities.beds === true` means the unit holds
 * physical beds, so a bed count of zero is an error only in that case.
 */
export function validateUnitDraft(draft: UnitDraftInput): UnitDraftValidation {
  const errors: Record<string, string> = {};
  const name = cleanString(draft?.name);
  const typeId = normalizeUnitTypeId(draft?.typeId);
  const rawTypeId = cleanString(draft?.typeId);
  const customTypeName = cleanString(draft?.customTypeName);
  const functionName = cleanString(draft?.functionName);

  if (name.length < MIN_UNIT_NAME_LENGTH || name.length > MAX_UNIT_NAME_LENGTH) {
    errors.name = `Unit name must be ${MIN_UNIT_NAME_LENGTH}-${MAX_UNIT_NAME_LENGTH} characters.`;
  }

  if (!rawTypeId) {
    errors.typeId = 'Choose a unit type.';
  } else if (rawTypeId.toLowerCase() !== 'custom' && !isBuiltinUnitTypeId(rawTypeId)) {
    errors.typeId = 'Choose a unit type from the list.';
  }

  if (typeId === 'custom' && (customTypeName.length < 2 || customTypeName.length > MAX_CUSTOM_TYPE_NAME_LENGTH)) {
    errors.customTypeName = `Custom type name must be 2-${MAX_CUSTOM_TYPE_NAME_LENGTH} characters.`;
  }

  const beds = Number(draft?.beds);
  if (!Number.isInteger(beds) || beds < 0 || beds > MAX_UNIT_BEDS) {
    errors.beds = `Beds must be a whole number between 0 and ${MAX_UNIT_BEDS}.`;
  } else {
    const capabilities = { ...defaultCapabilitiesFor(typeId), ...pickCapabilities(draft?.capabilities) };
    if (capabilities.beds && beds < 1) {
      errors.beds = 'A unit with beds needs at least one bed.';
    }
  }

  if (functionName.length > MAX_FUNCTION_NAME_LENGTH) {
    errors.functionName = `Function name must be ${MAX_FUNCTION_NAME_LENGTH} characters or fewer.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

let idCounter = 0;

/** Generated id for a new unit. Callers that need uniqueness must still check. */
export function newUnitId(typeId: UnitTypeId): string {
  idCounter += 1;
  return `unit-${typeId}-${Date.now()}-${idCounter}`;
}

/**
 * Builds a NEW Unit from a draft, preserving the identity fields of `base`
 * (createdBy, consultantUid, createdAtMs, capacityLocked, notes, features...).
 * The base object is never mutated.
 */
export function buildUnitFromDraft(draft: UnitDraftInput, base: Partial<Unit> = {}): Unit {
  const typeId = normalizeUnitTypeId(draft?.typeId);
  const customTypeName = cleanString(draft?.customTypeName);
  const beds = Math.max(0, Math.min(MAX_UNIT_BEDS, Math.trunc(Number(draft?.beds)) || 0));
  const capabilities = { ...defaultCapabilitiesFor(typeId), ...pickCapabilities(draft?.capabilities) };
  const functionName = cleanString(draft?.functionName) || cleanString(base?.config?.settings?.functionName);

  const settings: UnitConfig['settings'] = {
    ...(base?.config?.settings || {}),
    defaultBedCount: beds,
  };
  if (functionName) settings.functionName = functionName;
  else delete settings.functionName;

  const config: UnitConfig = {
    typeId,
    capabilities,
    settings,
    schemaVersion: UNIT_SCHEMA_VERSION,
  };
  if (typeId === 'custom' && customTypeName) config.customTypeName = customTypeName;

  const label = unitDisplayType({
    type: cleanString(base?.type) || cleanString(draft?.name),
    unitTypeId: typeId,
    config,
  });

  return {
    ...(base as Unit),
    id: cleanString(base?.id) || `unit-${typeId}-${Date.now()}`,
    name: cleanString(draft?.name),
    type: label,
    totalBeds: beds,
    unitTypeId: typeId,
    config,
  };
}
