import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMeaningfulExaminationContent, meaningfulExaminationText, examFieldText, applyNormalExamText, NORMAL_EXAM_TEXT } from '../src/services/examinationContent.ts';
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
