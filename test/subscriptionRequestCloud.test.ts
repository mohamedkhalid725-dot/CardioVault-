import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_INDEXED_REQUESTS,
  buildCloudRequestDoc,
  cloudIndexPath,
  cloudRequestPath,
  cloudRequestToLocal,
  codesFromCloudDocs,
  describeCloudReason,
  loadOwnerQueueFromCloud,
  mergeCodes,
  mergeRequests,
  mirrorSubscriptionRequest,
  pushOwnerDecision,
  requestAmount,
  requestUnitIds,
  syncMemberSubscriptionFromCloud,
  type SubscriptionCloudIo,
} from '../src/services/subscriptionRequestCloud.ts';
import {
  DAY_MS,
  loadCodes,
  loadRequests,
  submitRequest,
  type SubscriptionStorage,
} from '../src/services/subscriptionRequests.ts';
import { issueCode } from '../src/services/subscriptionRequests.ts';
import type { SubscriptionCodeRecord, SubscriptionRequest } from '../src/types/clinicArea';
import { CODE_VALID_DAYS, TRIAL_DAYS } from '../src/types/clinicArea.ts';

const WORKSPACE = 'ws_test_workspace_01';
const UID = 'uid-doctor-1';
const NOW = 1_760_000_000_000;

const memoryStorage = (): SubscriptionStorage & { dump: () => Record<string, string> } => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
};

/** In-memory fake of the three Firestore calls the module needs. */
const fakeIo = (seed: Record<string, Record<string, any>> = {}) => {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed));
  const writes: Array<{ path: string; data: Record<string, any>; merge: boolean }> = [];
  let failWrites = false;
  const io: SubscriptionCloudIo = {
    getDoc: async (path) => (docs.has(path) ? docs.get(path) || null : null),
    setDoc: async (path, data, merge) => {
      if (failWrites) throw new Error('permission-denied');
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
  return { io, docs, writes, fail: () => (failWrites = true), succeed: () => (failWrites = false) };
};

const departmentRequest = (overrides: Partial<Parameters<typeof submitRequest>[0]> = {}) =>
  submitRequest(
    {
      phone: '01012345678',
      requestType: 'department',
      institutionName: 'Nile CCU',
      unitDrafts: [
        { id: 'unit-ccu-1', name: 'CCU', typeLabel: 'CCU', beds: 8, receivesOperations: true },
        { id: 'unit-ward-2', name: 'Ward', typeLabel: 'Ward', beds: 12, receivesOperations: false },
      ],
      chosenPaymentMethod: 'instapay',
      actorUid: UID,
      actorName: 'Dr. Test',
      actorEmail: 'Doctor@Test.Local',
      nowMs: NOW,
      ...overrides,
    },
    memoryStorage(),
  ).request;

const clinicOnlyRequest = () =>
  submitRequest(
    {
      phone: '01012345678',
      requestType: 'clinic',
      institutionName: 'Nile Clinic',
      unitDrafts: [],
      doctorsCount: 3,
      chosenPaymentMethod: 'visa',
      actorUid: UID,
      actorName: 'Dr. Test',
      nowMs: NOW + 5,
    },
    memoryStorage(),
  ).request;

// ---------------------------------------------------------------------------
// Rules-shaped document
// ---------------------------------------------------------------------------

test('buildCloudRequestDoc satisfies every create predicate in firestore.rules', () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  assert.equal(built.ok, true);
  const doc = built.data as Record<string, any>;

  // match /subscriptionRequests/{requestId} -> allow create
  assert.equal(doc.workspaceId, WORKSPACE);
  assert.equal(doc.subscriberId, UID);
  assert.equal(doc.status, 'pending');
  assert.ok(['instapay', 'visa'].includes(doc.method));
  assert.ok(Array.isArray(doc.unitIds) && doc.unitIds.length > 0, 'unitIds must be non-empty');
  assert.ok(doc.amount > 0, 'amount must be positive');
  assert.equal(doc.paymentVerified, false);
  assert.deepEqual(doc.unitIds, ['unit-ccu-1', 'unit-ward-2']);
  assert.equal(doc.currency, 'EGP');
  assert.equal(doc.amount, 1000, 'two units at EGP 500');
});

test('buildCloudRequestDoc refuses a clinic-only request without a unit', () => {
  const request = clinicOnlyRequest();
  assert.deepEqual(requestUnitIds(request), []);
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  assert.equal(built.ok, false);
  assert.equal(built.reason, 'units-required');
});

