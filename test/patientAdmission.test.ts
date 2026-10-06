import test from 'node:test';
import assert from 'node:assert/strict';
import { isAtOrAfterCurrentAdmission, prepareReadmittedPatient, toLocalIsoTimestamp } from '../src/services/patientAdmission.ts';

const admitted = {
  id: 'p1', admissionDate: '2026-10-06', admissionTime: '10:00',
  pastAdmissions: [{ id: 'adm-old', admissionDate: '2026-09-01', dischargeDate: '2026-09-05', unitName: 'CCU', dischargeReason: 'Discharged Home', dischargeSummary: 'Previous admission', primaryDiagnosis: 'ACS' }],
  clinicalSummary: { chiefComplaint: 'Chest pain' },
  vitalsHistory: [{ id: 'v1' }], labResults: [{ id: 'l1' }],
} as any;

test('current-admission filter excludes records before the explicit admission start', () => {
  const startedAt = '2026-10-06T10:00:00+03:00';
  assert.equal(isAtOrAfterCurrentAdmission('2026-10-06T09:59:59+03:00', startedAt), false);
  assert.equal(isAtOrAfterCurrentAdmission('2026-10-06T10:00:00+03:00', startedAt), true);
});
test('patients without currentAdmissionStartedAt are not filtered', () => {
  assert.equal(isAtOrAfterCurrentAdmission('not-a-timestamp', undefined), true);
  assert.equal(isAtOrAfterCurrentAdmission(undefined, undefined), true);
});
test('readmission preserves pastAdmissions and clinical data', () => {
  const next = prepareReadmittedPatient(admitted, 'unit-2', 'bed-4');
  assert.equal(next.pastAdmissions[0].admissionDate, '2026-09-01');
  assert.deepEqual(next.vitalsHistory, admitted.vitalsHistory);
  assert.deepEqual(next.labResults, admitted.labResults);
  assert.equal(next.isArchived, false);
});
test('readmission timestamp is a complete local ISO timestamp', () => {
  const timestamp = toLocalIsoTimestamp(new Date('2026-10-07T12:30:00Z'));
  assert.match(timestamp, /^2026-10-07T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
});
