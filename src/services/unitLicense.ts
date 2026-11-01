export const UNIT_LICENSE_DAYS = 30;
export const UNIT_LICENSE_MS = UNIT_LICENSE_DAYS * 24 * 60 * 60 * 1000;

export interface UnitLicenseRecord {
  workspaceId: string;
  unitId: string;
  issuedAtMs: number;
  expiresAtMs: number;
  updatedBy: string;
  schemaVersion: 1;
}

export type UnitLicenseState = 'missing' | 'active' | 'expired';

export function licensedUnitIds(
  unitIds: string[],
  licenses: Record<string, Partial<UnitLicenseRecord> | null | undefined>,
  nowMs: number,
): Set<string> {
  return new Set(unitIds.filter(id => unitLicenseState(licenses[id], nowMs) === 'active'));
}

export function filterCachedClinicalByLicensedUnits<TUnit extends { id: string }, TPatient extends { unitId: string; unitIds?: string[] }, TBed extends { unitId: string }>(
  units: TUnit[],
  patients: TPatient[],
  beds: TBed[],
  allowedUnitIds: ReadonlySet<string>,
) {
  return {
    units: units.filter(unit => allowedUnitIds.has(String(unit.id))),
    patients: patients.filter(patient => allowedUnitIds.has(String(patient.unitId)) || (patient.unitIds || []).some(id => allowedUnitIds.has(String(id)))),
    beds: beds.filter(bed => allowedUnitIds.has(String(bed.unitId))),
  };
}

export function unitLicenseState(record: Partial<UnitLicenseRecord> | null | undefined, nowMs: number): UnitLicenseState {
  if (!record || !Number.isFinite(record.expiresAtMs) || Number(record.expiresAtMs) <= 0) return 'missing';
  return nowMs < Number(record.expiresAtMs) ? 'active' : 'expired';
}

/** Early renewal stacks on the current expiry; a late renewal starts now. */
export function nextUnitLicenseExpiry(currentExpiryMs: number | null | undefined, nowMs: number): number {
  if (!Number.isFinite(nowMs) || nowMs <= 0) throw new Error('A valid issue time is required.');
  const current = Number(currentExpiryMs);
  const start = Number.isFinite(current) && current > nowMs ? current : nowMs;
  return start + UNIT_LICENSE_MS;
}

export function createUnitLicenseRecord(input: {
  workspaceId: string;
  unitId: string;
  updatedBy: string;
  nowMs: number;
  currentExpiryMs?: number | null;
}): UnitLicenseRecord {
  const workspaceId = String(input.workspaceId || '').trim();
  const unitId = String(input.unitId || '').trim();
  const updatedBy = String(input.updatedBy || '').trim();
  if (!workspaceId || !unitId || !updatedBy) throw new Error('Workspace, unit, and owner are required.');
  const nowMs = Math.floor(input.nowMs);
  const currentExpiryMs = Number(input.currentExpiryMs);
  return {
    workspaceId,
    unitId,
    issuedAtMs: nowMs,
    expiresAtMs: nextUnitLicenseExpiry(Number.isFinite(currentExpiryMs) ? currentExpiryMs : null, nowMs),
    updatedBy,
    schemaVersion: 1,
  };
}
