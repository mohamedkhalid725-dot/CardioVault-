// Cross-device subscription requests, approvals and activation codes.
//
// Why this module exists
// ----------------------
// `subscriptionRequests.ts` is the *device-local* pipeline: it validates a
// request, prices it, issues owner codes and computes the per-unit/area
// entitlement state. That pipeline is still the single place where the
// lifecycle is computed, and its storage stays the local cache so every screen
// keeps working offline.
//
// This module adds the missing cross-device hop on top of it:
//
//   member device ──create──▶ workspaces/{ws}/subscriptionRequests/{requestId}
//   owner device  ──list────▶ (platform owner only, per firestore.rules)
//   owner device  ──update──▶ {paymentVerified, status, codes[]}
//   member device ──read────▶ users/{uid}/subscriptionIndex/current (own ids)
//
// The security rules are authoritative and were NOT relaxed for this module:
//
//  * create  : member(workspaceId), subscriberId == auth.uid, status 'pending',
//              method in ['instapay','visa'], unitIds.size() > 0,
//              unitIds.hasOnly(memberUnits(workspaceId)), amount > 0,
//              paymentVerified == false.
//  * update  : the platform owner only (the requester may only withdraw their
//              own still-pending request).
//  * list    : the platform owner only. A member can `get` a document only when
//              `resource.data.subscriberId == request.auth.uid`.
//
// Two consequences are handled explicitly instead of being hidden:
//
//  1. A member cannot list their own requests, so the account keeps a private
//     index of request ids at `users/{uid}/subscriptionIndex/current`. That path
//     is covered by the pre-existing owner-of-account rule
//     (`match /users/{uid}`), so no new rule was needed and the index grants
//     nothing: it is only a list of ids the same account already created.
//  2. A DEPARTMENT request must name at least one unit the member really belongs
//     to, otherwise the rules refuse to create it and `buildCloudRequestDoc`
//     returns 'units-required' instead of writing a document that would be
//     denied. A CLINIC request has no department unit at all, so it travels
//     through the rules' dedicated clinic branch: requestType 'clinic', an empty
//     unitIds list, a doctor count between 1 and 200 and the exact 30-day price
//     for the chosen method. Nothing else is relaxed for members.
//
// Everything here is non-fatal: any failure resolves to `{ ok: false, reason }`
// and the caller keeps using the local record. No feature is reported as
// working remotely unless the write or read actually succeeded.

import type { SubscriptionCodeRecord, SubscriptionRequest } from '../types/clinicArea';
import { isLocalPreview } from '../config/localPreview.ts';
import { MAX_REQUEST_UNIT_DRAFTS } from './institutionSetup.ts';
import { PRICE_EGP, PRICE_USD, cacheCodes, cacheRequests, loadCodes, loadRequests } from './subscriptionRequests.ts';
import type { SubscriptionStorage } from './subscriptionRequests.ts';

export const CLOUD_REQUEST_SCHEMA_VERSION = 1;
export const CLOUD_INDEX_SCHEMA_VERSION = 1;

/** Hard cap so a corrupt index can never turn into an unbounded read loop. */
export const MAX_INDEXED_REQUESTS = 100;

export const cloudRequestsPath = (workspaceId: string): string =>
  `workspaces/${workspaceId}/subscriptionRequests`;
export const cloudRequestPath = (workspaceId: string, requestId: string): string =>
  `${cloudRequestsPath(workspaceId)}/${requestId}`;
export const cloudIndexPath = (uid: string): string => `users/${uid}/subscriptionIndex/current`;

// ---------------------------------------------------------------------------
// Onboarding (brand-new account, no membership yet)
// ---------------------------------------------------------------------------
// A newly registered account has no membership, so it cannot file the request
// through the membership path above. The rules allow ONE narrow alternative:
// the account that created a workspace may file a single pending, unverified
// request in it, with an EMPTY unitIds list. The drafted units are a plan, not
// access - nothing is created and nothing becomes readable from this document.
//
// Every path below is deterministic from the uid, which is what makes a retry
// after a network failure idempotent: the same three writes (workspace, request,
// index) are repeated, never appended.
export const onboardingWorkspaceId = (uid: string): string => `ws_ob_${clean(uid)}`;
export const onboardingRequestId = (uid: string): string => `onboard-${clean(uid)}`;
export const cloudOnboardingIndexPath = (uid: string): string => `onboardingIndex/${clean(uid)}`;
export const ONBOARDING_SCHEMA_VERSION = 1;


export type CloudRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type CloudSkipReason =
  | 'cloud-disabled'
  | 'no-workspace'
  | 'no-subscriber'
  | 'subscriber-mismatch'
  | 'method-invalid'
  | 'units-required'
  | 'units-limit'
  | 'doctors-count-invalid'
  | 'clinic-services-invalid'
  | 'amount-invalid'
  | 'already-verified'
  | 'invalid-request';

export type CloudFailureReason =
  | CloudSkipReason
  | 'read-failed'
  | 'write-failed'
  | 'index-failed'
  | 'workspace-conflict';

export interface CloudRequestBuild {
  ok: boolean;
  reason?: CloudSkipReason;
  /** Unit ids sent to Firestore; also used for local validation messages. */
  unitIds: string[];
  data?: Record<string, any>;
}

export interface CloudDoc {
  id: string;
  data: Record<string, any>;
}

/** Minimal Firestore surface this module needs. Injected in tests. */
export interface SubscriptionCloudIo {
  getDoc(path: string): Promise<Record<string, any> | null>;
  setDoc(path: string, data: Record<string, any>, merge: boolean): Promise<void>;
  listDocs(path: string): Promise<CloudDoc[]>;
}

