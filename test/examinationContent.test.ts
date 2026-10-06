import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMeaningfulExaminationContent, meaningfulExaminationText } from '../src/services/examinationContent.ts';

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
