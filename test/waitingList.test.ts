import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_TRANSITIONS,
  DUPLICATE_SERVICE_WARNING,
  WAITING_STORAGE_KEY,
  activeEntries,
  canTransition,
  convertWaitingToAdmission,
  createWaitingEntry,
  entriesForUnit,
  loadWaitingEntries,
  saveWaitingEntries,
  statusCounts,
  transitionWaitingEntry,
  unitSupportsWaitingList,
  type WaitingListStorage,
} from '../src/services/waitingList.ts';
import type { WaitingEntry, WaitingStatus } from '../src/types/departmentTeam.ts';

class FakeStorage implements WaitingListStorage {
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

const NOW = 1_700_000_000_000;

const baseInput = {
  workspaceId: 'ws-test',
  unitId: 'unit-ccu',
  patientId: 'pat-1',
  patientName: 'Test Patient',
  service: 'CCU bed',
  createdBy: 'uid-doctor',
  createdByName: 'Dr Test',
  notes: '',
  referredBy: '',
};

const makeEntry = (overrides: Partial<typeof baseInput> = {}, existing: WaitingEntry[] = [], nowMs = NOW): WaitingEntry =>
  createWaitingEntry({ ...baseInput, ...overrides }, existing, nowMs).entry;

test('createWaitingEntry validates required fields', () => {
  const cases: Array<[Partial<typeof baseInput>, string]> = [
    [{ workspaceId: '  ' }, 'workspaceId-required'],
    [{ unitId: '' }, 'unitId-required'],
    [{ patientId: '   ' }, 'patientId-required'],
    [{ patientName: '' }, 'patientName-required'],
    [{ service: '  ' }, 'service-required'],
    [{ createdBy: '' }, 'createdBy-required'],
    [{ service: 'x'.repeat(121) }, 'service-too-long'],
    [{ notes: 'x'.repeat(501) }, 'notes-too-long'],
  ];
  cases.forEach(([overrides, message]) => {
    assert.throws(
      () => createWaitingEntry({ ...baseInput, ...overrides }, []),
      (error: unknown) => error instanceof Error && error.message === message,
      `expected ${message}`
    );
  });
});

test('createWaitingEntry starts in waiting with an opening history event', () => {
  const entry = makeEntry({ notes: '  needs telemetry  ', referredBy: 'ER' });
  assert.equal(entry.status, 'waiting');
  assert.equal(entry.service, 'CCU bed');
  assert.equal(entry.notes, 'needs telemetry');
  assert.equal(entry.referredBy, 'ER');
  assert.equal(entry.history.length, 1);
  assert.equal(entry.history[0].from, null);
  assert.equal(entry.history[0].to, 'waiting');
  assert.equal(entry.history[0].actorUid, 'uid-doctor');
  assert.match(entry.id, /^wait-1700000000000-0$/);
  assert.equal(entry.schemaVersion, 1);
});

test('duplicate service warns but still creates an independent entry', () => {
  const first = makeEntry();
  const second = createWaitingEntry({ ...baseInput, service: '  ccu BED ' }, [first], NOW + 1);
  assert.deepEqual(second.warnings, [DUPLICATE_SERVICE_WARNING]);
  assert.notEqual(second.entry.id, first.id);
  assert.equal(second.entry.status, 'waiting');

  // A finished request no longer counts as a duplicate.
  const admitted = transitionWaitingEntry(first, 'admitted', { actorUid: 'uid-doctor', nowMs: NOW + 2 });
  const third = createWaitingEntry(baseInput, [admitted], NOW + 3);
  assert.deepEqual(third.warnings, []);
});

test('every allowed transition succeeds and returns a new entry with history', () => {
  const statuses = Object.keys(ALLOWED_TRANSITIONS) as WaitingStatus[];
  let checked = 0;
  statuses.forEach((from) => {
    ALLOWED_TRANSITIONS[from].forEach((to) => {
      const entry: WaitingEntry = { ...makeEntry(), status: from };
      const reason = to === 'deferred' || to === 'cancelled' ? 'clinically stable' : undefined;
      const next = transitionWaitingEntry(entry, to, {
        actorUid: 'uid-nurse',
        actorName: 'Nurse A',
        reason,
        nowMs: NOW + 10,
      });
      assert.notEqual(next, entry, 'must be a new object');
      assert.equal(entry.status, from, 'original must not be mutated');
      assert.equal(entry.history.length, 1, 'original history must not grow');
      assert.equal(next.status, to);
      assert.equal(next.updatedAtMs, NOW + 10);
      assert.equal(next.history.length, 2);
      const event = next.history[1];
      assert.equal(event.from, from);
      assert.equal(event.to, to);
      assert.equal(event.atMs, NOW + 10);
      assert.equal(event.actorUid, 'uid-nurse');
      if (to === 'deferred') assert.equal(next.deferredReason, 'clinically stable');
      if (to === 'cancelled') assert.equal(next.cancelledReason, 'clinically stable');
      checked += 1;
    });
  });
  assert.equal(checked, 10, 'waiting(4) + ready(4) + deferred(2)');
});

test('invalid transitions throw invalid-transition', () => {
  const pairs: Array<[WaitingStatus, WaitingStatus]> = [
    ['cancelled', 'waiting'],
    ['cancelled', 'admitted'],
    ['admitted', 'ready'],
    ['deferred', 'ready'],
    ['deferred', 'admitted'],
  ];
  pairs.forEach(([from, to]) => {
    assert.equal(canTransition(from, to), false);
    assert.throws(
      () => transitionWaitingEntry({ ...makeEntry(), status: from }, to, { actorUid: 'u', reason: 'r', nowMs: NOW }),
      (error: unknown) => error instanceof Error && error.message === 'invalid-transition'
    );
  });
  assert.equal(canTransition('waiting', 'ready'), true);
  assert.equal(canTransition('ready', 'waiting'), true);
});

test('defer and cancel require a non-blank reason', () => {
  (['deferred', 'cancelled'] as WaitingStatus[]).forEach((to) => {
    [{}, { reason: '   ' }, { reason: undefined }].forEach((options) => {
      assert.throws(
        () => transitionWaitingEntry(makeEntry(), to, { actorUid: 'u', nowMs: NOW, ...options }),
        (error: unknown) => error instanceof Error && error.message === 'reason-required'
      );
    });
  });
  // A reason is optional for ready.
  assert.doesNotThrow(() => transitionWaitingEntry(makeEntry(), 'ready', { actorUid: 'u', nowMs: NOW }));
});

test('convertWaitingToAdmission creates a linked encounter and marks the entry admitted', () => {
  const entry = transitionWaitingEntry(makeEntry(), 'ready', { actorUid: 'u', nowMs: NOW + 1 });
  const { entry: admitted, encounter } = convertWaitingToAdmission(entry, {
    encounterId: 'enc-1',
    bedId: 'bed-ccu-3',
    actorUid: 'uid-doctor',
    actorName: 'Dr Test',
    nowMs: NOW + 5,
  });

  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.admittedEncounterId, 'enc-1');
  assert.equal(admitted.admittedBedId, 'bed-ccu-3');
  assert.equal(admitted.history.length, entry.history.length + 1);
  assert.equal(admitted.history[admitted.history.length - 1].to, 'admitted');
  assert.equal(admitted.history[admitted.history.length - 1].from, 'ready');
  assert.equal(entry.status, 'ready', 'original must not be mutated');

  assert.equal(encounter.id, 'enc-1');
  assert.equal(encounter.kind, 'admission');
  assert.equal(encounter.sourceWaitingEntryId, entry.id);
  assert.equal(encounter.patientId, entry.patientId);
  assert.equal('patientName' in encounter, false, 'no patient demographics are copied');
  assert.equal('fullName' in encounter, false, 'no patient demographics are copied');
  assert.equal(encounter.unitId, entry.unitId);
  assert.equal(encounter.workspaceId, entry.workspaceId);
  assert.equal(encounter.bedId, 'bed-ccu-3');
  assert.equal(encounter.startedAtMs, NOW + 5);
  assert.equal(encounter.createdBy, 'uid-doctor');
  assert.equal(encounter.schemaVersion, 1);
});