// ---------------------------------------------------------------------------
// Pure mapping
// ---------------------------------------------------------------------------

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const intMs = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** The unit ids of a request, in the same shape `issueCode` uses. */
export function requestUnitIds(request: SubscriptionRequest): string[] {
  const units = asArray<SubscriptionRequest['unitDrafts'][number]>(request?.unitDrafts);
  return [
    ...new Set(
      units
        .map((unit, index) => clean(unit?.id) || `${clean(request?.id)}:unit-${index + 1}`)
        .filter(Boolean),
    ),
  ];
}

/** Total of the priced lines, in the single currency the method implies. */
export function requestAmount(request: SubscriptionRequest): { amount: number; currency: string } {
  const items = asArray<SubscriptionRequest['lineItems'][number]>(request?.lineItems);
  const amount = items.reduce((sum, item) => sum + Math.max(0, Number(item?.subtotal) || 0), 0);
  const currency = clean(items[0]?.currency) || (request?.paymentMethod === 'instapay' ? 'EGP' : 'USD');
  return { amount, currency };
}

/**
 * A clinic-only request has no department unit to attach to, so `unitIds` is
 * empty and `firestore.rules` accepts it through a dedicated branch. That branch
 * requires a real doctor count and the exact 30-day price for the chosen method,
 * which is what this function mirrors on the client before any write is tried.
 */
export function clinicOnlyAmountMatches(
  doctorsCount: number,
  method: string,
  amount: number,
  currency: string,
): boolean {
  const doctors = Math.trunc(Number(doctorsCount) || 0);
  if (doctors < 1 || doctors > 200) return false;
  if (method === 'instapay') return currency === 'EGP' && amount === doctors * PRICE_EGP;
  if (method === 'visa') return currency === 'USD' && amount === doctors * PRICE_USD;
  return false;
}

/**
 * Builds the exact document shape the deployed rules accept.
 *
 * Returns a skip reason instead of a document whenever the rules would deny the
 * create, so the UI can say "this stays on this device" honestly.
 */
export function buildCloudRequestDoc(
  request: SubscriptionRequest,
  context: { workspaceId?: string; subscriberId?: string; onboarding?: boolean },
): CloudRequestBuild {
  const onboarding = !!context?.onboarding;
  // Onboarding: the unit list is deliberately empty. The drafts describe what
  // the customer asked for; they are not a claim on existing units.
  const unitIds = onboarding ? [] : requestUnitIds(request);
  const plannedUnits = asArray<SubscriptionRequest['unitDrafts'][number]>(request?.unitDrafts)
    .filter((unit) => clean(unit?.id) || clean(unit?.name)).length;
  const fail = (reason: CloudSkipReason): CloudRequestBuild => ({ ok: false, reason, unitIds });

  if (!request || !clean(request.id)) return fail('invalid-request');
  if (asArray<SubscriptionRequest['unitDrafts'][number]>(request.unitDrafts).length > MAX_REQUEST_UNIT_DRAFTS) {
    return fail('units-limit');
  }
  const workspaceId = clean(context?.workspaceId);
  if (!workspaceId) return fail('no-workspace');
  const subscriberId = clean(context?.subscriberId);
  if (!subscriberId) return fail('no-subscriber');
  if (clean(request.createdBy) !== subscriberId) return fail('subscriber-mismatch');
  if (request.paymentMethod !== 'instapay' && request.paymentMethod !== 'visa') return fail('method-invalid');

  // A clinic request without any department unit is legal in the rules, but only
  // for the clinic request type and only with a priced doctor count.
  const clinicOnly = clean(request.requestType) === 'clinic' && unitIds.length === 0;
  if (!onboarding && unitIds.length === 0 && !clinicOnly) return fail('units-required');
  if (onboarding) {
    // The rules' onboarding branch demands at least one drafted unit unless the
    // request is clinic-only, and a real doctor count whenever a clinic exists.
    if (clean(request.requestType) !== 'clinic' && plannedUnits === 0) return fail('units-required');
    if (clean(request.requestType) !== 'department') {
      const doctors = Math.trunc(Number(request.doctorsCount) || 0);
      if (!Number.isInteger(doctors) || doctors < 1 || doctors > 200) return fail('doctors-count-invalid');
    }
  }
  if (request.paymentVerifiedAtMs) return fail('already-verified');

  const { amount, currency } = requestAmount(request);
  if (!(amount > 0)) return fail('amount-invalid');
  if (clinicOnly) {
    if (asArray<string>(request.clinicServices).filter((entry) => clean(entry)).length > 20) {
      return fail('clinic-services-invalid');
    }
    if (!clinicOnlyAmountMatches(request.doctorsCount, request.paymentMethod, amount, currency)) {
      const doctors = Math.trunc(Number(request.doctorsCount) || 0);
      return fail(doctors < 1 || doctors > 200 ? 'doctors-count-invalid' : 'amount-invalid');
    }
  }

  const submittedAtMs = intMs(request.submittedAtMs) || Date.now();
  const data: Record<string, any> = {
    workspaceId,
    subscriberId,
    subscriberName: clean(request.createdByName) || 'Subscriber',
    createdByName: clean(request.createdByName) || 'Subscriber',
    status: 'pending',
    method: request.paymentMethod,
    unitIds,
    amount,
    currency,
    // The owner flips this by hand after checking the transfer. A client-side
    // create must always start false - the rules enforce it.
    paymentVerified: false,
    ...(onboarding ? { onboarding: true } : {}),
    requestType: request.requestType,
    institutionName: clean(request.institutionName),
    phone: clean(request.phone),
    doctorsCount: Math.max(0, Math.trunc(Number(request.doctorsCount) || 0)),
    clinicServices: asArray<string>(request.clinicServices).map(clean).filter(Boolean),
    unitDrafts: asArray<SubscriptionRequest['unitDrafts'][number]>(request.unitDrafts).map((unit) => ({
      id: clean(unit?.id),
      name: clean(unit?.name),
      typeLabel: clean(unit?.typeLabel) || 'Unit',
      beds: Math.max(0, Math.trunc(Number(unit?.beds) || 0)),
      receivesOperations: !!unit?.receivesOperations,
    })),
    lineItems: asArray<SubscriptionRequest['lineItems'][number]>(request.lineItems).map((item) => ({
      area: item?.area === 'clinic' ? 'clinic' : 'department',
      quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0)),
      currency: clean(item?.currency) || currency,
      unitPrice: Math.max(0, Number(item?.unitPrice) || 0),
      subtotal: Math.max(0, Number(item?.subtotal) || 0),
    })),
    submittedAtMs,
    trialStartedAtMs: intMs(request.trialStartedAtMs) || submittedAtMs,
    trialEligible: request.trialEligible !== false,
    isRenewal: !!request.isRenewal,
    createdBy: subscriberId,
    ...(clean(request.createdByEmail) ? { createdByEmail: clean(request.createdByEmail).toLowerCase() } : {}),
    createdAtMs: submittedAtMs,
    schemaVersion: CLOUD_REQUEST_SCHEMA_VERSION,
  };
  return { ok: true, unitIds, data };
}

