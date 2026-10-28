import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  clearEncounters,
  encounterHistory,
  endEncounter,
  listEncountersForPatient,
  listEncountersForUnit,
  loadEncounters,
  migratePastAdmissions,
  openEncounterForPatient,
  planTransfer,
  saveEncounters,
  startEncounter,
} from '../src/services/patientEncounters.ts';
import type { PatientEncounter } from '../src/services/patientEncounters.ts';
import type { PastAdmission } from '../src/types/clinical';

const base = {
  workspaceId: 'ws-1',
  patientId: 'p-1',
  unitId: 'u-1',
  kind: 'admission' as const,
  createdBy: 'uid-1',
  nowMs: 1000,
};

const makeStorage = (seed: Record<string, string> = {}) => {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    values,
    getItem(key: string): string | null {
      return values.has(key) ? String(values.get(key)) : null;
    },
    setItem(key: string, value: string): void {
      values.set(key, String(value));
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
};

const past = (
  admissionDate: string,
  dischargeDate: string,
  unitName = 'CCU',
): PastAdmission => ({
  id: 'adm-x',
  admissionDate,
  dischargeDate,
  unitName,
  dischargeReason: 'Discharged Home',
  dischargeSummary: 'stable',
  primaryDiagnosis: 'ACS',
});

test('startEncounter validates every required identity field and the kind', () => {
  assert.throws(() => startEncounter({ ...base, workspaceId: ' ' }, []), /workspaceId-required/);
  assert.throws(() => startEncounter({ ...base, patientId: '' }, []), /patientId-required/);
  assert.throws(() => startEncounter({ ...base, unitId: '' }, []), /unitId-required/);
  assert.throws(() => startEncounter({ ...base, createdBy: '' }, []), /createdBy-required/);
  assert.throws(
    () => startEncounter({ ...base, kind: 'bogus' as any }, []),
    /invalid-kind/,
  );

  const encounter = startEncounter(
    {
      ...base,
      bedId: 'b-7',
      sourceWaitingEntryId: 'w-3',
      nowMs: 1234,
    },
    [],
  );
  assert.equal(encounter.id, 'enc-1234-1');
  assert.equal(encounter.workspaceId, 'ws-1');
  assert.equal(encounter.patientId, 'p-1');
  assert.equal(encounter.unitId, 'u-1');
  assert.equal(encounter.bedId, 'b-7');
  assert.equal(encounter.sourceWaitingEntryId, 'w-3');
  assert.equal(encounter.kind, 'admission');
  assert.equal(encounter.startedAtMs, 1234);
  assert.equal(encounter.createdAtMs, 1234);
  assert.equal(encounter.endedAtMs, undefined);
  assert.equal(encounter.schemaVersion, 1);
});

test('a second open admission or transfer is refused, but a clinic visit is allowed', () => {
  const admission = startEncounter(base, []);
  assert.throws(
    () => startEncounter({ ...base, kind: 'transfer', fromUnitId: 'u-1', nowMs: 1100 }, [admission]),
    /patient-already-in-encounter/,
  );
  assert.throws(
    () => startEncounter({ ...base, nowMs: 1200 }, [admission]),
    /patient-already-in-encounter/,
  );

  const clinic = startEncounter({ ...base, kind: 'clinic-visit', nowMs: 1300 }, [admission]);
  assert.equal(clinic.kind, 'clinic-visit');
  assert.notEqual(clinic.id, admission.id);

  // A different patient is never blocked.
  const other = startEncounter(
    { ...base, patientId: 'p-2', kind: 'admission', nowMs: 1400 },
    [admission, clinic],
  );
  assert.equal(other.patientId, 'p-2');

  // Once the stay really ended, a new admission is allowed again.
  const ended = endEncounter(admission, 1500);
  const readmitted = startEncounter({ ...base, nowMs: 1600 }, [ended, clinic]);
  assert.equal(readmitted.kind, 'admission');
  assert.equal(readmitted.id, 'enc-1600-1');
});

test('encounter ids stay unique for the same millisecond', () => {
  const first = startEncounter({ ...base, patientId: 'p-1' }, []);
  const second = startEncounter({ ...base, patientId: 'p-2', nowMs: 1000 }, [first]);
  assert.equal(first.id, 'enc-1000-1');
  assert.equal(second.id, 'enc-1000-2');
});

test('endEncounter closes exactly once and never mutates the original', () => {
  const open = startEncounter(base, []);
  const closed = endEncounter(open, 5000);
  assert.equal(closed.endedAtMs, 5000);
  assert.equal(open.endedAtMs, undefined);
  assert.notEqual(closed, open);
  assert.throws(() => endEncounter(closed, 6000), /already-ended/);
});

test('planTransfer closes the open stay and opens a transfer in the destination unit', () => {
  const admission = startEncounter({ ...base, bedId: 'b-1' }, []);
  const result = planTransfer({
    existing: [admission],
    patientId: 'p-1',
    fromUnitId: 'u-1',
    toUnitId: 'u-2',
    bedId: 'b-2',
    actorUid: 'uid-2',
    workspaceId: 'ws-1',
    nowMs: 2000,
  });

  assert.equal(result.closed.length, 1);
  assert.equal(result.closed[0].id, admission.id);
  assert.equal(result.closed[0].endedAtMs, 2000);
  assert.equal(admission.endedAtMs, undefined, 'the input stay must not be mutated');

  assert.equal(result.created.kind, 'transfer');
  assert.equal(result.created.patientId, 'p-1');
  assert.equal(result.created.unitId, 'u-2');
  assert.equal(result.created.fromUnitId, 'u-1');
  assert.equal(result.created.bedId, 'b-2');
  assert.equal(result.created.startedAtMs, 2000);
  assert.equal(result.created.createdBy, 'uid-2');

  const remaining = [...result.closed, result.created];
  const current = openEncounterForPatient(remaining, 'p-1');
  assert.equal(current?.id, result.created.id);

  assert.throws(
    () =>
      planTransfer({
        existing: remaining,
        patientId: 'p-1',
        fromUnitId: 'u-2',
        toUnitId: 'u-2',
        actorUid: 'uid-2',
        workspaceId: 'ws-1',
      }),
    /same-unit/,
  );
});

test('planTransfer works when no stay was open', () => {
  const result = planTransfer({
    existing: [],
    patientId: 'p-1',
    fromUnitId: 'u-1',
    toUnitId: 'u-2',
    actorUid: 'uid-2',
    workspaceId: 'ws-1',
    nowMs: 3000,
  });
  assert.deepEqual(result.closed, []);
  assert.equal(result.created.kind, 'transfer');
  assert.equal(result.created.fromUnitId, 'u-1');
  assert.equal(result.created.unitId, 'u-2');
});

test('migratePastAdmissions is deterministic, idempotent and read-only', () => {
  const history = [
    past('2025-01-02', '2025-01-10'),
    past('2025-02-01', ''),
    past('not-a-date', 'also-not-a-date', 'Ward'),
  ];
  const snapshot = JSON.parse(JSON.stringify(history));

  const first = migratePastAdmissions('p-1', history, 'ws-1', 'uid-1');
  assert.deepEqual(
    first.map((encounter) => encounter.id),
    ['enc-migrated-p-1-0', 'enc-migrated-p-1-1', 'enc-migrated-p-1-2'],
  );
  assert.equal(first[0].startedAtMs, Date.parse('2025-01-02'));
  assert.equal(first[0].endedAtMs, Date.parse('2025-01-10'));
  assert.equal(first[0].unitId, 'CCU');
  assert.equal(first[1].endedAtMs, undefined, 'an empty discharge date is not a finite time');
  assert.equal(first[2].startedAtMs, 0, 'an unparsable admission date falls back to 0');
  assert.equal(first[2].endedAtMs, undefined);
  assert.equal(first[2].unitId, 'Ward');
  for (const encounter of first) {
    assert.equal(encounter.kind, 'admission');
    assert.equal(encounter.createdBy, 'migration');
    assert.equal(encounter.workspaceId, 'ws-1');
    assert.equal(encounter.patientId, 'p-1');
    assert.equal(encounter.schemaVersion, 1);
  }
  assert.deepEqual(history, snapshot, 'the PastAdmission snapshots must not be touched');

  const second = migratePastAdmissions('p-1', history, 'ws-1', 'uid-1');
  assert.deepEqual(second, first);

  const concatenated = [...first, ...second];
  const uniqueIds = new Set(concatenated.map((encounter) => encounter.id));
  assert.equal(concatenated.length, first.length * 2);
  assert.equal(uniqueIds.size, first.length, 'repeating the migration adds no new stays');
});

test('migratePastAdmissions returns nothing for missing or empty input', () => {
  assert.deepEqual(migratePastAdmissions('p-1', undefined, 'ws-1', 'uid-1'), []);
  assert.deepEqual(migratePastAdmissions('p-1', [], 'ws-1', 'uid-1'), []);
  assert.deepEqual(migratePastAdmissions('', [past('2025-01-02', '2025-01-10')], 'ws-1', 'uid-1'), []);
  assert.deepEqual(migratePastAdmissions('p-1', [past('2025-01-02', '2025-01-10')], '', 'uid-1'), []);
});

test('list, unit filter, open stay and history keep the right order', () => {
  const admission = startEncounter({ ...base, patientId: 'p-1', unitId: 'u-1', nowMs: 3000 }, []);
  const clinic = startEncounter(
    { ...base, patientId: 'p-1', unitId: 'u-1', kind: 'clinic-visit', nowMs: 1000 },
    [admission],
  );
  const otherUnit = startEncounter(
    { ...base, patientId: 'p-2', unitId: 'u-2', nowMs: 2000 },
    [admission, clinic],
  );

  const all: PatientEncounter[] = [admission, clinic, otherUnit];

  assert.deepEqual(
    listEncountersForPatient(all, 'p-1').map((encounter) => encounter.id),
    [admission.id, clinic.id],
  );
  assert.deepEqual(
    listEncountersForUnit(all, 'u-1').map((encounter) => encounter.id),
    [admission.id, clinic.id],
  );
  assert.deepEqual(
    listEncountersForUnit(all, 'u-2').map((encounter) => encounter.id),
    [otherUnit.id],
  );
  assert.deepEqual(listEncountersForPatient(all, ''), []);
  assert.deepEqual(listEncountersForUnit(all, ''), []);

  assert.equal(openEncounterForPatient(all, 'p-1')?.id, admission.id);
  assert.equal(openEncounterForPatient(all, 'missing'), null);

  assert.deepEqual(
    encounterHistory(all, 'p-1').map((encounter) => encounter.id),
    [clinic.id, admission.id],
    'history is oldest first even when the open stay was inserted first',
  );
  assert.deepEqual(
    all.map((encounter) => encounter.id),
    [admission.id, clinic.id, otherUnit.id],
    'listing must not reorder the caller array',
  );
});

test('save/load round-trips through an injected storage', () => {
  const storage = makeStorage();
  const encounters = [
    startEncounter(base, []),
    startEncounter({ ...base, kind: 'clinic-visit', nowMs: 2000 }, []),
  ];

  assert.equal(saveEncounters(encounters, storage), true);
  assert.ok(storage.values.get(STORAGE_KEY), 'the agreed storage key is used');
  assert.deepEqual(loadEncounters(storage), encounters);

  assert.equal(clearEncounters(storage), true);
  assert.deepEqual(loadEncounters(storage), []);
});

test('loadEncounters treats corrupt or foreign payloads as empty', () => {
  assert.deepEqual(loadEncounters(makeStorage({ [STORAGE_KEY]: '{not json' })), []);
  assert.deepEqual(loadEncounters(makeStorage({ [STORAGE_KEY]: '{"a":1}' })), []);
  assert.deepEqual(loadEncounters(makeStorage({ [STORAGE_KEY]: '"text"' })), []);
  assert.deepEqual(
    loadEncounters(makeStorage({ [STORAGE_KEY]: '[{"id":"x"}]' })),
    [],
    'incomplete records are dropped instead of trusted',
  );

  const broken = {
    getItem(): string | null {
      throw new Error('storage disabled');
    },
    setItem(): void {
      throw new Error('storage disabled');
    },
    removeItem(): void {
      throw new Error('storage disabled');
    },
  };
  assert.deepEqual(loadEncounters(broken), []);
  assert.equal(saveEncounters([], broken), false);
});

test('save/load falls back to memory when no storage is given', () => {
  clearEncounters();
  const encounters = [startEncounter({ ...base, nowMs: 9000 }, [])];
  assert.equal(saveEncounters(encounters), true);
  assert.deepEqual(loadEncounters(), encounters);
  clearEncounters();
  assert.deepEqual(loadEncounters(), []);
});
