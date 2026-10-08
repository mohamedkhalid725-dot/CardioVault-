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
test('readmission preserves pastAdmissions and clinical data and updates admission date/time locally', () => {
  const admissionStartedAt = new Date(2026, 9, 7, 12, 30, 0, 0);
  const next = prepareReadmittedPatient(admitted, 'unit-2', 'bed-4', admissionStartedAt);
  assert.equal(next.admissionDate, '2026-10-07');
  assert.equal(next.admissionTime, '12:30');
  assert.equal(next.pastAdmissions[0].admissionDate, '2026-09-01');
  assert.deepEqual(next.vitalsHistory, admitted.vitalsHistory);
  assert.deepEqual(next.labResults, admitted.labResults);
  assert.equal(next.isArchived, false);
});
test('readmission timestamp is a complete local ISO timestamp', () => {
  const timestamp = toLocalIsoTimestamp(new Date('2026-10-07T12:30:00Z'));
  assert.match(timestamp, /^2026-10-07T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
});

import {createAdmissionEpisodeSnapshot,makePastAdmission,resetForNewAdmission,verifyAdmissionSnapshot,MAX_PATIENT_DOCUMENT_BYTES} from '../src/services/admissionEpisode.ts';
test('makePastAdmission stays lightweight',()=>{const e=makePastAdmission(admitted,'CCU','adm-1','2026-10-05','Discharged Home','Home');assert.equal(e.episodeSnapshot,undefined);});
test('snapshot verifies and excludes identity/history/audit/AI',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Discharged Home'} as any;const s=createAdmissionEpisodeSnapshot(p,'CCU','adm-1');assert.equal(verifyAdmissionSnapshot(p,s),true);assert.equal('fullName'in s,false);assert.equal('pastAdmissions'in s,false);assert.equal('auditTrail'in s,false);assert.equal('aiSummary'in s,false);});
test('exact lightweight entry is replaced',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Discharged Home',pastAdmissions:[{id:'adm-1',admissionDate:'2026-10-06',dischargeDate:'2026-10-05',unitName:'CCU',dischargeReason:'Discharged Home',dischargeSummary:'',primaryDiagnosis:'ACS'}]};const n=resetForNewAdmission(p,'u2','b2','CCU','2026-10-07','12:30','2026-10-07T12:30:00+03:00','dept');assert.equal(n.pastAdmissions.length,1);assert.ok(n.pastAdmissions[0].episodeSnapshot);});
test('legacy archived patient with no lightweight entry gets a new snapshot',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Deceased',pastAdmissions:[]};const n=resetForNewAdmission(p,'u2','b2','CCU','2026-10-07','12:30','2026-10-07T12:30:00+03:00');assert.equal(n.pastAdmissions.length,1);assert.ok(n.pastAdmissions[0].episodeSnapshot);});
test('top-level coverage has no unclassified current Patient key',()=>{const keys=Object.keys(admitted);const classified=new Set(['id','mrn','fullName','age','sex','weight','height','unitId','bedId','status','admissionDate','admissionTime','primaryDiagnosis','secondaryDiagnoses','allergies','codeStatus','pastAdmissions','clinicalSummary','cardiovascularHistory','vitalsHistory','fluidRecords','examination','ecgRecords','cardiology','medications','ventilator','imaging','labs','procedures','calculatorResults','progressNotes','auditTrail','aiSummary']);assert.deepEqual(keys.filter(k=>!classified.has(k)),[]);});
test('one 700 KiB document limit is used',()=>assert.equal(MAX_PATIENT_DOCUMENT_BYTES,700*1024));