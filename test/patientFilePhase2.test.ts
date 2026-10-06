import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNeedsAttention,
  buildNowVitals,
  getLatestVitalRecord,
  getSectionStatus,
  formatPhase2Timestamp,
} from '../src/services/patientFilePhase2.ts';

const vital = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  timestamp: '2026-10-06T10:00:00Z',
  sbp: 120,
  dbp: 70,
  hr: 80,
  rr: 16,
  spo2: 98,
  temp: 36.8,
  gcsEye: 4,
  gcsVerbal: 5,
  gcsMotor: 6,
  gcsTotal: 15,
  rass: 0,
  ...overrides,
});

test('Now is Not documented when there are no vitals', () => {
  assert.deepEqual(buildNowVitals([]), []);
});

test('Now always exposes only HR, BP, RR, SpO2 and Temp', () => {
  const result = buildNowVitals([vital({ pain: 7, gcsTotal: 10, glucose: 200 })]);
  assert.deepEqual(result.map((item) => item.key), ['hr', 'bp', 'rr', 'spo2', 'temp']);
  assert.equal(result.length, 5);
});

test('readmitted Now ignores pre-admission vitals, while patients without an explicit start are not filtered', () => {
  const oldVital = vital({ timestamp: '2026-10-06T09:00:00Z', hr: 70 });
  const currentVital = vital({ timestamp: '2026-10-06T11:00:00Z', hr: 90 });
  assert.equal(buildNowVitals([oldVital, currentVital], '2026-10-06T10:00:00Z')[0].value, '90');
  assert.deepEqual(buildNowVitals([oldVital], '2026-10-06T10:00:00Z'), []);
  assert.equal(buildNowVitals([oldVital])[0].value, '70');
});

test('latest vitals are selected by timestamp, not array position', () => {
  const older = vital({ id: 'old', timestamp: '2026-10-06T09:00:00Z', hr: 70 });
  const newer = vital({ id: 'new', timestamp: '2026-10-06T11:00:00Z', hr: 90 });
  assert.equal(getLatestVitalRecord([newer, older])?.id, 'new');
  assert.equal(buildNowVitals([older, newer])[0].value, '90');
});

test('partial vitals show Not documented instead of zero', () => {
  const result = buildNowVitals([
    vital({ sbp: 0, dbp: 0, hr: 0, rr: 18, spo2: 0, temp: 0 }),
  ]);
  assert.equal(result.find((item) => item.key === 'hr')?.value, 'Not documented');
  assert.equal(result.find((item) => item.key === 'bp')?.value, 'Not documented');
  assert.equal(result.find((item) => item.key === 'rr')?.value, '18');
  assert.equal(result.find((item) => item.key === 'spo2')?.value, 'Not documented');
  assert.equal(result.find((item) => item.key === 'temp')?.value, 'Not documented');
});

test('Needs attention filters old abnormal labs only when currentAdmissionStartedAt exists', () => {
  const items = buildNeedsAttention({
    currentAdmissionStartedAt: '2026-10-06T10:00:00Z',
    clinicalSummary: { chiefComplaint: 'Documented' },
    labResults: [
      { id: 'old', testName: 'Hb', value: 8, unit: 'g/dL', flag: 'Low', timestamp: '2026-10-06T09:00:00Z' },
      { id: 'new', testName: 'K', value: 6, unit: 'mmol/L', flag: 'High', timestamp: '2026-10-06T11:00:00Z' },
    ],
  } as any);
  assert.equal(items.length, 1);
  assert.equal(items[0].labName, 'K');
  assert.equal(items[0].labValue, '6');
  assert.equal(items[0].labFlag, 'High');
});

test('re-admitted abnormal labs without timestamps remain visible as date not recorded', () => {
  const items = buildNeedsAttention({
    currentAdmissionStartedAt: '2026-10-06T10:00:00Z',
    clinicalSummary: { chiefComplaint: 'Documented' },
    labResults: [{ id: 'l1', testName: 'Hb', value: 8, unit: 'g/dL', flag: 'Low' }],
  } as any);
  assert.equal(items.length, 1);
  assert.equal(items[0].labName, 'Hb');
  assert.equal(items[0].labTimestamp, undefined);
});

test('patients without currentAdmissionStartedAt still show abnormal labs without timestamps', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: 'Documented' },
    labResults: [{ id: 'l1', testName: 'Hb', value: 9, unit: 'g/dL', flag: 'High' }],
  } as any);
  assert.equal(items[0].id, 'abnormal-lab');
  assert.equal(items[0].labTimestamp, undefined);
});