test('buildCloudRequestDoc refuses mismatched subscriber, bad method and verified requests', () => {
  const request = departmentRequest();
  assert.equal(buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: 'someone-else' }).reason, 'subscriber-mismatch');
  assert.equal(buildCloudRequestDoc(request, { workspaceId: '', subscriberId: UID }).reason, 'no-workspace');
  assert.equal(buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: '' }).reason, 'no-subscriber');
  const verified = { ...request, paymentVerifiedAtMs: NOW + 1 };
  assert.equal(buildCloudRequestDoc(verified, { workspaceId: WORKSPACE, subscriberId: UID }).reason, 'already-verified');
});

test('requestAmount totals the priced lines and keeps one currency', () => {
  const both = submitRequest(
    {
      phone: '01012345678',
      requestType: 'both',
      institutionName: 'Nile Hospital',
      unitDrafts: [{ id: 'unit-ccu-1', name: 'CCU', typeLabel: 'CCU', beds: 8, receivesOperations: true }],
      doctorsCount: 2,
      chosenPaymentMethod: 'visa',
      actorUid: UID,
      nowMs: NOW,
    },
    memoryStorage(),
  ).request;
  assert.deepEqual(requestAmount(both), { amount: 60, currency: 'USD' });
});

// ---------------------------------------------------------------------------
// Read-back and merge
// ---------------------------------------------------------------------------

test('cloudRequestToLocal round-trips the request and its owner-written codes', () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  const code: SubscriptionCodeRecord = {
    id: 'subcode-1',
    code: 'DPT-AAAA-30D',
    requestId: request.id,
    area: 'department',
    subscriberId: UID,
    unitId: 'unit-ccu-1',
    unitName: 'CCU',
    quantity: 1,
    issuedAtMs: NOW + DAY_MS,
    startsAtMs: NOW + DAY_MS,
    expiresAtMs: NOW + DAY_MS + CODE_VALID_DAYS * DAY_MS,
    validForDays: CODE_VALID_DAYS,
    status: 'active',
    schemaVersion: 1,
  };
  const parsed = cloudRequestToLocal(request.id, {
    ...built.data,
    status: 'approved',
    paymentVerified: true,
    paymentVerifiedAtMs: NOW + DAY_MS,
    paymentVerifiedBy: 'Platform owner',
    codes: [code, { bogus: true }],
  });

  assert.ok(parsed);
  assert.equal(parsed?.status, 'approved');
  assert.equal(parsed?.request.id, request.id);
  assert.equal(parsed?.request.createdBy, UID);
  assert.equal(parsed?.request.paymentMethod, 'instapay');
  assert.equal(parsed?.request.paymentVerifiedAtMs, NOW + DAY_MS);
  assert.equal(parsed?.request.trialEligible, request.trialEligible);
  assert.deepEqual(parsed?.request.unitDrafts.map((unit) => unit.id), ['unit-ccu-1', 'unit-ward-2']);
  assert.equal(parsed?.codes.length, 1, 'malformed code entries are dropped');
  assert.equal(parsed?.codes[0].code, 'DPT-AAAA-30D');
});

test('cloudRequestToLocal rejects documents without an owner or id', () => {
  assert.equal(cloudRequestToLocal('', { subscriberId: UID }), null);
  assert.equal(cloudRequestToLocal('req-1', null), null);
  assert.equal(cloudRequestToLocal('req-1', { workspaceId: WORKSPACE }), null);
});

test('mergeRequests keeps local-only records and lets the cloud copy win', () => {
  const local = departmentRequest();
  const cloudCopy = { ...local, institutionName: 'Renamed CCU', submittedAtMs: local.submittedAtMs + 1 };
  const localOnly = { ...departmentRequest({ nowMs: NOW + 1000 }) } as SubscriptionRequest;
  const merged = mergeRequests([local, localOnly], [cloudCopy]);
  assert.equal(merged.length, 2);
  const byId = new Map(merged.map((request) => [request.id, request]));
  assert.equal(byId.get(local.id)?.institutionName, 'Renamed CCU');
  assert.ok(byId.has(localOnly.id));
  assert.deepEqual(
    merged.map((request) => request.submittedAtMs),
    [...merged.map((request) => request.submittedAtMs)].sort((a, b) => a - b),
  );
});

test('mergeCodes lets a revocation win over a stale active copy', () => {
  const code: SubscriptionCodeRecord = {
    id: 'subcode-1',
    code: 'DPT-AAAA-30D',
    requestId: 'req-1',
    area: 'department',
    subscriberId: UID,
    issuedAtMs: NOW,
    validForDays: 30,
    status: 'active',
    schemaVersion: 1,
  };
  const revoked = { ...code, status: 'revoked' as const, revokedAtMs: NOW + 1 };
  const merged = mergeCodes([revoked], [code]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'revoked');
  assert.equal(mergeCodes([], [code]).length, 1);
});

