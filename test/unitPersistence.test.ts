import test from 'node:test';
import assert from 'node:assert/strict';
import { desiredBeds } from '../src/services/unitBeds.ts';
import { UnitCloudVerificationError, verifyUnitSetupInCloud } from '../src/services/unitPersistence.ts';
import type { Bed, Unit } from '../src/types/clinical.ts';

const makeIO = (unit: Unit | null, beds: Bed[]) => ({
  async getUnit() { return unit; },
  async listBeds() { return beds; },
});

test('unit setup verification requires the unit, deterministic beds, and a confirmed capacity lock', async () => {
  const unit: Unit = { id: 'unit-1', name: 'CCU', type: 'ICU', totalBeds: 2, capacityLocked: true };
  const beds = desiredBeds(unit.id, 2);
  const result = await verifyUnitSetupInCloud(makeIO(unit, beds), unit.id, 2, true);
  assert.equal(result.unit.id, unit.id);
  assert.deepEqual(result.beds.map((bed) => bed.id), ['bed-unit-1-1', 'bed-unit-1-2']);
});

test('partial server read-back reports only the deterministic beds confirmed present', async () => {
  const unit: Unit = { id: 'unit-2', name: 'Ward', type: 'Ward', totalBeds: 3 };
  const beds = desiredBeds(unit.id, 3).filter((bed) => bed.id !== 'bed-unit-2-2');
  await assert.rejects(
    () => verifyUnitSetupInCloud(makeIO(unit, beds), unit.id, 3),
    (error: unknown) => {
      assert.ok(error instanceof UnitCloudVerificationError);
      assert.equal(error.confirmedPresent, 2);
      assert.match(error.message, /bed-unit-2-2/);
      return true;
    },
  );
});

test('a missing unit or unlocked capacity cannot be reported as complete', async () => {
  await assert.rejects(
    () => verifyUnitSetupInCloud(makeIO(null, []), 'unit-3', 0),
    /unit document could not be verified/,
  );

  const unit: Unit = { id: 'unit-4', name: 'CCU', type: 'ICU', totalBeds: 1, capacityLocked: false };
  await assert.rejects(
    () => verifyUnitSetupInCloud(makeIO(unit, desiredBeds(unit.id, 1)), unit.id, 1, true),
    (error: unknown) => {
      assert.ok(error instanceof UnitCloudVerificationError);
      assert.equal(error.confirmedPresent, 1);
      assert.match(error.message, /capacity lock is not confirmed/);
      return true;
    },
  );
});