test('Needs attention shows the most recent abnormal lab and the total abnormal count', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: 'Documented' },
    labResults: [
      { id: 'first', testName: 'Hb', value: 8, unit: 'g/dL', flag: 'Low', timestamp: '2026-10-06T09:00:00Z' },
      { id: 'newest', testName: 'K', value: 6.2, unit: 'mmol/L', flag: 'High', timestamp: '2026-10-06T12:00:00Z' },
      { id: 'middle', testName: 'Na', value: 128, unit: 'mmol/L', flag: 'Low', timestamp: '2026-10-06T10:00:00Z' },
    ],
  } as any);
  assert.equal(items.length, 1);
  assert.equal(items[0].labName, 'K');
  assert.equal(items[0].labValue, '6.2');
  assert.equal(items[0].count, 3);
});

test('Needs attention keeps the first abnormal lab when none have timestamps', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: 'Documented' },
    labResults: [
      { id: 'first', testName: 'Hb', value: 8, unit: 'g/dL', flag: 'Low' },
      { id: 'second', testName: 'K', value: 6, unit: 'mmol/L', flag: 'High' },
    ],
  } as any);
  assert.equal(items[0].labName, 'Hb');
  assert.equal(items[0].count, 2);
});

test('Needs attention uses only explicit missing/flagged data', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: '  ' },
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    labResults: [{ id: 'l1', testName: 'Hb', value: 9, unit: 'g/dL', flag: 'High' }],
  } as any);
  assert.deepEqual(items, [
    { id: 'chief-complaint', reason: 'Chief complaint is not documented.' },
    {
      id: 'abnormal-lab',
      reason: 'This lab was already flagged as abnormal in the record.',
      labName: 'Hb',
      labValue: '9',
      labUnit: 'g/dL',
      labFlag: 'High',
      labTimestamp: undefined,
      count: 1,
    },
  ]);
});

test('Needs attention does not treat false/empty defaults as undocumented allergies or code status', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: 'Documented' },
    allergies: [],
    codeStatus: 'Full Code',
    labResults: [],
  } as any);
  assert.deepEqual(items, []);
});

test('examination defaults are not counted as section data', () => {
  const status = getSectionStatus({
    examination: {
      general: { pallor: false, cyanosis: false, appearance: '• Temperature:', hydration: '' },
      cardiovascular: { heartSounds: '()', murmurs: '', jvp: '' },
    },
  } as any, 'examination');
  assert.equal(status.hasData, false);
  assert.equal(status.count, 0);
  assert.equal(status.lastUpdated, null);
});

test('formatPhase2Timestamp uses a readable local date/time', () => {
  const formatted = formatPhase2Timestamp('2026-10-06T11:00:00Z');
  assert.ok(formatted);
  assert.match(formatted!, /2026|Oct|10/);
});

test('section status handles empty sections and different timestamps', () => {
  const empty = getSectionStatus({
    clinicalSummary: { chiefComplaint: '', hpi: '', pmh: [], psh: [], drugHistory: '', allergies: [], familyHistory: '', socialHistory: '' },
    vitalsHistory: [],
    auditTrail: [],
  } as any, 'vitals');
  assert.equal(empty.hasData, false);
  assert.equal(empty.count, 0);
  assert.equal(empty.lastUpdated, null);

  const status = getSectionStatus({
    vitalsHistory: [
      vital({ id: 'old', timestamp: '2026-10-06T09:00:00Z' }),
      vital({ id: 'new', timestamp: '2026-10-06T11:00:00Z' }),
    ],
  } as any, 'vitals');
  assert.equal(status.hasData, true);
  assert.equal(status.count, 2);
  assert.equal(status.lastUpdated, formatPhase2Timestamp('2026-10-06T11:00:00Z'));
});

test('section status tolerates missing objects and casing in lab flags', () => {
  const status = getSectionStatus({
    labResults: [
      { id: 'l1', testName: 'Hb', value: 10, unit: 'g/dL', flag: 'HIGH', timestamp: '2026-10-06T12:00:00Z' },
    ],
    labs: [],
  } as any, 'labs');
  assert.equal(status.hasData, true);
  assert.equal(status.count, 1);
  assert.equal(status.lastUpdated, '2026-10-06T12:00:00Z');
});

test('Clinical Tools & Workflow is a Phase 2 section with read-only empty status when no tool data is recorded', () => {
  const status = getSectionStatus({
    auditTrail: [],
  } as any, 'clinical-tools');

  assert.equal(status.id, 'clinical-tools');
  assert.equal(status.hasData, false);
  assert.equal(status.count, 0);
  assert.equal(status.lastUpdated, null);
});