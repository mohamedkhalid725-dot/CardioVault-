import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatientName, findPatientNameMatches } from '../src/services/patientDedup.ts';
import type { Patient, Unit } from '../src/types/clinical.ts';

// The name matcher is the safety net in front of the "one file, two units"
// flow: it must spot the same patient written in two ways, and it must never
// report a file that lives in a unit the doctor is not a member of.

const unit = (id: string, name: string): Unit => ({ id, name, type: 'Clinical Unit', totalBeds: 10 } as Unit);

const patient = (over: Partial<Patient>): Patient => ({
  id: 'p1',
  mrn: 'MRN-1',
  fullName: 'Mohamed Khalid',
  age: 40,
  sex: 'Male',
  weight: 80,
  height: 175,
  unitId: 'unitA',
  bedId: 'bedA',
  status: 'Stable',
  admissionDate: '2026-10-21',
  admissionTime: '09:00',
  primaryDiagnosis: 'ACS',
  secondaryDiagnoses: [],
  allergies: ['NKDA'],
  codeStatus: 'Full Code',
  isArchived: false,
  pastAdmissions: [],
  ...over,
} as Patient);

test('normalizePatientName unifies Arabic letter forms, diacritics and tatweel', () => {
  assert.equal(normalizePatientName('أحمد'), normalizePatientName('احمد'));
  assert.equal(normalizePatientName('محمّد'), normalizePatientName('محمد'));
  assert.equal(normalizePatientName('مصطفى'), normalizePatientName('مصطفي'));
  assert.equal(normalizePatientName('فاطمة'), normalizePatientName('فاطمه'));
  assert.equal(normalizePatientName('محمـــود'), normalizePatientName('محمود'));
});

test('normalizePatientName folds case, spacing, punctuation and Arabic digits', () => {
  assert.equal(normalizePatientName('  Mohamed   KHALID  '), 'mohamed khalid');
  assert.equal(normalizePatientName('Mohamed, Khalid.'), 'mohamed khalid');
  assert.equal(normalizePatientName('Ward ٣'), 'ward 3');
  assert.equal(normalizePatientName(''), '');
  assert.equal(normalizePatientName(null), '');
});

test('findPatientNameMatches reports the file of the unit being admitted to', () => {
  const matches = findPatientNameMatches(
    'mohamed khalid',
    [patient({ id: 'p1', unitId: 'unitA', bedNumber: 'B-01' })],
    [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')],
    'unitA',
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].patientId, 'p1');
  assert.equal(matches[0].unitName, 'CCU-1');
  assert.equal(matches[0].isSameUnit, true);
  assert.equal(matches[0].mrn, 'MRN-1');
});

test('findPatientNameMatches reports a file of another unit the doctor belongs to', () => {
  const matches = findPatientNameMatches(
    'Mohamed Khalid',
    [patient({ id: 'p2', unitId: 'unitB', mrn: 'MRN-77' })],
    [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')],
    'unitA',
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].isSameUnit, false);
  assert.equal(matches[0].unitName, 'CCU-2');
  assert.equal(matches[0].mrn, 'MRN-77');
});

test('findPatientNameMatches never reports a unit the doctor does not belong to', () => {
  const matches = findPatientNameMatches(
    'Mohamed Khalid',
    [patient({ id: 'p3', unitId: 'unitX' })],
    [unit('unitA', 'CCU-1')],
    'unitA',
  );
  assert.deepEqual(matches, []);
});

test('findPatientNameMatches ignores discharged files and different names', () => {
  const matches = findPatientNameMatches(
    'Mohamed Khalid',
    [
      patient({ id: 'p4', unitId: 'unitA', isArchived: true }),
      patient({ id: 'p5', unitId: 'unitA', fullName: 'Ahmed Hassan' }),
    ],
    [unit('unitA', 'CCU-1')],
    'unitA',
  );
  assert.deepEqual(matches, []);
});

test('findPatientNameMatches returns one entry per file even when units overlap', () => {
  const shared = patient({ id: 'p6', unitId: 'unitB' });
  const matches = findPatientNameMatches(
    'mohamed  khalid',
    [shared, { ...shared }],
    [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')],
    'unitA',
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].patientId, 'p6');
});
