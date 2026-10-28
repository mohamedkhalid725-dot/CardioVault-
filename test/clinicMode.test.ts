import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPOINTMENT_TRANSITIONS,
  CLINIC_APPOINTMENTS_KEY,
  CLINIC_BILLS_KEY,
  CLINIC_CONSULTATIONS_KEY,
  clinicEnabledForUnit,
  createAppointment,
  createBill,
  createConsultation,
  dailyClinicReport,
  issueBill,
  linkConsultationToAppointment,
  listAppointmentsByPatient,
  listAppointmentsByUnit,
  listBillsByPatient,
  listBillsByUnit,
  listConsultationsByPatient,
  listConsultationsByUnit,
  loadAppointments,
  loadBills,
  loadConsultations,
  saveAppointments,
  saveBills,
  saveConsultations,
  transitionAppointment,
} from '../src/services/clinicMode.ts';
import type { ClinicStorage } from '../src/services/clinicMode.ts';
import type { ClinicAppointment, ClinicBill, ClinicConsultation } from '../src/types/departmentTeam.ts';
import type { Unit } from '../src/types/clinical.ts';

const NOW = 1_700_000_000_000;
const DAY_START = 1_700_006_400_000;
const DAY_END = DAY_START + 24 * 60 * 60 * 1000;

class FakeStorage implements ClinicStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const unitWith = (clinicMode: boolean | undefined, features?: string[]): Partial<Unit> =>
  ({
    id: 'unit-clinic',
    name: 'Outpatient Clinic',
    config: {
      typeId: 'cardiology',
      capabilities: { beds: false, waitingList: false, clinicMode: Boolean(clinicMode) },
      settings: {},
      schemaVersion: 1,
    },
    features,
  }) as Partial<Unit>;

const baseAppointment = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-1',
  unitId: 'unit-clinic',
  patientId: 'patient-1',
  patientName: 'Test Patient',
  scheduledAtMs: DAY_START + 60 * 60 * 1000,
  durationMinutes: 20,
  reason: 'Follow-up',
  createdBy: 'user-1',
  ...overrides,
});

const appointmentFixture = (overrides: Record<string, unknown> = {}): ClinicAppointment =>
  createAppointment(baseAppointment(overrides) as never, NOW);

const baseConsultation = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-1',
  unitId: 'unit-clinic',
  patientId: 'patient-1',
  chiefComplaint: 'Chest pain',
  assessment: 'Stable angina',
  plan: 'Start beta blocker, review in two weeks',
  createdBy: 'user-1',
  ...overrides,
});

const baseBill = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-1',
  unitId: 'unit-clinic',
  patientId: 'patient-1',
  items: [{ label: 'Consultation', amount: 100, currency: 'EGP' }],
  createdBy: 'user-1',
  ...overrides,
});

/* ─── Unit enablement ────────────────────────────────────────────────────── */

test('clinic mode is opt-in per unit', () => {
  assert.equal(clinicEnabledForUnit(unitWith(true)), true);
  assert.equal(clinicEnabledForUnit(unitWith(false)), false);
  assert.equal(clinicEnabledForUnit({ id: 'legacy-unit' }), false);
  assert.equal(clinicEnabledForUnit(null), false);
  assert.equal(clinicEnabledForUnit(undefined), false);
});

test('legacy features array can enable clinic mode', () => {
  assert.equal(clinicEnabledForUnit({ id: 'u', features: ['clinic', 'beds'] }), true);
  assert.equal(clinicEnabledForUnit({ id: 'u', features: ['beds'] }), false);
});

test('a truthy but non-boolean capability does not enable clinic mode', () => {
  const unit = { id: 'u', config: { capabilities: { clinicMode: 'yes' } } } as unknown as Partial<Unit>;
  assert.equal(clinicEnabledForUnit(unit), false);
});

/* ─── Appointment validation ─────────────────────────────────────────────── */

test('appointment requires patient, unit, creator and a finite time', () => {
  assert.throws(() => createAppointment(baseAppointment({ patientId: '   ' }) as never, NOW), /Patient id is required/);
  assert.throws(() => createAppointment(baseAppointment({ patientName: '' }) as never, NOW), /Patient name is required/);
  assert.throws(() => createAppointment(baseAppointment({ unitId: '' }) as never, NOW), /Unit id is required/);
  assert.throws(() => createAppointment(baseAppointment({ createdBy: '' }) as never, NOW), /Creator is required/);
  assert.throws(
    () => createAppointment(baseAppointment({ scheduledAtMs: Number.NaN }) as never, NOW),
    /Scheduled date and time must be a valid number/
  );
});