test('codesFromCloudDocs flattens every code the owner wrote', () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  const codes = codesFromCloudDocs([
    {
      id: request.id,
      data: {
        ...built.data,
        codes: [
          {
            id: 'c1',
            code: 'CLN-BBBB-30D',
            requestId: request.id,
            area: 'clinic',
            subscriberId: UID,
            quantity: 2,
            issuedAtMs: NOW,
            validForDays: 30,
            status: 'active',
          },
        ],
      },
    },
  ]);
  assert.equal(codes.length, 1);
  assert.equal(codes[0].area, 'clinic');
  assert.equal(codes[0].quantity, 2);
});

// ---------------------------------------------------------------------------
// Operations against the fake IO
// ---------------------------------------------------------------------------

test('mirrorSubscriptionRequest writes the doc and the private id index', async () => {
  const { io, docs, writes } = fakeIo();
  const request = departmentRequest();
  const result = await mirrorSubscriptionRequest(request, { io, workspaceId: WORKSPACE, subscriberId: UID });

  assert.deepEqual(result, { ok: true, requestId: request.id, indexed: true });
  const docPath = cloudRequestPath(WORKSPACE, request.id);
  assert.ok(docs.has(docPath), 'request document must exist');
  assert.equal(docs.get(docPath)?.subscriberId, UID);
  assert.equal(docs.get(docPath)?.paymentVerified, false);
  assert.equal(writes[0].merge, false, 'the request document is created, never merged over an existing one');

  const index = docs.get(cloudIndexPath(UID));
  assert.deepEqual(index?.requestIds, [request.id]);
  assert.equal(index?.workspaceId, WORKSPACE);
});

test('mirrorSubscriptionRequest reports a skip instead of writing an invalid document', async () => {
  const { io, writes } = fakeIo();
  const result = await mirrorSubscriptionRequest(clinicOnlyRequest(), {
    io,
    workspaceId: WORKSPACE,
    subscriberId: UID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'units-required');
  assert.equal(writes.length, 0);
});

test('mirrorSubscriptionRequest never throws when the cloud refuses the write', async () => {
  const { io, fail } = fakeIo();
  fail();
  const result = await mirrorSubscriptionRequest(departmentRequest(), {
    io,
    workspaceId: WORKSPACE,
    subscriberId: UID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
});

test('syncMemberSubscriptionFromCloud merges the owner codes into the local cache', async () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });

  const code: SubscriptionCodeRecord = {
    id: 'subcode-cloud-1',
    code: 'DPT-CCCC-30D',
    requestId: request.id,
    area: 'department',
    subscriberId: UID,
    unitId: 'unit-ccu-1',
    unitName: 'CCU',
    quantity: 1,
    issuedAtMs: NOW + DAY_MS,
    startsAtMs: NOW + DAY_MS,
    expiresAtMs: NOW + DAY_MS + CODE_VALID_DAYS * DAY_MS,
    validForDays: CODE_VALID_DAYS,
    status: 'active',
    schemaVersion: 1,
  };

  const { io } = fakeIo({
    [cloudIndexPath(UID)]: { requestIds: [request.id], workspaceId: WORKSPACE, schemaVersion: 1 },
    [cloudRequestPath(WORKSPACE, request.id)]: {
      ...built.data,
      status: 'approved',
      paymentVerified: true,
      paymentVerifiedAtMs: NOW + DAY_MS,
      codes: [code],
    },
  });

  const storage = memoryStorage();
  const result = await syncMemberSubscriptionFromCloud({ io, subscriberId: UID, workspaceId: WORKSPACE, storage });

  assert.equal(result.ok, true);
  assert.equal(result.fetched, 1);
  assert.equal(result.codes.length, 1);
  const cachedRequests = loadRequests(storage);
  assert.equal(cachedRequests.length, 1);
  assert.equal(cachedRequests[0].id, request.id);
  assert.equal(cachedRequests[0].paymentVerifiedAtMs, NOW + DAY_MS);
  const cachedCodes = loadCodes(storage);
  assert.equal(cachedCodes.length, 1);
  assert.equal(cachedCodes[0].code, 'DPT-CCCC-30D');
});

