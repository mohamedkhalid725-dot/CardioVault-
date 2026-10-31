import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Patient } from '../src/types/clinical.ts';

const tempRoot = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode')
  : join(tmpdir(), 'opencode');
await mkdir(tempRoot, { recursive: true });
const tempDir = await mkdtemp(join(tempRoot, 'patient-timeline-test-'));
const bundlePath = join(tempDir, 'PatientTimeline.mjs');
after(async () => rm(tempDir, { recursive: true, force: true }));

await build({
  entryPoints: [fileURLToPath(new URL('../src/components/patient/PatientTimeline.tsx', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  jsx: 'automatic',
  outfile: bundlePath,
  plugins: [{
    name: 'patient-timeline-test-stubs',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^\.\.\/\.\.\/context\/AppContext$/ }, () => ({
        path: 'app-context-stub',
        namespace: 'patient-timeline-test',
      }));
      buildApi.onResolve({ filter: /^\.\/ClinicalAudioPlayer$/ }, () => ({
        path: 'audio-player-stub',
        namespace: 'patient-timeline-test',
      }));
      buildApi.onLoad({ filter: /.*/, namespace: 'patient-timeline-test' }, ({ path }) => ({
        contents: path === 'app-context-stub'
          ? 'export const useApp = () => ({ currentUser: null });'
          : 'export const ClinicalAudioPlayer = () => null;',
        loader: 'js',
      }));
    },
  }],
});

const {
  buildTimelineItems,
  getTimelineRecordFieldsForRole,
  isTimelineCategoryVisible,
} = await import(pathToFileURL(bundlePath).href);

const patientWith = (overrides: Partial<Patient>): Patient =>
  ({
    id: 'patient-test',
    mrn: 'mrn-test',
    fullName: 'Test Patient',
    age: 50,
    sex: 'Other',
    weight: 0,
    height: 0,
    unitId: 'unit-test',
    bedId: 'bed-test',
    status: 'Stable',
    admissionDate: '',
    admissionTime: '',
    primaryDiagnosis: '',
    secondaryDiagnoses: [],
    allergies: [],
    codeStatus: 'Not documented',
    pastAdmissions: [],
    clinicalSummary: {} as Patient['clinicalSummary'],
    cardiovascularHistory: {} as Patient['cardiovascularHistory'],
    vitalsHistory: [],
    fluidRecords: [],
    examination: {} as Patient['examination'],
    ecgRecords: [],
    cardiology: {} as Patient['cardiology'],
    medications: [],
    ventilator: {} as Patient['ventilator'],
    imaging: [],
    labs: [],
    procedures: [],
    calculatorResults: [],
    progressNotes: [],
    ...overrides,
  }) as Patient;

test('Labs includes panels, investigations, and results; zero values and source records are preserved', () => {
  const panel = { date: '2026-10-01', hb: 7, customLabs: [] };
  const investigation = { title: 'CBC', orderedAt: '2026-10-02T09:00:00Z', status: 'reviewed' };
  const result = { name: 'Glucose', value: 0, unit: 'mmol/L', timestamp: '2026-10-03T09:00:00Z' };
  const patient = patientWith({
    labs: [panel as Patient['labs'][number]],
    investigations: [investigation as NonNullable<Patient['investigations']>[number]],
    labResults: [result],
  });

  const items = buildTimelineItems(patient, 'labs');

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.record), [result, investigation, panel]);
  assert.ok(items[0].detail.includes('0'), 'zero is not discarded as an empty value');
  assert.equal(Object.hasOwn(panel, 'id'), false, 'building list metadata does not add an id to a legacy record');
});

test('id-less records get distinct keys and valid timestamps sort newest first', () => {
  const older = { timestamp: '2026-01-01T00:00:00Z', sbp: 100 };
  const newer = { timestamp: '2026-02-01T00:00:00Z', sbp: 120 };
  const undated = { timestamp: 'not-a-date', sbp: 90 };
  const sourceRecords = [undated, older, newer];
  const snapshot = structuredClone(sourceRecords);
  const patient = patientWith({ vitalsHistory: sourceRecords as Patient['vitalsHistory'] });

  const items = buildTimelineItems(patient, 'vitals');

  assert.deepEqual(items.map((item) => item.record), [newer, older, undated]);
  assert.equal(new Set(items.map((item) => item.key)).size, sourceRecords.length);
  assert.deepEqual(sourceRecords, snapshot, 'legacy records remain untouched');
  assert.ok(sourceRecords.every((record) => !Object.hasOwn(record, 'id')));
});

