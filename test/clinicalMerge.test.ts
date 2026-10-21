import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClinicalCollections } from '../src/services/clinicalMerge.ts';

/**
 * The restore merges the cloud snapshot with the local working state instead of
 * replacing it. A unit that was just created is uploaded in two steps (the unit
 * document, then its bed documents), and a restore that landed in that window
 * used to wipe the local copy - the unit came back with no beds at all.
 */

const record = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  updatedAt,
  ...extra,
});

const empty = { units: [], beds: [], patients: [] };

test('the newer copy of a record wins', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z', { name: 'from cloud' })] },
    { ...empty, units: [record('u1', '2026-10-21T09:00:00.000Z', { name: 'from local' })] },
  );
  assert.equal(merged.units.length, 1);
  assert.equal(merged.units[0].name, 'from cloud');
});

test('a local edit that is newer than the cloud wins', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [record('u1', '2026-10-21T09:00:00.000Z', { name: 'from cloud' })] },
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z', { name: 'from local' })] },
  );
  assert.equal(merged.units[0].name, 'from local');
});

test('a tie goes to the local working state', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z', { name: 'from cloud' })] },
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z', { name: 'from local' })] },
  );
  assert.equal(merged.units[0].name, 'from local');
});

test('a local record that was never uploaded is the newest thing known', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z', { name: 'from cloud' })] },
    { ...empty, units: [{ id: 'u1', name: 'never uploaded' }] },
  );
  assert.equal(merged.units[0].name, 'never uploaded');
});

test('a record the cloud has and the local does not is kept', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [record('u1', '2026-10-21T10:00:00.000Z')] },
    { ...empty, units: [] },
  );
  assert.equal(merged.units.length, 1);
  assert.equal(merged.units[0].id, 'u1');
});

test('a record only the local knows is kept while changes are pending', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [] },
    { ...empty, units: [record('u-new', '2026-10-21T10:00:00.000Z')] },
    { keepLocalOnly: true },
  );
  assert.equal(merged.units.length, 1);
  assert.equal(merged.units[0].id, 'u-new');
});

test('a record only the local knows is dropped when the cloud is authoritative', () => {
  const merged = mergeClinicalCollections(
    { ...empty, units: [] },
    { ...empty, units: [record('u-old', '2026-10-21T10:00:00.000Z')] },
    { keepLocalOnly: false },
  );
  assert.equal(merged.units.length, 0);
});

test('every collection is merged on its own', () => {
  const merged = mergeClinicalCollections(
    {
      units: [record('u1', '2026-10-21T10:00:00.000Z')],
      beds: [record('b1', '2026-10-21T10:00:00.000Z')],
      patients: [record('p1', '2026-10-21T10:00:00.000Z')],
    },
    { units: [], beds: [], patients: [] },
  );
  assert.equal(merged.units.length, 1);
  assert.equal(merged.beds.length, 1);
  assert.equal(merged.patients.length, 1);
});
