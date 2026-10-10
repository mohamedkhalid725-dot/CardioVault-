import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMeaningfulExaminationContent, meaningfulExaminationText, examFieldText, applyNormalExamText, NORMAL_EXAM_TEXT, countExamSystemFields, EXAM_FIELD_OPTIONS } from '../src/services/examinationContent.ts';
import { emptyExam } from '../src/services/admissionEpisode.ts';

test('false values are not meaningful examination content', () => assert.equal(hasMeaningfulExaminationContent(false), false));
test('empty strings are not meaningful examination content', () => assert.equal(hasMeaningfulExaminationContent('   '), false));
test('label-only examination templates are not meaningful', () => {
  assert.equal(hasMeaningfulExaminationContent('• Temperature:'), false);
  assert.equal(hasMeaningfulExaminationContent('Cap refill:'), false);
});
test('empty parentheses are not meaningful', () => assert.equal(hasMeaningfulExaminationContent('()'), false));
test('numeric zero remains meaningful examination content', () => {
  assert.equal(hasMeaningfulExaminationContent(0), true);
  assert.equal(meaningfulExaminationText(0), '0');
});
test('objects preserve meaningful zero values', () => assert.equal(hasMeaningfulExaminationContent({ neurological: { motorPower: 0 } }), true));
test('objects with only false or empty fields are not meaningful', () => assert.equal(
  hasMeaningfulExaminationContent({
    pallor: false, cyanosis: false, heartSounds: '', ascites: '• Ascites:',
    customFields: [{ label: 'Other', value: '' }],
  }), false));

test('undocumented examination fields render as Not documented',()=>{assert.equal(examFieldText(''), 'Not documented');assert.equal(examFieldText(undefined), 'Not documented');assert.equal(examFieldText(false), 'Not documented');assert.equal(examFieldText('Normal S1, S2'), 'Normal S1, S2');});
test('motor power grade zero stays meaningful and visible',()=>{assert.equal(examFieldText('0'), '0');assert.equal(examFieldText(0), '0');assert.equal(hasMeaningfulExaminationContent('0'), true);});
test('new-patient examination defaults carry no preselected normals',()=>{assert.equal(hasMeaningfulExaminationContent(emptyExam()), false);assert.deepEqual(emptyExam().customFields, []);});
test('set-all-normal fills text fields and clears boolean flags explicitly',()=>{const out=applyNormalExamText({heartSounds:'',murmurs:'(old)',pallor:true,cyanosis:false,custom:5});assert.equal(out.heartSounds,'Normal S1, S2');assert.equal(out.murmurs,'No murmurs');assert.equal(out.pallor,false);assert.equal(out.cyanosis,false);assert.equal(out.custom,5);});
test('set-all-normal covers every default examination text field',()=>{const shape={appearance:'',hydration:'',mentalStatus:'',consciousness:'',gcs:'',pupils:'',motor:'',sensory:'',reflexes:'',cranialNerves:'',motorPower:'',plantarResponse:'',jvp:'',heartSounds:'',murmurs:'',peripheralPulses:'',edema:'',perfusion:'',pulses:'',temp:'',chestExam:'',airEntry:'',addedSounds:'',workOfBreathing:'',inspection:'',palpation:'',tenderness:'',organomegaly:'',ascites:'',bowelSounds:''};const out=applyNormalExamText(shape);for(const [k,v] of Object.entries(shape))assert.ok(String(out[k]).length>0,'missing normal for '+k);assert.equal(out.motorPower,'5');});

test('new examination keys default to undocumented empties',()=>{const e=emptyExam();assert.equal(hasMeaningfulExaminationContent(e.neurological.speech),false);assert.equal(hasMeaningfulExaminationContent(e.cardiovascular.thrill),false);assert.equal(examFieldText(e.respiratory.fremitus),'Not documented');});
test('set-all-normal covers the extended examination unit',()=>{const out=applyNormalExamText({neck:'',thrill:'',fremitus:'',hernia:'',speech:'',calves:'',pressureAreas:'',apexBeat:'',bowelSounds:'',cranialNerves:'',motorPower:'',plantarResponse:''});assert.equal(out.neck,'Normal neck, no lymphadenopathy');assert.equal(out.thrill,'No thrill');assert.equal(out.speech,'Normal speech');assert.equal(out.motorPower,'5');});
test('system count tracks documented versus total fields',()=>{assert.deepEqual(countExamSystemFields({a:'',b:false}),{documented:0,total:2});assert.deepEqual(countExamSystemFields({a:'Normal S1, S2',b:true,c:''}),{documented:2,total:3});assert.deepEqual(countExamSystemFields(undefined),{documented:0,total:0});assert.deepEqual(countExamSystemFields({customFields:[{label:'X',value:'Y'},{label:'Z',value:''}]}),{documented:1,total:2});});

test('every quick-pick list is non-empty and never preselects a value',()=>{const keys=Object.keys(EXAM_FIELD_OPTIONS);assert.ok(keys.length>=30);for(const k of keys)assert.ok(EXAM_FIELD_OPTIONS[k].length>0,'empty options for '+k);});
test('quick-pick options cover every examinable text field',()=>{const e=emptyExam();const systems=[e.general,e.cardiovascular,e.respiratory,e.abdomen,e.neurological,e.extremities];const skip=new Set(['vitalSignsSummary','gcs']);for(const s of systems)for(const [k,v] of Object.entries(s))if(typeof v==='string'&&!skip.has(k))assert.ok(Array.isArray(EXAM_FIELD_OPTIONS[k])&&EXAM_FIELD_OPTIONS[k].length>0,'missing options for '+k);});
