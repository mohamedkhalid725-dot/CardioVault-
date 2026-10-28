import type {
  AreaEntitlementState,
  OwnerApprovalArea,
  PaymentMethodChoice,
  PricingCurrency,
  PricingLineItem,
  SubscriptionCodeRecord,
  SubscriptionRequest,
  SubscriptionRequestType,
} from '../types/clinicArea';
import { CODE_VALID_DAYS, GRACE_DAYS, TRIAL_DAYS } from '../types/clinicArea.ts';
import { PREVIEW_USER, PREVIEW_WORKSPACE_ID } from '../config/localPreview.ts';
import { appendAuditEvent, listAuditEvents } from './localAuditLog.ts';
import { previewNowMs } from './previewClock.ts';

/**
 * Local-preview subscription request + owner approval pipeline (plan §7/§8/§19).
 *
 * Scope and honesty rules:
 *  - Everything is a device-local record. Submitting a request starts the
 *    3-day trial and NEVER represents a payment; only the owner (in the owner
 *    panel, or a future real owner) issues an activation code manually.
 *  - Prices are local-preview records: EGP 500 / USD 20 per unit and per
 *    doctor, billed for each 30-day subscription period.
 *  - Visa is selectable as a recorded choice but the provider is NOT live: the
 *    action area only points to WhatsApp for a manual solution. No fake
 *    transaction and no fake success is ever created here.
 *  - Each department code belongs to one unit; clinic codes cover the
 *    requested doctor count. Early renewal stacks 30 days after the current
 *    expiry. A renewal after expiry starts at approval time.
 *
 * Storage is injected in tests; the default is localStorage with an in-memory
 * fallback so a blocked-storage device keeps the session usable.
 */

export const SUB_REQUESTS_STORAGE_KEY = 'cardiovault_dt_sub_requests_v1';
export const SUB_CODES_STORAGE_KEY = 'cardiovault_dt_owner_codes_v1';

/** Local price table (awaiting owner confirmation — see module header). */
export const PRICE_EGP = 500;
export const PRICE_USD = 20;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const SUB_REQUEST_SCHEMA_VERSION = 1;
export const SUB_CODE_SCHEMA_VERSION = 1;

export interface SubscriptionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryBlobs = new Map<string, string>();

const fallbackStorage: SubscriptionStorage = {
  getItem: (key) => (memoryBlobs.has(key) ? (memoryBlobs.get(key) as string) : null),
  setItem: (key, value) => {
    memoryBlobs.set(key, value);
  },
  removeItem: (key) => {
    memoryBlobs.delete(key);
  },
};

function looksLikeStorage(candidate: unknown): candidate is SubscriptionStorage {
  const value = candidate as SubscriptionStorage | null;
  return (
    !!value &&
    typeof value.getItem === 'function' &&
    typeof value.setItem === 'function' &&
    typeof value.removeItem === 'function'
  );
}

/**
 * Resolves the storage lazily and defensively. localStorage is never touched at
 * import time, so importing this module must not throw anywhere (Node tests).
 */
export function resolveSubscriptionStorage(candidate?: SubscriptionStorage | null): SubscriptionStorage {
  if (looksLikeStorage(candidate)) return candidate;
  try {
    const local = globalThis.localStorage;
    if (looksLikeStorage(local)) return local;
  } catch {
    /* storage is blocked; the session keeps working in memory */
  }
  return fallbackStorage;
}

function readRaw(storage: SubscriptionStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return memoryBlobs.get(key) ?? null;
  }
}

/** Mirrors every write into the memory fallback; returns true when persisted. */
function writeRaw(storage: SubscriptionStorage, key: string, value: string): boolean {
  memoryBlobs.set(key, value);
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export class ReadOnlyAreaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyAreaError';
  }
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PRICES: Record<PricingCurrency, number> = { EGP: PRICE_EGP, USD: PRICE_USD };

/** Currency depends on the payment METHOD ONLY (instapay -> EGP, visa -> USD). */
export function currencyForMethod(method: PaymentMethodChoice): PricingCurrency {
  return method === 'instapay' ? 'EGP' : 'USD';
}

export function unitPriceForMethod(method: PaymentMethodChoice): number {
  return PRICES[currencyForMethod(method)];
}

/**
 * Itemized pricing lines. Department units and clinic doctors are TWO separate
 * lines; 'both' shows both (the UI adds the total), a single type shows one.
 * A zero quantity produces no line at all.
 */
