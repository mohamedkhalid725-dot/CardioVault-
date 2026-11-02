import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLabResults, buildPdfTimeline, dateOf, orderLabResults } from '../src/components/patient/sections/labExportData.ts';

test('aggregates each analyte once and retains every modern value in ascending time order', () => {
  const result = aggregateLabResults({labs:[],labResults:[
    {panel:'Chemistry',testName:'Creatinine',value:2,unit:'mg/dL',timestamp:'2025-02-02'},
    {panel:'Chemistry',testName:'Creatinine',value:1,unit:'mg/dL',timestamp:'2025-01-01'},
    {panel:'CBC',testName:'WBC',value:5,unit:'10^3/uL',timestamp:'2025-01-01'},
  ]});
  assert.deepEqual(result.map(x=>`${x.panel}:${x.name}`),['CBC:WBC','Chemistry:Creatinine']);
  assert.deepEqual(result.find(x=>x.name==='Creatinine')?.results.map(x=>x.value),[1,2]);
});

test('merges legacy standard fields and custom analytes with modern data', () => {
  const groups=aggregateLabResults({
    labResults:[{panel:'Chemistry',name:'Creatinine',value:1.2,unit:'mg/dL',timestamp:'2025-01-03'}],
    labs:[{date:'2025-01-01',creatinine:1,customLabs:[{name:'Novel marker',value:'positive',unit:'qualitative',referenceRange:'negative'}]} as any],
  });
  const creatinine=groups.filter(a=>a.name==='Creatinine');
  assert.deepEqual(creatinine.map(group=>[group.panel,group.results.length]),[['Chemistry',1],['Renal',1]]);
  assert.deepEqual(creatinine.map(group=>group.results[0].value),[1.2,1]);
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

test('preserves a zero-valued legacy lab as a recorded result', () => {
  const results=aggregateLabResults({labResults:[],labs:[{date:'2025-01-01',troponin:0,customLabs:[]} as any]})
    .find(analyte=>analyte.name==='Troponin')?.results;
  assert.equal(results?.length,1);
  assert.equal(results?.[0].value,0);
  const events=buildPdfTimeline({labResults:[],labs:[{date:'2025-01-01',troponin:0,customLabs:[]} as any]},['labs']);
  assert.equal(events[0].details,'0 ng/L');
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
    procedures:[{date:'2025-01-06',procedure:'Index procedure'}],fluidIntakeHistory:[{date:'2025-01-06',time:'10:00',amount:500,type:'IV',unit:'mL'}],
    urineOutputHistory:[{date:'2025-01-06',time:'11:00',amount:250,type:'Urine',unit:'mL'}],
    investigations:[{title:'Index investigation'}],consultations:[{specialty:'Index consult'}],
    tasks:[{title:'Index task'}],progressNotes:[{date:'2025-01-07',assessment:'Index assessment'}],
    timelineEvents:[{timestamp:'2025-01-08',title:'Index event'}],problems:[{problem:'Index problem'}],shiftHandovers:[{timestamp:'2025-01-09',importantEvents:'Index shift handover'}],
  };
  const output=buildPdfTimeline(patient,['identification','history','vitals-exam','ecg','labs','imaging-cardiology','medications','icu-procedures','course-plan'])
    .map(event=>`${event.title} ${event.details}`).join('\n');
  ['Index diagnosis','Index complaint','Index HPI','Index PMH','Index cardiac history','Index vital note','Index exam','Index rhythm',
    'Index image','Index echo','Index medication','Index infusion','Index support','Index ABG','Index procedure','Index investigation',
    'Index consult','Index task','Index assessment','Index event','Index problem','Index shift handover','Penicillin','500','250'].forEach(content=>assert.ok(output.includes(content),`missing selected content: ${content}`));
});

test('clinical date fields and numeric epoch timestamps are parsed; unreliable values stay undated', () => {
  assert.equal(dateOf({orderedAt:'2025-01-02T09:30:00Z'}),'2025-01-02T09:30:00Z');
  assert.equal(dateOf({requestedAt:'2025-01-03'}),'2025-01-03');
  assert.equal(dateOf({dueDateTime:'2025-01-04T12:00:00Z'}),'2025-01-04T12:00:00Z');
  assert.equal(dateOf({dateIdentified:'2025-01-05'}),'2025-01-05');
  assert.equal(dateOf({startDate:'2025-01-06'}),'2025-01-06');
  assert.equal(dateOf({timestamp:Date.parse('2025-01-07T00:00:00Z')}),'2025-01-07T00:00:00.000Z');
  assert.equal(dateOf({timestamp:'not a date',orderedAt:'also invalid'}),undefined);
  const events=buildPdfTimeline({investigations:[{orderedAt:'2025-02-02',title:'Ordered'}, {orderedAt:'unknown',title:'No date'}]},['course-plan']);
  assert.deepEqual(events.map(event=>event.timestamp),['2025-02-02',undefined]);
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
  const appendix=aggregateLabResults(patient).filter(analyte=>analyte.name==='Creatinine');
  assert.equal(timeline.length,2);
  assert.equal(appendix.reduce((count,group)=>count+group.results.length,0),2);
  assert.deepEqual(timeline.map(event=>event.details),['1 mg/dL','2 mg/dL']);
  // No lab table is produced by the timeline extractor: only the appendix series contains result rows.
  assert.equal(appendix.reduce((count,group)=>count+group.results.filter(result=>result.value===1||result.value===2).length,0),2);
});

test('classifies legacy analytes into clinical panels and orders panel headings then analytes', () => {
  const groups=aggregateLabResults({labResults:[],labs:[{date:'2025-01-01',tsh:2,na:140,creatinine:1,hb:12,customLabs:[{name:'LDL',value:100}]} as any]});
  assert.deepEqual(groups.map(group=>`${group.panel}:${group.name}`),[
    'CBC:Hemoglobin','Electrolytes:Sodium','Lipid Profile:LDL','Renal:Creatinine','Thyroid:TSH',
  ]);
  assert.equal(groups.reduce((count,group)=>count+group.results.length,0),5);
});

test('uses inferred modern panels and keeps same-named analytes separate across panels and units', () => {
  const groups=aggregateLabResults({labs:[],labResults:[
    {testName:'Hemoglobin',value:12,unit:'g/dL',timestamp:'2025-01-01'},
    {panel:'CBC',testName:'Hemoglobin',value:13,unit:'g/dL',timestamp:'2025-01-02'},
    {panel:'Chemistry',testName:'Hemoglobin',value:120,unit:'g/L',timestamp:'2025-01-03'},
  ]});
  assert.deepEqual(groups.map(group=>[group.panel,group.name,group.results.length]),[
    ['CBC','Hemoglobin',2],['Chemistry','Hemoglobin',1],
  ]);
  assert.deepEqual(groups[0].results.map(result=>result.value),[12,13]);
});