test('appointment duration must be a whole number between 5 and 240 minutes', () => {
  for (const duration of [4, 241, 12.5, 0, -10]) {
    assert.throws(
      () => createAppointment(baseAppointment({ durationMinutes: duration }) as never, NOW),
      /Duration must be a whole number of minutes between 5 and 240/
    );
  }
  assert.equal(appointmentFixture({ durationMinutes: 5 }).durationMinutes, 5);
  assert.equal(appointmentFixture({ durationMinutes: 240 }).durationMinutes, 240);
});

test('appointment reason is capped at 200 characters', () => {
  assert.throws(
    () => createAppointment(baseAppointment({ reason: 'x'.repeat(201) }) as never, NOW),
    /Reason must be 200 characters or fewer/
  );
  assert.equal(appointmentFixture({ reason: 'x'.repeat(200) }).reason?.length, 200);
});

test('a new appointment starts scheduled with an opening history event', () => {
  const appointment = appointmentFixture();
  assert.equal(appointment.status, 'scheduled');
  assert.equal(appointment.createdAtMs, NOW);
  assert.equal(appointment.updatedAtMs, NOW);
  assert.equal(appointment.schemaVersion, 1);
  assert.deepEqual(appointment.history, [{ atMs: NOW, actorUid: 'user-1', from: null, to: 'scheduled' }]);
});

/* ─── Appointment transitions ────────────────────────────────────────────── */

test('scheduled appointments can be checked in, cancelled or marked no-show', () => {
  const scheduled = appointmentFixture();

  const checkedIn = transitionAppointment(scheduled, 'checked-in', { actorUid: 'user-2', atMs: NOW + 1000 });
  assert.equal(checkedIn.status, 'checked-in');
  assert.equal(checkedIn.updatedAtMs, NOW + 1000);
  assert.equal(checkedIn.history.length, 2);
  assert.deepEqual(checkedIn.history[1], {
    atMs: NOW + 1000,
    actorUid: 'user-2',
    from: 'scheduled',
    to: 'checked-in',
  });
  // Pure: the original object is untouched.
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.history.length, 1);

  const cancelled = transitionAppointment(scheduled, 'cancelled', {
    actorUid: 'user-2',
    reason: 'Patient called to reschedule',
    atMs: NOW + 2000,
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.history[1].reason, 'Patient called to reschedule');

  const noShow = transitionAppointment(scheduled, 'no-show', { actorUid: 'user-2', atMs: NOW + 3000 });
  assert.equal(noShow.status, 'no-show');
});

test('checked-in appointments can complete or be cancelled', () => {
  const checkedIn = transitionAppointment(appointmentFixture(), 'checked-in', { actorUid: 'user-1' });
  const completed = transitionAppointment(checkedIn, 'completed', { actorUid: 'user-3', atMs: NOW + 5000 });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.history.at(-1)?.to, 'completed');

  const cancelled = transitionAppointment(checkedIn, 'cancelled', {
    actorUid: 'user-3',
    reason: 'Left before being seen',
  });
  assert.equal(cancelled.status, 'cancelled');
});

test('terminal appointment states accept no further transition', () => {
  const terminalStates = ['completed', 'cancelled', 'no-show'] as const;
  for (const state of terminalStates) {
    assert.deepEqual(APPOINTMENT_TRANSITIONS[state], []);
    const terminal =
      state === 'completed'
        ? transitionAppointment(
            transitionAppointment(appointmentFixture(), 'checked-in', { actorUid: 'user-1' }),
            'completed',
            { actorUid: 'user-1' }
          )
        : transitionAppointment(appointmentFixture(), state, {
            actorUid: 'user-1',
            ...(state === 'cancelled' ? { reason: 'Cancelled by patient' } : {}),
          });
    assert.throws(
      () => transitionAppointment(terminal, 'checked-in', { actorUid: 'user-1' }),
      /cannot become "checked-in"/
    );
  }
});

test('invalid transitions and missing requirements are rejected', () => {
  const scheduled = appointmentFixture();
  assert.throws(() => transitionAppointment(scheduled, 'completed', { actorUid: 'user-1' }), /cannot become "completed"/);
  assert.throws(() => transitionAppointment(scheduled, 'scheduled', { actorUid: 'user-1' }), /cannot become "scheduled"/);
  assert.throws(() => transitionAppointment(scheduled, 'cancelled', { actorUid: 'user-1' }), /Cancellation reason is required/);
  assert.throws(
    () => transitionAppointment(scheduled, 'cancelled', { actorUid: 'user-1', reason: '   ' }),
    /Cancellation reason is required/
  );
  assert.throws(
    () => transitionAppointment(scheduled, 'checked-in', { actorUid: '' }),
    /Actor is required/
  );
});

