import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_UNIT_TYPES,
  DEFAULT_UNIT_CONFIG,
  LEGACY_TYPE_MAP,
  buildUnitFromDraft,
  defaultCapabilitiesFor,
  normalizeUnitTypeId,
  unitConfigFor,
  unitDisplayType,
  validateUnitDraft,
} from '../src/services/unitCatalog.ts';

/**
 * The catalogue is the vocabulary the rest of the roadmap speaks: unit types,
 * legacy free-text mapping, and a non-destructive config for records that were
 * written before `unitTypeId` existed. These tests pin the parts that, if they
 * drifted, would silently relabel a live unit or make an old document invalid.
 */

test('eight builtin unit types exist with stable ids and editable capability defaults', () => {
  assert.equal(BUILTIN_UNIT_TYPES.length, 8);
  assert.deepEqual(
    BUILTIN_UNIT_TYPES.map((entry) => entry.id),
    ['cardiology', 'ccu', 'icu', 'surgery', 'inpatient-ward', 'cath-lab', 'dialysis', 'endoscopy'],
  );
  const byId = new Map(BUILTIN_UNIT_TYPES.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('ccu')?.label, 'CCU (Coronary Care)');
  assert.equal(byId.get('cardiology')?.capabilities.beds, true);
  assert.equal(byId.get('cardiology')?.capabilities.clinicMode, true);
  assert.equal(byId.get('cath-lab')?.capabilities.beds, false);
  assert.equal(byId.get('cath-lab')?.capabilities.waitingList, true);
  assert.equal(byId.get('dialysis')?.capabilities.clinicMode, true);
  assert.equal(byId.get('endoscopy')?.capabilities.waitingList, true);
  assert.equal(byId.get('icu')?.capabilities.waitingList, false);
  // Defaults are proposals only: a config can flip them.
  const flipped = DEFAULT_UNIT_CONFIG({ beds: false, clinicMode: true }, 'icu');
  assert.equal(flipped.typeId, 'icu');
  assert.equal(flipped.capabilities.beds, false);
  assert.equal(flipped.capabilities.clinicMode, true);
  assert.equal(flipped.schemaVersion, 1);
});

test('legacy free-text unit types map to the catalogue', () => {
  assert.equal(LEGACY_TYPE_MAP['Critical Care / CCU'.toLowerCase()], 'ccu');
  assert.equal(normalizeUnitTypeId('Critical Care / CCU'), 'ccu');
  assert.equal(normalizeUnitTypeId('Intensive Care Unit'), 'icu');
  assert.equal(normalizeUnitTypeId('Step-Down / Inpatient'), 'inpatient-ward');
  assert.equal(normalizeUnitTypeId('Cardiology'), 'cardiology');
  // Substring fallbacks, including the cases where two words compete.
  assert.equal(normalizeUnitTypeId('Cardiology Inpatient Ward'), 'inpatient-ward');
  assert.equal(normalizeUnitTypeId('Coronary Care Unit'), 'ccu');
  assert.equal(normalizeUnitTypeId('Surgical ICU'), 'surgery');
  assert.equal(normalizeUnitTypeId('Cath Lab 2'), 'cath-lab');
  assert.equal(normalizeUnitTypeId('Haemodialysis'), 'dialysis');
  assert.equal(normalizeUnitTypeId('Endoscopy Suite'), 'endoscopy');
  // Already-normalised ids pass through.
  assert.equal(normalizeUnitTypeId('ccu'), 'ccu');
  assert.equal(normalizeUnitTypeId('  ICU  '), 'icu');
  // Unknown input never guesses.
  assert.equal(normalizeUnitTypeId('Procedure Room 7'), 'custom');
  assert.equal(normalizeUnitTypeId(''), 'custom');
  assert.equal(normalizeUnitTypeId(null), 'custom');
  assert.equal(normalizeUnitTypeId(42), 'custom');
});

test('config normalisation preserves an old unit and never mutates it', () => {
  const legacyUnit = {
    id: 'unit-1',
    name: 'CCU A',
    type: 'Critical Care / CCU',
    totalBeds: 6,
    createdBy: 'owner-1',
    consultantUid: 'doc-1',
    createdAtMs: 1_700_000_000_000,
    capacityLocked: true,
  };
  const snapshot = JSON.parse(JSON.stringify(legacyUnit));
  const config = unitConfigFor(legacyUnit);
  assert.deepEqual(legacyUnit, snapshot, 'input unit must be untouched');
  assert.equal(config.typeId, 'ccu');
  assert.deepEqual(config.capabilities, { beds: true, waitingList: false, clinicMode: false });
  assert.equal(config.settings.defaultBedCount, 6);
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.customTypeName, undefined);

  // unitTypeId wins over the free-text type.
  assert.equal(unitConfigFor({ type: 'Cardiology', unitTypeId: 'icu' }).typeId, 'icu');

  // An existing config keeps its own values and only gains missing keys.
  const stored = {
    id: 'unit-2',
    name: 'Dialysis',
    type: 'Dialysis',
    totalBeds: 0,
    config: {
      typeId: 'dialysis' as const,
      capabilities: { beds: true } as any,
      settings: { functionName: 'Acute dialysis' },
      schemaVersion: 1,
    },
  };
  const storedSnapshot = JSON.parse(JSON.stringify(stored));
  const kept = unitConfigFor(stored);
  assert.deepEqual(stored, storedSnapshot, 'existing config must be copied, not rewritten');
  assert.equal(kept.capabilities.beds, true, 'explicit capability is respected');
  assert.equal(kept.capabilities.waitingList, true, 'missing capability comes from the type default');
  assert.equal(kept.capabilities.clinicMode, true);
  assert.equal(kept.settings.functionName, 'Acute dialysis');
  assert.equal(kept.settings.defaultBedCount, undefined, 'no bed count is invented for a zero-bed unit');
  assert.notEqual(kept, stored.config, 'a new config object is returned');
  assert.notEqual(kept.settings, stored.config.settings);

  // A custom unit keeps its own label.
  const importedCustom = unitConfigFor({ type: 'Procedure Room 7' });
  assert.equal(unitDisplayType({ type: 'Procedure Room 7', config: importedCustom }), 'Procedure Room 7');
  assert.equal(
    unitDisplayType({ type: 'Bone Marrow Transplant', config: { ...importedCustom, customTypeName: 'Bone Marrow Transplant' } }),
    'Bone Marrow Transplant',
  );
  assert.equal(unitDisplayType({ type: 'Cardiology' }), 'Cardiology');
  assert.equal(unitDisplayType({ type: 'Critical Care / CCU' }), 'CCU (Coronary Care)');
  assert.equal(unitDisplayType({}), 'Unit');
  assert.deepEqual(defaultCapabilitiesFor('custom'), { beds: true, waitingList: false, clinicMode: false });
});

