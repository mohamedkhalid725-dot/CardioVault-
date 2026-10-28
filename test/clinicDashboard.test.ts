import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClinicVisitTimelineEvent,
  canEditClinical,
  canViewClinicalSummaries,
  canRegisterPatients,
  decideMasterFileLink,
  loadClinicRole,
  localDayStart,
  saveClinicRole,
  todayAppointments,
  todayCounters,
  upcomingBookedDays,
  waitingTodayCount,
  CLINIC_ROLE_KEY,
} from '../src/services/clinicDashboard.ts';
import type { ClinicRole, TodayAppointmentRow } from '../src/services/clinicDashboard.ts';
import type { MasterPatientFile } from '../src/types/clinicArea.ts';
import type { TimelineEventInput } from '../src/services/masterPatientFile.ts';
import type { AppointmentStatus, ClinicAppointment, ClinicConsultation } from '../src/types/departmentTeam.ts';
import { PREVIEW_CLINIC_ID, SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES } from '../src/types/clinicArea.ts';

/* ─── Fixed local-clock fixtures ────────────────────────────────────────────
 * Fixed LOCAL calendar math around a Date start-of-day; every call passes an
 * explicit nowMs. 2026-10-24 is a Saturday.
 */
const DAY = new Date(2026, 9, 24, 10, 30, 0); // Sat 24-10, 10:30 local
const NOW_MS = DAY.getTime();
const DAY_START = localDayStart(NOW_MS);

const at = (dayOffset: number, hour: number, minute: number): number =>
  new Date(2026, 9, 24 + dayOffset, hour, minute, 0).getTime();

class FakeStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const appointment = (overrides: Partial<ClinicAppointment> & { id: string; scheduledAtMs: number }): ClinicAppointment =>
  ({
    workspaceId: 'w1',
    unitId: 'unit-1',
    patientId: 'p1',
    patientName: 'Ali Mohamed',
    durationMinutes: 20,
    status: 'scheduled',
    createdBy: 'doctor-1',
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    history: [],
    schemaVersion: 1,
    ...overrides,
  }) as ClinicAppointment;

/* ─── Role storage ────────────────────────────────────────────────────────── */

test('loadClinicRole defaults to doctor when the key is missing', () => {
  assert.equal(loadClinicRole(new FakeStorage()), 'doctor');
});

test('loadClinicRole ignores junk values and corrupt JSON (default doctor)', () => {
  const junk = new FakeStorage();
  junk.setItem(CLINIC_ROLE_KEY, JSON.stringify({ role: 'janitor' }));
  junk.setItem(`${CLINIC_ROLE_KEY}-bad`, '{not json');
  assert.equal(loadClinicRole(junk), 'doctor');

  const corrupt = new FakeStorage();
  corrupt.setItem(CLINIC_ROLE_KEY, '{not json');
  assert.equal(loadClinicRole(corrupt), 'doctor');

  const scalar = new FakeStorage();
  scalar.setItem(CLINIC_ROLE_KEY, '"secretary"');
  assert.equal(loadClinicRole(scalar), 'secretary');
});

test('saveClinicRole persists and reloads the secretary role', () => {
  const storage = new FakeStorage();
  assert.equal(saveClinicRole('secretary', storage), true);
  assert.equal(loadClinicRole(storage), 'secretary');
});

test('saveClinicRole coerces any non-secretary argument to doctor (never stores junk)', () => {
  const storage = new FakeStorage();
  saveClinicRole('weird-role' as unknown as ClinicRole, storage);
  assert.equal(loadClinicRole(storage), 'doctor');
});

/* ─── Role capability gates ───────────────────────────────────────────────── */

test('canRegisterPatients stays true for BOTH roles (front-desk booking allowed)', () => {
  assert.equal(canRegisterPatients('doctor'), true);
  assert.equal(canRegisterPatients('secretary'), true);
});

test('canEditClinical is doctor-only', () => {
  assert.equal(canEditClinical('doctor'), true);
  assert.equal(canEditClinical('secretary'), false);
});

test('canViewClinicalSummaries: doctor true, secretary delegates to the reversible constant', () => {
  assert.equal(canViewClinicalSummaries('doctor'), true);
  // Single-line delegator: the result must equal the open-question constant.
  assert.equal(canViewClinicalSummaries('secretary'), SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES);
  // Pin the current default so a silent flip is caught.
  assert.equal(SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES, false);
});

/* ─── Today's agenda ──────────────────────────────────────────────────────── */

test('todayAppointments keeps only the same LOCAL calendar day (yesterday/tomorrow excluded)', () => {
  const list = [
    appointment({ id: 'y', scheduledAtMs: at(-1, 9, 0) }),
    appointment({ id: 'a', scheduledAtMs: at(0, 9, 0) }),
    appointment({ id: 'b', scheduledAtMs: at(0, 23, 59) }),
    appointment({ id: 't', scheduledAtMs: at(1, 9, 0) }),
  ];
  const rows = todayAppointments(list, NOW_MS);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['a', 'b']
  );
});

