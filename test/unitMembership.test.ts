import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addUnitMembership,
  canManageUnit,
  hasUnitMembership,
  mergeMemberships,
  removeUnitMembership,
  resolveActiveUnit,
  scopeToUnit,
  summarizeMemberships,
} from '../src/services/unitMembership.ts';

/**
 * These helpers only reshape the membership lists that `workspaceAccess.ts`
 * already stores and the rosters that `unitRoster.ts` already writes. The tests
 * pin the two properties that matter clinically:
 *   1. membership edits never drop a unit the member still holds, and
 *   2. no role gains management authority it did not already have.
 */

/* ─── mergeMemberships ────────────────────────────────────────────────────── */

test('mergeMemberships unions, trims and de-duplicates while keeping order', () => {
  assert.deepEqual(
    mergeMemberships([' ccu ', 'icu', 'ccu'], ['icu', ' cath-lab', '', '   ']),
    ['ccu', 'icu', 'cath-lab']
  );
});

test('mergeMemberships treats undefined inputs as empty lists', () => {
  assert.deepEqual(mergeMemberships(undefined, undefined), []);
  assert.deepEqual(mergeMemberships(undefined, ['icu']), ['icu']);
  assert.deepEqual(mergeMemberships(['icu'], undefined), ['icu']);
});

/* ─── addUnitMembership ───────────────────────────────────────────────────── */

test('addUnitMembership returns a new array and keeps every existing unit', () => {
  const current = ['ccu', 'icu'];
  const next = addUnitMembership(current, 'cath-lab');
  assert.deepEqual(next, ['ccu', 'icu', 'cath-lab']);
  assert.deepEqual(current, ['ccu', 'icu'], 'the input array must not be mutated');
  assert.notEqual(next, current, 'a new array must be returned');
});

test('addUnitMembership does not duplicate an existing unit', () => {
  const current = ['ccu', 'icu'];
  const next = addUnitMembership(current, ' icu ');
  assert.deepEqual(next, ['ccu', 'icu']);
  assert.notEqual(next, current);
});

test('addUnitMembership trims the id and rejects a blank one', () => {
  assert.deepEqual(addUnitMembership([], '  ccu  '), ['ccu']);
  assert.throws(() => addUnitMembership(['ccu'], ''), /invalid-unit-id/);
  assert.throws(() => addUnitMembership(['ccu'], '   '), /invalid-unit-id/);
});

/* ─── removeUnitMembership ────────────────────────────────────────────────── */

test('removeUnitMembership removes only the target unit', () => {
  const current = ['ccu', 'icu', 'cath-lab'];
  const next = removeUnitMembership(current, 'icu');
  assert.deepEqual(next, ['ccu', 'cath-lab']);
  assert.deepEqual(current, ['ccu', 'icu', 'cath-lab'], 'the input array must not be mutated');
});

test('removeUnitMembership tolerates an unknown or blank unit', () => {
  assert.deepEqual(removeUnitMembership(['ccu'], 'icu'), ['ccu']);
  const next = removeUnitMembership(['ccu'], '   ');
  assert.deepEqual(next, ['ccu']);
  assert.notEqual(next, undefined);
});

test('removeUnitMembership of the last unit leaves an empty membership', () => {
  assert.deepEqual(removeUnitMembership(['ccu'], 'ccu'), []);
});

/* ─── hasUnitMembership ───────────────────────────────────────────────────── */

test('hasUnitMembership matches trimmed ids only', () => {
  const current = [' ccu ', 'icu'];
  assert.equal(hasUnitMembership(current, 'ccu'), true);
  assert.equal(hasUnitMembership(current, ' icu '), true);
  assert.equal(hasUnitMembership(current, 'cath-lab'), false);
  assert.equal(hasUnitMembership(current, ''), false);
  assert.equal(hasUnitMembership([], 'ccu'), false);
});

/* ─── resolveActiveUnit ───────────────────────────────────────────────────── */

test('resolveActiveUnit keeps the requested unit while it is still held', () => {
  assert.equal(resolveActiveUnit(['ccu', 'icu'], 'icu', 'ccu'), 'icu');
});

test('resolveActiveUnit falls back to the previous unit when the request is gone', () => {
  assert.equal(resolveActiveUnit(['ccu', 'icu'], 'cath-lab', 'ccu'), 'ccu');
  assert.equal(resolveActiveUnit(['ccu', 'icu'], null, 'icu'), 'icu');
});

test('resolveActiveUnit falls back to the first unit, then null when empty', () => {
  assert.equal(resolveActiveUnit(['ccu', 'icu'], 'cath-lab', 'cath-lab'), 'ccu');
  assert.equal(resolveActiveUnit(['ccu'], undefined, undefined), 'ccu');
  assert.equal(resolveActiveUnit([], 'ccu', 'icu'), null);
  assert.equal(resolveActiveUnit([], '', ''), null);
});

/* ─── scopeToUnit ─────────────────────────────────────────────────────────── */

