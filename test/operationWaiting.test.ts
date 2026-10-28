import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATION_WAITING_STORAGE_KEY,
  DuplicateOperationEntryError,
  addAttachment,
  activeEntries,
  bookEntryPure,
  bookIntoUnit,
  bookedHistory,
  clearOperationEntries,
  createOperationEntry,
  entriesForUnit,
  loadOperationEntries,
  removeAttachment,
  saveOperationEntries,
  setMissingTests,
  setState,
  stateCounts,
  type OperationWaitingStorage,
} from '../src/services/operationWaiting.ts';
import type { OperationWaitState, OperationWaitingEntry } from '../src/types/clinicArea.ts';

class FakeStorage implements OperationWaitingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.has(key) ? String(this.values.get(key)) : null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class BlockedStorage implements OperationWaitingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.has(key) ? String(this.values.get(key)) : null;
  }
  setItem(): void {
    throw new Error('quota-exceeded (simulated)');
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class ThrowingReadStorage implements OperationWaitingStorage {
  getItem(): string | null {
    throw new Error('storage read blocked (simulated)');
  }
  setItem(): void {
    throw new Error('storage write blocked (simulated)');
  }
  removeItem(): void {
    throw new Error('storage remove blocked (simulated)');
  }
}

const NOW = 1_700_000_000_000;

const baseInput = {
  unitId: 'unit-ccu',
  patientFileId: 'mpf-1',
  patientName: 'محمد علي',
  ageYears: 58,
  operationName: 'CABG',
  createdBy: 'preview-doctor-uid',
};

/** Marks an entry booked through the pure core (helper for several tests). */
const markBooked = (entry: OperationWaitingEntry) =>
  bookEntryPure([entry], entry.id, 'unit-ward', NOW + T, 'actor-1');

const T = 60_000; // 1 minute apart timestamps

const freshStorage = (): FakeStorage => {
  const storage = new FakeStorage();
  clearOperationEntries(storage);
  return storage;
};

/* ─── Groups ──────────────────────────────────────────────────────────────── */

test('createOperationEntry fills defaults and survives a storage round trip', () => {
  const storage = freshStorage();
  const entry = createOperationEntry(baseInput, [], NOW);
  assert.equal(entry.status, 'active');
  assert.equal(entry.state, 'waiting');
  assert.equal(entry.testsComplete, true);
  assert.deepEqual(entry.missingTests, []);
  assert.deepEqual(entry.riskFactors, []);
  assert.equal(entry.attachments.length, 0);
  assert.equal(entry.createdAtMs, NOW);
  assert.equal(entry.updatedAtMs, NOW);
  assert.match(entry.id, /^opw-\d+-0$/);

  assert.equal(saveOperationEntries([entry], storage), true);
  const loaded = loadOperationEntries(storage);
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0], entry);
});

