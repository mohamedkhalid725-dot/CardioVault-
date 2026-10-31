// First-run onboarding: a brand-new account files its subscription request
// BEFORE it owns any membership.
//
// The Firebase Emulator is not available in this environment, so the rules
// themselves cannot be executed here. What is exercised instead is the exact
// document the client writes, plus every failure path around it:
//
//   * the request carries an EMPTY unitIds list (a draft is a plan, not access);
//   * the workspace, the request and the owner index are all deterministic from
//     the uid, so a retry after a network failure repeats the same writes;
//   * an existing request is never overwritten (a second write would be an
//     update the rules deny, and could erase an approved status or codes);
//   * a read failure never falls through to a blind create;
//   * the owner panel learns WHICH workspace each request belongs to, because
//     that is where the decision has to be published.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCloudRequestDoc,
  buildOnboardingIndexDoc,
  buildOnboardingWorkspaceDoc,
  cloudIndexPath,
  cloudOnboardingIndexPath,
  cloudRequestPath,
  loadOnboardingQueueFromCloud,
  loadOnboardingStatus,
  onboardingRequestId,
  onboardingWorkspaceId,
  pushOwnerDecision,
  submitOnboardingRequest,
  type SubscriptionCloudIo,
} from '../src/services/subscriptionRequestCloud.ts';
import { loadCodes, loadRequests, submitRequest, type SubscriptionStorage } from '../src/services/subscriptionRequests.ts';
import type { SubscriptionRequest } from '../src/types/clinicArea';

const UID = 'new-doctor-uid-0001';
const OTHER_UID = 'second-doctor-uid-02';
const NOW = 1_760_000_000_000;

const WS = onboardingWorkspaceId(UID);
const REQ = onboardingRequestId(UID);

const memoryStorage = (): SubscriptionStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
};

interface FakeIoOptions {
  seed?: Record<string, Record<string, any>>;
  failWritesFor?: (path: string) => boolean;
  failReadsFor?: (path: string) => boolean;
}

/** The three Firestore calls the module needs, with injectable failures. */
const fakeIo = (options: FakeIoOptions = {}) => {
  const docs = new Map<string, Record<string, any>>(Object.entries(options.seed || {}));
  const writes: Array<{ path: string; data: Record<string, any>; merge: boolean }> = [];
  const reads: string[] = [];
  const io: SubscriptionCloudIo = {
    getDoc: async (path) => {
      reads.push(path);
      if (options.failReadsFor?.(path)) throw new Error('permission-denied');
      return docs.has(path) ? docs.get(path) || null : null;
    },
    setDoc: async (path, data, merge) => {
      if (options.failWritesFor?.(path)) throw new Error('unavailable');
      writes.push({ path, data, merge });
      docs.set(path, merge ? { ...(docs.get(path) || {}), ...data } : { ...data });
    },
    listDocs: async (path) => {
      const prefix = `${path}/`;
      return [...docs.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, data]) => ({ id: key.slice(prefix.length), data }));
    },
  };
  return { io, docs, writes, reads };
};

const departmentRequest = (overrides: Partial<Parameters<typeof submitRequest>[0]> = {}) =>
  submitRequest(
    {
      id: REQ,
      phone: '01012345678',
      requestType: 'department',
      institutionName: 'Nile CCU',
      unitDrafts: [
        { id: 'unit-ccu-1', name: 'CCU', typeLabel: 'CCU', beds: 8, receivesOperations: true },
        { id: 'unit-ward-2', name: 'Ward', typeLabel: 'Ward', beds: 12, receivesOperations: false },
      ],
      chosenPaymentMethod: 'instapay',
      actorUid: UID,
      actorName: 'Dr. New',
      actorEmail: 'New@Clinic.Local',
      nowMs: NOW,
      ...overrides,
    },
    memoryStorage(),
  ).request;

