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

export type CloudRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type CloudSkipReason =
  | 'cloud-disabled'
  | 'no-workspace'
  | 'no-subscriber'
  | 'subscriber-mismatch'
  | 'method-invalid'
  | 'units-required'
  | 'doctors-count-invalid'
  | 'clinic-services-invalid'
  | 'amount-invalid'
  | 'already-verified'
  | 'invalid-request';

export type CloudFailureReason =
  | CloudSkipReason
  | 'read-failed'
  | 'write-failed'
  | 'index-failed';

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
  context: { workspaceId?: string; subscriberId?: string },
): CloudRequestBuild {
  const unitIds = requestUnitIds(request);
  const fail = (reason: CloudSkipReason): CloudRequestBuild => ({ ok: false, reason, unitIds });

  if (!request || !clean(request.id)) return fail('invalid-request');
  const workspaceId = clean(context?.workspaceId);
  if (!workspaceId) return fail('no-workspace');
  const subscriberId = clean(context?.subscriberId);
  if (!subscriberId) return fail('no-subscriber');
  if (clean(request.createdBy) !== subscriberId) return fail('subscriber-mismatch');
  if (request.paymentMethod !== 'instapay' && request.paymentMethod !== 'visa') return fail('method-invalid');

  // A clinic request without any department unit is legal in the rules, but only
  // for the clinic request type and only with a priced doctor count.
  const clinicOnly = clean(request.requestType) === 'clinic' && unitIds.length === 0;
  if (unitIds.length === 0 && !clinicOnly) return fail('units-required');
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
    subscriberName: clean(request.createdByName),
    status: 'pending',
    method: request.paymentMethod,
    unitIds,
    amount,
    currency,
    // The owner flips this by hand after checking the transfer. A client-side
    // create must always start false - the rules enforce it.
    paymentVerified: false,
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

  const built = buildCloudRequestDoc(request, { workspaceId, subscriberId });
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
      return 'The request could not reach the cloud right now, so it is kept on this device.';
    case 'read-failed':
      return 'The cloud copy could not be read right now; showing the device copy.';
    default:
      return 'This record stays on this device.';
  }
}