test('todayAppointments sorts by scheduled time and produces HH:MM local labels', () => {
  const list = [
    appointment({ id: 'late', scheduledAtMs: at(0, 14, 35) }),
    appointment({ id: 'early', scheduledAtMs: at(0, 9, 5) }),
    appointment({ id: 'noon', scheduledAtMs: at(0, 12, 0) }),
  ];
  const rows = todayAppointments(list, NOW_MS);
  assert.deepEqual(
    rows.map((row) => row.timeLabel),
    ['09:05', '12:00', '14:35']
  );
  assert.equal(rows[0].status, 'scheduled');
  assert.equal(rows[0].durationMinutes, 20);
  assert.equal(rows[0].patientName, 'Ali Mohamed');
});

test('todayAppointments ignores non-finite clocks and impossible scheduled values', () => {
  const rows = todayAppointments([appointment({ id: 'x', scheduledAtMs: Number.NaN })], NOW_MS);
  assert.deepEqual(rows, [] as TodayAppointmentRow[]);
  assert.deepEqual(todayAppointments([appointment({ id: 'x', scheduledAtMs: NOW_MS })], Number.NaN), []);
});

test('waitingTodayCount counts scheduled + checked-in today and EXCLUDES finished states', () => {
  const list = [
    appointment({ id: 'a', scheduledAtMs: at(0, 9, 0), status: 'scheduled' }), // waits
    appointment({ id: 'b', scheduledAtMs: at(0, 9, 30), status: 'checked-in' }), // waits
    appointment({ id: 'c', scheduledAtMs: at(0, 10, 0), status: 'completed' }),
    appointment({ id: 'd', scheduledAtMs: at(0, 10, 30), status: 'cancelled' }),
    appointment({ id: 'e', scheduledAtMs: at(0, 11, 0), status: 'no-show' }),
    appointment({ id: 'f', scheduledAtMs: at(1, 9, 0), status: 'scheduled' }), // other day
  ];
  assert.equal(waitingTodayCount(list, NOW_MS), 2);
});

test('todayCounters is honest about total / completed / cancelled / no-show for today', () => {
  const list = [
    appointment({ id: 'a', scheduledAtMs: at(0, 9, 0), status: 'completed' }),
    appointment({ id: 'b', scheduledAtMs: at(0, 10, 0), status: 'cancelled' }),
    appointment({ id: 'c', scheduledAtMs: at(0, 11, 0), status: 'no-show' }),
    appointment({ id: 'd', scheduledAtMs: at(0, 12, 0), status: 'scheduled' }),
    appointment({ id: 'e', scheduledAtMs: at(-1, 9, 0), status: 'completed' }), // yesterday: never counted
  ];
  assert.deepEqual(todayCounters(list, NOW_MS), { total: 4, completed: 1, cancelled: 1, noShow: 1 });
});

/* ─── Upcoming booked days ───────────────────────────────────────────────── */

test('upcomingBookedDays lists FUTURE days only, skips cancelled and empty days', () => {
  const list = [
    // Today: must NOT appear in the upcoming card.
    appointment({ id: 't1', scheduledAtMs: at(0, 15, 0) }),
    // Tomorrow (Sun 25-10): one booked.
    appointment({ id: 'u1', scheduledAtMs: at(1, 9, 0) }),
    // Day +2 (Mon 26-10): two booked, one cancelled → still 2 only.
    appointment({ id: 'v1', scheduledAtMs: at(2, 10, 0) }),
    appointment({ id: 'v2', scheduledAtMs: at(2, 11, 0) }),
    appointment({ id: 'v3', scheduledAtMs: at(2, 12, 0), status: 'cancelled' }),
  ];
  const days = upcomingBookedDays(list, NOW_MS);
  assert.deepEqual(days, [
    { dayLabel: 'Sun 25-10', count: 1 },
    { dayLabel: 'Mon 26-10', count: 2 },
  ]);
});

test('upcomingBookedDays past days and yesterday are always excluded', () => {
  const list = [
    appointment({ id: 'y1', scheduledAtMs: at(-1, 9, 0) }),
    appointment({ id: 'y2', scheduledAtMs: at(-3, 9, 0) }),
  ];
  assert.deepEqual(upcomingBookedDays(list, NOW_MS), []);
});

test('upcomingBookedDays respects the horizon and is empty when nothing is booked', () => {
  const list = [appointment({ id: 'far', scheduledAtMs: at(5, 9, 0) })];
  assert.deepEqual(upcomingBookedDays(list, NOW_MS, 3), []);
  assert.equal(upcomingBookedDays(list, NOW_MS, 7)[0].dayLabel, 'Thu 29-10');
  assert.deepEqual(upcomingBookedDays([], NOW_MS), []);
});

/* ─── Clinic-visit timeline event input ──────────────────────────────────── */