export function buildLineItems(
  requestType: SubscriptionRequestType,
  unitsCount: number,
  doctorsCount: number,
  method: PaymentMethodChoice,
): PricingLineItem[] {
  const currency = currencyForMethod(method);
  const price = PRICES[currency];
  const items: PricingLineItem[] = [];

  const wantsDepartment = requestType === 'department' || requestType === 'both';
  const wantsClinic = requestType === 'clinic' || requestType === 'both';

  const units = Math.max(0, Math.trunc(unitsCount));
  const doctors = Math.max(0, Math.trunc(doctorsCount));

  if (wantsDepartment && units > 0) {
    items.push({ area: 'department', quantity: units, currency, unitPrice: price, subtotal: units * price });
  }
  if (wantsClinic && doctors > 0) {
    items.push({ area: 'clinic', quantity: doctors, currency, unitPrice: price, subtotal: doctors * price });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Request submission
// ---------------------------------------------------------------------------

export interface RequestUnitInput {
  id?: string;
  name: string;
  typeLabel: string;
  beds: number;
  receivesOperations: boolean;
}

export interface SubmitRequestInput {
  phone: string;
  requestType: SubscriptionRequestType;
  institutionName: string;
  unitDrafts?: RequestUnitInput[];
  doctorsCount?: number;
  clinicServices?: string[];
  chosenPaymentMethod: PaymentMethodChoice;
  actorUid?: string;
  actorName?: string;
  actorEmail?: string;
  /** Renewal requests must not restart the signup trial. Defaults to true. */
  startTrial?: boolean;
  isRenewal?: boolean;
  /** Injected clock; defaults to previewNowMs(). */
  nowMs?: number;
}

export interface SubmittedRequest {
  request: SubscriptionRequest;
  persisted: boolean;
}

const REQUEST_TYPES: SubscriptionRequestType[] = ['department', 'clinic', 'both'];
const PAYMENT_METHODS: PaymentMethodChoice[] = ['instapay', 'visa'];

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Egyptian-ish phone: at least 7 digits after stripping separators. */
export function countPhoneDigits(phone: string): number {
  return (clean(phone).match(/\d/g) || []).length;
}

let requestCounter = 0;
let codeCounter = 0;

/** Reads all stored requests (oldest first, matching append order). */
export function loadRequests(storage?: SubscriptionStorage | null): SubscriptionRequest[] {
  const target = resolveSubscriptionStorage(storage);
  const raw = readRaw(target, SUB_REQUESTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed.filter(isStoredRequest) as SubscriptionRequest[]) : [];
  } catch {
    return [];
  }
}

const isStoredRequest = (value: unknown): boolean =>
  !!value && typeof value === 'object' && typeof (value as SubscriptionRequest).id === 'string';

/** Reads all stored codes (oldest first). */
export function loadCodes(storage?: SubscriptionStorage | null): SubscriptionCodeRecord[] {
  const target = resolveSubscriptionStorage(storage);
  const raw = readRaw(target, SUB_CODES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const requestById = new Map(loadRequests(target).map((request) => [request.id, request]));
    return parsed.filter(isStoredCode).map((code) => {
      const savedCode = code as SubscriptionCodeRecord;
      if (savedCode.subscriberId) return savedCode;
      const request = requestById.get(savedCode.requestId);
      return request?.createdBy ? { ...savedCode, subscriberId: request.createdBy } : savedCode;
    });
  } catch {
    return [];
  }
}

const isStoredCode = (value: unknown): boolean =>
  !!value && typeof value === 'object' && typeof (value as SubscriptionCodeRecord).id === 'string';

const writeRequests = (requests: SubscriptionRequest[], storage?: SubscriptionStorage): boolean =>
  writeRaw(resolveSubscriptionStorage(storage), SUB_REQUESTS_STORAGE_KEY, JSON.stringify(requests));

const writeCodes = (codes: SubscriptionCodeRecord[], storage?: SubscriptionStorage): boolean =>
  writeRaw(resolveSubscriptionStorage(storage), SUB_CODES_STORAGE_KEY, JSON.stringify(codes));

/** True once ANY request or code exists — the honest "history exists" signal. */
export function subscriptionHistoryExists(storage?: SubscriptionStorage | null, subscriberId?: string): boolean {
  const memberId = clean(subscriberId);
  const requests = loadRequests(storage).filter((request) => !memberId || request.createdBy === memberId);
  const codes = loadCodes(storage).filter((code) => !memberId || code.subscriberId === memberId);
  return requests.length > 0 || codes.length > 0;
}

const audit = (
  action: string,
  entityId: string,
  summary: string,
  meta: Record<string, string | number | boolean> | undefined,
  nowMs: number,
): void => {
  try {
    appendAuditEvent({
      workspaceId: PREVIEW_WORKSPACE_ID,
      unitId: 'subscription',
      actorUid: PREVIEW_USER.uid,
      actorName: PREVIEW_USER.name,
      action,
      entityType: 'subscription',
      entityId,
      result: 'success',
      summary,
      meta,
      nowMs,
    });
  } catch {
    // The audit log keeps a failed write in its own memory buffer; a storage
    // problem must never block the request/code action itself.
  }
};

/**
 * Validates and stores a subscription request. Throws on invalid input — the
 * message ALWAYS starts with a short code (invalid-phone, request-type-missing,
 * units-required, doctors-count-required, payment-method-missing,
 * institution-name-required) so callers can map it to a friendly message.
 *
 * The trial starts NOW (3 days, approved decision): submitting is never a
 * payment and the request sits pending until the owner approves.
 */
export function submitRequest(input: SubmitRequestInput, storage?: SubscriptionStorage): SubmittedRequest {
  const nowMs = Number.isFinite(input?.nowMs) ? Math.floor(Number(input.nowMs)) : previewNowMs();
  const phone = clean(input?.phone);
  const type = clean(input?.requestType) as SubscriptionRequestType;
  const institutionName = clean(input?.institutionName);
  const method = input?.chosenPaymentMethod;

  if (!type || !REQUEST_TYPES.includes(type)) {
    throw new Error('request-type-missing: choose a request type (department, clinic, or both).');
  }
  if (countPhoneDigits(phone) < 7) {
    throw new Error('invalid-phone: enter a valid phone number with at least 7 digits.');
  }
  if (institutionName.length < 2) {
    throw new Error('institution-name-required: enter the institution/clinic name (2+ characters).');
  }
  if (!method || !PAYMENT_METHODS.includes(method)) {
    throw new Error('payment-method-missing: choose a payment method first.');
  }

  const unitDrafts = Array.isArray(input?.unitDrafts) ? input.unitDrafts : [];
  if ((type === 'department' || type === 'both') && unitDrafts.length < 1) {
    throw new Error('units-required: add at least one department unit.');
  }

  const doctorsCountRaw = Number(input?.doctorsCount);
  let doctorsCount = 0;
  if (type === 'clinic' || type === 'both') {
    if (!Number.isInteger(doctorsCountRaw) || doctorsCountRaw < 1 || doctorsCountRaw > 200) {
      throw new Error('doctors-count-required: enter the clinic doctor count (1–200).');
    }
    doctorsCount = doctorsCountRaw;
  }

  const clinicServices = Array.isArray(input?.clinicServices)
    ? input.clinicServices.map((s) => clean(s)).filter(Boolean)
    : [];

  const request: SubscriptionRequest = {
    id: `subreq-${nowMs}-${(requestCounter += 1)}`,
    phone,
    requestType: type,
    institutionName,
    unitDrafts: unitDrafts.map((unit) => ({
      ...(clean(unit?.id) ? { id: clean(unit.id) } : {}),
      name: clean(unit?.name),
      typeLabel: clean(unit?.typeLabel) || 'Unit',
      beds: Math.max(0, Math.trunc(Number(unit?.beds) || 0)),
      receivesOperations: !!unit?.receivesOperations,
    })),
    doctorsCount,
    clinicServices,
    paymentMethod: method,
    lineItems: buildLineItems(type, unitDrafts.length, doctorsCount, method),
    submittedAtMs: nowMs,
    trialStartedAtMs: nowMs,
    trialEligible: input.startTrial !== false,
    isRenewal: !!input.isRenewal,
    createdBy: clean(input?.actorUid) || PREVIEW_USER.uid,
    createdByName: clean(input?.actorName) || PREVIEW_USER.name,
    ...(clean(input?.actorEmail) ? { createdByEmail: clean(input.actorEmail).toLowerCase() } : {}),
    schemaVersion: SUB_REQUEST_SCHEMA_VERSION,
  };

  const persisted = writeRequests([...loadRequests(storage), request], storage);
  audit('sub_request.submitted', request.id, `طلب اشتراك (${type}) — ${institutionName}`, {
    requestType: type,
    paymentMethod: method,
    totalLineItems: request.lineItems.length,
  }, nowMs);
  return { request, persisted };
}

export interface PaymentVerificationResult {
  request: SubscriptionRequest;
  persisted: boolean;
}

/** Records the owner's manual payment check; it never contacts a payment provider. */
export function setPaymentVerified(
  input: { requestId: string; verified: boolean; actorName?: string; nowMs?: number },
  storage?: SubscriptionStorage,
): PaymentVerificationResult {
  const nowMs = Number.isFinite(input?.nowMs) ? Math.floor(Number(input.nowMs)) : previewNowMs();
  const requestId = clean(input?.requestId);
  const requests = loadRequests(storage);
  const index = requests.findIndex((request) => request.id === requestId);
  if (index < 0) throw new Error('request-not-found: payment confirmation requires an existing subscription request.');

  const request = requests[index];
  const updated: SubscriptionRequest = input.verified
    ? { ...request, paymentVerifiedAtMs: nowMs, paymentVerifiedBy: clean(input.actorName) || PREVIEW_USER.name }
    : (() => {
        const { paymentVerifiedAtMs: _verifiedAt, paymentVerifiedBy: _verifiedBy, ...unverified } = request;
        return unverified;
      })();
  const next = requests.map((item, itemIndex) => itemIndex === index ? updated : item);
  const persisted = writeRequests(next, storage);
  audit(
    input.verified ? 'sub_payment.manually_verified' : 'sub_payment.verification_removed',
    request.id,
    input.verified ? `Payment manually confirmed for ${request.institutionName}` : `Manual payment confirmation removed for ${request.institutionName}`,
    { requestId: request.id, paymentMethod: request.paymentMethod },
    nowMs,
  );
  return { request: updated, persisted };
}

// ---------------------------------------------------------------------------
// Codes: issue / re-issue / revoke
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomChunk = (): string =>
  Array.from(
    { length: 4 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');

const codePrefix = (area: 'department' | 'clinic'): string => (area === 'department' ? 'DPT' : 'CLN');

export interface IssueCodeInput {
  requestId: string;
  area: OwnerApprovalArea;
  /** Optional unit ids for a partial department activation or renewal. */
  unitIds?: string[];
  actorName?: string;
  /** Injected clock; defaults to previewNowMs(). */
  nowMs?: number;
}

export interface IssueCodeResult {
  codes: SubscriptionCodeRecord[];
  persisted: boolean;
}

/**
 * Issues one code for each selected department unit and one clinic code for
 * the requested doctor count. Existing codes remain in history and an early
 * renewal starts after the latest not-yet-expired code for the same scope.
 */
export function issueCode(input: IssueCodeInput, storage?: SubscriptionStorage): IssueCodeResult {
  const nowMs = Number.isFinite(input?.nowMs) ? Math.floor(Number(input.nowMs)) : previewNowMs();
  const requestId = clean(input?.requestId);
  const area = input?.area;
  if (!requestId) throw new Error('request-id-required: a request id is required to issue a code.');
  if (area !== 'department' && area !== 'clinic' && area !== 'both') {
    throw new Error('code-area-invalid: area must be department, clinic, or both.');
  }
  const requests = loadRequests(storage);
  const request = requests.find((candidate) => candidate.id === requestId);
  if (!request) {
    throw new Error('request-not-found: issue a code against an existing request.');
  }
  if (!request.paymentVerifiedAtMs) {
    throw new Error('payment-not-verified: confirm the external payment manually before issuing an activation or renewal code.');
  }

  const requestedUnits = request.unitDrafts.map((unit, index) => ({
    id: clean(unit.id) || `${request.id}:unit-${index + 1}`,
    name: clean(unit.name) || `Unit ${index + 1}`,
  }));
  const selectedIds = Array.isArray(input.unitIds)
    ? [...new Set(input.unitIds.map(clean).filter(Boolean))]
    : requestedUnits.map((unit) => unit.id);
  const departmentTargets = area === 'clinic'
    ? []
    : requestedUnits.filter((unit) => selectedIds.includes(unit.id));
  const clinicTarget = area === 'clinic' || area === 'both';
  if (area !== 'clinic' && departmentTargets.length === 0) {
    throw new Error('unit-scope-required: select at least one requested unit.');
  }
  if (clinicTarget && request.doctorsCount < 1) {
    throw new Error('clinic-scope-missing: this request does not include a clinic.');
  }
  if (area === 'department' && request.requestType === 'clinic') {
    throw new Error('department-scope-missing: this request does not include a department.');
  }

  const existing = loadCodes(storage);
  const next = [...existing];
  const created: SubscriptionCodeRecord[] = [];

  const scopes: Array<{ area: 'department' | 'clinic'; unitId?: string; unitName?: string; quantity: number }> = [
    ...departmentTargets.map((unit) => ({ area: 'department' as const, unitId: unit.id, unitName: unit.name, quantity: 1 })),
    ...(clinicTarget ? [{ area: 'clinic' as const, quantity: Math.max(1, request.doctorsCount) }] : []),
  ];
  for (const scope of scopes) {
    const latestScopeExpiry = next
      .filter((record) =>
        record.area === scope.area &&
        record.status === 'active' &&
        record.subscriberId === request.createdBy &&
        (scope.area === 'clinic' ? !record.unitId : record.unitId === scope.unitId)
      )
      .reduce((latest, record) => Math.max(latest, record.expiresAtMs || ((record.startsAtMs || record.issuedAtMs) + record.validForDays * DAY_MS)), 0);
    const startsAtMs = Math.max(nowMs, latestScopeExpiry > nowMs ? latestScopeExpiry : nowMs);
    const expiresAtMs = startsAtMs + CODE_VALID_DAYS * DAY_MS;
    const codeId = `subcode-${nowMs}-${(codeCounter += 1)}`;
    let code = '';
    do {
      code = `${codePrefix(scope.area)}-${randomChunk()}-30D`;
    } while (next.some((record) => record.code === code));
    const record: SubscriptionCodeRecord = {
      id: codeId,
      code,
      requestId,
      area: scope.area,
      subscriberId: request.createdBy,
      ...(scope.unitId ? { unitId: scope.unitId, unitName: scope.unitName } : {}),
      quantity: scope.quantity,
      issuedAtMs: nowMs,
      startsAtMs,
      expiresAtMs,
      validForDays: CODE_VALID_DAYS,
      status: 'active',
      schemaVersion: SUB_CODE_SCHEMA_VERSION,
    };
    next.push(record);
    created.push(record);
    audit('sub_code.issued', record.id, `Activation code issued (${scope.area}) ${record.code}`, {
      requestId,
      area: scope.area,
      ...(scope.unitId ? { unitId: scope.unitId } : {}),
      quantity: scope.quantity,
      validForDays: record.validForDays,
      startsAtMs,
      expiresAtMs,
    }, nowMs);
  }

  const persisted = writeCodes(next, storage);
  return { codes: created, persisted };
}

export interface RevokeCodeResult {
  code: SubscriptionCodeRecord;
  persisted: boolean;
}

/** Explicit revocation. Never implicit; never deletes the record. */
export function revokeCode(
  input: { codeId: string; reason?: string; nowMs?: number },
  storage?: SubscriptionStorage,
): RevokeCodeResult {
  const nowMs = Number.isFinite(input?.nowMs) ? Math.floor(Number(input.nowMs)) : previewNowMs();
  const codeId = clean(input?.codeId);
  const existing = loadCodes(storage);
  const index = existing.findIndex((record) => record.id === codeId);
  if (index < 0) throw new Error('code-not-found: revoke an existing code id.');
  if (existing[index].status === 'revoked') return { code: existing[index], persisted: true };

  const target = existing[index];
  const next = existing.map((record) =>
    record.status === 'active' &&
    record.area === target.area &&
    record.subscriberId === target.subscriberId &&
    (target.unitId ? record.unitId === target.unitId : !record.unitId)
      ? { ...record, status: 'revoked' as const, revokedAtMs: nowMs }
      : record
  );
  const revoked = next[index];
  const persisted = writeCodes(next, storage);
  audit('sub_code.revoked', revoked.id, `إبطال رمز (${revoked.area}) ${revoked.code} — سيجعل المساحة قراءة فقط`, {
    requestId: revoked.requestId,
    reason: clean(input?.reason) || 'owner-revoked',
  }, nowMs);
  return { code: revoked, persisted };
}

// ---------------------------------------------------------------------------
// Entitlement state per area
// ---------------------------------------------------------------------------

function latestTrialStartedAtMs(requests: SubscriptionRequest[], area?: 'department' | 'clinic', unitId?: string, subscriberId?: string): number | null {
  let latest: number | null = null;
  for (const request of requests) {
    if (subscriberId && request.createdBy !== subscriberId) continue;
    if (request.trialEligible === false) continue;
    if (area === 'department' && request.requestType === 'clinic') continue;
    if (area === 'clinic' && request.requestType === 'department') continue;
    if (unitId && !request.unitDrafts.some((unit, index) => (clean(unit.id) || `${request.id}:unit-${index + 1}`) === unitId)) continue;
    const started = Number(request?.trialStartedAtMs);
    if (Number.isFinite(started) && (latest === null || started > latest)) latest = started;
  }
  return latest;
}

const codeStart = (record: SubscriptionCodeRecord): number => record.startsAtMs ?? record.issuedAtMs;
const codeExpiry = (record: SubscriptionCodeRecord): number =>
  record.expiresAtMs ?? (codeStart(record) + record.validForDays * DAY_MS);

export function computeUnitEntitlementState(
  unitId: string,
  nowMs?: number,
  storage?: SubscriptionStorage | null,
  subscriberId?: string,
): AreaEntitlementState {
  const now = Number.isFinite(nowMs) ? Math.floor(Number(nowMs)) : previewNowMs();
  const memberId = clean(subscriberId);
  const scoped = loadCodes(storage).filter((record) => record.area === 'department' && record.unitId === unitId && record.status === 'active' && (!memberId || record.subscriberId === memberId));
  const currentExpiry = scoped.filter((record) => codeStart(record) <= now && codeExpiry(record) > now).reduce((end, record) => Math.max(end, codeExpiry(record)), 0);
  if (currentExpiry > now) return 'active';
  const latestExpiry = scoped.reduce((end, record) => Math.max(end, codeExpiry(record)), 0);
  if (latestExpiry > 0 && latestExpiry <= now && now - latestExpiry <= GRACE_DAYS * DAY_MS) return 'grace';
  const trial = latestTrialStartedAtMs(loadRequests(storage), 'department', unitId, memberId);
  if (trial !== null && trial + TRIAL_DAYS * DAY_MS > now) return 'trial';
  return 'read-only';
}

/** Enforces the local-preview write gate for one department unit. */
export function assertUnitWritable(unitId: string, storage?: SubscriptionStorage | null, subscriberId?: string): void {
  const id = clean(unitId);
  if (!id || !subscriptionHistoryExists(storage, subscriberId)) return;
  const state = computeUnitEntitlementState(id, undefined, storage, subscriberId);
  if (state === 'read-only') {
    throw new ReadOnlyAreaError(`read-only-area: Unit ${id} is read-only until its own trial or subscription is active.`);
  }
}

export function describeUnitEntitlement(unitId: string, nowMs?: number, storage?: SubscriptionStorage | null, subscriberId?: string) {
  const now = Number.isFinite(nowMs) ? Math.floor(Number(nowMs)) : previewNowMs();
  const memberId = clean(subscriberId);
  const state = computeUnitEntitlementState(unitId, now, storage, memberId);
  const scoped = loadCodes(storage).filter((record) => record.area === 'department' && record.unitId === unitId && record.status === 'active' && (!memberId || record.subscriberId === memberId));
  const paidUntil = scoped.reduce((end, record) => Math.max(end, codeExpiry(record)), 0) || null;
  const trial = latestTrialStartedAtMs(loadRequests(storage), 'department', unitId, memberId);
  return { state, untilMs: state === 'trial' && trial !== null ? trial + TRIAL_DAYS * DAY_MS : paidUntil };
}

/**
 * Lifecycle of ONE area at `nowMs` (plan §7/§8, precedence applied):
 *  1. any ACTIVE code for this area not yet expired      -> 'active'
 *  2. the most recent expired active code within 3 days  -> 'grace'
 *  3. the latest trial start inside 3 days               -> 'trial'
 *  4. otherwise                                          -> 'read-only'
 *
 * Areas are independent: a partial approval (department only) leaves the clinic
 * area evaluating its own codes/trial, so it can be 'read-only' while the
 * department is 'active'. A trial only applies when no valid code exists.
 */
export function computeEntitlementState(
  area: 'department' | 'clinic',
  nowMs?: number,
  storage?: SubscriptionStorage | null,
  subscriberId?: string,
): AreaEntitlementState {
  const now = Number.isFinite(nowMs) ? Math.floor(Number(nowMs)) : previewNowMs();
  const memberId = clean(subscriberId);
  const active = loadCodes(storage).filter((record) => record.area === area && record.status === 'active' && (!memberId || record.subscriberId === memberId));

  let latestExpiry: number | null = null;
  for (const record of active) {
    const expiry = codeExpiry(record);
    if (codeStart(record) <= now && expiry > now) return 'active';
    if (latestExpiry === null || expiry > latestExpiry) latestExpiry = expiry;
  }
  if (latestExpiry !== null && latestExpiry <= now && now - latestExpiry <= GRACE_DAYS * DAY_MS) return 'grace';

  const trial = latestTrialStartedAtMs(loadRequests(storage), area, undefined, memberId);
  if (trial !== null && trial + TRIAL_DAYS * DAY_MS > now) return 'trial';

  return 'read-only';
}

/**
 * Throws ReadOnlyAreaError when the given state is 'read-only'. The message is
 * Arabic-friendly because the gate is user-facing in the preview.
 */
export function assertAreaWritable(state: AreaEntitlementState): void {
  if (state === 'read-only') {
    throw new ReadOnlyAreaError(
      'read-only-area: مساحة القراءة فقط — التفعيل بعد موافقة المالك أو تجديد الاشتراك. ' +
        'Cannot write: this area is read-only until the owner approves or the subscription is renewed.',
    );
  }
}

/**
 * The setup/save gate (wired from institutionSetup.createUnitsFromDraft):
 * with NO subscription history yet this is the very first signup, so creating
 * units is allowed (the request step starts the trial at save). Once history
 * exists, the standard state machine decides.
 */
export function departmentIsWritable(storage?: SubscriptionStorage | null): boolean {
  if (!subscriptionHistoryExists(storage)) return true;
  return computeEntitlementState('department', undefined, storage) !== 'read-only';
}

/** Audit rows for the integration checks and the owner panel history. */
export function listSubscriptionAuditEvents(storage?: SubscriptionStorage): ReturnType<typeof listAuditEvents> {
  try {
    return listAuditEvents({ limit: 50 });
  } catch {
    return [];
  }
}

export interface AreaEntitlementDescription {
  state: AreaEntitlementState;
  /** Expiry (active/grace) or trial-end timestamp when known, else null. */
  untilMs: number | null;
}

/**
 * State + the honest "until" timestamp for one area, for banner display:
 * - active/grace: `untilMs` is the latest active code's expiry;
 * - trial:        `untilMs` is trialStart + 3 days;
 * - read-only:    null (no promises — the owner must approve/renew first).
 */
export function describeAreaEntitlement(
  area: 'department' | 'clinic',
  nowMs?: number,
  storage?: SubscriptionStorage | null,
  subscriberId?: string,
): AreaEntitlementDescription {
  const now = Number.isFinite(nowMs) ? Math.floor(Number(nowMs)) : previewNowMs();
  const memberId = clean(subscriberId);
  const active = loadCodes(storage).filter((record) => record.area === area && record.status === 'active' && (!memberId || record.subscriberId === memberId));

  let latestExpiry: number | null = null;
  let unexpiredSeen = false;
  for (const record of active) {
    const expiry = codeExpiry(record);
    if (codeStart(record) <= now && expiry > now) unexpiredSeen = true;
    if (latestExpiry === null || expiry > latestExpiry) latestExpiry = expiry;
  }
  if (unexpiredSeen) return { state: 'active', untilMs: latestExpiry };
  if (latestExpiry !== null && latestExpiry <= now && now - latestExpiry <= GRACE_DAYS * DAY_MS) {
    return { state: 'grace', untilMs: latestExpiry };
  }

  const trial = latestTrialStartedAtMs(loadRequests(storage), area, undefined, memberId);
  if (trial !== null && trial + TRIAL_DAYS * DAY_MS > now) {
    return { state: 'trial', untilMs: trial + TRIAL_DAYS * DAY_MS };
  }

  return { state: 'read-only', untilMs: null };
}
