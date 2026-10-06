import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNeedsAttention,
  buildNowVitals,
  getLatestVitalRecord,
  getSectionStatus,
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

test('Needs attention uses only explicit missing/flagged data', () => {
  const items = buildNeedsAttention({
    clinicalSummary: { chiefComplaint: '  ' },
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    labResults: [{ id: 'l1', testName: 'Hb', value: 9, unit: 'g/dL', flag: 'High' }],
  } as any);
  assert.deepEqual(items, [
    { id: 'chief-complaint', reason: 'Chief complaint is not documented.' },
    { id: 'abnormal-lab', reason: 'This lab was already flagged as abnormal in the record.' },
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
  assert.equal(status.lastUpdated, '2026-10-06T11:00:00Z');
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