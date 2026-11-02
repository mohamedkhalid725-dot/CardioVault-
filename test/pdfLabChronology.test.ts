import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLabResults, buildPdfTimeline, orderLabResults } from '../src/components/patient/sections/labExportData.ts';

test('aggregates each analyte once and retains every modern value in ascending time order', () => {
  const result = aggregateLabResults({labs:[],labResults:[
    {panel:'Chemistry',testName:'Creatinine',value:2,unit:'mg/dL',timestamp:'2025-02-02'},
    {panel:'Chemistry',testName:'Creatinine',value:1,unit:'mg/dL',timestamp:'2025-01-01'},
    {panel:'CBC',testName:'WBC',value:5,unit:'10^3/uL',timestamp:'2025-01-01'},
  ]});
  assert.deepEqual(result.map(x=>x.name),['Creatinine','WBC']);
  assert.deepEqual(result[0].results.map(x=>x.value),[1,2]);
});

test('merges legacy standard fields and custom analytes with modern data', () => {
  const groups=aggregateLabResults({
    labResults:[{panel:'Chemistry',name:'Creatinine',value:1.2,unit:'mg/dL',timestamp:'2025-01-03'}],
    labs:[{date:'2025-01-01',creatinine:1,customLabs:[{name:'Novel marker',value:'positive',unit:'qualitative',referenceRange:'negative'}]} as any],
  });
  const creatinine=groups.find(a=>a.name==='Creatinine');
  assert.equal(creatinine?.results.length,2);
  assert.deepEqual(creatinine?.results.map(r=>r.value),[1,1.2]);
  assert.ok(groups.some(a=>a.name==='Novel marker'));
});

test('keeps undated results explicitly undated and after dated results without inventing dates', () => {
  const ordered=orderLabResults([{timestamp:''},{timestamp:'2025-01-01'},{timestamp:'invalid'}]);
  assert.equal(ordered[0].timestamp,'2025-01-01');
  assert.equal(ordered[1].timestamp,'');
  assert.equal(ordered[2].timestamp,'invalid');
  const timeline=buildPdfTimeline({labResults:[{panel:'Lab',testName:'X',value:4,unit:'u'}],labs:[]},['labs']);
  assert.equal(timeline[0].timestamp,undefined);
  assert.equal(timeline[0].type,'Laboratory');
  assert.match(timeline[0].details,/4 u/);
});

test('one global timeline includes selected section records and sorts dated content oldest first', () => {
  const events=buildPdfTimeline({
    vitalsHistory:[{timestamp:'2025-03-02',sbp:120,dbp:80,hr:70}],
    ecgRecords:[{date:'2025-01-01',time:'08:00',rhythm:'Sinus',heartRate:65}],
    progressNotes:[{date:'2025-02-01',time:'12:00',assessment:'Chest pain',plan:'Observe'}],
  },['vitals-exam','ecg','course-plan']);
  assert.deepEqual(events.map(event=>event.timestamp),['2025-01-01 08:00','2025-02-01 12:00','2025-03-02']);
  assert.ok(events.some(event=>event.details.includes('Chest pain')&&event.details.includes('Observe')));
  assert.ok(events.some(event=>event.details.includes('120')&&event.details.includes('70')));
});

test('every selected clinical section contributes its recorded content to the event extraction', () => {
  const patient={
    admissionDate:'2025-01-01',primaryDiagnosis:'Index diagnosis',allergies:['Penicillin'],
    clinicalSummary:{chiefComplaint:'Index complaint',hpi:'Index HPI',pmh:['Index PMH']},
    cardiovascularHistory:{other:'Index cardiac history'},
    vitalsHistory:[{timestamp:'2025-01-02',notes:'Index vital note'}],examination:{general:{appearance:'Index exam'}},
    ecgRecords:[{date:'2025-01-03',rhythm:'Index rhythm'}],labs:[],labResults:[],
    imaging:[{date:'2025-01-04',impression:'Index image'}],cardiology:{echoBriefSummary:'Index echo'},
    medications:[{name:'Index medication'}],infusions:[{drugName:'Index infusion'}],
    ventilator:{supportType:'Index support',abgHistory:[{timestamp:'2025-01-05',interpretation:'Index ABG'}]},
    procedures:[{date:'2025-01-06',procedure:'Index procedure'}],
    investigations:[{title:'Index investigation'}],consultations:[{specialty:'Index consult'}],
    tasks:[{title:'Index task'}],progressNotes:[{date:'2025-01-07',assessment:'Index assessment'}],
    timelineEvents:[{timestamp:'2025-01-08',title:'Index event'}],problems:[{problem:'Index problem'}],
  };
  const output=buildPdfTimeline(patient,['identification','history','vitals-exam','ecg','labs','imaging-cardiology','medications','icu-procedures','course-plan'])
    .map(event=>`${event.title} ${event.details}`).join('\n');
  ['Index diagnosis','Index complaint','Index HPI','Index PMH','Index cardiac history','Index vital note','Index exam','Index rhythm',
    'Index image','Index echo','Index medication','Index infusion','Index support','Index ABG','Index procedure','Index investigation',
    'Index consult','Index task','Index assessment','Index event','Index problem','Penicillin'].forEach(content=>assert.ok(output.includes(content),`missing selected content: ${content}`));
});

test('undated selected clinical records stay in the undated group and receive no fabricated date', () => {
  const events=buildPdfTimeline({procedures:[{procedure:'Central line',outcome:'Successful',date:'bad'}]},['icu-procedures']);
  assert.equal(events.length,1);
  assert.equal(events[0].timestamp,undefined);
  assert.match(events[0].details,/Central line/);
});

test('each lab observation has one timeline event and one merged appendix analyte series', () => {
  const patient={labs:[{date:'2025-01-01',creatinine:1} as any],labResults:[
    {panel:'Chemistry',testName:'Creatinine',value:2,unit:'mg/dL',timestamp:'2025-01-02'},
  ]};
  const timeline=buildPdfTimeline(patient,['labs']).filter(event=>event.type==='Laboratory');
  const appendix=aggregateLabResults(patient).find(analyte=>analyte.name==='Creatinine');
  assert.equal(timeline.length,2);
  assert.equal(appendix?.results.length,2);
  assert.deepEqual(timeline.map(event=>event.details),['1 mg/dL','2 mg/dL']);
  // No lab table is produced by the timeline extractor: only the appendix series contains result rows.
  assert.equal(appendix?.results.filter(result=>result.value===1||result.value===2).length,2);
});