export interface ParsedCloudRequest {
  request: SubscriptionRequest;
  status: CloudRequestStatus;
  codes: SubscriptionCodeRecord[];
}

const parseStatus = (value: unknown): CloudRequestStatus => {
  const raw = clean(value);
  if (raw === 'approved' || raw === 'rejected' || raw === 'withdrawn') return raw;
  return 'pending';
};

const parseCode = (value: unknown): SubscriptionCodeRecord | null => {
  const record = value as SubscriptionCodeRecord | null;
  if (!record || typeof record !== 'object' || !clean(record.id) || !clean(record.code)) return null;
  const area = record.area === 'clinic' || record.area === 'both' ? record.area : 'department';
  const status = record.status === 'revoked' || record.status === 'replaced' ? record.status : 'active';
  return {
    ...record,
    area,
    status,
    quantity: Math.max(1, Math.trunc(Number(record.quantity) || 1)),
    issuedAtMs: intMs(record.issuedAtMs) || Date.now(),
    validForDays: Math.max(1, Math.trunc(Number(record.validForDays) || 30)),
  };
};

/** Reads a stored cloud document back into the local request model. */
export function cloudRequestToLocal(id: string, data: Record<string, any> | null): ParsedCloudRequest | null {
  if (!data || typeof data !== 'object') return null;
  const requestId = clean(id);
  const subscriberId = clean(data.subscriberId);
  if (!requestId || !subscriberId) return null;

  const submittedAtMs = intMs(data.submittedAtMs) || intMs(data.createdAtMs) || 0;
  const request: SubscriptionRequest = {
    id: requestId,
    phone: clean(data.phone),
    requestType:
      data.requestType === 'clinic' || data.requestType === 'both' ? data.requestType : 'department',
    institutionName: clean(data.institutionName),
    unitDrafts: asArray<Record<string, any>>(data.unitDrafts).map((unit) => ({
      ...(clean(unit?.id) ? { id: clean(unit.id) } : {}),
      name: clean(unit?.name),
      typeLabel: clean(unit?.typeLabel) || 'Unit',
      beds: Math.max(0, Math.trunc(Number(unit?.beds) || 0)),
      receivesOperations: !!unit?.receivesOperations,
    })),
    doctorsCount: Math.max(0, Math.trunc(Number(data.doctorsCount) || 0)),
    clinicServices: asArray<string>(data.clinicServices).map(clean).filter(Boolean),
    paymentMethod: data.method === 'visa' ? 'visa' : 'instapay',
    lineItems: asArray<Record<string, any>>(data.lineItems).map((item) => ({
      area: item?.area === 'clinic' ? 'clinic' : 'department',
      quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0)),
      currency: item?.currency === 'USD' ? 'USD' : 'EGP',
      unitPrice: Math.max(0, Number(item?.unitPrice) || 0),
      subtotal: Math.max(0, Number(item?.subtotal) || 0),
    })),
    submittedAtMs,
    trialStartedAtMs: intMs(data.trialStartedAtMs) || submittedAtMs,
    trialEligible: data.trialEligible !== false,
    isRenewal: !!data.isRenewal,
    createdBy: subscriberId,
    createdByName: clean(data.subscriberName) || 'Subscriber',
    ...(clean(data.createdByEmail) ? { createdByEmail: clean(data.createdByEmail) } : {}),
    ...(intMs(data.paymentVerifiedAtMs)
      ? {
          paymentVerifiedAtMs: intMs(data.paymentVerifiedAtMs) as number,
          ...(clean(data.paymentVerifiedBy) ? { paymentVerifiedBy: clean(data.paymentVerifiedBy) } : {}),
        }
      : {}),
    schemaVersion: Math.max(1, Math.trunc(Number(data.schemaVersion) || 1)),
  };

  const codes = asArray<unknown>(data.codes)
    .map(parseCode)
    .filter((record): record is SubscriptionCodeRecord => (record ? true : false));

  return { request, status: parseStatus(data.status), codes };
}

