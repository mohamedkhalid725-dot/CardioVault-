import test from 'node:test';
import assert from 'node:assert/strict';
import type { Unit } from '../src/types/clinical';
import type { InstitutionSetupDraft, InstitutionUnitDraft } from '../src/types/departmentTeam';
import {
  INSTITUTION_SETUP_STORAGE_KEY,
  REQUIRED_STEPS,
  clearDraft,
  createUnitsFromDraft,
  emptyDraft,
  emptyUnitDraft,
  loadDraft,
  markStepCompleted,
  saveDraft,
  setupProgress,
  validateInstitutionSetup,
} from '../src/services/institutionSetup.ts';

/**
 * The setup wizard is resumable and device-local in this build. These tests
 * cover the two ways that can go wrong: a draft that validates but is not
 * finished (or the reverse), and a restore that silently produces unusable
 * data. `createUnitsFromDraft` is the only bridge to real units, so its refusal
 * path matters as much as its success path.
 */

const fakeStorage = (seed: Record<string, string> = {}) => {
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

const unitDraft = (over: Partial<InstitutionUnitDraft> = {}): InstitutionUnitDraft => ({
  tempId: 'temp-ccu',
  name: 'CCU A',
  typeId: 'ccu',
  beds: 6,
  ...over,
});

const validDraft = (over: Partial<InstitutionSetupDraft> = {}): InstitutionSetupDraft => ({
  id: 'current',
  institutionName: 'Nile Cardiac Hospital',
  adminName: 'Dr Ahmed Hassan',
  adminEmail: 'admin@nile-cardiac.example',
  unitDrafts: [unitDraft(), unitDraft({ tempId: 'temp-cath', name: 'Cath Lab 1', typeId: 'cath-lab', beds: 0 })],
  teamSize: 18,
  planId: 'trial',
  completedSteps: [...REQUIRED_STEPS],
  updatedAtMs: 0,
  schemaVersion: 1,
  ...over,
});

test('empty draft is resumable and the wizard has exactly four required steps', () => {
  const draft = emptyDraft();
  assert.deepEqual(REQUIRED_STEPS, ['institution', 'units', 'team', 'plan']);
  assert.equal(draft.id, 'current');
  assert.equal(draft.schemaVersion, 1);
  assert.deepEqual(draft.completedSteps, []);
  assert.deepEqual(draft.unitDrafts, []);
  assert.equal(draft.teamSize, 0);
  assert.equal(draft.updatedAtMs, 0);
  assert.equal(setupProgress(draft), 0);

  const row = emptyUnitDraft('cath-lab');
  assert.equal(row.typeId, 'cath-lab');
  assert.equal(row.beds, 0);
  assert.equal(row.name, '');
});

test('save and load round-trip through an injected storage', () => {
  const storage = fakeStorage();
  const draft = validDraft();
  const saved = saveDraft(draft, storage);
  assert.ok(saved.updatedAtMs > 0);
  assert.equal(saved.id, 'current');
  assert.equal(saved.unitDrafts.length, 2);
  assert.equal(draft.updatedAtMs, 0, 'the input draft is not mutated');

  const stored = storage.getItem(INSTITUTION_SETUP_STORAGE_KEY);
  assert.ok(stored && stored.includes('Nile Cardiac Hospital'));

  const loaded = loadDraft(storage);
  assert.equal(loaded.institutionName, draft.institutionName);
  assert.equal(loaded.adminEmail, draft.adminEmail);
  assert.equal(loaded.teamSize, draft.teamSize);
  assert.equal(loaded.planId, 'trial');
  assert.deepEqual(loaded.completedSteps, draft.completedSteps);
  assert.deepEqual(loaded.unitDrafts, draft.unitDrafts);
  assert.ok(loaded.updatedAtMs > 0);

  clearDraft(storage);
  assert.equal(storage.getItem(INSTITUTION_SETUP_STORAGE_KEY), null);
  assert.deepEqual(loadDraft(storage), emptyDraft());
});

test('a corrupt or foreign stored value never throws at load', () => {
  assert.deepEqual(loadDraft(fakeStorage({ [INSTITUTION_SETUP_STORAGE_KEY]: '{not json' })), emptyDraft());
  assert.deepEqual(loadDraft(fakeStorage({ [INSTITUTION_SETUP_STORAGE_KEY]: '[]' })), emptyDraft());
  assert.deepEqual(loadDraft(fakeStorage({ [INSTITUTION_SETUP_STORAGE_KEY]: 'null' })), emptyDraft());
  assert.deepEqual(loadDraft(fakeStorage()), emptyDraft());

  // Partially broken fields are repaired, not fatal.
  const repaired = loadDraft(
    fakeStorage({
      [INSTITUTION_SETUP_STORAGE_KEY]: JSON.stringify({
        institutionName: '  Clinic  ',
        unitDrafts: [{ name: 'Ward', typeId: 'Inpatient Ward', beds: '5' }, null, 'junk'],
        completedSteps: ['institution', 'institution', 7],
        teamSize: '4',
      }),
    }),
  );
  assert.equal(repaired.institutionName, 'Clinic');
  assert.equal(repaired.unitDrafts.length, 1);
  assert.equal(repaired.unitDrafts[0].typeId, 'inpatient-ward');
  assert.equal(repaired.unitDrafts[0].beds, 5);
  assert.equal(repaired.teamSize, 4);
  assert.deepEqual(repaired.completedSteps, ['institution']);
});

test('the wizard still works when storage is unavailable', () => {
  const blocked = {
    getItem: () => {
      throw new Error('storage blocked');
    },
    setItem: () => {
      throw new Error('storage blocked');
    },
    removeItem: () => {
      throw new Error('storage blocked');
    },
  };
  assert.doesNotThrow(() => saveDraft(validDraft({ institutionName: 'Memory Hospital' }), blocked));
  const loaded = loadDraft(blocked);
  assert.equal(loaded.institutionName, 'Memory Hospital');
  assert.doesNotThrow(() => clearDraft(blocked));
});

test('completed steps are deduped and never drop the others', () => {
  const once = markStepCompleted(emptyDraft(), 'institution');
  assert.deepEqual(once.completedSteps, ['institution']);
  const twice = markStepCompleted(once, 'institution');
  assert.deepEqual(twice.completedSteps, ['institution']);
  const third = markStepCompleted(twice, 'units');
  assert.deepEqual(third.completedSteps, ['institution', 'units']);
  assert.deepEqual(markStepCompleted(third, '').completedSteps, ['institution', 'units']);
});

test('setup validation catches missing steps, duplicate names, bad email and bad bed counts', () => {
  assert.equal(validateInstitutionSetup(validDraft()).ok, true);

  // A perfect form that has not walked the wizard is not finished.
  const missingSteps = validateInstitutionSetup(validDraft({ completedSteps: ['institution', 'units'] }));
  assert.equal(missingSteps.ok, false);
  assert.match(missingSteps.errors.steps, /team/);
  assert.match(missingSteps.errors.steps, /plan/);

  const duplicate = validateInstitutionSetup(
    validDraft({
      unitDrafts: [unitDraft(), unitDraft({ tempId: 'temp-two', name: '  ccu a  ' })],
    }),
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.errors['units.duplicate'], 'Unit names must be unique.');

  const badEmail = validateInstitutionSetup(validDraft({ adminEmail: 'doctor@localhost' }));
  assert.equal(badEmail.ok, false);
  assert.match(badEmail.errors.adminEmail, /email/i);

  assert.match(validateInstitutionSetup(validDraft({ institutionName: ' ' })).errors.institutionName, /institution/i);
  assert.match(validateInstitutionSetup(validDraft({ adminName: 'A' })).errors.adminName, /admin/i);
  assert.match(validateInstitutionSetup(validDraft({ teamSize: 2.5 })).errors.teamSize, /whole number/i);
  assert.match(validateInstitutionSetup(validDraft({ teamSize: 10_001 })).errors.teamSize, /whole number/i);

  const noUnits = validateInstitutionSetup(validDraft({ unitDrafts: [] }));
  assert.equal(noUnits.ok, false);
  assert.match(noUnits.errors.units || '', /at least one unit/i);

  // Per-row errors are namespaced by tempId and field.
  const badRow = validateInstitutionSetup(
    validDraft({
      unitDrafts: [
        unitDraft({ tempId: 'temp-a', name: '' }),
        unitDraft({ tempId: 'temp-b', name: 'Imaging', typeId: 'custom', beds: 201 }),
      ],
    }),
  );
  assert.equal(badRow.ok, false);
  assert.match(badRow.errors['unit.temp-a.name'], /name/i);
  assert.match(badRow.errors['unit.temp-b.customTypeName'], /custom/i);
  assert.match(badRow.errors['unit.temp-b.beds'], /200/);
});

test('total beds are summed live and progress is deterministic', () => {
  const draft = validDraft();
  assert.equal(validateInstitutionSetup(draft).totalBeds, 6);

  const richer = validDraft({
    unitDrafts: [
      unitDraft({ tempId: 'a', name: 'CCU', beds: 6 }),
      unitDraft({ tempId: 'b', name: 'ICU', typeId: 'icu', beds: 8 }),
      unitDraft({ tempId: 'c', name: 'Ward', typeId: 'inpatient-ward', beds: 20 }),
      unitDraft({ tempId: 'd', name: 'Cath', typeId: 'cath-lab', beds: 0 }),
    ],
  });
  assert.equal(validateInstitutionSetup(richer).totalBeds, 34);
  assert.equal(setupProgress(richer), 100);
  assert.equal(setupProgress(emptyDraft()), 0);

  const half = validDraft({ completedSteps: ['institution', 'units'], unitDrafts: [unitDraft({ name: '' })] });
  const progress = setupProgress(half);
  assert.ok(progress > 0 && progress < 100, `expected partial progress, got ${progress}`);
  assert.equal(setupProgress(half), progress, 'progress is deterministic');

  // A draft with ANY validation error must never look fully finished, no matter
  // how many steps or unit rows it already has.
  const broken = validDraft({ adminEmail: 'not-an-email' });
  assert.equal(validateInstitutionSetup(broken).ok, false);
  const brokenProgress = setupProgress(broken);
  assert.ok(brokenProgress <= 89, `expected capped progress for an invalid draft, got ${brokenProgress}`);
});

test('createUnitsFromDraft refuses an incomplete setup and never touches existing units', () => {
  const existing: Unit[] = [
    { id: 'unit-existing', name: 'CCU A', type: 'Critical Care / CCU', totalBeds: 4, createdBy: 'owner-1' },
  ];
  const existingSnapshot = JSON.parse(JSON.stringify(existing));

  assert.throws(() => createUnitsFromDraft(emptyDraft(), existing), /incomplete/i);
  assert.throws(
    () => createUnitsFromDraft(validDraft({ completedSteps: ['institution'] }), existing),
    /incomplete/i,
  );
  assert.deepEqual(existing, existingSnapshot);

  const created = createUnitsFromDraft(validDraft(), existing);
  assert.equal(created.length, 2);
  assert.deepEqual(existing, existingSnapshot, 'the existing list is not modified');
  assert.deepEqual(
    created.map((unit) => unit.name),
    ['CCU A 2', 'Cath Lab 1'],
    'names are de-duplicated against the institution, in draft order',
  );
  assert.equal(new Set(created.map((unit) => unit.id)).size, 2);
  assert.ok(created.every((unit) => !existing.some((old) => old.id === unit.id)));
  assert.equal(created[0].type, 'CCU (Coronary Care)');
  assert.equal(created[0].totalBeds, 6);
  assert.equal(created[0].unitTypeId, 'ccu');
  assert.equal(created[1].type, 'Cath Lab');
  assert.equal(created[1].totalBeds, 0);
  assert.equal(created[1].config?.capabilities.beds, false);

  // When the draft has no collisions, the names are kept exactly.
  const free = createUnitsFromDraft(validDraft(), []);
  assert.deepEqual(
    free.map((unit) => unit.name),
    ['CCU A', 'Cath Lab 1'],
  );
});