const clinicOnlyRequest = (overrides: Partial<Parameters<typeof submitRequest>[0]> = {}) =>
  submitRequest(
    {
      id: REQ,
      phone: '01012345678',
      requestType: 'clinic',
      institutionName: 'Nile Clinic',
      unitDrafts: [],
      doctorsCount: 3,
      chosenPaymentMethod: 'visa',
      actorUid: UID,
      actorName: 'Dr. New',
      nowMs: NOW,
      ...overrides,
    },
    memoryStorage(),
  ).request;

/** Mirrors the onboarding predicates of the (unexecutable) security rules. */
const satisfiesOnboardingBranch = (doc: Record<string, any>, uid: string): boolean =>
  doc.workspaceId === onboardingWorkspaceId(uid) &&
  doc.subscriberId === uid &&
  doc.createdBy === uid &&
  doc.status === 'pending' &&
  ['instapay', 'visa'].includes(doc.method) &&
  doc.amount > 0 &&
  doc.paymentVerified === false &&
  Array.isArray(doc.unitIds) &&
  doc.unitIds.length === 0 &&
  ['department', 'clinic', 'both'].includes(doc.requestType) &&
  Array.isArray(doc.unitDrafts) &&
  doc.unitDrafts.length <= 50 &&
  doc.unitDrafts.length >= (doc.requestType === 'clinic' ? 0 : 1);

// ---------------------------------------------------------------------------
// 1. A brand-new account
// ---------------------------------------------------------------------------

test('a new account creates its own workspace, its request and the owner index', async () => {
  const { io, docs } = fakeIo();
  const result = await submitOnboardingRequest(departmentRequest(), {
    io,
    uid: UID,
    email: 'New@Clinic.Local',
    name: 'Dr. New',
    workspaceName: 'Nile CCU',
    nowMs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivered, true);
  assert.equal(result.indexed, true);
  assert.equal(result.created, true);
  assert.equal(result.workspaceId, WS);
  assert.equal(result.requestId, REQ);

  // Own workspace, created by this account, with no owner claim at all.
  const workspace = docs.get(`workspaces/${WS}`);
  assert.ok(workspace, 'the account must bootstrap its own workspace');
  assert.equal(workspace?.createdBy, UID);
  assert.equal('ownerUid' in (workspace || {}), false);
  assert.equal('ownerEmail' in (workspace || {}), false);

  // The request document is the onboarding shape: no unit claim, pending.
  const request = docs.get(cloudRequestPath(WS, REQ));
  assert.ok(request);
  assert.equal(satisfiesOnboardingBranch(request as Record<string, any>, UID), true);
  assert.deepEqual(request?.unitIds, [], 'unit drafts are a plan, never access');
  assert.equal(request?.unitDrafts.length, 2, 'the plan itself is carried for the owner');
  assert.equal(request?.paymentVerified, false);
  assert.equal(request?.onboarding, true);

  // Owner discovery, carrying no clinical or payment data.
  const index = docs.get(cloudOnboardingIndexPath(UID));
  assert.ok(index);
  assert.equal(index?.workspaceId, WS);
  assert.equal(index?.requestId, REQ);
  assert.equal(typeof index?.submittedAtMs, 'number');
  assert.equal('codes' in (index || {}), false);
  assert.equal('phone' in (index || {}), false);

  // The account's private request index is written too, so its own device can
  // read the decision back later.
  const own = docs.get(cloudIndexPath(UID));
  assert.deepEqual(own?.requestIds, [REQ]);
  assert.equal(own?.workspaceId, WS);
});

// ---------------------------------------------------------------------------
// 2. Clinic-only request without any membership
// ---------------------------------------------------------------------------

test('a clinic-only request is filed with no unit and no membership', async () => {
  const { io, docs } = fakeIo();
  const request = clinicOnlyRequest();
  const result = await submitOnboardingRequest(request, { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, true);
  const doc = docs.get(cloudRequestPath(WS, REQ)) as Record<string, any>;
  assert.equal(satisfiesOnboardingBranch(doc, UID), true);
  assert.deepEqual(doc.unitIds, []);
  assert.equal(doc.requestType, 'clinic');
  assert.equal(doc.doctorsCount, 3);
  // Visa price is USD 20 per doctor per 30 days.
  assert.equal(doc.currency, 'USD');
  assert.equal(doc.amount, 60);
});

test('a department request without a drafted unit is refused before anything is written', async () => {
  const { io, writes } = fakeIo();
  const broken = { ...departmentRequest(), unitDrafts: [] } as SubscriptionRequest;
  const result = await submitOnboardingRequest(broken, { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'units-required');
  assert.deepEqual(writes, [], 'a refused request must not create a workspace either');
});

test('a clinic request needs a real doctor count', async () => {
  const { io, writes } = fakeIo();
  const broken = { ...clinicOnlyRequest(), doctorsCount: 0 } as SubscriptionRequest;
  const result = await submitOnboardingRequest(broken, { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'doctors-count-invalid');
  assert.deepEqual(writes, []);
});

// ---------------------------------------------------------------------------
// 3. The client can never claim access, verification or a decision
// ---------------------------------------------------------------------------

test('the onboarding document never claims a unit, a payment or a status', () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WS, subscriberId: UID, onboarding: true });
  assert.equal(built.ok, true);
  const doc = built.data as Record<string, any>;

  assert.deepEqual(doc.unitIds, [], 'drafted unit ids are never sent as access');
  assert.deepEqual(built.unitIds, []);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.paymentVerified, false);
  assert.equal(doc.workspaceId, WS);
  assert.equal(doc.subscriberId, UID);
  assert.equal(doc.createdBy, UID);
});

