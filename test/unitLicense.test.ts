import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitLicenseRecord, filterCachedClinicalByLicensedUnits, licensedUnitIds, nextUnitLicenseExpiry, unitLicenseState, UNIT_LICENSE_MS } from '../src/services/unitLicense.ts';

const now = 1_800_000_000_000;

test('unit license is active before expiry and expires exactly at its boundary', () => {
  const record = createUnitLicenseRecord({ workspaceId: 'ws_customer01', unitId: 'icu', updatedBy: 'platform-owner', nowMs: now });
  assert.equal(record.expiresAtMs, now + 30 * 24 * 60 * 60 * 1000);
  assert.equal(unitLicenseState(record, record.expiresAtMs - 1), 'active');
  assert.equal(unitLicenseState(record, record.expiresAtMs), 'expired');
});

test('early renewal stacks 30 days after current expiry; late renewal starts at issuance', () => {
  assert.equal(nextUnitLicenseExpiry(now + 5 * 86400000, now), now + 5 * 86400000 + UNIT_LICENSE_MS);
  assert.equal(nextUnitLicenseExpiry(now - 5 * 86400000, now), now + UNIT_LICENSE_MS);
});

test('licenses are explicitly scoped to one workspace and unit', () => {
  const license = createUnitLicenseRecord({ workspaceId: 'ws_customer01', unitId: 'icu', updatedBy: 'owner', nowMs: now });
  assert.equal(license.workspaceId, 'ws_customer01');
  assert.equal(license.unitId, 'icu');
  assert.equal(unitLicenseState(null, now), 'missing');
  assert.throws(() => createUnitLicenseRecord({ workspaceId: 'ws_customer01', unitId: '', updatedBy: 'owner', nowMs: now }));
});

test('cached clinical records from expired units are hidden but shared records remain visible through an active unit', () => {
  const active = createUnitLicenseRecord({ workspaceId: 'ws_customer01', unitId: 'unit-b', updatedBy: 'owner', nowMs: now });
  const allowed = licensedUnitIds(['unit-a', 'unit-b'], { 'unit-a': { expiresAtMs: now - 1 }, 'unit-b': active }, now);
  const visible = filterCachedClinicalByLicensedUnits(
    [{ id: 'unit-a' }, { id: 'unit-b' }],
    [{ id: 'p-a', unitId: 'unit-a' }, { id: 'p-shared', unitId: 'unit-a', unitIds: ['unit-a', 'unit-b'] }],
    [{ id: 'bed-a', unitId: 'unit-a' }, { id: 'bed-b', unitId: 'unit-b' }],
    allowed,
  );
  assert.deepEqual(visible.units.map(unit => unit.id), ['unit-b']);
  assert.deepEqual(visible.patients.map(patient => patient.id), ['p-shared']);
  assert.deepEqual(visible.beds.map(bed => bed.id), ['bed-b']);
});