/** Cloud records win on conflict; local-only records are kept. */
export function mergeRequests(
  local: SubscriptionRequest[],
  cloud: SubscriptionRequest[],
): SubscriptionRequest[] {
  const byId = new Map<string, SubscriptionRequest>();
  for (const request of local) if (clean(request?.id)) byId.set(request.id, request);
  for (const request of cloud) if (clean(request?.id)) byId.set(request.id, request);
  return [...byId.values()].sort((a, b) => (Number(a.submittedAtMs) || 0) - (Number(b.submittedAtMs) || 0));
}

/**
 * A revocation is irreversible, so it always survives a merge. Every other
 * field follows the cloud copy, which is the owner's authoritative record.
 */
export function mergeCodes(
  local: SubscriptionCodeRecord[],
  cloud: SubscriptionCodeRecord[],
): SubscriptionCodeRecord[] {
  const byId = new Map<string, SubscriptionCodeRecord>();
  for (const code of local) if (clean(code?.id)) byId.set(code.id, code);
  for (const code of cloud) {
    if (!clean(code?.id)) continue;
    const previous = byId.get(code.id);
    byId.set(code.id, previous?.status === 'revoked' && code.status !== 'revoked' ? previous : code);
  }
  return [...byId.values()].sort((a, b) => (Number(a.issuedAtMs) || 0) - (Number(b.issuedAtMs) || 0));
}