test('syncMemberSubscriptionFromCloud returns empty without an index and never throws', async () => {
  const storage = memoryStorage();
  const result = await syncMemberSubscriptionFromCloud({
    io: fakeIo().io,
    subscriberId: UID,
    workspaceId: WORKSPACE,
    storage,
  });
  assert.equal(result.ok, true);
  assert.equal(result.fetched, 0);
  assert.deepEqual(loadRequests(storage), []);
});

test('loadOwnerQueueFromCloud reads one workspace queue and caches it locally', async () => {
  const first = departmentRequest();
  const second = departmentRequest({ nowMs: NOW + 2000, institutionName: 'Second Hospital' });
  const { io } = fakeIo({
    [cloudRequestPath(WORKSPACE, first.id)]: buildCloudRequestDoc(first, {
      workspaceId: WORKSPACE,
      subscriberId: UID,
    }).data,
    [cloudRequestPath(WORKSPACE, second.id)]: buildCloudRequestDoc(second, {
      workspaceId: WORKSPACE,
      subscriberId: UID,
    }).data,
    [cloudRequestPath('ws_other_workspace_9', 'subreq-x')]: { subscriberId: 'other' },
  });

  const storage = memoryStorage();
  const result = await loadOwnerQueueFromCloud({ io, workspaceId: WORKSPACE, storage });
  assert.equal(result.ok, true);
  assert.equal(result.parsed.length, 2);
  assert.deepEqual(
    result.parsed.map((entry) => entry.request.institutionName),
    ['Nile CCU', 'Second Hospital'],
  );
  assert.equal(loadRequests(storage).length, 2, 'the owner queue is cached so issueCode can run locally');
});

test('pushOwnerDecision writes only the decision fields and keeps identity untouched', async () => {
  const request = departmentRequest();
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  const { io, writes } = fakeIo({
    [cloudRequestPath(WORKSPACE, request.id)]: built.data as Record<string, any>,
  });

  const result = await pushOwnerDecision(
    {
      requestId: request.id,
      workspaceId: WORKSPACE,
      patch: {
        subscriberId: 'attacker',
        workspaceId: 'ws_attacker',
        status: 'approved',
        paymentVerified: true,
        paymentVerifiedAtMs: NOW + 1,
      },
    },
    { io },
  );

  assert.equal(result.ok, true);
  const write = writes[0];
  assert.equal(write.path, cloudRequestPath(WORKSPACE, request.id));
  assert.equal(write.merge, true);
  assert.equal('subscriberId' in write.data, false);
  assert.equal('workspaceId' in write.data, false);
  assert.equal(write.data.status, 'approved');
  assert.equal(write.data.paymentVerified, true);
  assert.equal(typeof write.data.updatedAtMs, 'number');
});

test('the index never grows past the read cap', async () => {
  const { io, docs } = fakeIo({
    [cloudIndexPath(UID)]: {
      requestIds: Array.from({ length: MAX_INDEXED_REQUESTS }, (_, index) => `old-${index}`),
      workspaceId: WORKSPACE,
    },
  });
  const request = departmentRequest();
  await mirrorSubscriptionRequest(request, { io, workspaceId: WORKSPACE, subscriberId: UID });
  const ids = docs.get(cloudIndexPath(UID))?.requestIds as string[];
  assert.equal(ids.length, MAX_INDEXED_REQUESTS);
  assert.equal(ids.at(-1), request.id);
});

// ---------------------------------------------------------------------------
// Honest wording
// ---------------------------------------------------------------------------

test('every skip reason has a distinct user-facing explanation', () => {
  const reasons = [
    'cloud-disabled',
    'units-required',
    'no-workspace',
    'no-subscriber',
    'subscriber-mismatch',
    'method-invalid',
    'amount-invalid',
    'already-verified',
    'write-failed',
    'read-failed',
    'index-failed',
  ];
  const messages = new Set(reasons.map((reason) => describeCloudReason(reason)));
  // no-workspace/no-subscriber share one message, write-failed/index-failed share one.
  assert.equal(messages.size, reasons.length - 2);
  for (const message of messages) assert.ok(message.length > 20);
});

test('the trial request keeps its three-day eligibility when mirrored', () => {
  const request = departmentRequest();
  assert.equal(request.trialEligible, true);
  assert.equal(request.trialStartedAtMs + TRIAL_DAYS * DAY_MS > request.trialStartedAtMs, true);
  const built = buildCloudRequestDoc(request, { workspaceId: WORKSPACE, subscriberId: UID });
  assert.equal(built.data?.trialEligible, true);
  assert.equal(built.data?.trialStartedAtMs, NOW);
});