test('a request that claims payment verification is refused', () => {
  const forged = { ...departmentRequest(), paymentVerifiedAtMs: NOW } as SubscriptionRequest;
  const built = buildCloudRequestDoc(forged, { workspaceId: WS, subscriberId: UID, onboarding: true });
  assert.equal(built.ok, false);
  assert.equal(built.reason, 'already-verified');
});

test('a request filed for somebody else is refused', () => {
  const stolen = { ...departmentRequest(), createdBy: OTHER_UID } as SubscriptionRequest;
  const built = buildCloudRequestDoc(stolen, { workspaceId: WS, subscriberId: UID, onboarding: true });
  assert.equal(built.ok, false);
  assert.equal(built.reason, 'subscriber-mismatch');
});

test('the discovery index carries no clinical, payment or code data', () => {
  const doc = buildOnboardingIndexDoc(
    { workspaceId: WS, requestId: REQ, institutionName: 'Nile CCU', subscriberName: 'Dr. New', submittedAtMs: NOW },
    NOW,
  );
  assert.deepEqual(Object.keys(doc).sort(), [
    'institutionName',
    'requestId',
    'schemaVersion',
    'submittedAtMs',
    'subscriberName',
    'updatedAtMs',
    'workspaceId',
  ]);
});

test('the onboarding workspace document claims no owner', () => {
  const doc = buildOnboardingWorkspaceDoc(UID, 'New@Clinic.Local', 'Nile CCU', NOW);
  assert.equal(doc.createdBy, UID);
  assert.equal('ownerUid' in doc, false);
  assert.equal('ownerEmail' in doc, false);
  assert.equal(doc.onboarding, true);
});

// ---------------------------------------------------------------------------
// 4. Retry after a network failure
// ---------------------------------------------------------------------------

