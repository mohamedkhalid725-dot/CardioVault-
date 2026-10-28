import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UnitBedsIncompleteError,
  clearUnitBedsPending,
  desiredBeds,
  ensureUnitBeds,
  isUnitBedsPending,
  markUnitBedsPending,
  missingBedIndexes,
  normalizeBedCount,
  pendingUnitBedCounts,
} from '../src/services/unitBeds.ts';

/**
 * A unit and its beds are two different writes. The defect this file guards
 * against: a unit that declared 20 beds reached the cloud with zero bed
 * documents, nothing retried the upload, and the local copy (memory only) lost
 * the beds to the first cloud snapshot.
 *
 * The fake IO below behaves like the Firestore collections: it can refuse a
 * single write, or accept it and silently drop it, which is exactly what a
 * failed rules check and a lost snapshot look like to the app.
 */

const makeStore = () => new Map<string, any>();

const makeIO = (
  store: Map<string, any>,
  hooks: { failFor?: string[]; dropFor?: string[] } = {},
) => ({
  calls: { list: 0, create: 0 },
  async listBeds(unitId: string) {
    this.calls.list += 1;
    return Array.from(store.entries())
      .filter(([, value]) => value.unitId === unitId)
      .map(([id, data]) => ({ id, data }));
  },
  async createBed(_unitId: string, bed: any) {
    this.calls.create += 1;
    if (store.has(bed.id)) throw new Error(`refusing to overwrite ${bed.id}`);
    if (hooks.failFor?.includes(bed.id)) throw new Error('permission-denied');
    if (hooks.dropFor?.includes(bed.id)) return; // the cloud never receives it
    store.set(bed.id, { ...bed, updatedAt: '2026-01-01T00:00:00.000Z' });
  },
});

test('bed ids are deterministic, so repeating the work can never duplicate a bed', () => {
  const beds = desiredBeds('unit-1', 3);
  assert.deepEqual(
    beds.map((bed) => bed.id),
    ['bed-unit-1-1', 'bed-unit-1-2', 'bed-unit-1-3'],
  );
  assert.deepEqual(beds.map((bed) => bed.bedNumber), ['Bed 1', 'Bed 2', 'Bed 3']);
  assert.deepEqual(
    desiredBeds('unit-1', 3).map((bed) => bed.id),
    beds.map((bed) => bed.id),
  );
  assert.equal(normalizeBedCount(0), 0);
  assert.equal(normalizeBedCount(-4), 0);
  assert.equal(normalizeBedCount('12'), 12);
  assert.equal(normalizeBedCount(1_000_000), 200);
});

test('missing bed numbers are computed from the ids the cloud already holds', () => {
  assert.deepEqual(missingBedIndexes('u1', 3, ['bed-u1-1', 'bed-u1-3']), [2]);
  assert.deepEqual(missingBedIndexes('u1', 3, ['bed-u1-1', 'bed-u1-2', 'bed-u1-3']), []);
  assert.deepEqual(missingBedIndexes('u1', 2, []), [1, 2]);
  // A bed of another unit never counts for this one.
  assert.deepEqual(missingBedIndexes('u1', 1, ['bed-u2-1']), [1]);
});

