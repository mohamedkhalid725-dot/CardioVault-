import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * `totalBeds` is the capacity the doctor declared when the unit was created,
 * and addBed/removeBed keep it in step with the bed records. The restore must
 * not rewrite it from whatever bed documents happen to be in the cloud at that
 * moment: a restore that landed between the unit write and the bed writes
 * turned a six-bed unit into a zero-bed unit, and the next sync wrote that
 * zero back for good.
 */

// bedReconciliation.ts touches localStorage when it is loaded, so the storage
// is stubbed before the module is imported.
const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => {
    memory.set(key, String(value));
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

const { reconcileClinicalRegistry } = await import('../src/services/bedReconciliation.ts');

const bed = (unitId: string, index: number) => ({
  id: `bed-${unitId}-${index}`,
  unitId,
  bedNumber: `Bed ${index}`,
  status: 'Empty' as const,
});

test('an existing unit keeps the capacity the doctor declared', () => {
  const result = reconcileClinicalRegistry(
    [{ id: 'unitA', name: 'ICU', type: 'Intensive Care', totalBeds: 6 }],
    [bed('unitA', 1), bed('unitA', 2)],
    [],
  );
  assert.equal(result.units[0].totalBeds, 6);
});

test('an existing unit is not zeroed when its beds are missing from the cloud', () => {
  // The exact state a restore used to find: the unit document reached the
  // cloud, its bed documents did not.
  const result = reconcileClinicalRegistry(
    [{ id: 'unitA', name: 'ICU', type: 'Intensive Care', totalBeds: 6 }],
    [],
    [],
  );
  assert.equal(result.units[0].totalBeds, 6);
});

test('a unit recovered from its beds derives the capacity from them', () => {
  const result = reconcileClinicalRegistry([], [bed('unitGhost', 1), bed('unitGhost', 2), bed('unitGhost', 3)], []);
  assert.equal(result.units.length, 1);
  assert.equal(result.units[0].id, 'unitGhost');
  assert.equal(result.units[0].totalBeds, 3);
});

test('recovered units never invent a unit for a shared clinical file', () => {
  const result = reconcileClinicalRegistry(
    [],
    [],
    [{ id: 'p1', unitId: 'unitOther', unitIds: ['unitOther', 'unitMine'] } as any],
  );
  assert.equal(result.units.length, 0);
});

test('the bed records are never discarded by the reconciliation', () => {
  const beds = [bed('unitA', 1), bed('unitA', 2)];
  const result = reconcileClinicalRegistry(
    [{ id: 'unitA', name: 'ICU', type: 'Intensive Care', totalBeds: 6 }],
    beds,
    [],
  );
  assert.equal(result.beds.length, 2);
});
