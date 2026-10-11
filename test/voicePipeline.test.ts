import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolishPrompt,
  cachedPolish,
  normalizePolishKey,
  storePolish,
} from '../src/services/voicePipeline.ts';

test('polish prompt forbids inventing clinical facts', () => {
  const prompt = buildPolishPrompt('ضغطه عالي', 'Vitals');
  assert.ok(prompt.includes('never add, infer'));
  assert.ok(prompt.includes('ضغطه عالي'));
  assert.ok(prompt.includes('medicalEnglish'));
});

test('polish cache returns stored results and normalizes keys', () => {
  storePolish('  Chest  Pain ', 'Chest pain.');
  assert.equal(cachedPolish('chest pain'), 'Chest pain.');
  assert.equal(normalizePolishKey('  A  B '), 'a b');
});

test('empty polish results are never cached', () => {
  storePolish('Some text', '   ');
  assert.equal(cachedPolish('Some text'), null);
  storePolish('   ', 'Something');
  assert.equal(cachedPolish(''), null);
});