const consultation = (overrides: Partial<ClinicConsultation> = {}): ClinicConsultation =>
  ({
    id: 'consult-1',
    workspaceId: 'w1',
    unitId: 'unit-1',
    patientId: 'p1',
    chiefComplaint: 'Chest pain on effort',
    assessment: 'Stable angina',
    plan: 'Aspirin, stress test',
    prescriptions: [],
    investigations: [],
    createdBy: 'doctor-1',
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    schemaVersion: 1,
    ...overrides,
  }) as ClinicConsultation;

test('buildClinicVisitTimelineEvent returns the exact persistTimelineEvent input shape', () => {
  const input = buildClinicVisitTimelineEvent(consultation(), NOW_MS, 'doctor-1');
  const expectedKeys = ['kind', 'title', 'summary', 'detail', 'createdBy', 'context', 'refId', 'atMs'].sort();
  assert.deepEqual(Object.keys(input).sort(), expectedKeys);
  const event = input as TimelineEventInput;
  assert.equal(event.kind, 'clinic-visit');
  assert.deepEqual(event.context, { clinicId: PREVIEW_CLINIC_ID });
  assert.equal(event.refId, 'consult-1');
  assert.equal(event.atMs, NOW_MS);
  assert.equal(event.createdBy, 'doctor-1');
  assert.equal(event.summary, 'Chest pain on effort');
  assert.ok(event.detail.includes('Assessment: Stable angina'));
  assert.ok(event.detail.includes('Plan: Aspirin, stress test'));
});

test('buildClinicVisitTimelineEvent survives empty/truncated text without junk', () => {
  const empty = buildClinicVisitTimelineEvent(consultation({ chiefComplaint: '  ', assessment: '', plan: '' }), NOW_MS, '');
  assert.equal(empty.title, 'Clinic visit');
  assert.equal(empty.summary, 'Clinic visit recorded');
  assert.equal(empty.createdBy, 'local-user');
  assert.equal(empty.context.clinicId, PREVIEW_CLINIC_ID);
  assert.ok(!('unitId' in empty.context));
});

/* ─── Master-file link decision (never auto, never name-only) ────────────── */

const masterFile = (overrides: Partial<MasterPatientFile> & { id: string; name: string; ageYears: number }): MasterPatientFile =>
  ({
    riskFactors: [],
    history: '',
    pastOperations: [],
    pastImaging: [],
    contextIds: [PREVIEW_CLINIC_ID],
    timeline: [],
    createdAtMs: NOW_MS,
    createdBy: 'doctor-1',
    updatedAtMs: NOW_MS,
    schemaVersion: 1,
    ...overrides,
  }) as MasterPatientFile;

test('decideMasterFileLink: unique exact-name + age match inside scope → confirm suggestion (NEVER auto)', () => {
  const files = [
    masterFile({ id: 'mpf-1', name: 'mahmoud ali', ageYears: 54, contextIds: ['unit-1'] }),
    masterFile({ id: 'mpf-2', name: 'other person', ageYears: 30 }),
  ];
  const decision = decideMasterFileLink(files, { name: 'Mahmoud  Ali', age: 54 }, ['unit-1', PREVIEW_CLINIC_ID]);
  assert.equal(decision.decision, 'confirm');
  assert.equal(decision.decision === 'confirm' && decision.fileId, 'mpf-1');
  assert.equal(decision.decision === 'confirm' && decision.fileName, 'mahmoud ali');
});

test('decideMasterFileLink: no file with that name in scope → none (skip silently)', () => {
  const files = [masterFile({ id: 'mpf-1', name: 'other person', ageYears: 54 })];
  assert.equal(decideMasterFileLink(files, { name: 'Mahmoud Ali', age: 54 }, ['unit-1']).decision, 'none');
  assert.equal(decideMasterFileLink([], { name: 'Mahmoud Ali', age: 54 }, ['unit-1']).decision, 'none');
});

test('decideMasterFileLink: name hit but age differs, or ≥2 same-age hits → ambiguous (never guess)', () => {
  const scope = ['unit-1', PREVIEW_CLINIC_ID];
  const singleNameHit = [masterFile({ id: 'mpf-1', name: 'mahmoud ali', ageYears: 60 })];
  assert.equal(
    decideMasterFileLink(singleNameHit, { name: 'Mahmoud Ali', age: 54 }, scope).decision,
    'ambiguous'
  );

  const twins = [
    masterFile({ id: 'mpf-1', name: 'mahmoud ali', ageYears: 54 }),
    masterFile({ id: 'mpf-2', name: 'mahmoud ali', ageYears: 54 }),
  ];
  assert.equal(decideMasterFileLink(twins, { name: 'Mahmoud Ali', age: 54 }, scope).decision, 'ambiguous');

  // A scope the file does not belong to must not be searched.
  const scoped = [masterFile({ id: 'mpf-3', name: 'mahmoud ali', ageYears: 54, contextIds: ['unit-9'] })];
  assert.equal(decideMasterFileLink([scoped[0]], { name: 'Mahmoud Ali', age: 54 }, ['unit-1']).decision, 'none');
});