test('a failed request write reports the failure and a retry creates exactly one request', async () => {
  const options = { failWritesFor: (path: string) => path.includes('/subscriptionRequests/') };
  const { io, docs, writes } = fakeIo(options);

  const first = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });
  assert.equal(first.ok, false);
  assert.equal(first.delivered, false);
  assert.equal(first.indexed, false);
  assert.equal(first.reason, 'write-failed');
  assert.equal(docs.has(cloudOnboardingIndexPath(UID)), false, 'the owner is never pointed at a missing request');

  // The workspace survived the failure, which is fine: it is idempotent.
  assert.ok(docs.get(`workspaces/${WS}`));

  options.failWritesFor = () => false;
  const second = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW + 1000 });
  assert.equal(second.ok, true);
  assert.equal(second.created, true);
  assert.equal(second.indexed, true);

  const requestWrites = writes.filter((entry) => entry.path === cloudRequestPath(WS, REQ));
  assert.equal(requestWrites.length, 1, 'a retry never writes the request twice');
  assert.ok(docs.get(cloudOnboardingIndexPath(UID)));
});

test('a failed owner index is reported as delivered-but-not-indexed', async () => {
  const { io, docs } = fakeIo({ failWritesFor: (path: string) => path.startsWith('onboardingIndex/') });
  const result = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.delivered, true);
  assert.equal(result.indexed, false);
  assert.equal(result.reason, 'index-failed');
  assert.ok(docs.get(cloudRequestPath(WS, REQ)), 'the request itself must be kept');
});

test('a retry after a partial success reuses the existing request and does not overwrite it', async () => {
  const { io, docs, writes } = fakeIo();
  const first = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });
  assert.equal(first.ok, true);
  const before = { ...(docs.get(cloudRequestPath(WS, REQ)) as Record<string, any>) };

  const second = await submitOnboardingRequest(
    departmentRequest({ institutionName: 'A Different Name', nowMs: NOW + 5000 }),
    { io, uid: UID, nowMs: NOW + 5000 },
  );

  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(second.status, 'pending');
  const after = docs.get(cloudRequestPath(WS, REQ)) as Record<string, any>;
  assert.equal(after.institutionName, before.institutionName, 'an existing request is never rewritten');
  assert.equal(after.submittedAtMs, before.submittedAtMs);
  assert.equal(writes.filter((entry) => entry.path === cloudRequestPath(WS, REQ)).length, 1);
});

test('a request that is already approved keeps its status and is never reset by a retry', async () => {
  const approved = { ...(buildCloudRequestDoc(departmentRequest(), {
    workspaceId: WS,
    subscriberId: UID,
    onboarding: true,
  }).data as Record<string, any>), status: 'approved', paymentVerified: true };
  const { io, docs } = fakeIo({ seed: { [`workspaces/${WS}`]: { createdBy: UID }, [cloudRequestPath(WS, REQ)]: approved } });

  const result = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW + 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.status, 'approved');
  assert.equal((docs.get(cloudRequestPath(WS, REQ)) || {}).status, 'approved');
});

test('a read failure never falls through to a blind create', async () => {
  const { io, writes } = fakeIo({ failReadsFor: (path: string) => path === `workspaces/${WS}` });
  const result = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'read-failed');
  assert.deepEqual(writes, [], 'nothing may be created when the read failed');
});

test('a workspace owned by another account is refused instead of reused', async () => {
  const { io, writes } = fakeIo({ seed: { [`workspaces/${WS}`]: { createdBy: OTHER_UID } } });
  const result = await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'workspace-conflict');
  assert.deepEqual(writes, []);
});

// ---------------------------------------------------------------------------
// 5. The owner sees it, and the decision goes back to the right workspace
// ---------------------------------------------------------------------------

