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

test('findPatientNameMatches does not search outside the selected unit', () => {
  const matches = findPatientNameMatches(
    'Mohamed Khalid',
    [patient({ id: 'p2', unitId: 'unitB', mrn: 'MRN-77' })],
    [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')],
    'unitA',
  );
  assert.deepEqual(matches, []);
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

test('findPatientNameMatches includes archived files but ignores different names', () => {
  const matches = findPatientNameMatches(
    'Mohamed Khalid',
    [
      patient({ id: 'p4', unitId: 'unitA', isArchived: true }),
      patient({ id: 'p5', unitId: 'unitA', fullName: 'Ahmed Hassan' }),
    ],
    [unit('unitA', 'CCU-1')],
    'unitA',
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].patientId, 'p4');
  assert.equal(matches[0].isArchived, true);
});

test('archived patient record remains a candidate when no master-file document exists', () => {
  const archivedOnly = patient({ id: 'archived-only', unitId: 'unitA', isArchived: true, masterFileId: undefined });
  const matches = findPatientNameMatches('Mohamed Khalid', [archivedOnly], [unit('unitA', 'CCU-1')], 'unitA', []);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].patientId, 'archived-only');
  assert.equal(matches[0].isArchived, true);
});

test('master-file matches are name-only, selected-unit scoped, and deduplicated by master identity', () => {
  const files = [
    { id: 'master-1', name: 'Mohamed Khalid', ageYears: 40, sourcePatientIds: ['p1'], contextIds: ['unitA'], timeline: [] },
    { id: 'master-2', name: 'Mohamed Khalid', ageYears: 70, sourcePatientIds: ['p2'], contextIds: ['unitA'], timeline: [] },
    { id: 'outside', name: 'Mohamed Khalid', ageYears: 40, contextIds: ['unitB'], timeline: [] },
  ] as any;
  const matches = findPatientNameMatches('Mohamed Khalid', [], [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')], 'unitA', files);
  assert.deepEqual(matches.map(match => match.masterFileId), ['master-1', 'master-2']);
  assert.equal(matches[0].mrn, '');
});

test('legacy admission records resolve to the actual linked master-file ID', () => {
  const match = findPatientNameMatches(
    'Mohamed Khalid',
    [patient({ id: 'legacy-patient', unitId: 'unitA', masterFileId: undefined })],
    [unit('unitA', 'CCU-1')],
    'unitA',
    [{ id: 'legacy-master-real-id', name: 'Mohamed Khalid', ageYears: 40, sourcePatientIds: ['legacy-patient'], contextIds: ['unitA'], timeline: [] } as any],
  );
  assert.equal(match.length, 1);
  assert.equal(match[0].masterFileId, 'legacy-master-real-id');
});

test('findPatientNameMatches returns one entry per master file when records overlap', () => {
  const shared = patient({ id: 'p6', unitId: 'unitA', masterFileId: 'master-6' });
  const matches = findPatientNameMatches(
    'mohamed  khalid',
    [shared, { ...shared, id: 'p7' }],
    [unit('unitA', 'CCU-1'), unit('unitB', 'CCU-2')],
    'unitA',
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].patientId, 'p6');
});