/* ─── Consultation validation ───────────────────────────────────────────── */

test('consultation requires chief complaint, assessment and plan', () => {
  assert.throws(
    () => createConsultation(baseConsultation({ chiefComplaint: '  ' }) as never, NOW),
    /Chief complaint is required/
  );
  assert.throws(() => createConsultation(baseConsultation({ assessment: '' }) as never, NOW), /Assessment is required/);
  assert.throws(() => createConsultation(baseConsultation({ plan: '' }) as never, NOW), /Plan is required/);
});

test('consultation validates prescriptions and investigations', () => {
  assert.throws(
    () =>
      createConsultation(
        baseConsultation({
          prescriptions: [{ drug: 'Aspirin', dose: '81 mg', route: 'PO', frequency: '' }],
        }) as never,
        NOW
      ),
    /Prescription 1 frequency is required/
  );
  assert.throws(
    () =>
      createConsultation(
        baseConsultation({ prescriptions: [{ drug: '', dose: '81 mg', route: 'PO', frequency: 'OD' }] }) as never,
        NOW
      ),
    /Prescription 1 drug is required/
  );
  assert.throws(
    () => createConsultation(baseConsultation({ investigations: [{ name: ' ' }] }) as never, NOW),
    /Investigation 1 name is required/
  );
  assert.throws(
    () => createConsultation(baseConsultation({ followUpAtMs: Number.NaN }) as never, NOW),
    /Follow-up date must be a valid number/
  );
});

test('a valid consultation keeps its rows and defaults investigation status', () => {
  const consultation = createConsultation(
    baseConsultation({
      appointmentId: 'appt-1',
      followUpAtMs: DAY_START + 14 * 24 * 60 * 60 * 1000,
      prescriptions: [
        { drug: 'Aspirin', dose: '81 mg', route: 'PO', frequency: 'OD', durationDays: 30 },
        { drug: 'Atorvastatin', dose: '40 mg', route: 'PO', frequency: 'ON' },
      ],
      investigations: [{ name: 'Troponin', urgent: true }, { name: 'Echo', status: 'resulted' }],
    }) as never,
    NOW
  );
  assert.equal(consultation.schemaVersion, 1);
  assert.equal(consultation.prescriptions.length, 2);
  assert.equal(consultation.prescriptions[0].durationDays, 30);
  assert.equal(consultation.investigations[0].status, 'ordered');
  assert.equal(consultation.investigations[0].urgent, true);
  assert.equal(consultation.investigations[1].status, 'resulted');
  assert.equal(consultation.createdAtMs, NOW);
});

/* ─── Consultation ↔ appointment link ───────────────────────────────────── */

test('linking a consultation completes the appointment and stores the id', () => {
  const appointment = transitionAppointment(appointmentFixture(), 'checked-in', { actorUid: 'user-1', atMs: NOW });
  const consultation = createConsultation(baseConsultation({ appointmentId: appointment.id }) as never, NOW + 4000);
  const linked = linkConsultationToAppointment(appointment, consultation);

  assert.equal(linked.status, 'completed');
  assert.equal(linked.consultationId, consultation.id);
  assert.equal(linked.updatedAtMs, NOW + 4000);
  assert.equal(linked.history.at(-1)?.to, 'completed');
  assert.equal(linked.history.at(-1)?.from, 'checked-in');
  // The source appointment is not mutated.
  assert.equal(appointment.status, 'checked-in');
  assert.equal(appointment.consultationId, undefined);
});

test('linking rejects a mismatched appointment or an existing link', () => {
  const appointment = appointmentFixture();
  const otherConsultation = createConsultation(baseConsultation({ appointmentId: 'other-appt' }) as never, NOW);
  assert.throws(
    () => linkConsultationToAppointment(appointment, otherConsultation),
    /belongs to a different appointment/
  );

  const firstConsultation = createConsultation(baseConsultation({ id: 'consult-1' }) as never, NOW);
  const linked = linkConsultationToAppointment(appointment, firstConsultation);
  const secondConsultation = createConsultation(baseConsultation({ id: 'consult-2' }) as never, NOW + 1000);
  assert.throws(
    () => linkConsultationToAppointment(linked, secondConsultation),
    /already linked to another consultation/
  );

  // Repeating the same link is harmless.
  const again = linkConsultationToAppointment(linked, firstConsultation);
  assert.equal(again.consultationId, 'consult-1');
  assert.equal(again.status, 'completed');
});

