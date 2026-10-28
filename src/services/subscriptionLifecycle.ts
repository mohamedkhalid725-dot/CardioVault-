import { DEPARTMENT_TEAM_SCHEMA_VERSION } from '../types/departmentTeam.ts';
import type {
  ManualPaymentRecord,
  PlanEntitlements,
  SubscriptionLifecycleState,
  SubscriptionLifecycleView,
} from '../types/departmentTeam.ts';

/**
 * Subscription lifecycle + manual payments (local preview).
 *
 * Product corrections enforced here:
 *  - There is NO verified manual-payment approval flow in this repository, so
 *    `verifyManualPayment` always throws. Real payments stay `pending`.
 *  - A mock simulator is allowed ONLY for a preview workspace and records that
 *    are explicitly tagged `mock: true`.
 *  - `null` in PlanEntitlements means "not defined yet", never "unlimited".
 *    This module reports values only; it does not gate any feature. Existing
 *    behaviour is therefore preserved.
 */

export const MANUAL_PAYMENTS_KEY = 'cardiovault_dt_manual_payments_v1';
export const DEFAULT_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;

export interface PaymentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();

function safeStorage(candidate?: PaymentStorage | null): PaymentStorage {
  if (candidate) return candidate;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* fall through to memory */
  }
  return {
    getItem: (key) => (memory.has(key) ? (memory.get(key) as string) : null),
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
}

export function loadManualPayments(storage?: PaymentStorage | null): ManualPaymentRecord[] {
  try {
    const raw = safeStorage(storage).getItem(MANUAL_PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ManualPaymentRecord =>
        !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.workspaceId === 'string',
    );
  } catch {
    return [];
  }
}

