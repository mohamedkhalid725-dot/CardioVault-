import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabOcrText } from '../src/services/labResultParser.ts';

// Simulated on-device OCR output for a printed CBC report.
const CBC_OCR = `
DRLOGY PATHOLOGY LAB
Complete Blood Count (CBC)
Investigation Result Reference Value Unit
HEMOGLOBIN Hemoglobin (Hb) 12.5 Low 13.0 - 17.0 g/dL
RBC COUNT Total RBC count 5.2 4.5 - 5.5 mill/cumm
BLOOD INDICES
Packed Cell Volume (PCV) 57.5 High 40 - 50 %
Mean Corpuscular Volume (MCV) 87.75 83 - 101 fL
MCH Calculated 27.2 27 - 32 pg
MCHC Calculated 32.8 32.5 - 34.5 g/dL
RDW 13.6 11.6 - 14.0 %
WBC COUNT Total WBC count 9000 4000-11000 cumm
DIFFERENTIAL WBC COUNT
Neutrophils 60 50 - 62 %
Lymphocytes 31 20 - 40 %
Eosinophils 1 00 - 06 %
Monocytes 7 00 - 10 %
Basophils 1 00 - 02 %
PLATELET COUNT Platelet Count 150000 Borderline 150000 - 410000 cumm
****End Of Report****
`;

test('parses hemoglobin with explicit Low flag', () => {
  const { results } = parseLabOcrText(CBC_OCR);
  const hb = results.find((r) => r.testName === 'Hemoglobin');
  assert.ok(hb);
  assert.equal(hb.value, 12.5);
  assert.equal(hb.status, 'low');
  assert.equal(hb.referenceRange, '13 - 17');
});

test('parses PCV with explicit High flag', () => {
  const { results } = parseLabOcrText(CBC_OCR);
  const pcv = results.find((r) => r.testName === 'PCV');
  assert.ok(pcv);
  assert.equal(pcv.value, 57.5);
  assert.equal(pcv.status, 'high');
});

test('borderline platelet stays unknown with a manual-review note', () => {
  const { results, notes } = parseLabOcrText(CBC_OCR);
  const plt = results.find((r) => r.testName === 'Platelet Count');
  assert.ok(plt);
  assert.equal(plt.value, 150000);
  assert.equal(plt.status, 'unknown');
  assert.ok(notes.some((n) => n.includes('Platelet Count') && n.includes('borderline')));
});

test('derives normal status from range when no flag word exists', () => {
  const { results } = parseLabOcrText(CBC_OCR);
  const wbc = results.find((r) => r.testName === 'WBC');
  assert.ok(wbc);
  assert.equal(wbc.value, 9000);
  assert.equal(wbc.status, 'normal');
});

test('never fabricates values for unclear lines', () => {
  const { results, notes } = parseLabOcrText('Some blurry line\nAnother ??? row');
  assert.equal(results.length, 0);
  assert.ok(notes.length >= 0);
});