/* ─── Bills ──────────────────────────────────────────────────────────────── */

test('bill total is computed from the items and a caller total is ignored', () => {
  const callerSupplied: any = {
    ...baseBill(),
    items: [
      { label: 'Consultation', amount: 100, currency: 'EGP' },
      { label: 'ECG', amount: 50.25, currency: 'EGP' },
    ],
    total: 999999,
    status: 'Paid',
  };
  const bill = createBill(callerSupplied, NOW);
  assert.equal(bill.total, 150.25);
  assert.equal(bill.currency, 'EGP');
  assert.equal(bill.status, 'Draft');
  assert.equal(bill.createdAtMs, NOW);
  assert.equal(bill.issuedAtMs, undefined);
});

test('bill items must be valid and share one currency', () => {
  assert.throws(() => createBill(baseBill({ items: [] }) as never, NOW), /at least one line item/);
  assert.throws(
    () => createBill(baseBill({ items: [{ label: '  ', amount: 10, currency: 'EGP' }] }) as never, NOW),
    /Line item 1 label is required/
  );
  assert.throws(
    () => createBill(baseBill({ items: [{ label: 'Fee', amount: Number.NaN, currency: 'EGP' }] }) as never, NOW),
    /Line item 1 amount must be a valid number/
  );
  assert.throws(
    () => createBill(baseBill({ items: [{ label: 'Fee', amount: -1, currency: 'EGP' }] }) as never, NOW),
    /amount cannot be negative/
  );
  assert.throws(
    () => createBill(baseBill({ items: [{ label: 'Fee', amount: 10, currency: 'EG' }] }) as never, NOW),
    /3 letter ISO code/
  );
  assert.throws(
    () => createBill(baseBill({ items: [{ label: 'Fee', amount: 10, currency: '' }] }) as never, NOW),
    /currency is required/
  );
  assert.throws(
    () =>
      createBill(
        baseBill({
          items: [
            { label: 'Fee', amount: 10, currency: 'EGP' },
            { label: 'Drug', amount: 5, currency: 'USD' },
          ],
        }) as never,
        NOW
      ),
    /same currency/
  );
});

test('a bill is Draft then Issued once, and no paid state exists', () => {
  const draft = createBill(baseBill() as never, NOW);
  assert.equal(draft.status, 'Draft');

  const issued = issueBill(draft, NOW + 5000);
  assert.equal(issued.status, 'Issued');
  assert.equal(issued.issuedAtMs, NOW + 5000);
  assert.equal(draft.status, 'Draft');

  assert.throws(() => issueBill(issued, NOW + 9000), /already issued/);

  const allowedStatuses: string[] = ['Draft', 'Issued'];
  assert.equal(allowedStatuses.includes(issued.status), true);
  assert.notEqual(issued.status as string, 'Paid');
  assert.equal(Object.prototype.hasOwnProperty.call(issued, 'paidAtMs'), false);
});

/* ─── Daily report ───────────────────────────────────────────────────────── */

test('daily report counts the day per unit and totals each currency separately', () => {
  const appointmentAt = (offsetMinutes: number) =>
    appointmentFixture({ scheduledAtMs: DAY_START + offsetMinutes * 60 * 1000 });

  const completedBase = transitionAppointment(appointmentAt(60), 'checked-in', { actorUid: 'user-1' });
  const completed = transitionAppointment(completedBase, 'completed', { actorUid: 'user-1' });
  const cancelled = transitionAppointment(appointmentAt(120), 'cancelled', {
    actorUid: 'user-1',
    reason: 'Patient unwell',
  });
  const noShow = transitionAppointment(appointmentAt(180), 'no-show', { actorUid: 'user-1' });
  const stillScheduled = appointmentAt(240);
  const outsideDay = appointmentFixture({ scheduledAtMs: DAY_END + 60_000 });
  const otherUnit = appointmentFixture({ unitId: 'unit-other', scheduledAtMs: DAY_START + 60_000 });

  const consultations = [
    createConsultation(
      baseConsultation({
        appointments: undefined,
        chiefComplaint: 'Palpitations',
        investigations: [{ name: 'ECG' }, { name: 'TSH', status: 'resulted' }],
      }) as never,
      DAY_START + 3_600_000
    ),
    createConsultation(baseConsultation({ patientId: 'patient-2' }) as never, DAY_START + 7_200_000),
    createConsultation(baseConsultation() as never, DAY_END + 60_000),
    createConsultation(baseConsultation({ unitId: 'unit-other' }) as never, DAY_START + 60_000),
  ];

  const egpBill = issueBill(createBill(baseBill({ items: [{ label: 'Visit', amount: 300, currency: 'EGP' }] }) as never, DAY_START), DAY_START + 4_000_000);
  const usdBill = issueBill(createBill(baseBill({ items: [{ label: 'Visit', amount: 120, currency: 'USD' }] }) as never, DAY_START), DAY_START + 5_000_000);
  const draftEgp = createBill(baseBill({ items: [{ label: 'Draft', amount: 50, currency: 'EGP' }] }) as never, DAY_START);

  const report = dailyClinicReport(
    [completed, cancelled, noShow, stillScheduled, outsideDay, otherUnit],
    consultations,
    [egpBill, usdBill, draftEgp],
    'unit-clinic',
    DAY_START,
    DAY_END
  );

  assert.deepEqual(report, {
    appointments: 4,
    completed: 1,
    cancelled: 1,
    noShow: 1,
    consultations: 2,
    investigationsOrdered: 2,
    billsIssued: 2,
    billedTotalByCurrency: { EGP: 300, USD: 120 },
  });
});

