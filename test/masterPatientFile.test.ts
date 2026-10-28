import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_FILES_KEY,
  appendTimelineEvent,
  createMasterFile,
  linkOrCreateForIntake,
  loadMasterFiles,
  persistTimelineEvent,
  saveMasterFiles,
  searchMasterFiles,
} from '../src/services/masterPatientFile.ts';

/**
 * Master patient file (الملف الأم) — service tests for the approval-critical
 * rules: append-only history, scope-confined search, masked national ids,
 * name-only ambiguity that never merges, and corrupt-storage resilience.
 *
 * ALL tests use an injected memory Storage object; plain localStorage is never
 * assumed (the service must work on the Node test runner and behind blocked
 * storage in the browser).
 */

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly store: Map<string, string>;
}

const memoryStorage = (seed: Record<string, string> = {}): MemoryStorage => {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

const baseInput = (over: Partial<Parameters<typeof createMasterFile>[0]> = {}) => ({
  name: 'Mohamed Ali',
  ageYears: 54,
  nationalId: '28450191234',
  contextIds: ['unit-a'],
  createdBy: 'doctor-1',
  ...over,
});

test('create + load round-trip through an injected memory storage', () => {
  const storage = memoryStorage();
  const { file, saved } = createMasterFile(
    baseInput({
      riskFactors: ['diabetes', 'hypertension'],
      history: 'Old MI 2021',
      pastOperations: ['CABG 2022', 'Stent 2023'],
      pastImaging: ['Echo 2024'],
      phone: '01000000000',
    }),
    1_700_000_000_000,
    storage,
  );
  assert.equal(saved, true);
  assert.ok(file.id.startsWith('mpf-'));
  assert.equal(file.ageYears, 54);
  assert.deepEqual(file.riskFactors, ['diabetes', 'hypertension']);
  assert.equal(file.history, 'Old MI 2021');
  assert.deepEqual(file.timeline, []);

  // Round-trip: a fresh load over the same injected storage returns it.
  const loaded = loadMasterFiles(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, file.id);
  assert.equal(loaded[0].nationalId, '28450191234', 'the full id is stored ONLY inside the file record');
  assert.deepEqual(loaded[0].pastOperations, ['CABG 2022', 'Stent 2023']);
});

test('appendTimelineEvent keeps old events, adds a dated one, and never mutates the input array', () => {
  const storage = memoryStorage();
  const { file: first } = createMasterFile(baseInput(), 1000, storage);
  const before = loadMasterFiles(storage);
  const beforeSnapshot = JSON.parse(JSON.stringify(before));

  const { files: next, event } = appendTimelineEvent(
    before,
    first.id,
    {
      kind: 'clinic-visit',
      title: 'Follow-up visit',
      summary: 'Stable',
      detail: 'Chest pain free for 3 weeks.',
      createdBy: 'doctor-1',
      context: { unitId: 'unit-a' },
      atMs: 5000,
    },
  );

  assert.ok(event);
  assert.equal(event?.kind, 'clinic-visit');
  assert.equal(event?.atMs, 5000);
  assert.equal(event?.schemaVersion, 1);

  // The original array and the original file object are untouched (pure core).
  assert.deepEqual(before, JSON.parse(JSON.stringify(beforeSnapshot)));
  assert.equal(before[0].timeline.length, 0);

  // Old content preserved, new event appended: one extra event, order kept.
  assert.equal(next.length, before.length);
  const nextFile = next.find((candidate) => candidate.id === first.id);
  assert.equal(nextFile?.timeline.length, 1);
  assert.deepEqual(nextFile?.timeline[0].title, 'Follow-up visit');

  // A second append keeps the first event and adds another in dated order.
  const { files: then } = appendTimelineEvent(next, first.id, {
    kind: 'encounter',
    title: 'Ward encounter',
    summary: 'Stable',
    detail: 'Reviewed labs.',
    createdBy: 'doctor-1',
    context: { unitId: 'unit-a' },
    atMs: 9000,
  });
  const finalFile = then.find((candidate) => candidate.id === first.id);
  assert.equal(finalFile?.timeline.length, 2);
  assert.deepEqual(
    finalFile?.timeline.map((item) => item.title),
    ['Follow-up visit', 'Ward encounter'],
    'events are appended in order, nothing is removed',
  );
});

test('persistTimelineEvent saves the dated event to storage and refreshes on reload', () => {
  const storage = memoryStorage();
  const { file: created } = createMasterFile(baseInput(), 1000, storage);

  const first = persistTimelineEvent(
    created.id,
    {
      kind: 'test-attachment',
      title: 'Echo attached',
      summary: 'EF 45%',
      detail: 'Mild LV dysfunction.',
      createdBy: 'doctor-1',
      context: { unitId: 'unit-a' },
      atMs: 3000,
    },
    storage,
  );
  assert.equal(first.saved, true);
  assert.ok(first.event?.id);

  const second = persistTimelineEvent(
    created.id,
    {
      kind: 'operation-record',
      title: 'CABG recorded',
      summary: 'Done',
      detail: 'On-pump, 4 grafts.',
      createdBy: 'doctor-1',
      context: { unitId: 'unit-a' },
      atMs: 7000,
    },
    storage,
  );
  assert.equal(second.saved, true);

  const reloaded = loadMasterFiles(storage);
  const file = reloaded.find((candidate) => candidate.id === created.id);
  assert.equal(file?.timeline.length, 2, 'both persisted events survive a reload');
  assert.deepEqual(
    file?.timeline.map((item) => item.kind),
    ['test-attachment', 'operation-record'],
  );

  // Unknown file id: nothing saved, event null (never throws).
  const missing = persistTimelineEvent('mpf-nope', {
    kind: 'encounter',
    title: 'x',
    summary: '',
    detail: '',
    createdBy: 'doctor-1',
    context: { unitId: 'unit-a' },
  }, storage);
  assert.equal(missing.saved, false);
  assert.equal(missing.event, null);
});

test('search by name is confined to authorized contexts — out-of-scope files never leak', () => {
  const storage = memoryStorage();
  createMasterFile(baseInput({ name: 'Hassan Osman', contextIds: ['unit-a'] }), 1000, storage);
  createMasterFile(baseInput({ name: 'Hassan Mahmoud', contextIds: ['unit-b'] }), 2000, storage);

  const result = searchMasterFiles({
    query: 'Hassan',
    authorizedContextIds: ['unit-a'],
    files: loadMasterFiles(storage),
  });

  assert.equal(result.hits.length, 1, 'the unit-b file is invisible inside a unit-a search');
  assert.equal(result.hits[0].file.name, 'hassan osman', 'names are stored normalized (lowercased) by the service');
  assert.deepEqual(result.searchedScopeIds, ['unit-a']);
  assert.equal(result.ambiguous, false);

  // Widening the scope to include unit-b surfaces the second file again.
  const widened = searchMasterFiles({
    query: 'Hassan',
    authorizedContextIds: ['unit-a', 'unit-b'],
    files: loadMasterFiles(storage),
  });
  assert.equal(widened.hits.length, 2);
});

test('all-digit query matches the full national id and the last-4 suffix, and only masked ids leave the service', () => {
  const storage = memoryStorage();
  createMasterFile(baseInput({ nationalId: '28450191234' }), 1000, storage);
  createMasterFile(baseInput({ name: 'Sara Kamal', nationalId: '29901015678' }), 1100, storage);

  const byFull = searchMasterFiles({
    query: '28450191234',
    authorizedContextIds: ['unit-a'],
    files: loadMasterFiles(storage),
  });
  assert.equal(byFull.hits.length, 1);
  assert.equal(byFull.hits[0].file.name, 'mohamed ali');
  assert.equal(byFull.hits[0].maskedNationalId, '****1234');
  assert.ok(byFull.hits[0].maskedNationalId.endsWith('1234'));
  assert.doesNotMatch(byFull.hits[0].maskedNationalId, /2845/);

  const bySuffix = searchMasterFiles({
    query: '1234',
    authorizedContextIds: ['unit-a'],
    files: loadMasterFiles(storage),
  });
  assert.equal(bySuffix.hits.length, 1, 'a 4-digit suffix query matches only the file whose id ends with it');
  assert.equal(bySuffix.hits[0].maskedNationalId, '****1234');

  // A file with NO national id is never matched by a digits query.
  createMasterFile(baseInput({ name: 'Nora Sami', nationalId: undefined }), 1200, storage);
  const noId = searchMasterFiles({
    query: '1234',
    authorizedContextIds: ['unit-a'],
    files: loadMasterFiles(storage),
  });
  assert.equal(noId.hits.length, 1);
});

test('two same-name files inside the scope are flagged ambiguous (disambiguation required)', () => {
  const storage = memoryStorage();
  createMasterFile(baseInput({ name: 'Amr Fathy', ageYears: 40 }), 1000, storage);
  createMasterFile(baseInput({ name: 'Amr Fathy', ageYears: 61, nationalId: undefined }), 2000, storage);

  const result = searchMasterFiles({
    query: 'Amr Fathy',
    authorizedContextIds: ['unit-a'],
    files: loadMasterFiles(storage),
  });
  assert.equal(result.hits.length, 2);
  assert.equal(result.ambiguous, true);
  // Each hit must expose a DIFFERENT age so the caller can disambiguate by age + last-4.
  assert.deepEqual(
    result.hits.map((hit) => hit.file.ageYears).sort((a, b) => a - b),
    [40, 61],
  );
});

test('linkOrCreateForIntake picks the exact name+age match WITHOUT creating a duplicate', () => {
  const storage = memoryStorage();
  const { file: existing } = createMasterFile(baseInput({ name: 'Tarek Nabil', ageYears: 63 }), 1000, storage);

  const linked = linkOrCreateForIntake(
    {
      identity: { name: 'tarek  nabil', ageYears: 63 },
      authorizedContextIds: ['unit-a'],
      defaultContextId: 'unit-a',
      createdBy: 'doctor-1',
      nowMs: 9000,
    },
    storage,
  );
  assert.ok('file' in linked);
  assert.equal(linked.created, false);
  assert.equal(linked.file.id, existing.id);

  // Nothing new was written: still exactly one file in storage.
  assert.equal(loadMasterFiles(storage).length, 1);

  // A different name with no candidates creates a fresh file in the default context.
  const created = linkOrCreateForIntake(
    {
      identity: { name: 'New Patient', ageYears: 44 },
      authorizedContextIds: ['unit-a'],
      defaultContextId: 'unit-a',
      createdBy: 'doctor-1',
      nowMs: 9500,
    },
    storage,
  );
  assert.ok('file' in created);
  assert.equal(created.created, true);
  assert.deepEqual(loadMasterFiles(storage).length, 2);
});

test('two same-name same-scope files reject intake with {error: ambiguous} and are never merged', () => {
  const storage = memoryStorage();
  createMasterFile(baseInput({ name: 'Same Name', ageYears: 50 }), 1000, storage);
  createMasterFile(baseInput({ name: 'Same Name', ageYears: 70, nationalId: undefined }), 2000, storage);
  const countBefore = loadMasterFiles(storage).length;

  const outcome = linkOrCreateForIntake(
    {
      // Name matches two same-scope files and the age matches NEITHER (50/70),
      // so no exact (name+age) link is possible: the call must refuse instead
      // of guessing or merging.
      identity: { name: 'Same Name', ageYears: 55 },
      authorizedContextIds: ['unit-a'],
      defaultContextId: 'unit-a',
      createdBy: 'doctor-1',
      nowMs: 9000,
    },
    storage,
  );
  assert.deepEqual(outcome, { error: 'ambiguous' }, 'matching by name alone never merges and never guesses');
  assert.equal(loadMasterFiles(storage).length, countBefore, 'no third file was created and nothing merged');
});

test('corrupt JSON in storage reads as an empty list instead of throwing', () => {
  const garbage = memoryStorage({ [MASTER_FILES_KEY]: '{this is not json' });
  assert.deepEqual(loadMasterFiles(garbage), []);

  // A non-array JSON value (e.g. an object) is also dropped, never thrown on.
  const foreign = memoryStorage({
    [MASTER_FILES_KEY]: JSON.stringify({ id: 'mpf-x', name: 'Not A List' }),
  });
  assert.deepEqual(loadMasterFiles(foreign), []);

  // And a save over a garbage key repairs it with a valid list.
  const repairable = memoryStorage({ [MASTER_FILES_KEY]: 'garbage' });
  const { file } = createMasterFile(baseInput({ nationalId: undefined }), 42_000, repairable);
  const after = loadMasterFiles(repairable);
  assert.deepEqual(
    after.map((item) => item.id),
    [file.id],
  );
});