test('convertWaitingToAdmission rejects cancelled and deferred entries', () => {
  const cancelled = transitionWaitingEntry(makeEntry(), 'cancelled', { actorUid: 'u', reason: 'left', nowMs: NOW + 1 });
  const deferred = transitionWaitingEntry(makeEntry(), 'deferred', { actorUid: 'u', reason: 'later', nowMs: NOW + 1 });
  [cancelled, deferred].forEach((entry) => {
    assert.throws(
      () => convertWaitingToAdmission(entry, { encounterId: 'enc-x', actorUid: 'u', nowMs: NOW + 2 }),
      (error: unknown) => error instanceof Error && error.message === 'invalid-transition'
    );
  });
  assert.throws(
    () => convertWaitingToAdmission(makeEntry(), { encounterId: '  ', actorUid: 'u', nowMs: NOW + 2 }),
    (error: unknown) => error instanceof Error && error.message === 'encounterId-required'
  );
});

test('entriesForUnit, activeEntries and statusCounts filter correctly', () => {
  const a = makeEntry();
  const b = makeEntry({ patientId: 'pat-2' }, [a], NOW + 1);
  const c = makeEntry({ unitId: 'unit-ward', patientId: 'pat-3' }, [a, b], NOW + 2);
  const ready = transitionWaitingEntry(b, 'ready', { actorUid: 'u', nowMs: NOW + 3 });
  const cancelled = transitionWaitingEntry(c, 'cancelled', { actorUid: 'u', reason: 'no bed', nowMs: NOW + 4 });
  const all = [a, ready, cancelled];

  assert.deepEqual(entriesForUnit(all, 'unit-ccu').map((entry) => entry.id), [a.id, ready.id]);
  assert.deepEqual(entriesForUnit(all, 'missing'), []);

  assert.deepEqual(activeEntries(all).map((entry) => entry.id), [a.id, ready.id]);
  assert.deepEqual(statusCounts(all), { waiting: 1, ready: 1, deferred: 0, cancelled: 1, admitted: 0 });
  assert.deepEqual(statusCounts([]), { waiting: 0, ready: 0, deferred: 0, cancelled: 0, admitted: 0 });
});

