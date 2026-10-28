import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PERIOD_DAYS,
  DuplicatePendingPaymentError,
  ManualPaymentVerificationUnavailableError,
  applyVerifiedPaymentToPeriod,
  deriveLifecycle,
  entitlementsForPlan,
  historyForWorkspace,
  loadManualPayments,
  pendingForWorkspace,
  rejectManualPaymentMock,
  saveManualPayments,
  submitManualPayment,
  verifyManualPayment,
  verifyManualPaymentMock,
} from '../src/services/subscriptionLifecycle.ts';
import type { ManualPaymentRecord } from '../src/types/departmentTeam.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

const previewPayment = (overrides: Partial<ManualPaymentRecord> = {}): ManualPaymentRecord => ({
  id: 'pay-1',
  workspaceId: 'preview-local-workspace',
  method: 'instapay',
  reference: 'INSTA-1234',
  status: 'pending',
  submittedAtMs: NOW,
  submittedBy: 'preview-doctor-uid',
  mock: true,
  schemaVersion: 1,
  ...overrides,
});

test('active subscription with a future period is Active', () => {
  const view = deriveLifecycle({ sourceStatus: 'active', periodEndMs: NOW + 10 * DAY, nowMs: NOW });
  assert.equal(view.state, 'Active');
  assert.equal(view.renewalBlocked, false);
  assert.equal(view.daysLeft, 10);
});

test('a trial that has not ended is reported as Active', () => {
  const view = deriveLifecycle({ sourceStatus: 'trial', periodEndMs: NOW + DAY, nowMs: NOW });
  assert.equal(view.state, 'Active');
});

test('an elapsed active period becomes Renewal, not Pending', () => {
  const view = deriveLifecycle({ sourceStatus: 'active', periodEndMs: NOW - DAY, nowMs: NOW });
  assert.equal(view.state, 'Renewal');
  assert.equal(view.daysLeft, 0);
});

test('grace maps to Renewal and locked maps to Expired', () => {
  assert.equal(deriveLifecycle({ sourceStatus: 'grace', periodEndMs: NOW - DAY, nowMs: NOW }).state, 'Renewal');
  assert.equal(deriveLifecycle({ sourceStatus: 'locked', periodEndMs: null, nowMs: NOW }).state, 'Expired');
  assert.equal(deriveLifecycle({ sourceStatus: 'none', periodEndMs: null, nowMs: NOW }).state, 'Expired');
});

test('a pending payment outranks every other state and blocks renewal', () => {
  const view = deriveLifecycle({
    sourceStatus: 'active',
    periodEndMs: NOW + 30 * DAY,
    nowMs: NOW,
    pendingPayment: previewPayment(),
  });
  assert.equal(view.state, 'Pending');
  assert.equal(view.renewalBlocked, true);
  assert.equal(view.pendingPayment?.id, 'pay-1');
});

test('daysLeft is null without a period and never NaN', () => {
  const view = deriveLifecycle({ sourceStatus: 'none', periodEndMs: null, nowMs: NOW });
  assert.equal(view.daysLeft, null);
  const numeric = deriveLifecycle({ sourceStatus: 'active', periodEndMs: NOW - 5 * DAY, nowMs: NOW });
  assert.equal(Number.isNaN(numeric.daysLeft as number), false);
  assert.equal(numeric.daysLeft, 0);
});

test('entitlements use null (undefined) and never Infinity, with no new gating', () => {
  const entitlements = entitlementsForPlan('standard-30-day');
  assert.equal(entitlements.maxUnits, null);
  assert.equal(entitlements.maxBedsPerUnit, null);
  assert.notEqual(entitlements.maxUnits, Infinity);
  assert.equal(entitlements.waitingLists, true);
  assert.equal(entitlements.clinicMode, true);
});

test('submitManualPayment validates input and stores a pending record', () => {
  const record = submitManualPayment(
    { workspaceId: 'preview-local-workspace', reference: 'INSTA-9876', submittedBy: 'uid-1', nowMs: NOW },
    [],
  );
  assert.equal(record.status, 'pending');
  assert.equal(record.method, 'instapay');
  assert.equal(record.mock, undefined);

  assert.throws(
    () => submitManualPayment({ workspaceId: 'w', reference: 'ab', submittedBy: 'u', nowMs: NOW }, []),
    /invalid-reference/,
  );
  assert.throws(
    () => submitManualPayment({ workspaceId: 'w', reference: 'abcd', submittedBy: '', nowMs: NOW }, []),
    /submittedBy-required/,
  );
  assert.throws(
    () =>
      submitManualPayment(
        { workspaceId: 'w', reference: 'abcd', submittedBy: 'u', amount: -5, nowMs: NOW },
        [],
      ),
    /invalid-amount/,
  );
  assert.throws(
    () =>
      submitManualPayment(
        { workspaceId: 'w', reference: 'abcd', submittedBy: 'u', currency: 'usd1', nowMs: NOW },
        [],
      ),
    /invalid-currency/,
  );
});

