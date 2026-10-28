// Production institution setup (Fix 1): the plan and the retry semantics.
//
// The wizard component only coordinates. Everything that decides "what still
// has to happen" lives in these two functions, so the important promises can be
// tested without React, a Firebase session or a device:
//
//   - a unit id is the draft tempId, so the subscription request, the unit
//     document and an owner-issued code all agree;
//   - a retry never creates a unit twice (nor its beds);
//   - finishing is attempted for every configured unit on every run, so a
//     half-finished earlier attempt is repaired;
//   - a partial run is never reported as a success.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Unit } from '../src/types/clinical';
import type { InstitutionSetupDraft, InstitutionUnitDraft } from '../src/types/departmentTeam';
import {
  planProductionSetupUnits,
  runProductionSetup,
} from '../src/services/institutionSetupProduction.ts';
import { saveSetupCompanion } from '../src/services/institutionSetup.ts';

const UID = 'uid-owner-1';

const fakeStorage = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

const row = (over: Partial<InstitutionUnitDraft> = {}): InstitutionUnitDraft => ({
  tempId: 'temp-ccu',
  name: 'CCU A',
  typeId: 'ccu',
  beds: 6,
  ...over,
});

const draft = (over: Partial<InstitutionSetupDraft> = {}): InstitutionSetupDraft => ({
  id: 'current',
  institutionName: 'Nile Cardiac Hospital',
  adminName: 'Dr Ahmed Hassan',
  adminEmail: 'admin@nile-cardiac.example',
  unitDrafts: [
    row(),
    row({ tempId: 'temp-cath', name: 'Cath Lab 1', typeId: 'cath-lab', beds: 2 }),
  ],
  teamSize: 18,
  completedSteps: ['institution', 'units', 'team', 'plan', 'payment', 'request'],
  updatedAtMs: 0,
  schemaVersion: 1,
  ...over,
});

const storedUnit = (over: Partial<Unit> = {}): Unit => ({
  id: 'temp-ccu',
  name: 'CCU A',
  type: 'CCU',
  totalBeds: 6,
  createdBy: UID,
  consultantUid: UID,
  createdAtMs: 1_700_000_000_000,
  capacityLocked: false,
  ...over,
});

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

test('the plan uses the draft tempIds as real unit ids with the exact bed count', () => {
  const plan = planProductionSetupUnits(draft(), [], UID);

  assert.deepEqual(
    plan.targets.map((target) => [target.id, target.beds]),
    [
      ['temp-ccu', 6],
      ['temp-cath', 2],
    ],
  );
  assert.deepEqual(
    plan.toCreate.map((unit) => unit.id),
    ['temp-ccu', 'temp-cath'],
  );
  assert.deepEqual(plan.existing, []);
  assert.deepEqual(plan.unlinked, []);
  for (const unit of plan.toCreate) {
    assert.notEqual(unit.capacityLocked, true, 'capacity stays open until the beds exist');
    assert.equal(unit.totalBeds, unit.id === 'temp-ccu' ? 6 : 2);
  }
});

test('a retry plans only the units that are still missing', () => {
  const plan = planProductionSetupUnits(draft(), [storedUnit()], UID);

  assert.deepEqual(plan.toCreate.map((unit) => unit.id), ['temp-cath']);
  assert.deepEqual(plan.existing, ['temp-ccu']);
  // Every configured unit is still a target, because finishing is the repair step.
  assert.deepEqual(plan.targets.map((target) => target.id), ['temp-ccu', 'temp-cath']);
});

test('a complete retry has nothing left to create', () => {
  const plan = planProductionSetupUnits(
    draft(),
    [storedUnit(), storedUnit({ id: 'temp-cath', name: 'Cath Lab 1', totalBeds: 2 })],
    UID,
  );
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.existing, ['temp-ccu', 'temp-cath']);
});

test('a duplicated draft id is reported as unlinked instead of created under a new id', () => {
  const plan = planProductionSetupUnits(
    draft({ unitDrafts: [row(), row({ name: 'CCU B', beds: 4 })] }),
    [],
    UID,
  );
  assert.equal(plan.unlinked.length, 1, 'the second row cannot keep the same unit id');
  assert.equal(plan.unlinked[0].name, 'CCU B');
  // It is never silently created under a generated id, which would break the
  // link to the subscription request.
  assert.equal(plan.toCreate.length, plan.targets.length - plan.unlinked.length);
});

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

const harness = (options: {
  existing?: Unit[];
  createImpl?: (unit: Unit) => Unit | null;
  completeImpl?: (unitId: string) => { ok: boolean; expected: number; present: number; message: string };
} = {}) => {
  const created: string[] = [];
  const completed: string[] = [];
  const plan = planProductionSetupUnits(draft(), options.existing || [], UID);
  const outcome = () =>
    runProductionSetup({
      plan,
      createUnit: (unit) => {
        created.push(String(unit.id));
        return options.createImpl ? options.createImpl(unit) : unit;
      },
      completeUnit: async (unitId) => {
        completed.push(unitId);
        const target = plan.targets.find((entry) => entry.id === unitId);
        const expected = target?.beds ?? 0;
        const result = options.completeImpl
          ? options.completeImpl(unitId)
          : { ok: true, expected, present: expected, message: 'Done.' };
        return { unitId, ...result };
      },
    });
  return { plan, created, completed, outcome };
};