test('save and load round-trip through an injected storage', () => {
  const storage = new FakeStorage();
  const entries = [makeEntry(), makeEntry({ patientId: 'pat-2' }, [], NOW + 1)];

  assert.equal(saveWaitingEntries(entries, storage), true);
  assert.ok(storage.values.has(WAITING_STORAGE_KEY));

  const loaded = loadWaitingEntries(storage);
  // JSON drops absent optional keys, so compare against the serialized shape.
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(entries)));
});

test('corrupt or wrong-shaped stored JSON loads as an empty list', () => {
  const storage = new FakeStorage();
  storage.setItem(WAITING_STORAGE_KEY, '{not json');
  assert.deepEqual(loadWaitingEntries(storage), []);

  storage.setItem(WAITING_STORAGE_KEY, '{"entries":[]}');
  assert.deepEqual(loadWaitingEntries(storage), []);

  storage.setItem(WAITING_STORAGE_KEY, 'null');
  assert.deepEqual(loadWaitingEntries(storage), []);

  storage.setItem(WAITING_STORAGE_KEY, JSON.stringify([{ id: 'x' }, null, 42, { id: 'y', unitId: 'u', patientId: 'p', status: 'bogus' }]));
  assert.deepEqual(loadWaitingEntries(storage), []);
  assert.deepEqual(loadWaitingEntries(), []);
});

test('unitSupportsWaitingList is opt-in and reads config before the legacy flag', () => {
  assert.equal(unitSupportsWaitingList(null), false);
  assert.equal(unitSupportsWaitingList({}), false);
  assert.equal(unitSupportsWaitingList({ features: ['beds'] }), false);

  const config = (waitingList: boolean) =>
    ({
      typeId: 'ccu' as const,
      capabilities: { beds: true, waitingList, clinicMode: false },
      settings: {},
      schemaVersion: 1,
    });

  assert.equal(unitSupportsWaitingList({ config: config(true) }), true);
  assert.equal(unitSupportsWaitingList({ config: config(false) }), false);
  assert.equal(unitSupportsWaitingList({ features: ['waiting-list'] }), true);
  assert.equal(unitSupportsWaitingList({ features: [' Waiting-List '] }), true);
  // Explicit configuration wins over the legacy feature flag.
  assert.equal(unitSupportsWaitingList({ features: ['waiting-list'], config: config(false) }), false);
});