/** All codes an owner wrote onto one request document. */
export function codesFromCloudDocs(docs: Array<{ id: string; data: Record<string, any> | null }>): SubscriptionCodeRecord[] {
  const out: SubscriptionCodeRecord[] = [];
  for (const doc of docs) {
    const parsed = cloudRequestToLocal(doc.id, doc.data);
    if (parsed) out.push(...parsed.codes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Platform IO (lazy: Node tests and the isolated preview never load Firebase)
// ---------------------------------------------------------------------------

const snapshotData = (snapshot: any): Record<string, any> | null => {
  if (!snapshot) return null;
  try {
    if (typeof snapshot.data === 'function') return snapshot.data() || null;
  } catch {
    return null;
  }
  return snapshot.data && typeof snapshot.data === 'object' ? snapshot.data : null;
};

async function nativeIo(): Promise<SubscriptionCloudIo> {
  const { FirebaseFirestore } = await import('@capacitor-firebase/firestore');
  return {
    getDoc: async (path) => {
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      return snapshotData(result?.snapshot);
    },
    setDoc: async (path, data, merge) => {
      await FirebaseFirestore.setDocument({ reference: path, data, merge });
    },
    listDocs: async (path) => {
      const result: any = await FirebaseFirestore.getCollection({ reference: path });
      return asArray<any>(result?.snapshots).map((snapshot) => ({
        id: String(snapshot?.id || ''),
        data: snapshotData(snapshot) || {},
      }));
    },
  };
}

async function webIo(): Promise<SubscriptionCloudIo> {
  const { webDoc, webCollection, getDoc, getDocs, setDoc } = await import('./webFirebase');
  return {
    getDoc: async (path) => {
      const snapshot = await getDoc(webDoc(path));
      return snapshot.exists() ? snapshot.data() : null;
    },
    setDoc: async (path, data, merge) => {
      await setDoc(webDoc(path), data, { merge });
    },
    listDocs: async (path) => {
      const snapshot = await getDocs(webCollection(path));
      return snapshot.docs.map((entry: any) => ({ id: entry.id, data: entry.data() }));
    },
  };
}

/**
 * The isolated local preview (and therefore the emulator wiring) must never
 * receive a subscription write: it has no real account and no real workspace.
 */
export function subscriptionCloudEnabled(): boolean {
  return !isLocalPreview();
}

async function resolveIo(injected?: SubscriptionCloudIo | null): Promise<SubscriptionCloudIo | null> {
  if (injected) return injected;
  if (!subscriptionCloudEnabled()) return null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform() ? await nativeIo() : await webIo();
  } catch (error) {
    console.warn('Subscription cloud driver unavailable:', error);
    return null;
  }
}

async function currentIdentity(): Promise<{ workspaceId: string; uid: string }> {
  const { getActiveWorkspaceId, getCurrentUid } = await import('./workspaceAccess');
  const workspaceId = clean(getActiveWorkspaceId());
  const uid = clean(await getCurrentUid().catch(() => ''));
  return { workspaceId, uid };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface CloudMirrorResult {
  ok: boolean;
  reason?: CloudFailureReason;
  requestId?: string;
  /** True when the owner-side index also recorded the id. */
  indexed?: boolean;
}

/**
 * Mirrors one locally created request to the cloud so the owner can see it from
 * another device. Never throws.
 */
export async function mirrorSubscriptionRequest(
  request: SubscriptionRequest,
  options: {
    io?: SubscriptionCloudIo | null;
    workspaceId?: string;
    subscriberId?: string;
    onboarding?: boolean;
  } = {},
): Promise<CloudMirrorResult> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled' };

  let workspaceId = clean(options.workspaceId);
  let subscriberId = clean(options.subscriberId);
  if (!workspaceId || !subscriberId) {
    const identity = await currentIdentity();
    workspaceId = workspaceId || identity.workspaceId;
    subscriberId = subscriberId || identity.uid;
  }

  const built = buildCloudRequestDoc(request, {
    workspaceId,
    subscriberId,
    onboarding: !!options.onboarding,
  });
  if (!built.ok || !built.data) return { ok: false, reason: built.reason || 'invalid-request' };

  try {
    await io.setDoc(cloudRequestPath(workspaceId, request.id), built.data, false);
  } catch (error) {
    console.warn('Subscription request mirror failed:', error);
    return { ok: false, reason: 'write-failed', requestId: request.id };
  }

  // Private id index. Failure here is not fatal: the owner can still see the
  // request, the member just cannot re-read it on another device.
  let indexed = false;
  try {
    const path = cloudIndexPath(subscriberId);
    const existing = await io.getDoc(path).catch(() => null);
    const previous = asArray<string>(existing?.requestIds).map(clean).filter(Boolean);
    const requestIds = [...new Set([...previous, request.id])].slice(-MAX_INDEXED_REQUESTS);
    await io.setDoc(
      path,
      {
        requestIds,
        workspaceId,
        updatedAtMs: Date.now(),
        schemaVersion: CLOUD_INDEX_SCHEMA_VERSION,
      },
      true,
    );
    indexed = true;
  } catch (error) {
    console.warn('Subscription index write failed:', error);
  }

  return { ok: true, requestId: request.id, indexed };
}

// ---------------------------------------------------------------------------
// Onboarding operations
// ---------------------------------------------------------------------------

/**
 * The workspace document a brand-new account creates for itself. It claims no
 * ownership and no access: `createdBy` is recorded so the rules (and only the
 * rules) can let this one account file its first request and open its one
 * trial. It is created only when it does not exist yet.
 */
export function buildOnboardingWorkspaceDoc(
  uid: string,
  email: string,
  name: string,
  nowMs = Date.now(),
): Record<string, any> {
  const id = clean(uid);
  return {
    createdBy: id,
    ...(clean(email) ? { createdByEmail: clean(email).toLowerCase() } : {}),
    name: clean(name) || 'New institution',
    schemaVersion: 13,
    createdAt: new Date(nowMs).toISOString(),
    onboarding: true,
  };
}

/** The owner-discovery document. It carries no clinical or payment data. */
export function buildOnboardingIndexDoc(
  input: {
    workspaceId: string;
    requestId: string;
    institutionName?: string;
    subscriberName?: string;
    submittedAtMs: number;
  },
  nowMs = Date.now(),
): Record<string, any> {
  return {
    workspaceId: clean(input.workspaceId),
    requestId: clean(input.requestId),
    institutionName: clean(input.institutionName).slice(0, 200),
    subscriberName: clean(input.subscriberName).slice(0, 200),
    submittedAtMs: Math.max(1, Math.floor(Number(input.submittedAtMs) || nowMs)),
    updatedAtMs: Math.floor(nowMs),
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
  };
}

export interface OnboardingSubmitResult {
  ok: boolean;
  reason?: CloudFailureReason;
  /** The request document really exists in the cloud. */
  delivered: boolean;
  /** The owner-discovery index was written, so the owner can see it. */
  indexed: boolean;
  /** True when this call created the request; false when it already existed. */
  created?: boolean;
  /** Current cloud status of a request that already existed. */
  status?: CloudRequestStatus;
  workspaceId?: string;
  requestId?: string;
}

/**
 * Files the first request of a brand-new account.
 *
 * Order matters and is the whole safety story:
 *   1. validate the document BEFORE creating anything;
 *   2. ensure the account's own workspace exists (create once, never overwrite);
 *   3. write the request under that workspace (deterministic id -> a retry
 *      overwrites the same document, never a second one);
 *   4. write the account's private request index (so its own devices can read
 *      the decision back);
 *   5. write the owner-discovery index LAST, so it never points at a request
 *      that does not exist.
 *
 * `ok` is true only when steps 3 and 5 both succeeded. A retry is always safe.
 */
export async function submitOnboardingRequest(
  request: SubscriptionRequest,
  options: {
    io?: SubscriptionCloudIo | null;
    uid?: string;
    email?: string;
    workspaceName?: string;
    name?: string;
    nowMs?: number;
  } = {},
): Promise<OnboardingSubmitResult> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled', delivered: false, indexed: false };

  const identity = clean(options.uid) ? { workspaceId: '', uid: clean(options.uid) } : await currentIdentity();
  const uid = clean(identity.uid);
  if (!uid) return { ok: false, reason: 'no-subscriber', delivered: false, indexed: false };

  const workspaceId = onboardingWorkspaceId(uid);
  const requestId = onboardingRequestId(uid);
  const canonical: SubscriptionRequest = { ...request, id: requestId };
  const nowMs = Number.isFinite(options.nowMs) ? Math.floor(Number(options.nowMs)) : Date.now();

  const built = buildCloudRequestDoc(canonical, { workspaceId, subscriberId: uid, onboarding: true });
  if (!built.ok || !built.data) {
    return { ok: false, reason: built.reason || 'invalid-request', delivered: false, indexed: false, workspaceId, requestId };
  }

  // 2) The workspace. A read failure must NOT fall through to a blind write.
  let workspace: Record<string, any> | null;
  try {
    workspace = await io.getDoc(`workspaces/${workspaceId}`);
  } catch (error) {
    console.warn('Onboarding workspace read failed:', error);
    return { ok: false, reason: 'read-failed', delivered: false, indexed: false, workspaceId, requestId };
  }
  if (workspace && clean(workspace.createdBy) !== uid) {
    return { ok: false, reason: 'workspace-conflict', delivered: false, indexed: false, workspaceId, requestId };
  }
  if (!workspace) {
    try {
      await io.setDoc(
        `workspaces/${workspaceId}`,
        buildOnboardingWorkspaceDoc(uid, options.email || '', options.workspaceName || '', nowMs),
        false,
      );
    } catch (error) {
      console.warn('Onboarding workspace create failed:', error);
      return { ok: false, reason: 'write-failed', delivered: false, indexed: false, workspaceId, requestId };
    }
  }

  // 3) The request itself. A retry must NEVER overwrite an existing document:
  //    the rules treat a second write as an update (which only the owner may
  //    make), and blind overwriting could reset an approved status or erase the
  //    owner's codes. So the document is created only when it is absent, and an
  //    existing one is reported as delivered with its current status.
  const requestPath = cloudRequestPath(workspaceId, requestId);
  let existingRequest: Record<string, any> | null;
  try {
    existingRequest = await io.getDoc(requestPath);
  } catch (error) {
    console.warn('Onboarding request read failed:', error);
    return { ok: false, reason: 'read-failed', delivered: false, indexed: false, workspaceId, requestId };
  }

  let created = false;
  let status: CloudRequestStatus | undefined;
  if (existingRequest) {
    if (clean(existingRequest.subscriberId) !== uid) {
      return { ok: false, reason: 'workspace-conflict', delivered: false, indexed: false, workspaceId, requestId };
    }
    status = parseStatus(existingRequest.status);
  } else {
    try {
      await io.setDoc(requestPath, built.data, false);
      created = true;
    } catch (error) {
      console.warn('Onboarding request write failed:', error);
      return { ok: false, reason: 'write-failed', delivered: false, indexed: false, workspaceId, requestId };
    }
  }

  // 4) The account's private index (non-fatal: the owner queue does not use it).
  try {
    const path = cloudIndexPath(uid);
    const existing = await io.getDoc(path).catch(() => null);
    const previous = asArray<string>(existing?.requestIds).map(clean).filter(Boolean);
    const requestIds = [...new Set([...previous, requestId])].slice(-MAX_INDEXED_REQUESTS);
    await io.setDoc(
      path,
      { requestIds, workspaceId, updatedAtMs: nowMs, schemaVersion: CLOUD_INDEX_SCHEMA_VERSION },
      true,
    );
  } catch (error) {
    console.warn('Onboarding member index write failed:', error);
  }

  // 5) Owner discovery, last.
  try {
    await io.setDoc(
      cloudOnboardingIndexPath(uid),
      buildOnboardingIndexDoc(
        {
          workspaceId,
          requestId,
          institutionName: canonical.institutionName,
          subscriberName: canonical.createdByName,
          submittedAtMs: intMs(canonical.submittedAtMs) || nowMs,
        },
        nowMs,
      ),
      true,
    );
  } catch (error) {
    console.warn('Onboarding discovery index write failed:', error);
    return {
      ok: false,
      reason: 'index-failed',
      delivered: true,
      indexed: false,
      created,
      ...(status ? { status } : {}),
      workspaceId,
      requestId,
    };
  }

  return {
    ok: true,
    delivered: true,
    indexed: true,
    created,
    ...(status ? { status } : {}),
    workspaceId,
    requestId,
  };
}

export interface OnboardingStatus {
  ok: boolean;
  reason?: CloudFailureReason;
  found: boolean;
  workspaceId?: string;
  requestId?: string;
  request?: SubscriptionRequest;
  status?: CloudRequestStatus;
  codes?: SubscriptionCodeRecord[];
}

/**
 * Reads the caller's own onboarding request back (status and owner codes).
 *
 * The discovery index is the normal source. Two narrow fallbacks exist and both
 * are opt-in, so an ordinary member account never probes a workspace it does not
 * own (which the rules would deny, every time):
 *   - `requestId`: a hint from this device's own saved draft, used when the
 *     index write failed but the request itself was delivered;
 *   - a failed index READ is retried against the deterministic path.
 */
export async function loadOnboardingStatus(
  options: {
    io?: SubscriptionCloudIo | null;
    uid?: string;
    storage?: SubscriptionStorage | null;
    /** Known request id from this device; never guessed for other accounts. */
    requestId?: string;
  } = {},
): Promise<OnboardingStatus> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled', found: false };

  const uid = clean(options.uid) || (await currentIdentity()).uid;
  if (!uid) return { ok: false, reason: 'no-subscriber', found: false };

  let workspaceId = '';
  let requestId = '';
  let indexReadFailed = false;
  try {
    const index = await io.getDoc(cloudOnboardingIndexPath(uid));
    workspaceId = clean(index?.workspaceId);
    requestId = clean(index?.requestId);
  } catch (error) {
    indexReadFailed = true;
    console.warn('Onboarding index read failed:', error);
  }

  const candidates: Array<{ workspaceId: string; requestId: string }> = [];
  if (workspaceId && requestId) candidates.push({ workspaceId, requestId });
  const hint = clean(options.requestId);
  if (hint) candidates.push({ workspaceId: onboardingWorkspaceId(uid), requestId: hint });
  else if (indexReadFailed) {
    candidates.push({ workspaceId: onboardingWorkspaceId(uid), requestId: onboardingRequestId(uid) });
  }

  let failure: CloudFailureReason | undefined;
  for (const candidate of candidates) {
    try {
      const data = await io.getDoc(cloudRequestPath(candidate.workspaceId, candidate.requestId));
      const parsed = cloudRequestToLocal(candidate.requestId, data);
      if (!parsed) continue;
      cacheRequests(mergeRequests(loadRequests(options.storage), [parsed.request]), options.storage);
      cacheCodes(mergeCodes(loadCodes(options.storage), parsed.codes), options.storage);
      return {
        ok: true,
        found: true,
        workspaceId: candidate.workspaceId,
        requestId: candidate.requestId,
        request: parsed.request,
        status: parsed.status,
        codes: parsed.codes,
      };
    } catch (error) {
      console.warn('Onboarding request read failed:', error);
      failure = 'read-failed';
    }
  }

  return { ok: !failure, ...(failure ? { reason: failure } : {}), found: false };
}

