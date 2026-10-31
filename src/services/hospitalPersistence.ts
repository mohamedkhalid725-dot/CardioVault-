import type { Hospital, Unit } from '../types/clinical';

export const HOSPITAL_SCHEMA_VERSION = 1;

export interface HospitalDocument extends Hospital {
  id: string;
  name: string;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  unitIds: string[];
  schemaVersion: number;
}

export interface HospitalWrite {
  collection: 'hospitals' | 'units';
  id: string;
  data: Record<string, unknown>;
  merge?: boolean;
}

/** Firestore operations are injected so ID and assignment behavior can be tested without Firebase. */
export interface HospitalPersistenceIO {
  getHospital(workspaceId: string, hospitalId: string): Promise<HospitalDocument | null>;
  listHospitals(workspaceId: string): Promise<HospitalDocument[]>;
  getUnit(workspaceId: string, unitId: string): Promise<Unit | null>;
  commit(workspaceId: string, writes: HospitalWrite[]): Promise<void>;
}

export function newHospitalId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `hospital-${randomId}`;
}

export async function createHospitalDocument(
  io: HospitalPersistenceIO,
  workspaceId: string,
  createdBy: string,
  name: string,
  id: string,
  nowMs = Date.now(),
): Promise<HospitalDocument> {
  const trimmedName = String(name || '').trim();
  const cleanId = String(id || '').trim();
  if (!workspaceId || !createdBy) throw new Error('A workspace and signed-in owner are required to create a hospital.');
  if (!trimmedName) throw new Error('Enter a hospital name.');
  if (!cleanId) throw new Error('A stable hospital ID is required.');

  const existing = await io.getHospital(workspaceId, cleanId);
  if (existing) {
    if (existing.createdBy === createdBy && existing.name === trimmedName) return existing;
    throw new Error('This hospital ID is already in use. Start a new hospital form before retrying.');
  }

  const hospital: HospitalDocument = {
    id: cleanId,
    name: trimmedName,
    createdBy,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    unitIds: [],
    schemaVersion: HOSPITAL_SCHEMA_VERSION,
  };
  await io.commit(workspaceId, [{ collection: 'hospitals', id: cleanId, data: { ...hospital }, merge: false }]);

  const saved = await io.getHospital(workspaceId, cleanId);
  if (!saved || saved.id !== cleanId || saved.name !== trimmedName || saved.createdBy !== createdBy || !Array.isArray(saved.unitIds)) {
    throw new Error('Hospital creation was not confirmed in Firestore. Retry using the same form.');
  }
  return saved;
}

/**
 * Members fetch only hospitals referenced by their already-authorized units.
 * A hospital is shown only when its persisted unitIds also confirms that link.
 */
export async function loadHospitalsForUnits(
  io: HospitalPersistenceIO,
  workspaceId: string,
  authorizedUnits: Unit[],
  isOwner: boolean,
): Promise<HospitalDocument[]> {
  if (!workspaceId) return [];
  if (isOwner) return io.listHospitals(workspaceId);

  const unitIds = new Set(authorizedUnits.map((unit) => String(unit.id)).filter(Boolean));
  const hospitalIds = Array.from(new Set(
    authorizedUnits.map((unit) => String(unit.hospitalId || '')).filter(Boolean),
  ));
  const fetched = await Promise.all(hospitalIds.map((id) => io.getHospital(workspaceId, id).catch(() => null)));
  return fetched.filter((hospital): hospital is HospitalDocument =>
    !!hospital && hospital.unitIds.some((unitId) => unitIds.has(String(unitId))) &&
    authorizedUnits.some((unit) => String(unit.hospitalId || '') === hospital.id),
  );
}

/**
 * Changes both sides of a hospital assignment in one Firestore batch. The stable
 * unit ID and every clinical/permission/subscription field are left untouched.
 */
export async function assignUnitHospitalDocument(
  io: HospitalPersistenceIO,
  workspaceId: string,
  unitId: string,
  hospitalId: string | null,
  nowMs = Date.now(),
): Promise<Unit> {
  const cleanUnitId = String(unitId || '').trim();
  const targetHospitalId = String(hospitalId || '').trim() || null;
  if (!workspaceId || !cleanUnitId) throw new Error('A workspace and unit are required to update the hospital group.');

  const unit = await io.getUnit(workspaceId, cleanUnitId);
  if (!unit) throw new Error('This unit could not be verified in Firestore.');
  const previousHospitalId = String(unit.hospitalId || '').trim() || null;
  const previousHospital = previousHospitalId
    ? await io.getHospital(workspaceId, previousHospitalId).catch(() => null)
    : null;
  const targetHospital = targetHospitalId
    ? await io.getHospital(workspaceId, targetHospitalId)
    : null;
  if (targetHospitalId && !targetHospital) throw new Error('The selected hospital is not available in this workspace.');

  const writes: HospitalWrite[] = [];
  if (previousHospital && previousHospitalId !== targetHospitalId) {
    writes.push({
      collection: 'hospitals',
      id: previousHospital.id,
      data: {
        unitIds: Array.from(new Set(previousHospital.unitIds || [])).filter((id) => String(id) !== cleanUnitId),
        updatedAtMs: nowMs,
      },
      merge: true,
    });
  }
  if (targetHospital) {
    const unitIds = Array.from(new Set([...(targetHospital.unitIds || []).map(String), cleanUnitId]));
    if (!targetHospital.unitIds.includes(cleanUnitId) || previousHospitalId !== targetHospitalId) {
      writes.push({
        collection: 'hospitals',
        id: targetHospital.id,
        data: { unitIds, updatedAtMs: nowMs },
        merge: true,
      });
    }
  }
  if (previousHospitalId !== targetHospitalId) {
    writes.push({
      collection: 'units',
      id: cleanUnitId,
      data: { hospitalId: targetHospitalId, updatedAt: new Date(nowMs).toISOString() },
      merge: true,
    });
  }

  if (writes.length) await io.commit(workspaceId, writes);

  const [savedUnit, savedOldHospital, savedTargetHospital] = await Promise.all([
    io.getUnit(workspaceId, cleanUnitId),
    previousHospital && previousHospitalId !== targetHospitalId
      ? io.getHospital(workspaceId, previousHospital.id)
      : Promise.resolve(previousHospital),
    targetHospitalId ? io.getHospital(workspaceId, targetHospitalId) : Promise.resolve(null),
  ]);
  if (!savedUnit || String(savedUnit.hospitalId || '').trim() !== String(targetHospitalId || '')) {
    throw new Error('The unit’s hospital assignment was not confirmed in Firestore. Retry the assignment.');
  }
  if (targetHospitalId && !savedTargetHospital?.unitIds?.includes(cleanUnitId)) {
    throw new Error('The hospital was saved, but its unit list was not confirmed. Retry the assignment.');
  }
  if (savedOldHospital?.unitIds?.includes(cleanUnitId) && previousHospitalId !== targetHospitalId) {
    throw new Error('The old hospital still lists this unit. Retry the assignment to reconcile it.');
  }
  return savedUnit;
}
