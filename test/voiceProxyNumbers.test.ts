import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, extractNumbers, numberPostCheck } from '../voice-proxy/src/numbers.ts';

test('extractNumbers finds integers and decimals', () => {
  assert.deepEqual(extractNumbers('took 5 mg then 2.5 mg'), ['5', '2.5']);
  assert.deepEqual(extractNumbers('nothing here'), []);
});

test('extractNumbers normalizes arabic-indic digits first', () => {
  assert.deepEqual(extractNumbers('الجرعة ١٢٣'), ['123']);
});

test('post-check is soft: returns warnings, never throws', () => {
  assert.deepEqual(numberPostCheck('', ''), []);
  assert.deepEqual(numberPostCheck('silent', ''), []);
});