export interface OnboardingQueueEntry {
  workspaceId: string;
  requestId: string;
  parsed: ParsedCloudRequest;
}

export interface OnboardingQueueResult {
  ok: boolean;
  reason?: CloudFailureReason;
  entries: OnboardingQueueEntry[];
}

/**
 * Platform-owner queue for brand-new accounts: lists the discovery index and
 * loads each request from its own workspace. The rules allow the list and the
 * reads for the platform owner only. Unreadable entries are skipped, never
 * turned into a fake record.
 */
export async function loadOnboardingQueueFromCloud(
  options: { io?: SubscriptionCloudIo | null; storage?: SubscriptionStorage | null } = {},
): Promise<OnboardingQueueResult> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled', entries: [] };

  let docs: CloudDoc[];
  try {
    docs = await io.listDocs('onboardingIndex');
  } catch (error) {
    console.warn('Onboarding queue read failed:', error);
    return { ok: false, reason: 'read-failed', entries: [] };
  }

  const entries: OnboardingQueueEntry[] = [];
  let failed = 0;
  for (const doc of docs) {
    const workspaceId = clean(doc?.data?.workspaceId);
    const requestId = clean(doc?.data?.requestId);
    if (!workspaceId || !requestId) continue;
    try {
      const data = await io.getDoc(cloudRequestPath(workspaceId, requestId));
      const parsed = cloudRequestToLocal(requestId, data);
      if (parsed) entries.push({ workspaceId, requestId, parsed });
    } catch (error) {
      failed += 1;
      console.warn('Onboarding request read failed:', workspaceId, requestId, error);
    }
  }

  if (entries.length > 0) {
    const merged = mergeRequests(loadRequests(options.storage), entries.map((entry) => entry.parsed.request));
    const mergedCodes = mergeCodes(loadCodes(options.storage), entries.flatMap((entry) => entry.parsed.codes));
    cacheRequests(merged, options.storage);
    cacheCodes(mergedCodes, options.storage);
  }

  entries.sort(
    (a, b) =>
      (Number(a.parsed.request.submittedAtMs) || 0) - (Number(b.parsed.request.submittedAtMs) || 0),
  );

  return { ok: true, entries, ...(failed > 0 ? { reason: 'read-failed' as CloudFailureReason } : {}) };
}

