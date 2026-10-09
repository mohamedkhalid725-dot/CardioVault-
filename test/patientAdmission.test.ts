import test from 'node:test';
import assert from 'node:assert/strict';
import type {Patient} from '../src/types/clinical.ts';
import { isAtOrAfterCurrentAdmission, prepareReadmittedPatient, toLocalIsoTimestamp, formatLocalAdmissionDate, formatLocalAdmissionTime } from '../src/services/patientAdmission.ts';

const patientResetFixture:any={
  id:'p-reset',mrn:'MRN-RESET',fullName:'Fixture Patient',name:'Fixture Alias',age:55,sex:'Male',gender:'male',weight:80,height:175,photoUrl:'photo://old',
  unitId:'unit-old',bedId:'bed-old',bedNumber:'B-01',departmentId:'dept-old',status:'Critical',admissionDate:'2026-10-01',admissionTime:'09:00',primaryDiagnosis:'Old ACS',diagnosis:'Old diagnosis',secondaryDiagnoses:['Old secondary'],allergies:['Old allergy'],codeStatus:'Full Code',
  isArchived:true,archiveReason:'Discharged Home',archiveDate:'2026-10-08',currentAdmissionStartedAt:'2026-10-01T09:00:00+03:00',additionalConditions:['Previous admission condition'],dischargeSummary:'Old discharge',
  pastAdmissions:[],
  clinicalSummary:{chiefComplaint:'Old complaint',hpi:'Old HPI',pmh:['HTN'],psh:['PCI'],drugHistory:'Old drugs',allergies:['Old allergy'],familyHistory:'Old family',socialHistory:'Old social'},
  cardiovascularHistory:{hypertension:true,diabetes:true,dyslipidemia:true,cad:true,previousMI:true,heartFailure:true,arrhythmias:true,valvularDisease:true,previousPCI:true,previousCABG:true,previousStroke:true,pvd:true,smoking:true,alcohol:true,previousAdmissions:'Old admissions',previousICU:'Old ICU',other:'Old other'},
  handover:{situation:'Old situation',background:'Old background',assessment:'Old assessment',recommendation:'Old recommendation',updatedAt:'old'},
  vitalsHistory:[{id:'v-old'}],fluidRecords:[{id:'f-old'}],hemodynamicHistory:[{id:'h-old'}],fluidIntakeHistory:[{id:'fi-old'}],urineOutputHistory:[{id:'u-old'}],
  examination:{general:{appearance:'Old',consciousness:'Old',distress:'Old',hydration:'Old',pallor:true,cyanosis:true,jaundice:true,edema:'Old'},cardiovascular:{jvp:'Old',heartSounds:'Old',murmurs:'Old',peripheralPulses:'Old',edema:'Old',perfusion:'Old'},respiratory:{chestExam:'Old',airEntry:'Old',addedSounds:'Old',workOfBreathing:'Old'},abdomen:{inspection:'Old',palpation:'Old',tenderness:'Old',organomegaly:'Old',ascites:'Old'},neurological:{consciousness:'Old',gcs:'Old',pupils:'Old',motor:'Old',sensory:'Old',reflexes:'Old'},extremities:{pulses:'Old',edema:'Old',temp:'Old',perfusion:'Old'},customFields:[{label:'Old',value:'Old'}]},
  ecgRecords:[{id:'ecg-old'}],cardiology:{rhythm:'Old',heartRate:100,bp:'120/80',heartFailureStatus:'Old',nyha:'Old',killip:'Old',congestion:'Old',perfusion:'Old',echo:{lvDimensions:'Old',lvFunction:'Old',rvFunction:'Old',rwma:'Old',la:'Old',ra:'Old',mr:'Old',ar:'Old',as:'Old',ms:'Old',tr:'Old',pr:'Old',ivc:'Old',pericardium:'Old',otherFindings:'Old'},biomarkers:{troponin:'Old',ckmb:'Old',bnp:'Old',ntProBnp:'Old'},coronary:{cath:'Old',coronaryFindings:'Old',pci:'Old',stent:'Old',cabg:'Old'},antithrombotic:{antiplatelet:'Old',anticoagulation:'Old',thrombolysis:'Old'}},
  medications:[{id:'med-old',drug:'Old drug',dose:'10',route:'PO',frequency:'OD'}],infusions:[{id:'inf-old',drugName:'Old infusion',dose:1,unit:'mg',rateMlHr:10}],ventilator:{mode:'Old',fio2:50,peep:5,tidalVolume:500,rr:16,pressureSupport:5,inspiratoryPressure:10,ieRatio:'1:2',peakPressure:20,plateauPressure:15,meanAirwayPressure:10,spo2:98,etco2:35,compliance:40,resistance:10,abgHistory:[{id:'abg-old'}]},
  imaging:[{id:'img-old'}],labs:[{date:'2026-10-08'}],labResults:[{id:'lab-old',name:'Hb',value:10,unit:'g/dL'}],procedures:[{id:'proc-old'}],calculatorResults:[{id:'calc-old'}],progressNotes:[{id:'note-old'}],
  auditTrail:[{id:'audit-old',timestamp:'2026-10-08',action:'old',fields:['old']}],aiSummary:{summary:'Old AI',keyPoints:['Old'],generatedAt:'old',savedAt:'old',savedByUid:'old',inputFingerprint:'old',model:'old'},
  problems:[{id:'problem-old'}],tasks:[{id:'task-old'}],investigations:[{id:'invest-old'}],medicationAdministrations:[{id:'ma-old'}],consultations:[{id:'consult-old'}],shiftHandovers:[{id:'sh-old'}],corrections:[{id:'corr-old'}],timelineEvents:[{id:'timeline-old'}],
  attendedClinician:'Old clinician',attendedNurse:'Old nurse'
};

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

