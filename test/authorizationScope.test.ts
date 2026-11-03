import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The dashboard scopes units, beds and patients with the local clinical profile
 * roster. A member who enrolled with a Unit Access Code has a workspace
 * membership but not necessarily a roster on the cached profile, which used to
 * render an empty dashboard (0 units / 0 beds) while the unit census was fully
 * populated. These tests pin the fallback order that fixes that mismatch.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
  get length(): number { return this.map.size; }
}

(globalThis as any).localStorage = new MemoryStorage();

const { scopeUnitIds, storedWorkspaceAccess } = await import('../src/services/unitScope.ts');
const { WORKSPACE_ACCESS_KEY } = await import('../src/services/unitScope.ts');

const grantMembership = (state: Record<string, unknown> = {}) => {
  localStorage.clear();
  localStorage.setItem(WORKSPACE_ACCESS_KEY, JSON.stringify({
    workspaceId: 'ws-1',
    role: 'clinical_editor',
    unitId: 'unit-tamyia-ccu',
    unitName: 'Tamyia CCU',
    unitIds: ['unit-tamyia-ccu', 'unit-tamyia-icu'],
    unitNames: { 'unit-tamyia-ccu': 'Tamyia CCU', 'unit-tamyia-icu': 'Tamyia ICU' },
    ...state,
  }));
};

test('scope falls back to the workspace membership when the roster is empty', () => {
  grantMembership();
  assert.deepEqual(scopeUnitIds([]), ['unit-tamyia-ccu', 'unit-tamyia-icu']);
  assert.deepEqual(scopeUnitIds(undefined), ['unit-tamyia-ccu', 'unit-tamyia-icu']);
});

test('scope falls back to a single unitId membership', () => {
  grantMembership({ unitIds: [], unitId: 'unit-single' });
  assert.deepEqual(scopeUnitIds([]), ['unit-single']);
});

test('scope prefers an explicit roster over the stored membership', () => {
  grantMembership();
  assert.deepEqual(scopeUnitIds(['unit-cath-lab']), ['unit-cath-lab']);
});

test('scope ignores a missing or malformed membership state', () => {
  localStorage.clear();
  assert.deepEqual(scopeUnitIds([]), []);

  localStorage.setItem(WORKSPACE_ACCESS_KEY, '{not valid json');
  assert.deepEqual(scopeUnitIds([]), []);

  localStorage.setItem(WORKSPACE_ACCESS_KEY, JSON.stringify({ role: 'clinical_editor', unitIds: ['unit-x'] }));
  assert.deepEqual(scopeUnitIds([]), [], 'a state without a workspaceId is not a grant');
});

test('scope trims blank roster entries and falls back when only blanks remain', () => {
  grantMembership();
  assert.deepEqual(scopeUnitIds(['unit-cath-lab', '  ', '']), ['unit-cath-lab']);
  assert.deepEqual(scopeUnitIds(['  ', '']), ['unit-tamyia-ccu', 'unit-tamyia-icu']);
});

test('storedWorkspaceAccess only reports a state that names a workspace', () => {
  localStorage.clear();
  assert.equal(storedWorkspaceAccess(), null);

  localStorage.setItem(WORKSPACE_ACCESS_KEY, JSON.stringify({ role: 'owner', unitId: null }));
  assert.equal(storedWorkspaceAccess(), null);

  grantMembership({ role: 'owner' });
  assert.equal(storedWorkspaceAccess()?.role, 'owner');
  assert.equal(storedWorkspaceAccess()?.workspaceId, 'ws-1');
});

test('a membership that lists one unit keeps only that unit in scope', () => {
  grantMembership({ unitIds: ['unit-tamyia-ccu'] });
  assert.deepEqual(scopeUnitIds([]), ['unit-tamyia-ccu']);
});

test('member roster never widens to every unit', () => {
  grantMembership();
  const scope = new Set(scopeUnitIds([]));
  const units = [{ id: 'unit-tamyia-ccu' }, { id: 'unit-other' }];
  assert.deepEqual(units.filter(unit => scope.has(unit.id)).map(unit => unit.id), ['unit-tamyia-ccu']);
});
