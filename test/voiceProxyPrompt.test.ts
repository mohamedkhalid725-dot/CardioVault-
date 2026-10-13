import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscribePrompt } from '../voice-proxy/src/prompt.ts';
import { CARDIO_GLOSSARY } from '../voice-proxy/src/glossary.ts';
import { normalizeDigits, extractNumbers, numberPostCheck } from '../voice-proxy/src/numbers.ts';

test('prompt fills field name and glossary, keeps strict rules', () => {
  const prompt = buildTranscribePrompt('Chest pain', ['Aspirin', 'Bisoprolol']);
  assert.ok(prompt.includes('Chest pain'));
  assert.ok(prompt.includes('Aspirin'));
  assert.ok(prompt.includes('Bisoprolol'));
  assert.ok(prompt.includes('Never add diagnoses'));
  assert.ok(prompt.includes('[?word?]'));
  assert.ok(!prompt.includes('{{field_name}}'));
  assert.ok(!prompt.includes('{{glossary}}'));
});

test('glossary is a non-empty editable list with cardio coverage', () => {
  assert.ok(Array.isArray(CARDIO_GLOSSARY));
  assert.ok(CARDIO_GLOSSARY.length >= 80);
  for (const name of ['Aspirin', 'Bisoprolol', 'Atorvastatin', 'Furosemide', 'Clopidogrel', 'EF', 'PCI']) {
    assert.ok(CARDIO_GLOSSARY.includes(name), `missing ${name}`);
  }
});

test('arabic-indic digits normalize to western digits', () => {
  assert.equal(normalizeDigits('الجرعة ١٢٣ ملجم'), 'الجرعة 123 ملجم');
  assert.equal(normalizeDigits('no digits here'), 'no digits here');
});

test('number post-check warns only on numbers missing from transcript', () => {
  assert.deepEqual(numberPostCheck('took 5 mg', 'took 5 mg daily'), []);
  const warnings = numberPostCheck('took 5 mg', 'took 50 mg daily');
  assert.ok(warnings.includes('number_not_in_transcript:50'));
  assert.ok(!warnings.includes('number_not_in_transcript:5'));
});

test('number post-check handles arabic-indic digits on both sides', () => {
  assert.deepEqual(numberPostCheck('أخذ ٥ ملجم', 'took 5 mg'), []);
  const warnings = numberPostCheck('أخذ ٥ ملجم', 'took 6 mg');
  assert.ok(warnings.includes('number_not_in_transcript:6'));
});
