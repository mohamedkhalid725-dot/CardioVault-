import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The sync planner decides what a single upload must send. These tests pin the
 * properties that keep the Firestore Spark quota intact: a no-op save uploads
 * nothing, a single edit uploads one document, scope is honoured, and deletions
 * happen only for explicit tombstones (never because a document is missing).
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

const { computeSyncPlan, chunkOperations, hashRecord, recordKey } = await import('../src/services/clinicalSyncPlan.ts');
const store = await import('../src/services/clinicalSyncStore.ts');

const ws = 'ws-1';
const scopeAll = () => true;

const baseInput = (): any => ({
  workspaceId: ws,
  manifest: null,
  units: [{ id: 'unit-a', name: 'CCU' }],
  beds: [{ id: 'bed-1', unitId: 'unit-a', bedNumber: '1' }],
  patients: [{ id: 'pat-1', unitId: 'unit-a', fullName: 'Patient A' }],
  scope: scopeAll,
});

test('hashRecord ignores key order and changes with content', () => {
  assert.equal(hashRecord({ a: 1, b: [2, 3] }), hashRecord({ b: [2, 3], a: 1 }));
  assert.notEqual(hashRecord({ a: 1 }), hashRecord({ a: 2 }));
  assert.equal(hashRecord({ nested: { x: [{ y: 1 }] } }), hashRecord({ nested: { x: [{ y: 1 }] } }));
});

test('first run uploads everything that is in scope', () => {
  const plan = computeSyncPlan(baseInput());
  assert.deepEqual(plan.writes.map(op => recordKey(op.collection, op.id)).sort(), ['beds/bed-1', 'patients/pat-1', 'units/unit-a']);
  assert.equal(plan.deletes.length, 0);
  assert.equal(Object.keys(plan.nextManifest.docs).length, 3);
});

test('a re-run with the same data uploads nothing', () => {
  const first = computeSyncPlan(baseInput());
  const second = computeSyncPlan({ ...baseInput(), manifest: first.nextManifest });
  assert.equal(second.writes.length, 0);
  assert.equal(second.unchanged, 3);
});

test('editing one patient uploads exactly that document', () => {
  const first = computeSyncPlan(baseInput());
  const input = baseInput();
  input.patients = [{ id: 'pat-1', unitId: 'unit-a', fullName: 'Patient A', status: 'Critical' }];
  const plan = computeSyncPlan({ ...input, manifest: first.nextManifest });
  assert.deepEqual(plan.writes.map(op => recordKey(op.collection, op.id)), ['patients/pat-1']);
});

test('a new family of 100 documents does not re-upload the untouched 100', () => {
  const patients = Array.from({ length: 100 }, (_, index) => ({ id: `p-${index}`, unitId: 'unit-a', note: 'stable' }));
  const first = computeSyncPlan({ ...baseInput(), patients });
  assert.equal(first.writes.filter(op => op.collection === 'patients').length, 100);
  const changed = patients.map((patient, index) => index === 7 ? { ...patient, note: 'edited' } : patient);
  const plan = computeSyncPlan({ ...baseInput(), patients: changed, manifest: first.nextManifest });
  assert.deepEqual(plan.writes.map(op => recordKey(op.collection, op.id)), ['patients/p-7']);
});

test('out-of-scope records are neither uploaded nor deleted', () => {
  const input = baseInput();
  input.scope = (collection, record) => collection !== 'patients' || record.unitId === 'unit-a';
  input.patients = [{ id: 'pat-1', unitId: 'unit-a' }, { id: 'pat-2', unitId: 'unit-b' }];
  const first = computeSyncPlan(input);
  assert.deepEqual(first.writes.map(op => op.id).sort(), ['bed-1', 'pat-1', 'unit-a']);
  const second = computeSyncPlan({ ...input, manifest: first.nextManifest });
  assert.equal(second.writes.length, 0);
  assert.equal(second.deletes.length, 0);
});