test('scopeToUnit returns exactly the target unit for a member', () => {
  assert.deepEqual(scopeToUnit(['ccu', 'icu'], 'icu'), ['icu']);
  assert.deepEqual(scopeToUnit([' ccu '], 'ccu'), ['ccu']);
});

test('scopeToUnit throws for a unit the member does not hold', () => {
  assert.throws(() => scopeToUnit(['ccu'], 'cath-lab'), /unit-not-a-member/);
  assert.throws(() => scopeToUnit([], 'ccu'), /unit-not-a-member/);
  assert.throws(() => scopeToUnit(['ccu'], '   '), /unit-not-a-member/);
});

/* ─── canManageUnit ───────────────────────────────────────────────────────── */

test('canManageUnit allows the owner for any target unit', () => {
  assert.equal(
    canManageUnit({ role: 'owner', activeUnitId: null, targetUnitId: 'ccu', isMember: false }),
    true
  );
});

test('canManageUnit allows a department admin only in a unit they belong to', () => {
  assert.equal(
    canManageUnit({ role: 'department_admin', activeUnitId: 'ccu', targetUnitId: 'ccu', isMember: true }),
    true
  );
  assert.equal(
    canManageUnit({ role: 'department_admin', activeUnitId: 'ccu', targetUnitId: 'icu', isMember: false }),
    false
  );
  // Being active in the target unit is still not a grant: membership is.
  assert.equal(
    canManageUnit({ role: 'department_admin', activeUnitId: 'icu', targetUnitId: 'icu', isMember: false }),
    false
  );
});

test('canManageUnit denies clinical_editor, view_only and every other role', () => {
  for (const role of [
    'clinical_editor',
    'view_only',
    'consultant',
    'specialist',
    'resident',
    'nurse',
    'viewer',
    'coordinator',
    '',
  ]) {
    assert.equal(
      canManageUnit({ role, activeUnitId: 'ccu', targetUnitId: 'ccu', isMember: true }),
      false,
      `${role || 'empty role'} must never manage a unit`
    );
  }
});

test('canManageUnit requires a target unit', () => {
  assert.equal(
    canManageUnit({ role: 'owner', activeUnitId: 'ccu', targetUnitId: '', isMember: true }),
    false
  );
});

/* ─── summarizeMemberships ────────────────────────────────────────────────── */

test('summarizeMemberships groups by unit and sorts units and members', () => {
  const summary = summarizeMemberships([
    { uid: 'u3', name: 'Zainab', clinicalRole: 'nurse', unitIds: ['icu', 'ccu'] },
    { uid: 'u1', name: 'Ahmed', role: 'clinical_editor', unitIds: ['ccu'] },
    { uid: 'u2', name: 'Mona', clinicalRole: 'resident', unitIds: ['icu'] },
  ]);

  assert.deepEqual(
    summary.map((group) => group.unitId),
    ['ccu', 'icu']
  );
  assert.deepEqual(
    summary[0].members.map((member) => member.uid),
    ['u1', 'u3']
  );
  assert.deepEqual(
    summary[1].members.map((member) => member.uid),
    ['u2', 'u3']
  );
  assert.deepEqual(summary[0].members[0], {
    uid: 'u1',
    name: 'Ahmed',
    role: 'clinical_editor',
    clinicalRole: undefined,
  });
});

test('summarizeMemberships accepts unitId-only, unitIds-only and both', () => {
  const summary = summarizeMemberships([
    { uid: 'legacy', name: 'Legacy', unitId: 'ccu' },
    { uid: 'multi', name: 'Multi', unitIds: ['ccu', 'icu'] },
    { uid: 'both', name: 'Both', unitId: 'cath-lab', unitIds: ['icu'] },
  ]);

  const unitIds = summary.map((group) => group.unitId);
  assert.deepEqual(unitIds, ['cath-lab', 'ccu', 'icu']);

  const byUnit = new Map(summary.map((group) => [group.unitId, group.members.map((m) => m.uid)]));
  assert.deepEqual(byUnit.get('ccu'), ['legacy', 'multi']);
  assert.deepEqual(byUnit.get('icu'), ['both', 'multi']);
  assert.deepEqual(byUnit.get('cath-lab'), ['both']);
});

test('summarizeMemberships skips records without a uid and lists a member once per unit', () => {
  const summary = summarizeMemberships([
    { uid: '', name: 'Ghost', unitIds: ['icu'] },
    { uid: 'u1', name: 'Ahmed', unitIds: ['icu'] },
    { uid: 'u1', name: 'Ahmed duplicate', unitIds: ['icu'] },
    { uid: 'u2', name: '', unitIds: ['icu'] },
  ]);

  assert.equal(summary.length, 1);
  assert.deepEqual(
    summary[0].members.map((member) => member.uid),
    ['u2', 'u1']
  );
  assert.equal(summary[0].members[1].name, 'Ahmed');
  assert.equal(summary[0].members[0].name, undefined, 'blank names stay undefined');
});

test('summarizeMemberships returns an empty list for empty input', () => {
  assert.deepEqual(summarizeMemberships([]), []);
});
