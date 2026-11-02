import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdfSafetyWarnings } from '../src/components/patient/sections/pdfSafetyWarnings.ts';

test('reports age, cross-source heart-rate, and GCS inconsistencies', () => {
  const warnings = getPdfSafetyWarnings({ age: 60 }, {
    clinicalSummary: { hpi: 'A 45-year-old patient presents.' },
    vitalsHistory: [{ hr: 80, gcsEye: 4, gcsVerbal: 5, gcsMotor: 6, gcsTotal: 14 }],
    ecgRecords: [{ heartRate: 100 }],
  });
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some(w => w.t.includes('Age discrepancy')));
  assert.ok(warnings.some(w => w.t.includes('HR discrepancy')));
  assert.ok(warnings.some(w => w.t.includes('GCS discrepancy')));
});

test('warns for positive acute ECG text, but not explicit negation or missing data', () => {
  assert.ok(getPdfSafetyWarnings({}, { ecgRecords: [{ interpretation: 'ST elevation, possible STEMI' }] }).some(w => w.kind === 'rose'));
  assert.equal(getPdfSafetyWarnings({}, { ecgRecords: [{ interpretation: 'No ST elevation' }] }).length, 0);
  assert.equal(getPdfSafetyWarnings({}, {}).length, 0);
});

test('does not manufacture age/HR/GCS discrepancies from absent or invalid values', () => {
  assert.deepEqual(getPdfSafetyWarnings({ age: '60' }, {
    clinicalSummary: { hpi: '60-year-old' },
    vitalsHistory: [{ hr: 'unknown', gcsEye: 4, gcsVerbal: 5, gcsMotor: 6, gcsTotal: 'unknown' }],
    ecgRecords: [{ heartRate: 'unknown' }], cardiology: { heartRate: null },
  }), []);
});

test('retains the former vital-sign thresholds and acute ECG finding flag', () => {
  const warnings = getPdfSafetyWarnings({}, {
    vitalsHistory: [{ sbp: 85, hr: 125, spo2: 88, temp: 38, gcsTotal: 8 }],
    ecgRecords: [{ interpretation: ['Sinus rhythm'], finalImpression: 'Acute STEMI', stSegment: 'ST elevation' }],
  });
  assert.ok(warnings.some(w => w.t.includes('Critical systolic')));
  assert.ok(warnings.some(w => w.t.includes('Critical heart rate')));
  assert.ok(warnings.some(w => w.t.includes('Critical oxygen')));
  assert.ok(warnings.some(w => w.t.includes('Fever')));
  assert.ok(warnings.some(w => w.t.includes('Critical GCS')));
  assert.ok(warnings.some(w => w.kind === 'rose' && w.t.includes('ECG warning')));
});