test('only the beds missing in the cloud are created, and an occupied bed is left alone', async () => {
  const store = makeStore();
  const occupied = { id: 'bed-u1-2', unitId: 'u1', bedNumber: 'Bed 2', status: 'Occupied', patientId: 'patient-7' };
  store.set(occupied.id, occupied);
  const io = makeIO(store);

  const result = await ensureUnitBeds({ unitId: 'u1', expected: 3, io, attempts: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.expected, 3);
  assert.equal(result.present, 3);
  assert.equal(result.created, 2);
  assert.deepEqual(Array.from(store.keys()).sort(), ['bed-u1-1', 'bed-u1-2', 'bed-u1-3']);
  assert.deepEqual(store.get('bed-u1-2'), occupied);
});

test('running the setup twice creates nothing the second time', async () => {
  const store = makeStore();
  const io = makeIO(store);

  const first = await ensureUnitBeds({ unitId: 'u2', expected: 4, io, attempts: 1 });
  const writesAfterFirst = io.calls.create;
  const second = await ensureUnitBeds({ unitId: 'u2', expected: 4, io, attempts: 1 });

  assert.equal(first.created, 4);
  assert.equal(second.created, 0);
  assert.equal(second.present, 4);
  assert.equal(io.calls.create, writesAfterFirst);
  assert.equal(store.size, 4);
});

test('a partial failure reports the bed numbers that are still missing', async () => {
  const store = makeStore();
  const io = makeIO(store, { failFor: ['bed-u3-3'] });

  await assert.rejects(
    () => ensureUnitBeds({ unitId: 'u3', expected: 4, io, attempts: 1 }),
    (error: any) => {
      assert.ok(error instanceof UnitBedsIncompleteError, 'expected UnitBedsIncompleteError');
      assert.equal(error.expected, 4);
      assert.equal(error.present, 3);
      assert.deepEqual(error.missing, [3]);
      assert.match(error.message, /Bed 3/);
      return true;
    },
  );
  assert.equal(store.size, 3);
});

test('a retry after a partial failure finishes the same unit', async () => {
  const store = makeStore();
  await assert.rejects(() =>
    ensureUnitBeds({ unitId: 'u4', expected: 3, io: makeIO(store, { failFor: ['bed-u4-2'] }), attempts: 1 }),
  );

  const retry = await ensureUnitBeds({ unitId: 'u4', expected: 3, io: makeIO(store), attempts: 1 });

  assert.equal(retry.ok, true);
  assert.equal(retry.present, 3);
  assert.equal(retry.created, 1);
  assert.equal(store.size, 3);
});

test('a write that is accepted but silently dropped is caught by the verification', async () => {
  const store = makeStore();
  const io = makeIO(store, { dropFor: ['bed-u5-2'] });

  await assert.rejects(
    () => ensureUnitBeds({ unitId: 'u5', expected: 3, io, attempts: 1 }),
    (error: any) => {
      assert.ok(error instanceof UnitBedsIncompleteError);
      assert.equal(error.present, 2);
      assert.deepEqual(error.missing, [2]);
      return true;
    },
  );
});

test('a failing write is retried before the setup is reported as incomplete', async () => {
  let writes = 0;
  const io = {
    async listBeds() {
      return [];
    },
    async createBed() {
      writes += 1;
      throw new Error('network');
    },
  };

  await assert.rejects(() => ensureUnitBeds({ unitId: 'u6', expected: 1, io, attempts: 3, concurrency: 1 }));
  assert.equal(writes, 3);
});

test('a unit with no requested beds needs no cloud call', async () => {
  const io = makeIO(makeStore());
  const result = await ensureUnitBeds({ unitId: 'u7', expected: 0, io, attempts: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.present, 0);
  assert.equal(io.calls.list, 0);
  assert.equal(io.calls.create, 0);
});

test('the pending registry keeps a unit marked until its setup is verified', () => {
  const memory = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
  };
  try {
    markUnitBedsPending('unit-pending', 12);
    assert.equal(isUnitBedsPending('unit-pending'), true);
    assert.deepEqual(pendingUnitBedCounts(), { 'unit-pending': 12 });

    clearUnitBedsPending('unit-pending');
    assert.equal(isUnitBedsPending('unit-pending'), false);
    assert.deepEqual(pendingUnitBedCounts(), {});
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test('the pending registry never breaks a clinical write when storage is unavailable', () => {
  assert.deepEqual(pendingUnitBedCounts(), {});
  markUnitBedsPending('unit-x', 5);
  assert.deepEqual(pendingUnitBedCounts(), {});
});
