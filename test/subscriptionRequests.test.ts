import test from 'node:test';
import assert from 'node:assert/strict';
import type { SubscriptionRequest, SubscriptionRequestType } from '../src/types/clinicArea';
import {
  DAY_MS,
  PRICE_EGP,
  PRICE_USD,
  SUB_CODES_STORAGE_KEY,
  SUB_REQUESTS_STORAGE_KEY,
  assertAreaWritable,
  buildLineItems,
  computeEntitlementState,
  currencyForMethod,
  issueCode,
  loadCodes,
  loadRequests,
  ReadOnlyAreaError,
  revokeCode,
  setPaymentVerified,
  submitRequest,
  subscriptionHistoryExists,
  type SubscriptionStorage,
} from '../src/services/subscriptionRequests.ts';
import {
  clearDraft,
  createUnitsFromDraft,
  INSTITUTION_SETUP_STORAGE_KEY,
  loadDraft,
  loadSetupCompanion,
  saveSetupCompanion,
  SETUP_COMPANION_STORAGE_KEY,
  unitTypeLabel,
} from '../src/services/institutionSetup.ts';

/**
 * Pricing, payment, request submission, owner codes and the per-area
 * entitlement state machine for the local preview (approved plan §7/§8/§19).
 *
 * Every test uses an injected Map-backed storage and FIXED timestamps, so the
 * 3-day trial / 30-day code / 3-day grace timeline is asserted without any
 * waiting or randomness beyond the code's readable characters.
 */