export function saveManualPayments(
  records: ManualPaymentRecord[],
  storage?: PaymentStorage | null,
): boolean {
  try {
    safeStorage(storage).setItem(MANUAL_PAYMENTS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export interface DeriveLifecycleInput {
  sourceStatus: string;
  periodEndMs: number | null;
  nowMs?: number;
  pendingPayment?: ManualPaymentRecord;
  planId?: string;
}

/**
 * Maps the existing workspace subscription statuses (none/trial/active/grace/
 * locked) onto the roadmap's four observable states.
 */
export function deriveLifecycle(input: DeriveLifecycleInput): SubscriptionLifecycleView {
  const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
  const sourceStatus = String(input.sourceStatus || 'none').toLowerCase();
  const periodEndMs =
    typeof input.periodEndMs === 'number' && Number.isFinite(input.periodEndMs) ? input.periodEndMs : null;
  const pendingPayment = input.pendingPayment && input.pendingPayment.status === 'pending' ? input.pendingPayment : undefined;

  const daysLeft =
    periodEndMs === null ? null : Math.max(0, Math.ceil((periodEndMs - nowMs) / DAY_MS));

  let state: SubscriptionLifecycleState;
  if (pendingPayment) {
    state = 'Pending';
  } else if (sourceStatus === 'active' || sourceStatus === 'trial') {
    state = periodEndMs !== null && periodEndMs <= nowMs ? 'Renewal' : 'Active';
  } else if (sourceStatus === 'grace') {
    state = 'Renewal';
  } else {
    state = 'Expired';
  }

  return {
    state,
    sourceStatus,
    periodEndMs,
    daysLeft,
    entitlements: entitlementsForPlan(input.planId),
    pendingPayment,
    renewalBlocked: state === 'Pending',
  };
}

/**
 * Mirrors the current product behaviour: nothing is gated by plan today.
 * `maxUnits` / `maxBedsPerUnit` are `null` because no limits are defined in
 * the repository — callers must treat that as "undefined", not unlimited.
 */
export function entitlementsForPlan(_planId?: string): PlanEntitlements {
  return {
    maxUnits: null,
    maxBedsPerUnit: null,
    waitingLists: true,
    clinicMode: true,
  };
}

export class DuplicatePendingPaymentError extends Error {
  constructor() {
    super('duplicate-pending-payment');
    this.name = 'DuplicatePendingPaymentError';
  }
}

export class ManualPaymentVerificationUnavailableError extends Error {
  constructor() {
    super(
      'No verified manual-payment approval flow exists in this build. ' +
        'The payment stays Pending; a real payment is never marked verified here.',
    );
    this.name = 'ManualPaymentVerificationUnavailableError';
  }
}

export interface SubmitManualPaymentInput {
  workspaceId: string;
  reference: string;
  amount?: number;
  currency?: string;
  submittedBy: string;
  nowMs?: number;
}

export function submitManualPayment(
  input: SubmitManualPaymentInput,
  existing: ManualPaymentRecord[] = [],
): ManualPaymentRecord {
  const workspaceId = String(input.workspaceId || '').trim();
  const reference = String(input.reference || '').trim();
  const submittedBy = String(input.submittedBy || '').trim();
  if (!workspaceId) throw new Error('workspaceId-required');
  if (!submittedBy) throw new Error('submittedBy-required');
  if (reference.length < 4 || reference.length > 64) throw new Error('invalid-reference');
  if (existing.some((record) => record.workspaceId === workspaceId && record.status === 'pending')) {
    throw new DuplicatePendingPaymentError();
  }

  let amount: number | undefined;
  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('invalid-amount');
    amount = input.amount;
  }

  let currency: string | undefined;
  if (input.currency !== undefined && String(input.currency).trim() !== '') {
    const clean = String(input.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(clean)) throw new Error('invalid-currency');
    currency = clean;
  }

  return {
    id: `pay-${input.nowMs ?? Date.now()}-${existing.length + 1}`,
    workspaceId,
    method: 'instapay',
    reference,
    amount,
    currency,
    status: 'pending',
    submittedAtMs: input.nowMs ?? Date.now(),
    submittedBy,
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };
}

/** Always throws: a real payment may not be verified by this build. */
export function verifyManualPayment(): never {
  throw new ManualPaymentVerificationUnavailableError();
}

function assertMockPreview(record: ManualPaymentRecord): void {
  const isPreview = record.workspaceId.startsWith('preview');
  if (!isPreview || record.mock !== true) {
    throw new ManualPaymentVerificationUnavailableError();
  }
}

export function verifyManualPaymentMock(
  record: ManualPaymentRecord,
  options: { verifiedBy: string; nowMs?: number },
): ManualPaymentRecord {
  assertMockPreview(record);
  const verifiedBy = String(options.verifiedBy || '').trim();
  if (!verifiedBy) throw new Error('verifiedBy-required');
  return {
    ...record,
    status: 'verified',
    verifiedAtMs: options.nowMs ?? Date.now(),
    verifiedBy,
    note: 'MOCK payment — demo only. Proves nothing about a real transfer.',
  };
}

export function rejectManualPaymentMock(
  record: ManualPaymentRecord,
  options: { verifiedBy: string; reason?: string; nowMs?: number },
): ManualPaymentRecord {
  assertMockPreview(record);
  const verifiedBy = String(options.verifiedBy || '').trim();
  if (!verifiedBy) throw new Error('verifiedBy-required');
  return {
    ...record,
    status: 'rejected',
    verifiedAtMs: options.nowMs ?? Date.now(),
    verifiedBy,
    note: options.reason ? `MOCK rejection — ${options.reason}` : 'MOCK rejection — demo only.',
  };
}

export interface ApplyPaymentInput {
  periodEndMs: number | null;
  payment: ManualPaymentRecord;
  nowMs?: number;
  periodDays?: number;
}

/** Extends the paid period ONLY for a verified mock payment in a preview workspace. */
export function applyVerifiedPaymentToPeriod(input: ApplyPaymentInput): number {
  if (input.payment.mock !== true) {
    throw new ManualPaymentVerificationUnavailableError();
  }
  if (!String(input.payment.workspaceId || '').startsWith('preview')) {
    throw new ManualPaymentVerificationUnavailableError();
  }
  if (input.payment.status !== 'verified') throw new Error('payment-not-verified');

  const nowMs = input.nowMs ?? Date.now();
  const periodDays = Number.isFinite(input.periodDays) ? Math.max(1, input.periodDays as number) : DEFAULT_PERIOD_DAYS;
  const base =
    typeof input.periodEndMs === 'number' && Number.isFinite(input.periodEndMs)
      ? Math.max(nowMs, input.periodEndMs)
      : nowMs;
  return base + periodDays * DAY_MS;
}

export function pendingForWorkspace(
  records: ManualPaymentRecord[],
  workspaceId: string,
): ManualPaymentRecord | undefined {
  return records.find((record) => record.workspaceId === workspaceId && record.status === 'pending');
}

export function historyForWorkspace(
  records: ManualPaymentRecord[],
  workspaceId: string,
): ManualPaymentRecord[] {
  return records
    .filter((record) => record.workspaceId === workspaceId)
    .slice()
    .sort((a, b) => b.submittedAtMs - a.submittedAtMs);
}
