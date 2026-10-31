import type { Bed, Unit } from '../types/clinical';
import { bedIdFor } from './unitBeds.ts';

export interface UnitCloudVerificationIO {
  getUnit(unitId: string): Promise<Unit | null>;
  listBeds(unitId: string): Promise<Bed[]>;
}

export interface VerifiedUnitSetup {
  unit: Unit;
  beds: Bed[];
}

export class UnitCloudVerificationError extends Error {
  readonly confirmedPresent: number;

  constructor(message: string, confirmedPresent = 0) {
    super(message);
    this.name = 'UnitCloudVerificationError';
    this.confirmedPresent = confirmedPresent;
  }
}

/** Verifies declared unit capacity and every deterministic bed ID from cloud reads. */
export async function verifyUnitSetupInCloud(
  io: UnitCloudVerificationIO,
  unitId: string,
  expectedBeds: number,
  capacityLocked?: boolean,
): Promise<VerifiedUnitSetup> {
  const unit = await io.getUnit(unitId);
  if (!unit) throw new UnitCloudVerificationError('The unit document could not be verified in Firestore.');
  if (String(unit.id) !== unitId) throw new UnitCloudVerificationError('The cloud unit ID does not match the requested unit.');
  if (Number(unit.totalBeds) !== expectedBeds) {
    throw new UnitCloudVerificationError(`The unit is in Firestore, but declares ${Number(unit.totalBeds) || 0} beds instead of ${expectedBeds}.`);
  }

  const beds = await io.listBeds(unitId);
  const byId = new Map(beds.map((bed) => [String(bed.id), bed]));
  const missing = Array.from({ length: expectedBeds }, (_, index) => bedIdFor(unitId, index + 1))
    .filter((id) => !byId.has(id));
  if (missing.length || beds.length !== expectedBeds) {
    const present = expectedBeds - missing.length;
    const details = missing.length ? ` Missing: ${missing.join(', ')}.` : '';
    const extras = beds.length > expectedBeds ? ` Firestore returned ${beds.length} bed documents.` : '';
    throw new UnitCloudVerificationError(`${present} of ${expectedBeds} deterministic beds were confirmed in Firestore.${details}${extras}`, present);
  }
  if (capacityLocked !== undefined && unit.capacityLocked !== capacityLocked) {
    throw new UnitCloudVerificationError(`The unit is in Firestore, but its capacity lock is not confirmed as ${capacityLocked ? 'closed' : 'open'}.`, expectedBeds);
  }
  return { unit, beds };
}