test('unit draft validation covers the boundaries', () => {
  const valid = validateUnitDraft({ name: 'CCU A', typeId: 'ccu', beds: 6 });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, {});

  assert.match(validateUnitDraft({ name: ' ', typeId: 'ccu', beds: 6 }).errors.name, /name/i);
  assert.match(validateUnitDraft({ name: 'A', typeId: 'ccu', beds: 6 }).errors.name, /name/i);
  assert.match(validateUnitDraft({ name: 'x'.repeat(81), typeId: 'ccu', beds: 6 }).errors.name, /name/i);
  assert.equal(validateUnitDraft({ name: 'x'.repeat(80), typeId: 'ccu', beds: 6 }).ok, true);

  // Custom requires its own name.
  const customEmpty = validateUnitDraft({ name: 'Unit A', typeId: 'custom', beds: 2 });
  assert.equal(customEmpty.ok, false);
  assert.match(customEmpty.errors.customTypeName, /custom/i);
  assert.equal(validateUnitDraft({ name: 'Unit A', typeId: 'custom', customTypeName: 'BMT', beds: 2 }).ok, true);

  // Unknown type ids are rejected, not silently mapped.
  assert.match(validateUnitDraft({ name: 'Unit A', typeId: 'mystery', beds: 2 }).errors.typeId, /type/i);
  assert.match(validateUnitDraft({ name: 'Unit A', typeId: '', beds: 2 }).errors.typeId, /type/i);

  // Bed capability: zero beds is only wrong when the unit holds beds.
  const bedsUnit = validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: 0 });
  assert.equal(bedsUnit.ok, false);
  assert.match(bedsUnit.errors.beds, /at least one bed/i);
  assert.equal(validateUnitDraft({ name: 'Cath Lab', typeId: 'cath-lab', beds: 0 }).ok, true);
  assert.equal(validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: 0, capabilities: { beds: false } }).ok, true);

  assert.match(validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: 201 }).errors.beds, /200/);
  assert.match(validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: 4.5 }).errors.beds, /whole number/i);
  assert.match(validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: -1 }).errors.beds, /whole number/i);
  assert.match(
    validateUnitDraft({ name: 'Ward A', typeId: 'inpatient-ward', beds: 4, functionName: 'x'.repeat(121) }).errors.functionName,
    /120/,
  );
});

test('buildUnitFromDraft returns a new unit and preserves identity fields', () => {
  const base = {
    id: 'unit-legacy',
    name: 'Old name',
    type: 'Critical Care / CCU',
    totalBeds: 4,
    createdBy: 'owner-1',
    consultantUid: 'doc-1',
    createdAtMs: 1_700_000_000_000,
    capacityLocked: true,
    notes: 'third floor',
  };
  const snapshot = JSON.parse(JSON.stringify(base));
  const unit = buildUnitFromDraft(
    { name: 'CCU B', typeId: 'ccu', beds: 8, functionName: 'Post-PCI care' },
    base,
  );

  assert.deepEqual(base, snapshot, 'base is never mutated');
  assert.notEqual(unit, base);
  assert.equal(unit.id, 'unit-legacy');
  assert.equal(unit.name, 'CCU B');
  assert.equal(unit.type, 'CCU (Coronary Care)');
  assert.equal(unit.totalBeds, 8);
  assert.equal(unit.unitTypeId, 'ccu');
  assert.equal(unit.createdBy, 'owner-1');
  assert.equal(unit.consultantUid, 'doc-1');
  assert.equal(unit.createdAtMs, 1_700_000_000_000);
  assert.equal(unit.capacityLocked, true);
  assert.equal(unit.notes, 'third floor');
  assert.equal(unit.config?.capabilities.beds, true);
  assert.equal(unit.config?.settings.defaultBedCount, 8);
  assert.equal(unit.config?.settings.functionName, 'Post-PCI care');
  assert.equal(unit.config?.schemaVersion, 1);

  // Without a base id a new one is generated from the type.
  const fresh = buildUnitFromDraft({ name: 'Lab', typeId: 'cath-lab', beds: 0 });
  assert.equal(fresh.type, 'Cath Lab');
  assert.match(String(fresh.id), /^unit-cath-lab-\d+$/);
  assert.equal(fresh.createdBy, undefined);

  // A custom unit carries its own label into `type`.
  const custom = buildUnitFromDraft({ name: 'BMT', typeId: 'custom', customTypeName: 'Bone Marrow Transplant', beds: 3 });
  assert.equal(custom.type, 'Bone Marrow Transplant');
  assert.equal(custom.config?.customTypeName, 'Bone Marrow Transplant');
});
