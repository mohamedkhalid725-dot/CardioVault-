import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfChartX } from '../src/components/patient/sections/labExportData.ts';

test('single-timepoint chart is centered with a finite x coordinate', () => {
  assert.equal(pdfChartX(100, 100, 100, 20, 80), 60);
});

test('duplicate timestamps map to the same finite x coordinate', () => {
  const x0 = pdfChartX(100, 100, 100, 20, 80);
  const x1 = pdfChartX(100, 100, 100, 20, 80);
  assert.equal(x0, x1);
  assert.ok(Number.isFinite(x0));
});

test('distinct timestamps map across the chart range', () => {
  assert.equal(pdfChartX(100, 100, 200, 20, 80), 20);
  assert.equal(pdfChartX(200, 100, 200, 20, 80), 100);
});