test('validation failures: name, age, operation, file link, actor', () => {
  const wrong = (overrides: Partial<typeof baseInput>): string => {
    try {
      createOperationEntry({ ...baseInput, ...overrides }, [], NOW);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return '';
  };
  assert.equal(wrong({ patientName: '' }), 'patient-name-required');
  assert.equal(wrong({ patientName: 'م' }), 'patient-name-short');
  assert.equal(wrong({ ageYears: 131 }), 'age-invalid');
  assert.equal(wrong({ ageYears: -1 }), 'age-invalid');
  assert.equal(wrong({ ageYears: 2.5 }), 'age-invalid');
  assert.equal(wrong({ operationName: '  ' }), 'operationName-required');
  assert.equal(wrong({ patientFileId: ' ' }), 'patientFileId-required');
  assert.equal(wrong({ createdBy: '' }), 'createdBy-required');
  assert.equal(wrong({ unitId: '' }), 'unitId-required');
});

test('duplicate protection: active entry with the same normalized operation name is blocked, booked is fine', () => {
  const first = createOperationEntry(baseInput, [], NOW);
  assert.throws(
    () => createOperationEntry({ ...baseInput, operationName: '  cabg  ' }, [first], NOW + T),
    DuplicateOperationEntryError
  );
  // Different operation name on the same patient is allowed.
  const second = createOperationEntry({ ...baseInput, operationName: 'Valve replacement' }, [first], NOW + T);
  assert.notEqual(second.id, first.id);
  // After the first entry is booked, the same name is allowed again.
  const { entries: bookedList } = markBooked(first);
  const third = createOperationEntry(baseInput, bookedList, NOW + 2 * T);
  assert.equal(third.status, 'active');
});

test('booking is idempotent: a second call changes nothing and reports alreadyBooked', () => {
  const storage = freshStorage();
  const entry = createOperationEntry(baseInput, [], NOW);
  saveOperationEntries([entry], storage);

  const first = bookIntoUnit(entry.id, 'unit-ward', undefined, NOW + T, 'actor-1', storage);
  assert.equal(first.alreadyBooked, false);
  assert.equal(first.entry.status, 'booked');
  assert.deepEqual(first.entry.booking, { unitId: 'unit-ward', atMs: NOW + T, bookedBy: 'actor-1' });
  assert.equal(first.saved, true);
  // All fields preserved.
  assert.equal(first.entry.patientName, entry.patientName);
  assert.equal(first.entry.operationName, entry.operationName);
  assert.equal(first.entry.unitId, entry.unitId);

  const storedAfterFirst = storage.getItem(OPERATION_WAITING_STORAGE_KEY);

  const second = bookIntoUnit(entry.id, 'unit-other', undefined, NOW + 2 * T, 'actor-2', storage);
  assert.equal(second.alreadyBooked, true);
  assert.equal(second.saved, true);
  // No extra storage movement: the key content is byte-identical after the retry.
  assert.equal(storage.getItem(OPERATION_WAITING_STORAGE_KEY), storedAfterFirst);
  assert.deepEqual(second.entry.booking, { unitId: 'unit-ward', atMs: NOW + T, bookedBy: 'actor-1' });

  // Same guarantee at the pure level (no storage at all).
  const pure = bookEntryPure([entry], entry.id, 'unit-ward', NOW + T, 'actor-1');
  assert.equal(pure.alreadyBooked, false);
  const pure2 = bookEntryPure(pure.entries, entry.id, 'unit-elsewhere', NOW + 2 * T, 'actor-2');
  assert.equal(pure2.alreadyBooked, true);
  assert.deepEqual(pure2.entry, pure.entry);
});

test('booked history: the entry stays in storage with status booked and booking record', () => {
  const storage = freshStorage();
  const entry = createOperationEntry(
    { ...baseInput, state: 'urgent', riskFactors: ['diabetes'], complaint: 'ألم صدري' },
    [],
    NOW
  );
  const booked = bookIntoUnit(entry.id, 'unit-ward', [entry], NOW + T, 'actor-1', storage);
  const loaded = loadOperationEntries(storage);
  assert.equal(loaded.length, 1, 'never hard-deleted');
  assert.equal(loaded[0].status, 'booked');
  assert.deepEqual(loaded[0].booking, { unitId: 'unit-ward', atMs: NOW + T, bookedBy: 'actor-1' });
  assert.equal(loaded[0].state, 'urgent', 'clinical state preserved');

  const history = bookedHistory(loaded);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, entry.id);
  // Newest booking first (the later entry is booked at a later time).
  const later = createOperationEntry({ ...baseInput, patientFileId: 'mpf-2' }, [], NOW + 2 * T);
  const laterBooked = bookEntryPure([later], later.id, 'unit-ward', NOW + 3 * T, 'actor-1');
  const withBoth = bookedHistory([booked.entry, laterBooked.entry]);
  assert.equal(withBoth[0].id, later.id);
  assert.equal(bookedHistory(activeEntries(loaded)).length, 0);
});

test('every state may transition to every other state, and booked entries are frozen', () => {
  const states: OperationWaitState[] = ['urgent', 'waiting', 'pending', 'preparing'];
  for (const from of states) {
    for (const to of states) {
      const entry = createOperationEntry({ ...baseInput, state: from }, [], NOW);
      const { entries: next, entry: updated } = setState([entry], entry.id, to, NOW + T);
      assert.equal(updated.state, to);
      assert.equal(next.length, 1);
    }
  }
  const entry = createOperationEntry(baseInput, [], NOW);
  const booked = bookEntryPure([entry], entry.id, 'unit-ward', NOW + T, 'actor-1');
  assert.throws(
    () => setState(booked.entries, entry.id, 'preparing', NOW + 2 * T),
    (error: unknown) => error instanceof Error && error.message === 'entry-not-active'
  );
  assert.throws(
    () => setState([entry], 'missing-id', 'waiting', NOW + 2 * T),
    (error: unknown) => error instanceof Error && error.message === 'entry-not-found'
  );
});

test('missingTests and testsComplete are stored independently', () => {
  const storage = freshStorage();
  // Explicit independence: a list WHILE testsComplete is true.
  const entry = createOperationEntry(
    { ...baseInput, missingTests: ['قيمة البروثرومبين', ' ', 'CBC'], testsComplete: true },
    [],
    NOW
  );
  assert.deepEqual(entry.missingTests, ['قيمة البروثرومبين', 'CBC']);
  assert.equal(entry.testsComplete, true);

  const set = setMissingTests([entry], entry.id, ['Electrolytes'], true, NOW + T).entry;
  assert.deepEqual(set.missingTests, ['Electrolytes']);
  assert.equal(set.testsComplete, true);
  const cleared = setMissingTests([set], entry.id, [], false, NOW + 2 * T).entry;
  assert.deepEqual(cleared.missingTests, []);
  assert.equal(cleared.testsComplete, false);

  assert.equal(saveOperationEntries([cleared], storage), true);
  assert.deepEqual(loadOperationEntries(storage)[0].missingTests, []);
});