export interface CloudSyncResult {
  ok: boolean;
  reason?: CloudFailureReason;
  requests: SubscriptionRequest[];
  codes: SubscriptionCodeRecord[];
  /** Number of cloud documents that were read successfully. */
  fetched: number;
}

const emptySync = (reason?: CloudFailureReason): CloudSyncResult => ({
  ok: false,
  ...(reason ? { reason } : {}),
  requests: [],
  codes: [],
  fetched: 0,
});

/**
 * Pulls this account's own requests (and the owner-written codes on them) and
 * folds them into the local cache. Runs on every signed-in device, so a code
 * issued on the owner's phone is visible on the doctor's phone.
 */
export async function syncMemberSubscriptionFromCloud(
  options: {
    io?: SubscriptionCloudIo | null;
    workspaceId?: string;
    subscriberId?: string;
    storage?: SubscriptionStorage | null;
  } = {},
): Promise<CloudSyncResult> {
  const io = await resolveIo(options.io);
  if (!io) return emptySync('cloud-disabled');

  let subscriberId = clean(options.subscriberId);
  if (!subscriberId) subscriberId = (await currentIdentity()).uid;
  if (!subscriberId) return emptySync('no-subscriber');

  let index: Record<string, any> | null = null;
  try {
    index = await io.getDoc(cloudIndexPath(subscriberId));
  } catch (error) {
    console.warn('Subscription index read failed:', error);
    return emptySync('read-failed');
  }

  const ids = asArray<string>(index?.requestIds)
    .map(clean)
    .filter(Boolean)
    .slice(-MAX_INDEXED_REQUESTS);
  if (ids.length === 0) return { ok: true, requests: [], codes: [], fetched: 0 };

  const cloudRequests: SubscriptionRequest[] = [];
  const cloudCodes: SubscriptionCodeRecord[] = [];
  let fetched = 0;
  for (const id of ids) {
    try {
      const workspaceId = clean(index?.workspaceId) || clean(options.workspaceId);
      if (!workspaceId) break;
      const data = await io.getDoc(cloudRequestPath(workspaceId, id));
      const parsed = cloudRequestToLocal(id, data);
      if (!parsed) continue;
      fetched += 1;
      cloudRequests.push(parsed.request);
      cloudCodes.push(...parsed.codes);
    } catch (error) {
      // One unreadable document must not discard the rest of the queue.
      console.warn('Subscription request read failed:', error);
    }
  }

  const mergedRequests = mergeRequests(loadRequests(options.storage), cloudRequests);
  const mergedCodes = mergeCodes(loadCodes(options.storage), cloudCodes);
  cacheRequests(mergedRequests, options.storage);
  cacheCodes(mergedCodes, options.storage);

  return { ok: true, requests: cloudRequests, codes: cloudCodes, fetched };
}