test('an invalid report window returns an empty report instead of throwing', () => {
  const report = dailyClinicReport([appointmentFixture()], [], [], 'unit-clinic', DAY_END, DAY_START);
  assert.equal(report.appointments, 0);
  assert.deepEqual(report.billedTotalByCurrency, {});
});

/* ─── Listing helpers ────────────────────────────────────────────────────── */

test('list helpers filter by unit and by patient', () => {
  const first = appointmentFixture({ scheduledAtMs: DAY_START + 2000 });
  const second = appointmentFixture({ patientId: 'patient-2', scheduledAtMs: DAY_START + 1000 });
  const third = appointmentFixture({ unitId: 'unit-other' });
  const appointments = [first, second, third];

  assert.deepEqual(
    listAppointmentsByUnit(appointments, 'unit-clinic').map((item) => item.patientId),
    ['patient-2', 'patient-1']
  );
  assert.deepEqual(
    listAppointmentsByPatient(appointments, 'patient-1').map((item) => item.unitId),
    ['unit-clinic', 'unit-other']
  );

  const consultation: ClinicConsultation = createConsultation(baseConsultation() as never, NOW);
  assert.equal(listConsultationsByUnit([consultation], 'unit-clinic').length, 1);
  assert.equal(listConsultationsByPatient([consultation], 'patient-1').length, 1);
  assert.equal(listConsultationsByUnit([consultation], 'unit-other').length, 0);

  const bill: ClinicBill = createBill(baseBill() as never, NOW);
  assert.equal(listBillsByUnit([bill], 'unit-clinic').length, 1);
  assert.equal(listBillsByPatient([bill], 'patient-1').length, 1);
  assert.equal(listBillsByPatient([bill], 'patient-2').length, 0);
});

/* ─── Local persistence ──────────────────────────────────────────────────── */

test('appointments, consultations and bills roundtrip through injected storage', () => {
  const storage = new FakeStorage();
  const appointment = appointmentFixture();
  const consultation = createConsultation(baseConsultation({ appointmentId: appointment.id }) as never, NOW);
  const bill = createBill(baseBill({ consultationId: consultation.id }) as never, NOW);

  saveAppointments([appointment], storage);
  saveConsultations([consultation], storage);
  saveBills([bill], storage);

  assert.deepEqual(loadAppointments(storage), [appointment]);
  assert.deepEqual(loadConsultations(storage), [consultation]);
  assert.deepEqual(loadBills(storage), [bill]);
  assert.notEqual(storage.getItem(CLINIC_APPOINTMENTS_KEY), null);
  assert.notEqual(storage.getItem(CLINIC_CONSULTATIONS_KEY), null);
  assert.notEqual(storage.getItem(CLINIC_BILLS_KEY), null);
});

test('corrupt or non-list JSON loads as an empty collection', () => {
  const storage = new FakeStorage();
  storage.setItem(CLINIC_APPOINTMENTS_KEY, '{ not json');
  storage.setItem(CLINIC_CONSULTATIONS_KEY, '{"items":[]}');
  storage.setItem(CLINIC_BILLS_KEY, 'null');

  assert.deepEqual(loadAppointments(storage), []);
  assert.deepEqual(loadConsultations(storage), []);
  assert.deepEqual(loadBills(storage), []);
});

test('an empty key loads as an empty collection', () => {
  assert.deepEqual(loadAppointments(new FakeStorage()), []);
  assert.deepEqual(loadConsultations(new FakeStorage()), []);
  assert.deepEqual(loadBills(new FakeStorage()), []);
});