test('a second pending payment for the same workspace is rejected', () => {
  const existing = [previewPayment()];
  assert.throws(
    () =>
      submitManualPayment(
        { workspaceId: 'preview-local-workspace', reference: 'INSTA-5555', submittedBy: 'uid-1', nowMs: NOW },
        existing,
      ),
    DuplicatePendingPaymentError,
  );
});

test('real payment verification is unavailable and always throws', () => {
  assert.throws(() => verifyManualPayment(), ManualPaymentVerificationUnavailableError);
});

test('the mock verifier accepts only preview workspaces tagged mock', () => {
  const verified = verifyManualPaymentMock(previewPayment(), { verifiedBy: 'uid-1', nowMs: NOW });
  assert.equal(verified.status, 'verified');
  assert.match(String(verified.note), /MOCK/);

  assert.throws(
    () => verifyManualPaymentMock(previewPayment({ mock: false }), { verifiedBy: 'uid-1', nowMs: NOW }),
    ManualPaymentVerificationUnavailableError,
  );
  assert.throws(
    () =>
      verifyManualPaymentMock(previewPayment({ workspaceId: 'cardiovault_master_workspace' }), {
        verifiedBy: 'uid-1',
        nowMs: NOW,
      }),
    ManualPaymentVerificationUnavailableError,
  );
});

test('mock rejection is allowed only under the same preview guard', () => {
  const rejected = rejectManualPaymentMock(previewPayment(), { verifiedBy: 'uid-1', reason: 'demo', nowMs: NOW });
  assert.equal(rejected.status, 'rejected');
  assert.throws(
    () => rejectManualPaymentMock(previewPayment({ mock: false }), { verifiedBy: 'uid-1', nowMs: NOW }),
    ManualPaymentVerificationUnavailableError,
  );
});

test('only a verified mock payment may extend the period', () => {
  const verified = previewPayment({ status: 'verified' });
  const extended = applyVerifiedPaymentToPeriod({ periodEndMs: NOW + 5 * DAY, payment: verified, nowMs: NOW });
  assert.equal(extended, NOW + 5 * DAY + DEFAULT_PERIOD_DAYS * DAY);

  const fromNow = applyVerifiedPaymentToPeriod({ periodEndMs: NOW - 90 * DAY, payment: verified, nowMs: NOW });
  assert.equal(fromNow, NOW + DEFAULT_PERIOD_DAYS * DAY);

  assert.throws(
    () => applyVerifiedPaymentToPeriod({ periodEndMs: null, payment: previewPayment({ status: 'pending' }), nowMs: NOW }),
    /payment-not-verified/,
  );
  assert.throws(
    () =>
      applyVerifiedPaymentToPeriod({
        periodEndMs: null,
        payment: previewPayment({ status: 'verified', mock: false }),
        nowMs: NOW,
      }),
    ManualPaymentVerificationUnavailableError,
  );
});

test('a verified mock payment for a non-preview workspace may not extend any period', () => {
  const forged = previewPayment({ status: 'verified', workspaceId: 'cardiovault_master_workspace' });
  assert.throws(
    () => applyVerifiedPaymentToPeriod({ periodEndMs: null, payment: forged, nowMs: NOW }),
    ManualPaymentVerificationUnavailableError,
  );
});

test('history is newest-first and pending lookup is workspace-scoped', () => {
  const records = [
    previewPayment({ id: 'old', submittedAtMs: NOW - 10 }),
    previewPayment({ id: 'new', status: 'verified', submittedAtMs: NOW + 10 }),
  ];
  assert.deepEqual(
    historyForWorkspace(records, 'preview-local-workspace').map((record) => record.id),
    ['new', 'old'],
  );
  const pending = previewPayment({ id: 'pending', submittedAtMs: NOW });
  assert.equal(pendingForWorkspace([pending], 'preview-local-workspace')?.id, 'pending');
  assert.equal(pendingForWorkspace([pending], 'other-workspace'), undefined);
});

test('payments round-trip through an injected storage and survive corrupt JSON', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const record = previewPayment();
  assert.equal(saveManualPayments([record], storage), true);
  assert.equal(loadManualPayments(storage).length, 1);

  store.set('cardiovault_dt_manual_payments_v1', '{not json');
  assert.deepEqual(loadManualPayments(storage), []);
});
