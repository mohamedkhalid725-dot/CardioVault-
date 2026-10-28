// Owner dashboard visibility preference (Fix 3).
//
// The preference is a single Firestore document per platform owner. These tests
// pin the three things that make it safe:
//   1. only the owner account path is ever addressed,
//   2. the write is the caller's FULL list (so un-hiding removes an entry) and
//      never touches anything except `ownerPreferences/{uid}`,
//   3. every failure is returned, never thrown, so the dashboard can keep the
//      device list and say out loud that it did not sync.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HIDDEN_UNITS,
  OWNER_PREFERENCES_SCHEMA_VERSION,
  describeVisibilitySync,
  loadOwnerUnitVisibility,
  normalizeHiddenUnitIds,
  ownerPreferencePath,
  parseUnitVisibilityDoc,
  saveOwnerUnitVisibility,
  type OwnerPreferenceIo,
} from '../src/services/ownerPreferences.ts';

const UID = 'uid-owner-1';
const OTHER_UID = 'uid-owner-2';
const isOwner = async () => true;
const isNotOwner = async () => false;

const fakeIo = (seed: Record<string, Record<string, any>> = {}) => {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed));
  const writes: Array<{ path: string; data: Record<string, any>; merge: boolean }> = [];
  let failRead = false;
  let failWrite = false;
  const io: OwnerPreferenceIo = {
    getDoc: async (path) => {
      if (failRead) throw new Error('permission-denied');
      return docs.has(path) ? docs.get(path) || null : null;
    },
    setDoc: async (path, data, merge) => {
      if (failWrite) throw new Error('permission-denied');
      writes.push({ path, data, merge });
      docs.set(path, merge ? { ...(docs.get(path) || {}), ...data } : { ...data });
    },
  };
  return {
    io,
    docs,
    writes,
    failRead: () => (failRead = true),
    failWrite: () => (failWrite = true),
  };
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('the document path is scoped to the owner uid and to nothing else', () => {
  assert.equal(ownerPreferencePath(UID), `ownerPreferences/${UID}`);
  assert.equal(ownerPreferencePath(OTHER_UID), `ownerPreferences/${OTHER_UID}`);
  assert.equal(ownerPreferencePath('  uid spaced  '), 'ownerPreferences/uid spaced');
});

test('normalizeHiddenUnitIds trims, drops non-strings, de-duplicates and caps', () => {
  assert.deepEqual(normalizeHiddenUnitIds([' unit-a ', 'unit-a', '', null, 7, 'unit-b']), [
    'unit-a',
    'unit-b',
  ]);
  assert.deepEqual(normalizeHiddenUnitIds(undefined), []);
  assert.deepEqual(normalizeHiddenUnitIds('unit-a'), []);

  const many = Array.from({ length: MAX_HIDDEN_UNITS + 25 }, (_, index) => `unit-${index}`);
  assert.equal(normalizeHiddenUnitIds(many).length, MAX_HIDDEN_UNITS);
});

