import test from 'node:test';
import assert from 'node:assert/strict';
import { findAdmissionDuplicateMatches } from '../src/services/admissionDuplicateCheck.ts';
import type { Patient, Unit } from '../src/types/clinical.ts';

const unit = (id: string): Unit => ({ id, name: id, type: 'Clinical Unit', totalBeds: 10 } as Unit);
const patient = (id: string, unitId: string): Patient => ({
  id, mrn: id, fullName: 'Same Name', age: 40, sex: 'Male', weight: 80, height: 175,
  unitId, bedId: `bed-${id}`, status: 'Stable', admissionDate: '2026-10-21', admissionTime: '09:00',
  primaryDiagnosis: 'ACS', secondaryDiagnoses: [], allergies: [], codeStatus: 'Full Code', isArchived: false,
  pastAdmissions: [],
} as Patient);

test('master-file lookup failure is logged but does not block same-unit duplicate detection', async () => {
  const failure = new Error('permission-denied');
  let logged: unknown;
  const matches = await findAdmissionDuplicateMatches({
    name: 'Same Name', patients: [patient('p1', 'unit-a'), patient('p2', 'unit-b')],
    units: [unit('unit-a'), unit('unit-b')], unitId: 'unit-a',
    loadMasterFiles: async () => { throw failure; },
    onLookupError: error => { logged = error; },
  });

  assert.equal(logged, failure);
  assert.deepEqual(matches.map(match => match.patientId), ['p1']);
  assert.equal(matches[0].isSameUnit, true);
});

test('successful master-file lookup still identifies an archived duplicate', async () => {
  const matches = await findAdmissionDuplicateMatches({
    name: 'Same Name', patients: [], units: [unit('unit-a')], unitId: 'unit-a',
    loadMasterFiles: async () => [{
      id: 'mpf-archived', name: 'Same Name', ageYears: 40, sourcePatientIds: ['old-p1'],
      riskFactors: [], history: '', pastOperations: [], pastImaging: [], contextIds: ['unit-a'],
      timeline: [], createdAtMs: 1, createdBy: 'owner', updatedAtMs: 1, schemaVersion: 1,
    }],
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].masterFileId, 'mpf-archived');
  assert.equal(matches[0].isArchived, true);
});