test('tombstones delete only the named document and leave the rest alone', () => {
  const first = computeSyncPlan(baseInput());
  const input = baseInput();
  input.patients = [];
  const plan = computeSyncPlan({
    ...input,
    manifest: first.nextManifest,
    tombstones: [{ collection: 'patients', id: 'pat-1' }],
  });
  assert.deepEqual(plan.deletes, [{ collection: 'patients', id: 'pat-1' }]);
  assert.equal(plan.writes.length, 0);
  assert.equal(plan.nextManifest.docs['patients/pat-1'], undefined);
  assert.ok(plan.nextManifest.docs['units/unit-a']);
});

test('a live record wins over a stale tombstone', () => {
  const first = computeSyncPlan(baseInput());
  const plan = computeSyncPlan({
    ...baseInput(),
    manifest: first.nextManifest,
    tombstones: [{ collection: 'patients', id: 'pat-1' }],
  });
  assert.equal(plan.deletes.length, 0, 'the document still exists locally, so it must not be deleted');
});

test('documents missing locally are never treated as deletions', () => {
  const first = computeSyncPlan(baseInput());
  const plan = computeSyncPlan({
    ...baseInput(),
    patients: [],
    manifest: first.nextManifest,
  });
  assert.equal(plan.deletes.length, 0);
  assert.ok(plan.nextManifest.docs['patients/pat-1'], 'the previous fingerprint is retained');
});

test('chunkOperations splits at the batch limit', () => {
  const items = Array.from({ length: 950 }, (_, index) => index);
  const chunks = chunkOperations(items, 400);
  assert.deepEqual(chunks.map(chunk => chunk.length), [400, 400, 150]);
  assert.deepEqual(chunkOperations([], 400), []);
});

test('classifySyncError distinguishes quota, permission and network failures', () => {
  assert.equal(store.classifySyncError({ code: 'resource-exhausted', message: 'Quota exceeded' }), 'quota');
  assert.equal(store.classifySyncError({ code: 'permission-denied', message: 'Missing or insufficient permissions' }), 'permission');
  assert.equal(store.classifySyncError(new Error('Cloud sync operation timed out.')), 'deadline');
  assert.equal(store.classifySyncError({ code: 'unavailable' }), 'unreachable');
  assert.equal(store.classifySyncError({ code: 'unauthenticated' }), 'auth');
  assert.equal(store.classifySyncError(new Error('something odd')), 'unknown');
});

test('manifest and tombstones survive a reload', () => {
  localStorage.clear();
  const plan = computeSyncPlan(baseInput());
  store.saveManifest(plan.nextManifest);
  assert.deepEqual(store.loadManifest(ws), plan.nextManifest);
  store.enqueueDeletion({ collection: 'beds', id: 'bed-1' });
  store.enqueueDeletion({ collection: 'beds', id: 'bed-1' });
  assert.deepEqual(store.peekDeletions(), [{ collection: 'beds', id: 'bed-1' }]);
  store.removeDeletions([{ collection: 'beds', id: 'bed-1' }]);
  assert.deepEqual(store.peekDeletions(), []);
});

test('a later success keeps the last failure visible until dismissed', () => {
  localStorage.clear();
  store.recordCloudFailure({ code: 'resource-exhausted', message: 'Quota exceeded' });
  store.recordCloudSuccess(ws);
  const health = store.getCloudHealth();
  assert.equal(health.lastErrorKind, 'quota');
  assert.ok(health.lastErrorAt);
  assert.ok(health.lastErrorDetail.includes('Quota'));
  assert.ok(health.lastSyncAt);
  store.dismissCloudError();
  assert.equal(store.getCloudHealth().lastErrorKind, 'none');
});

test('quota cooldown blocks automatic syncs until it expires', () => {
  localStorage.clear();
  store.setQuotaCooldown(60_000, 1_000);
  assert.equal(store.isQuotaCoolingDown(30_000), true);
  assert.equal(store.isQuotaCoolingDown(61_000), false);
  store.clearQuotaCooldown();
  assert.equal(store.isQuotaCoolingDown(30_000), false);
});

test('health reports pending lifecycle events from the admission queue', () => {
  localStorage.clear();
  localStorage.setItem(store.PENDING_LIFECYCLE_KEY, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  assert.equal(store.pendingLifecycleCount(), 2);
  assert.equal(store.getCloudHealth().pendingLifecycle, 2);
});