test('investigation categories follow the stored investigation type', () => {
  const patient = patientWith({
    investigations: [
      { type: 'CBC', title: 'CBC order', orderedAt: '2026-10-01' },
      { type: 'ECG', title: 'ECG order', orderedAt: '2026-10-02' },
      { type: 'Echo', title: 'Echo order', orderedAt: '2026-10-03' },
    ] as NonNullable<Patient['investigations']>,
  });

  assert.equal(buildTimelineItems(patient, 'labs').length, 1);
  assert.equal(buildTimelineItems(patient, 'ecg').length, 1);
  assert.equal(buildTimelineItems(patient, 'imaging').length, 1);
});

test('secretaries cannot see clinical categories or sensitive admission, transfer, and discharge details', () => {
  const forbidden: Array<Parameters<typeof isTimelineCategoryVisible>[0]> = [
    'labs', 'imaging', 'vitals', 'progressNotes', 'ecg', 'procedures', 'medications', 'consultations',
  ];
  for (const category of forbidden) {
    assert.equal(isTimelineCategoryVisible(category, true), false, `${category} must be hidden`);
  }
  assert.equal(isTimelineCategoryVisible('transfers', true), true);

  const admission = {
    admissionDate: '2026-10-01',
    primaryDiagnosis: 'Sensitive diagnosis',
    status: 'Critical',
    unitId: 'unit-test',
    episodeSnapshot: { progressNotes: [{ plan: 'Sensitive plan' }] },
    treatmentPlan: 'Sensitive treatment plan',
    customClinicalNote: { details: 'Sensitive note' },
  };
  const visibleAdmission = getTimelineRecordFieldsForRole(admission, 'admissions', true);
  assert.deepEqual(visibleAdmission, {
    admissionDate: admission.admissionDate,
    unitId: admission.unitId,
  });

  const visibleTransfer = getTimelineRecordFieldsForRole({
    timestamp: '2026-10-01T10:00:00Z',
    actorName: 'Staff member',
    action: 'Transfer with sensitive context',
    fields: ['primaryDiagnosis'],
  }, 'transfers', true);
  assert.deepEqual(visibleTransfer, {
    timestamp: '2026-10-01T10:00:00Z',
    actorName: 'Staff member',
  });

  const legacyTransfer = {
    timestamp: '2026-10-02T10:00:00Z',
    eventType: 'Transfer',
    title: 'Sensitive transfer title',
    summary: 'Sensitive clinical summary',
    details: { progressNotes: [{ plan: 'Sensitive plan' }] },
  };
  const legacyTransferSnapshot = structuredClone(legacyTransfer);
  const transferItems = buildTimelineItems(patientWith({
    timelineEvents: [legacyTransfer as NonNullable<Patient['timelineEvents']>[number]],
  }), 'transfers', true);
  assert.equal(transferItems.length, 1);
  assert.equal(transferItems[0].label, 'Patient transfer');
  assert.equal(transferItems[0].detail, 'Transfer record');
  assert.deepEqual(legacyTransfer, legacyTransferSnapshot, 'legacy event is not mutated or assigned an id');
  assert.deepEqual(getTimelineRecordFieldsForRole(legacyTransfer, 'transfers', true), {
    timestamp: '2026-10-02T10:00:00Z',
  });

  const visibleDischarge = getTimelineRecordFieldsForRole({
    archiveReason: 'Sensitive reason',
    dischargeSummary: 'Sensitive summary',
    unitId: 'unit-test',
    unknownClinicalPayload: { diagnosis: 'Sensitive diagnosis' },
  }, 'discharges', true);
  assert.deepEqual(visibleDischarge, { unitId: 'unit-test' });
});