test('a first run creates both units, finishes both and reports the created beds', async () => {
  const { created, completed, outcome } = harness();
  const result = await outcome();

  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 2);
  assert.deepEqual(created, ['temp-ccu', 'temp-cath']);
  assert.deepEqual(completed, ['temp-ccu', 'temp-cath']);
  assert.equal(result.failures.length, 0);
  assert.equal(result.totalBeds, 8);
});

test('a retry after success creates nothing and still finishes every unit', async () => {
  const { created, completed, outcome } = harness({
    existing: [storedUnit(), storedUnit({ id: 'temp-cath', name: 'Cath Lab 1', totalBeds: 2 })],
  });
  const result = await outcome();

  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 0);
  assert.deepEqual(created, [], 'no duplicate unit');
  assert.deepEqual(completed, ['temp-ccu', 'temp-cath']);
});

test('a failed creation is reported and the run is not a success', async () => {
  const { outcome } = harness({
    createImpl: (unit) => {
      if (unit.id === 'temp-cath') throw new Error('permission-denied');
      return unit;
    },
  });
  const result = await outcome();

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].unitId, 'temp-cath');
  assert.match(result.failures[0].message, /permission-denied/);
  // The healthy unit still finished.
  assert.deepEqual(result.completed.map((entry) => entry.unitId), ['temp-ccu']);
  assert.equal(result.totalBeds, 6);
});

test('a retry after a partial run creates only the missing unit', async () => {
  // First attempt: the second unit could not be created.
  const first = harness({
    createImpl: (unit) => {
      if (unit.id === 'temp-cath') throw new Error('offline');
      return unit;
    },
  });
  const firstResult = await first.outcome();
  assert.equal(firstResult.ok, false);

  // Second attempt sees the first unit in storage (what addUnit + sync left
  // behind) and only creates the missing one.
  const second = harness({
    existing: [storedUnit()],
    createImpl: (unit) => {
      assert.equal(unit.id, 'temp-cath', 'the existing unit is never re-created');
      return unit;
    },
  });
  const secondResult = await second.outcome();

  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.createdCount, 1);
  assert.deepEqual(second.created, ['temp-cath']);
  assert.deepEqual(secondResult.completed.map((entry) => entry.unitId), ['temp-ccu', 'temp-cath']);
});

test('fewer beds than requested is a failure, not a success', async () => {
  const { outcome } = harness({
    completeImpl: (unitId) =>
      unitId === 'temp-ccu'
        ? { ok: true, expected: 6, present: 4, message: 'Only 4 of 6 beds were created.' }
        : { ok: true, expected: 2, present: 2, message: 'Done.' },
  });
  const result = await outcome();

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].unitId, 'temp-ccu');
  assert.match(result.failures[0].message, /4 of 6/);
  assert.deepEqual(result.completed.map((entry) => entry.unitId), ['temp-cath']);
  assert.equal(result.totalBeds, 2, 'the incomplete unit is not counted');
});

test('a throwing completion is caught and reported per unit', async () => {
  const { outcome } = harness({
    completeImpl: (unitId) => {
      if (unitId === 'temp-cath') throw new Error('network down');
      return { ok: true, expected: 6, present: 6, message: 'Done.' };
    },
  });
  const result = await outcome();

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].unitId, 'temp-cath');
  assert.match(result.failures[0].message, /network down/);
});

test('no configured unit is neither a success nor a crash', async () => {
  // A clinic-only wizard has no department unit: the request is the deliverable.
  const storage = fakeStorage();
  saveSetupCompanion({ requestType: 'clinic' }, storage);
  const plan = planProductionSetupUnits(draft({ unitDrafts: [] }), [], UID, storage);
  assert.deepEqual(plan.targets, []);

  const result = await runProductionSetup({
    plan,
    createUnit: () => null,
    completeUnit: async (unitId) => ({ ok: true, unitId, expected: 0, present: 0, message: 'Nothing to do.' }),
  });

  assert.equal(result.ok, false, 'a clinic-only request is handled by the caller, not here');
  assert.deepEqual(result.failures, []);
  assert.equal(result.createdCount, 0);
});

test('an unlinked row is reported once and never finished under the wrong id', async () => {
  const storage = fakeStorage();
  saveSetupCompanion({ requestType: 'department' }, storage);
  const plan = planProductionSetupUnits(
    draft({ unitDrafts: [row(), row({ name: 'CCU B', beds: 4 })] }),
    [],
    UID,
    storage,
  );
  const completed: string[] = [];
  const result = await runProductionSetup({
    plan,
    createUnit: (unit) => unit,
    completeUnit: async (unitId) => {
      completed.push(unitId);
      return { unitId, ok: true, expected: 6, present: 6, message: 'Done.' };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /identifier/i);
  assert.deepEqual(completed, [plan.targets[0].id]);
});