test('parseUnitVisibilityDoc ignores a malformed document instead of wiping the list', () => {
  assert.equal(parseUnitVisibilityDoc(null), null);
  assert.equal(parseUnitVisibilityDoc({}), null);
  assert.equal(parseUnitVisibilityDoc({ hiddenUnitIds: 'unit-a' }), null);
  assert.deepEqual(parseUnitVisibilityDoc({ hiddenUnitIds: [] }), []);
  assert.deepEqual(parseUnitVisibilityDoc({ hiddenUnitIds: ['unit-a', 'unit-a'] }), ['unit-a']);
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

test('loadOwnerUnitVisibility reads the owner document', async () => {
  const { io } = fakeIo({ [ownerPreferencePath(UID)]: { hiddenUnitIds: ['unit-ccu-2'] } });
  const result = await loadOwnerUnitVisibility({ io, uid: UID, isOwner });
  assert.equal(result.ok, true);
  assert.equal(result.synced, true);
  assert.deepEqual(result.hiddenUnitIds, ['unit-ccu-2']);
});

test('loadOwnerUnitVisibility reports "not synced" when the owner has no document yet', async () => {
  const { io } = fakeIo();
  const result = await loadOwnerUnitVisibility({ io, uid: UID, isOwner });
  assert.equal(result.ok, true);
  assert.equal(result.synced, false);
  assert.deepEqual(result.hiddenUnitIds, []);
});

test('loadOwnerUnitVisibility refuses a non-owner without touching Firestore', async () => {
  const { io, writes, docs } = fakeIo({ [ownerPreferencePath(UID)]: { hiddenUnitIds: ['x'] } });
  const result = await loadOwnerUnitVisibility({ io, uid: UID, isOwner: isNotOwner });
  assert.equal(result.ok, false);
  assert.equal(result.synced, false);
  assert.equal(result.reason, 'not-owner');
  assert.deepEqual(result.hiddenUnitIds, [], 'the caller must keep its device list');
  assert.equal(writes.length, 0);
  assert.equal(docs.size, 1);
});

test('loadOwnerUnitVisibility needs an account', async () => {
  const { io } = fakeIo();
  const result = await loadOwnerUnitVisibility({ io, uid: '', isOwner });
  assert.equal(result.reason, 'no-account');
});

test('loadOwnerUnitVisibility returns a reason instead of throwing when the read is denied', async () => {
  const { io, failRead } = fakeIo();
  failRead();
  const result = await loadOwnerUnitVisibility({ io, uid: UID, isOwner });
  assert.equal(result.ok, false);
  assert.equal(result.synced, false);
  assert.equal(result.reason, 'read-failed');
  assert.deepEqual(result.hiddenUnitIds, []);
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

test('saveOwnerUnitVisibility writes the full current list, so un-hiding works', async () => {
  const { io, writes, docs } = fakeIo({
    [ownerPreferencePath(UID)]: { hiddenUnitIds: ['unit-a', 'unit-b'] },
  });
  const result = await saveOwnerUnitVisibility(['unit-b'], { io, uid: UID, isOwner });
  assert.equal(result.ok, true);
  assert.equal(result.synced, true);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, ownerPreferencePath(UID));
  assert.equal(writes[0].merge, true);
  assert.deepEqual(writes[0].data.hiddenUnitIds, ['unit-b'], 'last write wins, no union');
  assert.equal(writes[0].data.schemaVersion, OWNER_PREFERENCES_SCHEMA_VERSION);
  assert.equal(typeof writes[0].data.updatedAtMs, 'number');
  assert.deepEqual(docs.get(ownerPreferencePath(UID))?.hiddenUnitIds, ['unit-b']);
});

test('saveOwnerUnitVisibility refuses a non-owner and writes nothing', async () => {
  const { io, writes } = fakeIo();
  const result = await saveOwnerUnitVisibility(['unit-a'], { io, uid: UID, isOwner: isNotOwner });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-owner');
  assert.equal(writes.length, 0);
});

test('saveOwnerUnitVisibility needs an account', async () => {
  const { io, writes } = fakeIo();
  const result = await saveOwnerUnitVisibility(['unit-a'], { io, uid: '', isOwner });
  assert.equal(result.reason, 'no-account');
  assert.equal(writes.length, 0);
});

test('saveOwnerUnitVisibility returns write-failed instead of throwing', async () => {
  const { io, failWrite } = fakeIo();
  failWrite();
  const result = await saveOwnerUnitVisibility(['unit-a'], { io, uid: UID, isOwner });
  assert.equal(result.ok, false);
  assert.equal(result.synced, false);
  assert.equal(result.reason, 'write-failed');
});

test('a saved list can never grow past the cap', async () => {
  const { io, writes } = fakeIo();
  const many = Array.from({ length: MAX_HIDDEN_UNITS + 40 }, (_, index) => `unit-${index}`);
  await saveOwnerUnitVisibility(many, { io, uid: UID, isOwner });
  assert.equal(writes[0].data.hiddenUnitIds.length, MAX_HIDDEN_UNITS);
});

// ---------------------------------------------------------------------------
// Honest wording
// ---------------------------------------------------------------------------

test('describeVisibilitySync never claims a cloud sync that did not happen', () => {
  const notOwner = describeVisibilitySync('not-owner');
  assert.match(notOwner, /this device/i);

  const readFailed = describeVisibilitySync('read-failed');
  assert.match(readFailed, /could not be read/i);
  assert.match(readFailed, /device copy/i);

  const writeFailed = describeVisibilitySync('write-failed');
  assert.match(writeFailed, /could not reach/i);
  assert.match(writeFailed, /this device only/i);

  const disabled = describeVisibilitySync('cloud-disabled');
  assert.match(disabled, /this device only/i);

  const unknown = describeVisibilitySync(undefined);
  assert.match(unknown, /this device/i);
});