export interface CloudQueueResult {
  ok: boolean;
  reason?: CloudFailureReason;
  /** Parsed cloud requests (authoritative copy). */
  parsed: ParsedCloudRequest[];
}

/**
 * Platform-owner queue for one workspace. Requires `adminOf(workspaceId)`,
 * which the rules define as the platform owner only.
 */
export async function loadOwnerQueueFromCloud(
  options: { io?: SubscriptionCloudIo | null; workspaceId?: string; storage?: SubscriptionStorage | null } = {},
): Promise<CloudQueueResult> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled', parsed: [] };

  const workspaceId = clean(options.workspaceId) || (await currentIdentity()).workspaceId;
  if (!workspaceId) return { ok: false, reason: 'no-workspace', parsed: [] };

  let docs: CloudDoc[];
  try {
    docs = await io.listDocs(cloudRequestsPath(workspaceId));
  } catch (error) {
    console.warn('Owner queue read failed:', error);
    return { ok: false, reason: 'read-failed', parsed: [] };
  }

  const parsed: ParsedCloudRequest[] = [];
  for (const doc of docs) {
    const entry = cloudRequestToLocal(doc.id, doc.data);
    if (entry) parsed.push(entry);
  }
  parsed.sort((a, b) => (Number(a.request.submittedAtMs) || 0) - (Number(b.request.submittedAtMs) || 0));

  if (parsed.length > 0) {
    const merged = mergeRequests(
      loadRequests(options.storage),
      parsed.map((entry) => entry.request),
    );
    const mergedCodes = mergeCodes(
      loadCodes(options.storage),
      parsed.flatMap((entry) => entry.codes),
    );
    cacheRequests(merged, options.storage);
    cacheCodes(mergedCodes, options.storage);
  }

  return { ok: true, parsed };
}

export interface CloudPushResult {
  ok: boolean;
  reason?: CloudFailureReason;
}

/**
 * Owner decision write-back: manual payment confirmation, approval status and
 * the issued/revoked code list. The rules require the owner to keep
 * `subscriberId` and `workspaceId` unchanged, so the patch never touches them.
 */
export async function pushOwnerDecision(
  input: {
    requestId: string;
    workspaceId?: string;
    patch: Record<string, any>;
  },
  options: { io?: SubscriptionCloudIo | null } = {},
): Promise<CloudPushResult> {
  const io = await resolveIo(options.io);
  if (!io) return { ok: false, reason: 'cloud-disabled' };

  const requestId = clean(input?.requestId);
  if (!requestId) return { ok: false, reason: 'invalid-request' };
  const workspaceId = clean(input?.workspaceId) || (await currentIdentity()).workspaceId;
  if (!workspaceId) return { ok: false, reason: 'no-workspace' };

  const patch: Record<string, any> = { ...(input.patch || {}), updatedAtMs: Date.now() };
  // The rules compare both fields with the stored document; they are never part
  // of an owner decision.
  delete patch.subscriberId;
  delete patch.workspaceId;

  try {
    await io.setDoc(cloudRequestPath(workspaceId, requestId), patch, true);
    return { ok: true };
  } catch (error) {
    console.warn('Owner decision write failed:', error);
    return { ok: false, reason: 'write-failed' };
  }
}

/** All codes of one request, from the local cache (owner side). */
export function localCodesForRequest(requestId: string, storage?: SubscriptionStorage | null): SubscriptionCodeRecord[] {
  const id = clean(requestId);
  if (!id) return [];
  return loadCodes(storage).filter((code) => code.requestId === id);
}

/** Short, user-facing explanation for a skip/failure. English UI. */
export function describeCloudReason(reason?: string): string {
  switch (reason) {
    case 'cloud-disabled':
      return 'Cloud delivery is disabled on this build, so this record stays on this device.';
    case 'units-required':
      return 'A department request needs at least one department unit of your membership. Add a unit to deliver it to the owner.';
    case 'units-limit':
      return `A single request can include at most ${MAX_REQUEST_UNIT_DRAFTS} units. Submit additional units in another request.`;
    case 'doctors-count-invalid':
      return 'A clinic request needs a doctor count between 1 and 200 before it can be delivered.';
    case 'clinic-services-invalid':
      return 'A clinic request can list at most 20 services. Remove some and try again.';
    case 'no-workspace':
    case 'no-subscriber':
      return 'Sign in to a workspace account to deliver this request to the owner.';
    case 'subscriber-mismatch':
      return 'The signed-in account does not match the request owner, so it was not delivered.';
    case 'method-invalid':
      return 'Choose InstaPay or Visa before sending the request.';
    case 'amount-invalid':
      return 'The request has no priced amount, so it was not delivered.';
    case 'already-verified':
      return 'This request was already confirmed by the owner and cannot be re-sent.';
    case 'write-failed':
    case 'index-failed':
      return 'The request could not reach the cloud right now, so it is kept on this device. Press Save again to retry - the same request is reused, nothing is duplicated.';
    case 'workspace-conflict':
      return 'This account already belongs to a different workspace under that name. Sign in to that workspace instead of creating a new one.';
    case 'read-failed':
      return 'The cloud copy could not be read right now; showing the device copy.';
    default:
      return 'This record stays on this device.';
  }
}
