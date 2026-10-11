import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabOcrText, panelForTest } from '../src/services/labResultParser.ts';

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

test('broken neutrophil fragment never becomes troponin', () => {
  const { results } = parseLabOcrText('trophils 60 Normal 50 - 62 %');
  assert.equal(results.some((r) => r.testName === 'Troponin'), false);
});

test('full neutrophils line keeps its own name', () => {
  const { results } = parseLabOcrText('Neutrophils 60 Normal 50 - 62 %');
  const neu = results.find((r) => r.testName === 'Neutrophils');
  assert.ok(neu);
  assert.equal(neu.value, 60);
});

test('result without a reference range goes to manual review, not results', () => {
  const { results, notes } = parseLabOcrText('MCH 20 pg');
  assert.equal(results.length, 0);
  assert.ok(notes.some((n) => n.includes('MCH') && n.includes('reference range')));
});

test('split name and numbers on two lines are joined', () => {
  const { results } = parseLabOcrText('Packed Cell Volume (PCV)\n45 Normal 40 - 50 %');
  const pcv = results.find((r) => r.testName === 'PCV');
  assert.ok(pcv);
  assert.equal(pcv.value, 45);
});

test('one-letter OCR error in name still matches with a manual-review note', () => {
  const { results, notes } = parseLabOcrText('Sasophils 0 Normal 00 - 02 %');
  const baso = results.find((r) => r.testName === 'Basophils');
  assert.ok(baso);
  assert.equal(baso.value, 0);
  assert.ok(notes.some((n) => n.includes('Basophils') && n.includes('letter errors')));
});

test('fuzzy never hijacks a broken neutrophil line into troponin', () => {
  const { results } = parseLabOcrText('Neutrophils i 60 Normal 50 - 62 Tn');
  assert.equal(results.some((r) => r.testName === 'Troponin'), false);
  assert.ok(results.some((r) => r.testName === 'Neutrophils'));
});

test('dropped decimal point in range is restored with a note', () => {
  const { results, notes } = parseLabOcrText('Total RBC count 5.00 Normal 450 - 550 mill/cumm');
  const rbc = results.find((r) => r.testName === 'RBC');
  assert.ok(rbc);
  assert.equal(rbc.referenceRange, '4.5 - 5.5');
  assert.ok(notes.some((n) => n.includes('RBC') && n.includes('decimal')));
});

test('panel mapping sends tests to their real panels', () => {
  assert.equal(panelForTest('Hemoglobin'), 'CBC');
  assert.equal(panelForTest('MCV'), 'CBC');
  assert.equal(panelForTest('Sodium'), 'Chemistry');
  assert.equal(panelForTest('Troponin'), 'Cardiac Markers');
  assert.equal(panelForTest('D-Dimer'), 'Coagulation');
  assert.equal(panelForTest('Something Unknown'), 'Custom Lab');
});