const fakeStorage = (seed: Record<string, string> = {}): SubscriptionStorage & { store: Map<string, string> } => {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

// Fixed "now": a Tuesday-ish arbitrary epoch well before any real date used by
// the app, so a wrong Date.now() dependence fails loudly.
const T0 = 1_720_000_000_000;

const unitRow = (name: string, receivesOperations: boolean) => ({
  name,
  typeLabel: 'CCU',
  beds: 6,
  receivesOperations,
});

const submit = (
  storage: SubscriptionStorage,
  over: Partial<Parameters<typeof submitRequest>[0]> = {},
): SubscriptionRequest => {
  const { request } = submitRequest(
    {
      phone: '01012345678',
      requestType: 'both',
      institutionName: 'Nile Cardiac Hospital',
      unitDrafts: [unitRow('CCU A', true), unitRow('CCU B', false)],
      doctorsCount: 4,
      clinicServices: ['استشارات القلب'],
      chosenPaymentMethod: 'instapay',
      nowMs: T0,
      ...over,
    },
    storage,
  );
  return request;
};

const freeze = (storage: SubscriptionStorage, at: number): void => {
  storage.setItem('cardiovault_dt_preview_clock_override_v1', JSON.stringify({ nowMs: at }));
};

test('pricing follows the payment method only: instapay -> EGP 500, visa -> USD 20', () => {
  assert.equal(currencyForMethod('instapay'), 'EGP');
  assert.equal(currencyForMethod('visa'), 'USD');
  assert.equal(PRICE_EGP, 500);
  assert.equal(PRICE_USD, 20);

  const deptEgp = buildLineItems('department', 3, 0, 'instapay');
  assert.deepEqual(deptEgp, [
    { area: 'department', quantity: 3, currency: 'EGP', unitPrice: 500, subtotal: 1500 },
  ]);

  const clinicUsd = buildLineItems('clinic', 0, 2, 'visa');
  assert.deepEqual(clinicUsd, [
    { area: 'clinic', quantity: 2, currency: 'USD', unitPrice: 20, subtotal: 40 },
  ]);
});

test('a department/clinic mix ignores the other area; clinic-only clinches one line', () => {
  // Department line + clinic line are SEPARATE line items (never one blob).
  const both = buildLineItems('both', 2, 5, 'instapay');
  assert.equal(both.length, 2);
  assert.deepEqual(both[0], { area: 'department', quantity: 2, currency: 'EGP', unitPrice: 500, subtotal: 1000 });
  assert.deepEqual(both[1], { area: 'clinic', quantity: 5, currency: 'EGP', unitPrice: 500, subtotal: 2500 });

  // Single-area request produces exactly its own line with zero on the other.
  assert.deepEqual(buildLineItems('department', 1, 7, 'visa'), [
    { area: 'department', quantity: 1, currency: 'USD', unitPrice: 20, subtotal: 20 },
  ]);
  assert.deepEqual(buildLineItems('clinic', 3, 1, 'visa'), [
    { area: 'clinic', quantity: 1, currency: 'USD', unitPrice: 20, subtotal: 20 },
  ]);
});

test('"both" math totals the two lines for either currency', () => {
  const egp = buildLineItems('both', 2, 5, 'instapay');
  const egpTotal = egp.reduce((sum, item) => sum + item.subtotal, 0);
  assert.equal(egpTotal, 2 * 500 + 5 * 500);

  const usd = buildLineItems('both', 2, 5, 'visa');
  const usdTotal = usd.reduce((sum, item) => sum + item.subtotal, 0);
  assert.equal(usdTotal, 2 * 20 + 5 * 20);
  assert.equal(egp.every((item) => item.currency === 'EGP'), true);
  assert.equal(usd.every((item) => item.currency === 'USD'), true);
});

test('submitRequest stores a complete record and starts the 3-day trial at submission', () => {
  const storage = fakeStorage();
  const request = submit(storage, { requestType: 'department', doctorsCount: 0, unitDrafts: [unitRow('CCU A', true)] });

  assert.equal(request.phone, '01012345678');
  assert.equal(request.requestType, 'department');
  assert.equal(request.institutionName, 'Nile Cardiac Hospital');
  assert.equal(request.doctorsCount, 0);
  assert.equal(request.trialStartedAtMs, T0);
  assert.equal(request.submittedAtMs, T0);
  assert.deepEqual(request.unitDrafts, [{ name: 'CCU A', typeLabel: 'CCU', beds: 6, receivesOperations: true }]);
  assert.deepEqual(request.lineItems, [
    { area: 'department', quantity: 1, currency: 'EGP', unitPrice: 500, subtotal: 500 },
  ]);
  assert.deepEqual(loadRequests(storage), [request]);
  assert.equal(subscriptionHistoryExists(storage), true);
});

test('submit validation: short phone, missing type, clinic without doctors, department without units', () => {
  const storage = fakeStorage();
  const base = {
    institutionName: 'Nile Cardiac Hospital',
    unitDrafts: [unitRow('CCU A', true)],
    doctorsCount: 2,
    chosenPaymentMethod: 'instapay' as const,
    nowMs: T0,
  };
  assert.throws(
    () => submitRequest({ ...base, phone: '123', requestType: 'both' }, storage),
    /invalid-phone/,
    'phone with fewer than 7 digits is rejected',
  );
  assert.throws(
    () => submitRequest({ ...base, phone: '01012345678', requestType: '' as SubscriptionRequestType }, storage),
    /request-type-missing/,
    'missing request type is rejected',
  );
  assert.throws(
    () => submitRequest({ ...base, phone: '01012345678', requestType: 'clinic', unitDrafts: [], doctorsCount: 0 }, storage),
    /doctors-count-required/,
    'clinic submission needs a doctor count',
  );
  assert.throws(
    () =>
      submitRequest(
        { phone: '01012345678', requestType: 'department', institutionName: 'Nile Cardiac', unitDrafts: [], doctorsCount: 0, chosenPaymentMethod: 'instapay', nowMs: T0 },
        storage,
      ),
    /units-required/,
    'department submission needs at least one unit',
  );
});

test('computeEntitlementState: trial runs inside 3 days, then read-only with no approval', () => {
  const storage = fakeStorage();
  submit(storage);
  assert.equal(computeEntitlementState('department', T0 + DAY_MS, storage), 'trial');
  assert.equal(computeEntitlementState('clinic', T0 + 2 * DAY_MS, storage), 'trial');
  // Trial ends when start + 3d <= now.
  assert.equal(computeEntitlementState('department', T0 + 3 * DAY_MS, storage), 'read-only');
  assert.equal(computeEntitlementState('clinic', T0 + 10 * DAY_MS, storage), 'read-only');
});

/**
 * The owner has checked the transfer by hand. The clock tests below are about
 * the entitlement timeline, not about payment, so they confirm the payment
 * first - exactly the order the real owner panel enforces.
 */
const verifyPayment = (storage: SubscriptionStorage, requestId: string, nowMs = T0): void => {
  setPaymentVerified({ requestId, verified: true, nowMs }, storage);
};

test('partial approval: department active while clinic stays read-only', () => {
  const storage = fakeStorage();
  const request = submit(storage);
  verifyPayment(storage, request.id);
  // Trial expired two days ago; owner approves only the department.
  issueCode({ requestId: request.id, area: 'department', nowMs: T0 + 5 * DAY_MS }, storage);

  assert.equal(computeEntitlementState('department', T0 + 5 * DAY_MS, storage), 'active');
  assert.equal(computeEntitlementState('clinic', T0 + 5 * DAY_MS, storage), 'read-only');
});

test('active inside 30 days, grace inside 3 days after expiry, read-only after grace', () => {
  const storage = fakeStorage();
  const request = submit(storage);
  verifyPayment(storage, request.id);
  const { codes } = issueCode({ requestId: request.id, area: 'both', nowMs: T0 + 4 * DAY_MS }, storage);
  assert.equal(codes.filter((code) => code.area === 'department').length, 2, 'one code per requested department unit');
  assert.equal(codes.filter((code) => code.area === 'clinic').length, 1, 'one clinic code for the requested doctor count');
  assert.match(codes[0].code, /^(DPT|CLN)-[A-Z2-9]{4}-30D$/);
  assert.equal(codes.every((code) => code.status === 'active'), true);
  assert.equal(codes.every((code) => code.validForDays === 30), true);

  const issued = codes[0].issuedAtMs;
  assert.equal(computeEntitlementState('department', issued + 29 * DAY_MS, storage), 'active');
  assert.equal(computeEntitlementState('department', issued + 30 * DAY_MS, storage), 'grace');
  assert.equal(computeEntitlementState('department', issued + 32 * DAY_MS, storage), 'grace');
  assert.equal(computeEntitlementState('department', issued + 33 * DAY_MS, storage), 'grace');
  assert.equal(computeEntitlementState('department', issued + 34 * DAY_MS, storage), 'read-only');
});

test('revoking every department code makes the area read-only immediately', () => {
  const storage = fakeStorage();
  const request = submit(storage);
  verifyPayment(storage, request.id);
  const { codes } = issueCode({ requestId: request.id, area: 'department', nowMs: T0 + 5 * DAY_MS }, storage);
  assert.equal(computeEntitlementState('department', T0 + 6 * DAY_MS, storage), 'active');

  // One code is issued per requested unit, so the area only turns read-only
  // once every department code has been revoked.
  const revoked = codes.map(
    (entry) => revokeCode({ codeId: entry.id, nowMs: T0 + 6 * DAY_MS }, storage).code,
  );
  assert.equal(revoked.every((entry) => entry.status === 'revoked'), true);
  assert.equal(revoked.every((entry) => entry.revokedAtMs === T0 + 6 * DAY_MS), true);
  assert.equal(computeEntitlementState('department', T0 + 6 * DAY_MS, storage), 'read-only');

  // The records are kept, not deleted.
  const stored = loadCodes(storage);
  assert.equal(revoked.every((entry) => stored.some((row) => row.id === entry.id)), true);
});

test('early renewal starts after the existing expiry and leaves no gap', () => {
  const storage = fakeStorage();
  const request = submit(storage);
  verifyPayment(storage, request.id);
  const first = issueCode({ requestId: request.id, area: 'department', nowMs: T0 + 4 * DAY_MS }, storage).codes[0];

  // Renewing 20 days into a 30-day window must not throw away the days that
  // were already paid for: the first code stays active, and the new window
  // begins exactly where the old one ends (approved renewal timing).
  const second = issueCode({ requestId: request.id, area: 'department', nowMs: T0 + 24 * DAY_MS }, storage).codes[0];
  const stored = loadCodes(storage);
  assert.equal(stored.find((code) => code.id === first.id)?.status, 'active');
  assert.equal(stored.find((code) => code.id === second.id)?.status, 'active');

  assert.equal(second.startsAtMs, first.expiresAtMs);
  assert.equal(second.expiresAtMs, first.expiresAtMs + 30 * DAY_MS);

  // Continuous cover across the boundary, then the usual grace and lock.
  assert.equal(computeEntitlementState('department', first.expiresAtMs - DAY_MS, storage), 'active');
  assert.equal(computeEntitlementState('department', second.startsAtMs + DAY_MS, storage), 'active');
  assert.equal(computeEntitlementState('department', second.expiresAtMs + 4 * DAY_MS, storage), 'read-only');
});

test('assertAreaWritable throws ReadOnlyAreaError for the read-only state only', () => {
  assert.doesNotThrow(() => assertAreaWritable('active'));
  assert.doesNotThrow(() => assertAreaWritable('trial'));
  assert.doesNotThrow(() => assertAreaWritable('grace'));
  assert.throws(() => assertAreaWritable('read-only'), ReadOnlyAreaError);
  try {
    assertAreaWritable('read-only');
  } catch (error) {
    assert.equal((error as ReadOnlyAreaError).name, 'ReadOnlyAreaError');
    assert.match(String((error as Error).message), /read-only-area/);
  }
});

test('institutionSetup draft backward-compat: old stored JSON without a companion record loads fine', () => {
  const storage = fakeStorage({
    [INSTITUTION_SETUP_STORAGE_KEY]: JSON.stringify({
      institutionName: 'Old Clinic',
      adminName: 'Dr Old',
      adminEmail: 'old@example.com',
      unitDrafts: [{ tempId: 'temp-1', name: 'Ward', typeId: 'ccu', beds: 4 }],
      teamSize: 3,
      completedSteps: ['institution'],
      updatedAtMs: 123,
      schemaVersion: 1,
    }),
  });

  const draft = loadDraft(storage);
  assert.equal(draft.institutionName, 'Old Clinic');
  assert.equal(draft.teamSize, 3);
  // Companion defaults, no throw, no new required draft fields.
  const companion = loadSetupCompanion(storage);
  assert.equal(companion.requestType, undefined);
  assert.equal(companion.paymentMethod, undefined);
  assert.equal(companion.lastSubmittedRequestId, undefined);
  clearDraft(storage);
  assert.equal(storage.getItem(SETUP_COMPANION_STORAGE_KEY), null, 'reset clears the companion too');
});

test('companion record persists per keystroke and round-trips the wizard extras', () => {
  const storage = fakeStorage();
  saveSetupCompanion({ requestType: 'clinic', phone: '01012345678', doctorsCount: 3 }, storage);
  saveSetupCompanion({ paymentMethod: 'visa', clinicServices: ['استشارات'] }, storage);
  const companion = loadSetupCompanion(storage);
  assert.equal(companion.requestType, 'clinic');
  assert.equal(companion.phone, '01012345678');
  assert.equal(companion.doctorsCount, 3);
  assert.equal(companion.paymentMethod, 'visa');
  assert.deepEqual(companion.clinicServices, ['استشارات']);

  saveSetupCompanion({ receivesOperationsByUnit: { 'temp-ccu': true } }, storage);
  assert.deepEqual(loadSetupCompanion(storage).receivesOperationsByUnit, { 'temp-ccu': true });
});

test('the read-only gate inside createUnitsFromDraft blocks unit creation once expired', () => {
  const storage = fakeStorage();
  const request = submit(storage, { requestType: 'department', doctorsCount: 0, unitDrafts: [unitRow('CCU A', true)] });
  // Trial expired long ago, no codes: history exists -> read-only.
  freeze(storage, T0 + 30 * DAY_MS);
  assert.equal(computeEntitlementState('department', T0 + 30 * DAY_MS, storage), 'read-only');
  const validDraft = {
    id: 'current' as const,
    institutionName: 'Nile Cardiac Hospital',
    adminName: 'Dr Ahmed',
    adminEmail: 'dr@example.com',
    unitDrafts: [{ tempId: 't1', name: 'CCU A', typeId: 'ccu' as const, beds: 6 }],
    teamSize: 1,
    completedSteps: ['institution', 'units', 'team', 'plan'],
    updatedAtMs: T0,
    schemaVersion: 1,
  };
  assert.throws(() => createUnitsFromDraft(validDraft, [], storage), ReadOnlyAreaError);

  // First-run behavior: with NO history at all, unit creation is allowed.
  const fresh = fakeStorage();
  assert.equal(subscriptionHistoryExists(fresh), false);
  assert.doesNotThrow(() =>
    createUnitsFromDraft(
      { ...validDraft, adminEmail: 'dr2@example.com' },
      [],
      fresh,
    ),
  );
  void request;
});

test('unitTypeLabel maps the wizard rows for the submission contract', () => {
  assert.equal(unitTypeLabel({ typeId: 'ccu', customTypeName: undefined }).startsWith('CCU'), true);
  assert.equal(unitTypeLabel({ typeId: 'custom', customTypeName: 'Bone Marrow' }), 'Bone Marrow');
  assert.equal(unitTypeLabel({ typeId: 'custom', customTypeName: '' }), 'Custom');
});
