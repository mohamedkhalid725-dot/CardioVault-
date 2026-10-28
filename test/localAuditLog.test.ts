import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_STORAGE_KEY,
  appendAuditEvent,
  clearAuditLog,
  listAuditEvents,
  markSynced,
  pendingUnsynced,
  writeRemoteWithAudit,
} from '../src/services/localAuditLog.ts';

const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);

const makeStorage = (initial: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    storage: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
};

const makeFailingStorage = () => {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: (key: string) => void store.delete(key),
    },
  };
};

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: 'preview-local-workspace',
  unitId: 'unit-ccu-1',
  actorUid: 'preview-doctor-uid',
  actorName: 'Dr. Local Preview',
  action: 'waiting.created',
  entityType: 'waiting-entry',
  entityId: 'wait-1',
  result: 'success' as const,
  summary: 'Waiting entry created',
  nowMs: NOW,
  ...overrides,
});

test('rejects an event without the mandatory ids', () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  assert.throws(() => appendAuditEvent(baseInput({ unitId: '   ' }), storage), /invalid-audit-event/);
  assert.throws(() => appendAuditEvent(baseInput({ result: 'maybe' as any }), storage), /invalid-audit-event/);
});

test('trims the summary and keeps normal meta', () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  const { event, persisted, metaStripped } = appendAuditEvent(
    baseInput({ summary: 'x'.repeat(400), meta: { bed: 'B-12', urgent: true, count: 2 } }),
    storage,
  );
  assert.equal(persisted, true);
  assert.equal(event.summary.length, 200);
  assert.deepEqual(event.meta, { bed: 'B-12', urgent: true, count: 2 });
  assert.deepEqual(metaStripped, []);
});

test('strips forbidden meta keys and nested values instead of persisting them', () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  const { event, metaStripped } = appendAuditEvent(
    baseInput({
      meta: { patientId: 'p-1', apiToken: 'abc', password: 'x', cardNumber: '4111', nested: { a: 1 } },
    }),
    storage,
  );
  assert.deepEqual(event.meta, { patientId: 'p-1' });
  assert.deepEqual(metaStripped.sort(), ['apiToken', 'cardNumber', 'nested', 'password'].sort());
});

test('a storage failure is reported and the event stays visible in memory', () => {
  const { storage } = makeFailingStorage();
  clearAuditLog(storage);
  const first = appendAuditEvent(baseInput({ entityId: 'wait-1' }), storage);
  assert.equal(first.persisted, false);

  const visible = listAuditEvents({ unitId: 'unit-ccu-1' }, storage);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, first.event.id);
});

test('events held in memory are written once a working storage returns', () => {
  const failing = makeFailingStorage();
  clearAuditLog(failing.storage);
  appendAuditEvent(baseInput({ entityId: 'wait-a' }), failing.storage);

  const working = makeStorage();
  const second = appendAuditEvent(baseInput({ entityId: 'wait-b', nowMs: NOW + 1000 }), working.storage);
  assert.equal(second.persisted, true);
  const stored = JSON.parse(working.store.get(AUDIT_STORAGE_KEY) as string);
  assert.equal(stored.length, 2);
});

test('a successful remote write is not duplicated locally', async () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  const result = await writeRemoteWithAudit(baseInput(), async () => undefined, storage);
  assert.equal(result.remotePersisted, true);
  assert.equal(result.event.unsynced, false);
  assert.deepEqual(listAuditEvents({}, storage), []);
});

test('a failed remote write is never swallowed and is labelled unsynced', async () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  const result = await writeRemoteWithAudit(baseInput(), async () => {
    throw new Error('permission-denied');
  }, storage);

  assert.equal(result.remotePersisted, false);
  assert.match(String(result.error), /permission-denied/);
  assert.equal(result.event.unsynced, true);

  const local = pendingUnsynced(storage);
  assert.equal(local.length, 1);
  assert.equal(local[0].id, result.event.id);
  assert.equal(listAuditEvents({}, storage).length, 1);
});

test('list filters, sorts newest-first and honours the limit', () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  appendAuditEvent(baseInput({ entityId: 'a', nowMs: NOW }), storage);
  appendAuditEvent(baseInput({ entityId: 'b', nowMs: NOW + 5000 }), storage);
  appendAuditEvent(baseInput({ entityId: 'c', nowMs: NOW + 9000, actorUid: 'other-uid' }), storage);

  assert.deepEqual(
    listAuditEvents({}, storage).map((event) => event.entityId),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    listAuditEvents({ actorUid: 'preview-doctor-uid' }, storage).map((event) => event.entityId),
    ['b', 'a'],
  );
  assert.equal(listAuditEvents({ limit: 1 }, storage).length, 1);
  assert.equal(listAuditEvents({ limit: 0 }, storage).length, 0);
  clearAuditLog(storage);
});

test('markSynced flips only the unsynced flag and keeps history', async () => {
  const { storage } = makeStorage();
  clearAuditLog(storage);
  const failed = await writeRemoteWithAudit(baseInput({ entityId: 'a' }), async () => {
    throw new Error('offline');
  }, storage);
  const local = appendAuditEvent(baseInput({ entityId: 'b', nowMs: NOW + 1 }), storage).event;

  const { updated, persisted } = markSynced([failed.event.id, 'unknown'], storage);
  assert.equal(updated, 1);
  assert.equal(persisted, true);
  const events = listAuditEvents({}, storage);
  assert.equal(events.length, 2);
  assert.equal(events.find((event) => event.id === failed.event.id)?.unsynced, false);
  assert.equal(events.find((event) => event.id === local.id)?.unsynced, undefined);
  clearAuditLog(storage);
});

test('corrupt stored JSON reads as an empty log', () => {
  const { storage } = makeStorage({ [AUDIT_STORAGE_KEY]: '{broken' });
  clearAuditLog(storage);
  storage.setItem(AUDIT_STORAGE_KEY, '{broken');
  assert.deepEqual(listAuditEvents({}, storage), []);
  const appended = appendAuditEvent(baseInput(), storage);
  assert.equal(appended.persisted, true);
  assert.equal(listAuditEvents({}, storage).length, 1);
  clearAuditLog(storage);
});