test('corrupt JSON and junk rows degrade safely to []', () => {
  const storage = freshStorage();
  storage.setItem(OPERATION_WAITING_STORAGE_KEY, '{not json at all');
  assert.deepEqual(loadOperationEntries(storage), []);

  storage.setItem(
    OPERATION_WAITING_STORAGE_KEY,
    JSON.stringify(['nope', 7, null, { id: 'x' }, baseInput])
  );
  assert.deepEqual(loadOperationEntries(storage), []);

  // A valid entry inside junk survives normalization and junk is dropped.
  const entry = createOperationEntry(baseInput, [], NOW);
  storage.setItem(OPERATION_WAITING_STORAGE_KEY, JSON.stringify([entry, { garbage: true }, 'text']));
  const loaded = loadOperationEntries(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, entry.id);
});

test('blocked storage: save reports failure, session data still readable through the fallback', () => {
  const blocked = new BlockedStorage();
  clearOperationEntries(blocked);
  const entry = createOperationEntry(baseInput, [], NOW);
  assert.equal(saveOperationEntries([entry], blocked), false, 'device store refused the write');

  const readBlocked = new ThrowingReadStorage();
  const viaFallback = loadOperationEntries(readBlocked);
  assert.ok(
    viaFallback.some((candidate) => candidate.id === entry.id),
    'memory fallback keeps the session list when the device store is blocked'
  );

  const noStore = loadOperationEntries(null);
  assert.ok(Array.isArray(noStore), 'missing store never throws');
});

test('activeEntries and entriesForUnit filter correctly', () => {
  const storage = freshStorage();
  const a = createOperationEntry(baseInput, [], NOW);
  const b = createOperationEntry({ ...baseInput, patientFileId: 'mpf-2', unitId: 'unit-ward' }, [], NOW + T);
  const booked = bookEntryPure([a, b], a.id, 'unit-ward', NOW + 2 * T, 'actor-1');
  saveOperationEntries(booked.entries, storage);
  const loaded = loadOperationEntries(storage);
  assert.deepEqual(
    activeEntries(loaded).map((entry) => entry.id),
    [b.id],
    'booked entries are excluded from the active list'
  );
  assert.equal(entriesForUnit(loaded, 'unit-ccu').length, 1);
  assert.equal(entriesForUnit(loaded, 'unit-ward').length, 1);
  assert.equal(entriesForUnit(loaded, 'unit-nothing').length, 0);
  assert.equal(entriesForUnit([], 'unit-ccu').length, 0);
});

test('stateCounts counts every state buckets', () => {
  const a = createOperationEntry({ ...baseInput, state: 'urgent' }, [], NOW);
  const b = createOperationEntry({ ...baseInput, patientFileId: 'mpf-2', state: 'pending' }, [], NOW + T);
  const c = createOperationEntry(
    { ...baseInput, patientFileId: 'mpf-3', state: 'waiting' },
    [],
    NOW + 2 * T
  );
  const counts = stateCounts([a, b, c]);
  assert.deepEqual(counts, { urgent: 1, waiting: 1, pending: 1, preparing: 0 });
  assert.deepEqual(stateCounts([]), { urgent: 0, waiting: 0, pending: 0, preparing: 0 });
});

test('attachments: service validates metadata, replaces the array lazily, unknown removal is a no-op', () => {
  const entry = createOperationEntry(baseInput, [], NOW);
  const attachment = { id: 'att-1', name: 'echo.pdf', mimeType: 'application/pdf', sizeBytes: 900, metadataOnly: true };
  const { entries: withAtt, entry: updated } = addAttachment([entry], entry.id, attachment, NOW + T);
  assert.equal(updated.attachments.length, 1);
  assert.equal(updated.updatedAtMs, NOW + T);
  assert.equal(withAtt.length, 1);

  assert.throws(
    () => addAttachment([entry], entry.id, { id: '', name: 'x', mimeType: 'a/b', sizeBytes: 1 }, NOW + T),
    (error: unknown) => error instanceof Error && error.message === 'attachment-invalid'
  );
  assert.throws(
    () => addAttachment([entry], entry.id, { id: 'a', name: '', mimeType: 'a/b', sizeBytes: 1 }, NOW + T),
    (error: unknown) => error instanceof Error && error.message === 'attachment-invalid'
  );
  assert.throws(
    () => addAttachment([entry], entry.id, { id: 'a', name: 'x', mimeType: 'a/b', sizeBytes: -5 }, NOW + T),
    (error: unknown) => error instanceof Error && error.message === 'attachment-invalid'
  );
  assert.throws(
    () => addAttachment([entry], 'missing-id', attachment, NOW + T),
    (error: unknown) => error instanceof Error && error.message === 'entry-not-found'
  );

  const { entry: afterRemove } = removeAttachment(withAtt, entry.id, 'att-1', NOW + 2 * T);
  assert.equal(afterRemove.attachments.length, 0);
  // Idempotent lenient removal of an unknown id: no throw.
  const { entry: unchanged } = removeAttachment(withAtt, entry.id, 'att-does-not-exist', NOW + 2 * T);
  assert.equal(unchanged.attachments.length, 1);
});
