import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLabResults, buildPdfTimeline, orderLabResults } from '../src/components/patient/sections/labExportData.ts';

test('aggregates by panel and analyte, retaining every modern value in ascending time order', () => {
  const result = aggregateLabResults({labs:[],labResults:[
    {panel:'Chemistry',testName:'Creatinine',value:2,unit:'mg/dL',timestamp:'2025-02-02'},
    {panel:'Chemistry',testName:'Creatinine',value:1,unit:'mg/dL',timestamp:'2025-01-01'},
    {panel:'CBC',testName:'WBC',value:5,unit:'10^3/uL',timestamp:'2025-01-01'},
  ]});
  assert.deepEqual(result.map(x=>x.panel),['CBC','Chemistry']);
  assert.deepEqual(result[1].analytes[0].results.map(x=>x.value),[1,2]);
});

test('merges legacy standard fields and custom analytes with modern data', () => {
  const groups=aggregateLabResults({
    labResults:[{panel:'Chemistry',name:'Creatinine',value:1.2,unit:'mg/dL',timestamp:'2025-01-03'}],
    labs:[{date:'2025-01-01',creatinine:1,customLabs:[{name:'Novel marker',value:'positive',unit:'qualitative',referenceRange:'negative'}]} as any],
  });
  const creatinine=groups.flatMap(g=>g.analytes).find(a=>a.name==='Creatinine');
  assert.equal(creatinine?.results.length,2);
  assert.deepEqual(creatinine?.results.map(r=>r.value),[1,1.2]);
  assert.ok(groups.flatMap(g=>g.analytes).some(a=>a.name==='Novel marker'));
});

test('keeps undated results explicitly undated and after dated results without inventing dates', () => {
  const ordered=orderLabResults([{timestamp:''},{timestamp:'2025-01-01'},{timestamp:'invalid'}]);
  assert.equal(ordered[0].timestamp,'2025-01-01');
  assert.equal(ordered[1].timestamp,'');
  assert.equal(ordered[2].timestamp,'invalid');
  const timeline=buildPdfTimeline({labResults:[{panel:'Lab',testName:'X',value:4,unit:'u'}],labs:[]},['labs']);
  assert.equal(timeline[0].timestamp,undefined);
  assert.equal(timeline[0].type,'Laboratory');
});
