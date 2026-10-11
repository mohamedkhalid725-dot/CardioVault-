import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAbgTimestamp, sortAbgRecords, parseExplicitNumber } from '../src/services/abgHistory.ts';
import { emptyVent } from '../src/services/admissionEpisode.ts';

const abg = (timestamp: string) => ({ id: timestamp, timestamp, ph: 7.4, paco2: 40, pao2: 95, hco3: 24 }) as any;

test('old time-only ABGs render without Date parsing', () => {
  assert.equal(formatAbgTimestamp('14:30'), '14:30');
  assert.equal(formatAbgTimestamp('09:15'), '09:15');
});
test('time-only ABGs sort by time descending', () => {
  const result = sortAbgRecords([abg('09:15'), abg('14:30'), abg('11:00')]);
  assert.deepEqual(result.map((item) => item.id), ['14:30', '11:00', '09:15']);
});
test('ISO ABGs sort by actual timestamp descending', () => {
  const result = sortAbgRecords([abg('2026-10-06T09:00:00Z'), abg('2026-10-06T11:00:00Z')]);
  assert.deepEqual(result.map((item) => item.id), ['2026-10-06T11:00:00Z', '2026-10-06T09:00:00Z']);
});
test('mixed legacy and ISO ABGs keep dated records sortable and legacy records readable', () => {
  const result = sortAbgRecords([abg('14:30'), abg('2026-10-06T11:00:00Z'), abg('09:15')]);
  assert.equal(result[0].timestamp, '2026-10-06T11:00:00Z');
  assert.deepEqual(result.slice(1).map((item) => item.timestamp), ['14:30', '09:15']);
});
test('blank numeric entry stays undefined and never coerces to zero', () => {
  assert.equal(parseExplicitNumber(''), undefined);
  assert.equal(parseExplicitNumber('   '), undefined);
  assert.equal(parseExplicitNumber('abc'), undefined);
  assert.equal(parseExplicitNumber('0'), 0);
  assert.equal(parseExplicitNumber('7.4'), 7.4);
});
test('new ventilator and ABG entries carry no fabricated defaults', () => {
  const v = emptyVent();
  assert.deepEqual(v.abgHistory, []);
  for (const k of ['fio2', 'peep', 'tidalVolume', 'rr', 'pressureSupport', 'inspiratoryPressure', 'peakPressure', 'plateauPressure', 'meanAirwayPressure', 'spo2', 'etco2', 'compliance', 'resistance']) assert.equal(v[k], undefined, 'fabricated value for ' + k);
});