test('the owner queue maps every onboarding request to its own workspace', async () => {
  const first = await (async () => {
    const { io, docs } = fakeIo();
    await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });
    return docs;
  })();
  const second = await (async () => {
    const { io, docs } = fakeIo();
    await submitOnboardingRequest(clinicOnlyRequest({ actorUid: OTHER_UID }), { io, uid: OTHER_UID, nowMs: NOW + 10 });
    return docs;
  })();

  const seed: Record<string, Record<string, any>> = {};
  for (const docs of [first, second]) {
    for (const [path, data] of docs.entries()) seed[path] = data;
  }

  const { io } = fakeIo({ seed });
  const storage = memoryStorage();
  const queue = await loadOnboardingQueueFromCloud({ io, storage });

  assert.equal(queue.ok, true);
  assert.equal(queue.entries.length, 2);
  const byRequest = Object.fromEntries(queue.entries.map((entry) => [entry.requestId, entry.workspaceId]));
  assert.equal(byRequest[REQ], onboardingWorkspaceId(UID));
  assert.equal(byRequest[onboardingRequestId(OTHER_UID)], onboardingWorkspaceId(OTHER_UID));
  assert.equal(loadRequests(storage).length, 2, 'the owner panel caches both so codes can be issued locally');
});

test('an owner decision is published to the customer workspace, not the owner workspace', async () => {
  const { io, docs, writes } = fakeIo({
    seed: {
      [cloudOnboardingIndexPath(UID)]: buildOnboardingIndexDoc(
        { workspaceId: WS, requestId: REQ, institutionName: 'Nile CCU', submittedAtMs: NOW },
        NOW,
      ),
      [cloudRequestPath(WS, REQ)]: buildCloudRequestDoc(departmentRequest(), {
        workspaceId: WS,
        subscriberId: UID,
        onboarding: true,
      }).data,
    },
  });

  const queue = await loadOnboardingQueueFromCloud({ io, storage: memoryStorage() });
  const target = queue.entries[0].workspaceId;
  const result = await pushOwnerDecision(
    { requestId: REQ, workspaceId: target, patch: { status: 'approved', paymentVerified: true } },
    { io },
  );

  assert.equal(result.ok, true);
  assert.equal(writes[0].path, cloudRequestPath(WS, REQ));
  assert.equal(docs.get(cloudRequestPath(WS, REQ))?.status, 'approved');
  assert.equal(docs.get(cloudRequestPath(WS, REQ))?.paymentVerified, true);
  assert.equal(docs.has(`workspaces/${WS}/subscriptionRequests/${REQ}`), true);
});

test('the account can read its own onboarding decision back', async () => {
  const { io, docs } = fakeIo();
  await submitOnboardingRequest(departmentRequest(), { io, uid: UID, nowMs: NOW });
  const approved = { ...(docs.get(cloudRequestPath(WS, REQ)) as Record<string, any>), status: 'approved' };
  docs.set(cloudRequestPath(WS, REQ), approved);

  const storage = memoryStorage();
  const status = await loadOnboardingStatus({ io, uid: UID, storage });
  assert.equal(status.ok, true);
  assert.equal(status.found, true);
  assert.equal(status.status, 'approved');
  assert.equal(status.workspaceId, WS);
  assert.equal(loadRequests(storage).length, 1);
  assert.deepEqual(loadCodes(storage), []);
});

test('a missing onboarding request is reported as not found, never invented', async () => {
  const { io, reads } = fakeIo();
  const status = await loadOnboardingStatus({ io, uid: UID, storage: memoryStorage() });
  assert.equal(status.ok, true);
  assert.equal(status.found, false);
  assert.equal(status.request, undefined);
  // An ordinary member account (no index, no local hint) must not probe a
  // workspace it does not own: the rules would deny that read every time.
  assert.deepEqual(reads, [cloudOnboardingIndexPath(UID)]);
});

test('a device that kept its request id can still resume when the index was never written', async () => {
  const { io } = fakeIo({
    seed: {
      [cloudRequestPath(WS, REQ)]: buildCloudRequestDoc(departmentRequest(), {
        workspaceId: WS,
        subscriberId: UID,
        onboarding: true,
      }).data,
    },
  });
  const storage = memoryStorage();
  const status = await loadOnboardingStatus({ io, uid: UID, requestId: REQ, storage });
  assert.equal(status.found, true);
  assert.equal(status.status, 'pending');
  assert.equal(loadRequests(storage).length, 1);
});