import {createAdmissionEpisodeSnapshot,makePastAdmission,resetForNewAdmission,verifyAdmissionSnapshot,MAX_PATIENT_DOCUMENT_BYTES,PATIENT_KEY_CLASS,emptyExam,emptyCV,emptyCardio,emptyVent} from '../src/services/admissionEpisode.ts';
test('makePastAdmission stays lightweight',()=>{const e=makePastAdmission(admitted,'CCU','adm-1','2026-10-05','Discharged Home','Home');assert.equal(e.episodeSnapshot,undefined);});
test('snapshot verifies and excludes identity/history/audit/AI',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Discharged Home'} as any;const s=createAdmissionEpisodeSnapshot(p,'CCU','adm-1');assert.equal(verifyAdmissionSnapshot(p,s),true);assert.equal('fullName'in s,false);assert.equal('pastAdmissions'in s,false);assert.equal('auditTrail'in s,false);assert.equal('aiSummary'in s,false);});
test('exact lightweight entry is replaced',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Discharged Home',pastAdmissions:[{id:'adm-1',admissionDate:'2026-10-06',dischargeDate:'2026-10-05',unitName:'CCU',dischargeReason:'Discharged Home',dischargeSummary:'',primaryDiagnosis:'ACS'}]};const n=resetForNewAdmission(p,'u2','b2','CCU','2026-10-07','12:30','2026-10-07T12:30:00+03:00','dept');assert.equal(n.pastAdmissions.length,1);assert.ok(n.pastAdmissions[0].episodeSnapshot);});
test('legacy archived patient with no lightweight entry gets a new snapshot',()=>{const p={...admitted,archiveDate:'2026-10-05',archiveReason:'Deceased',pastAdmissions:[]};const n=resetForNewAdmission(p,'u2','b2','CCU','2026-10-07','12:30','2026-10-07T12:30:00+03:00');assert.equal(n.pastAdmissions.length,1);assert.ok(n.pastAdmissions[0].episodeSnapshot);});
test('Patient key classification covers every fixture key',()=>{
  const keys=Object.keys(patientResetFixture).sort();
  assert.deepEqual(keys,Object.keys(PATIENT_KEY_CLASS).sort());
});

test('resetForNewAdmission classifies and resets every Patient key without mutating the old patient',()=>{
  const oldPatient=structuredClone(patientResetFixture);
  const expectedByClass=PATIENT_KEY_CLASS;
  const next=resetForNewAdmission(patientResetFixture,'unit-new','bed-new','CCU','2026-10-09','14:30','2026-10-09T14:30:00+03:00','dept-new');
  const expectedAssigned={unitId:'unit-new',bedId:'bed-new',departmentId:'dept-new',admissionDate:'2026-10-09',admissionTime:'14:30',currentAdmissionStartedAt:'2026-10-09T14:30:00+03:00',status:'Not documented',codeStatus:'Not documented'};
  const episodeFactoryValues:any={
    bedNumber:undefined,primaryDiagnosis:'',diagnosis:undefined,secondaryDiagnoses:[],allergies:[],isArchived:false,archiveReason:undefined,archiveDate:undefined,additionalConditions:[],dischargeSummary:undefined,
    clinicalSummary:{chiefComplaint:'',hpi:'',pmh:[],psh:[],drugHistory:'',allergies:[],familyHistory:'',socialHistory:''},cardiovascularHistory:emptyCV(),handover:undefined,vitalsHistory:[],fluidRecords:[],hemodynamicHistory:[],fluidIntakeHistory:[],urineOutputHistory:[],examination:emptyExam(),
    ecgRecords:[],cardiology:emptyCardio(),medications:[],infusions:[],ventilator:emptyVent(),imaging:[],labs:[],labResults:[],procedures:[],calculatorResults:[],progressNotes:[],aiSummary:undefined,problems:[],tasks:[],investigations:[],medicationAdministrations:[],consultations:[],shiftHandovers:[],corrections:[],timelineEvents:[],attendedClinician:undefined,attendedNurse:undefined
  };
  const keys=Object.keys(PATIENT_KEY_CLASS) as Array<keyof Patient>;
  for(const key of keys){
    const klass=expectedByClass[key as keyof typeof expectedByClass];
    if(klass==='identity') assert.deepEqual(next[key],oldPatient[key],key);
    if(klass==='assigned') assert.deepEqual(next[key],expectedAssigned[key as keyof typeof expectedAssigned],key);
    if(klass==='episode') assert.deepEqual(next[key],episodeFactoryValues[key],key);
    if(klass==='meta') assert.deepEqual(next[key],oldPatient[key],key);
  }
  assert.equal(next.pastAdmissions.length,oldPatient.pastAdmissions.length+1);
  assert.ok(next.pastAdmissions[next.pastAdmissions.length-1].episodeSnapshot);
  const snapshot=next.pastAdmissions[next.pastAdmissions.length-1].episodeSnapshot!;
  for(const key of ['additionalConditions','labResults','diagnosis','infusions','examination','medications']) assert.deepEqual(snapshot[key],oldPatient[key],key);
  assert.deepEqual(patientResetFixture,oldPatient);
});
test('one 700 KiB document limit is used',()=>assert.equal(MAX_PATIENT_DOCUMENT_BYTES,700*1024));

test('local admission date and time agree with the local timestamp at 00:30',()=>{const started=new Date(2026,9,8,0,30,0,0);const timestamp=toLocalIsoTimestamp(started);assert.equal(formatLocalAdmissionDate(started),timestamp.slice(0,10));assert.equal(formatLocalAdmissionTime(started),timestamp.slice(11,16));});
