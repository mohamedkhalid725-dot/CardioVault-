import test from 'node:test';
import assert from 'node:assert/strict';
import type { MasterPatientFile, MasterTimelineEvent } from '../src/types/clinicArea.ts';
import type { Patient } from '../src/types/clinical.ts';
import type { MasterPatientFilePersistenceIO } from '../src/services/masterPatientFileCloud.ts';
import {
  executePatientMasterFileBackfill,
  previewPatientMasterFileBackfill,
  type PatientMasterFileBackfillIO,
} from '../src/services/patientMasterFileBackfill.ts';

type MemoryIO = PatientMasterFileBackfillIO & {
  files: Map<string, MasterPatientFile>;
  events: Map<string, MasterTimelineEvent>;
  indexes: Set<string>;
};

function memoryIO(): MemoryIO {
  const files = new Map<string, MasterPatientFile>();
  const events = new Map<string, MasterTimelineEvent>();
  const indexes = new Set<string>();
  const key = (workspace: string, id: string) => `${workspace}/${id}`;
  const base: MasterPatientFilePersistenceIO = {
    async getFile(workspace, id) { return files.get(key(workspace, id)) || null; },
    async listFilesForUnit(workspace, unitId) {
      return [...files.values()].filter(file => file.workspaceId === workspace && file.contextIds.includes(unitId));
    },
    async createFile(workspace, file) {
      const id = key(workspace, file.id);
      if (files.has(id)) throw new Error('already exists');
      files.set(id, structuredClone(file));
      file.contextIds.forEach(unitId => indexes.add(`${workspace}/${unitId}/${file.id}`));
    },
    async updateFile(workspace, file) {
      const current = files.get(key(workspace, file.id));
      if (!current) throw new Error('missing parent file');
      files.set(key(workspace, file.id), { ...current, contextIds: [...file.contextIds], updatedAtMs: file.updatedAtMs });
      file.contextIds.forEach(unitId => indexes.add(`${workspace}/${unitId}/${file.id}`));
    },
    async ensureUnitIndex(workspace, fileId, unitId) {
      const file = files.get(key(workspace, fileId));
      if (!file?.contextIds.includes(unitId)) throw new Error('unit context missing');
      indexes.add(`${workspace}/${unitId}/${fileId}`);
    },
    async getEvent(workspace, fileId, eventId) { return events.get(key(workspace, `${fileId}/${eventId}`)) || null; },
    async listEvents(workspace, fileId) {
      const prefix = key(workspace, `${fileId}/`);
      return [...events.entries()].filter(([id]) => id.startsWith(prefix)).map(([, event]) => event);
    },
    async createEvent(workspace, fileId, event) {
      const id = key(workspace, `${fileId}/${event.id}`);
      if (events.has(id)) throw new Error('already exists');
      events.set(id, structuredClone(event));
    },
  };
  return Object.assign(base, {
    files,
    events,
    indexes,
    async listPatients() { return []; },
  });
}

const patient = (overrides: Partial<Patient>): Patient => ({
  id: 'p-active', mrn: 'MRN', fullName: 'Example', age: 61, sex: 'Female', weight: 60, height: 160,
  unitId: 'unit-a', bedId: 'bed-a', status: 'Stable', admissionDate: '2026-10-20', admissionTime: '11:15',
  primaryDiagnosis: 'ACS', secondaryDiagnoses: [], allergies: [], codeStatus: 'Full Code', isArchived: false,
  pastAdmissions: [], ...overrides,
} as Patient);

test('backfill preview counts active and archived records without writing', async () => {
  const io = memoryIO();
  const existing: MasterPatientFile = {
    id: 'existing-file', workspaceId: 'ws-a', name: 'Existing', ageYears: 61,
    sourcePatientIds: ['p-existing'], riskFactors: [], history: '', pastOperations: [], pastImaging: [],
    contextIds: ['unit-a'], ownerUnitId: 'unit-a', timeline: [], createdAtMs: 10, createdBy: 'owner',
    updatedAtMs: 10, schemaVersion: 1,
  };
  await io.createFile('ws-a', existing);
  const records = [
    patient({ id: 'p-active' }),
    patient({ id: 'p-archived', unitId: 'unit-b', isArchived: true }),
    patient({ id: 'p-existing', masterFileId: existing.id }),
    patient({ id: 'p-invalid', unitId: '' }),
  ];
  const fileCount = io.files.size;
  const indexCount = io.indexes.size;

  const preview = await previewPatientMasterFileBackfill(io, 'ws-a', records, 99);

  assert.equal(preview.totalPatients, 4);
  assert.equal(preview.archivedPatients, 1);
  assert.equal(preview.missingMasterFiles, 2);
  assert.equal(preview.existingMasterFiles, 1);
  assert.equal(preview.skippedPatients, 1);
  assert.equal(preview.previewedAtMs, 99);
  assert.equal(io.files.size, fileCount);
  assert.equal(io.indexes.size, indexCount);
});

test('backfill creates stable active/archive files, unit indexes, and original-time events idempotently', async () => {
  const io = memoryIO();
  const records = [
    patient({ id: 'p-active', currentAdmissionStartedAt: '2026-10-20T08:30:00.000Z' }),
    patient({ id: 'p-archive', unitId: 'unit-b', isArchived: true, admissionDate: '2026-10-18', admissionTime: '05:45' }),
    patient({ id: 'p-transfer', masterFileId: 'mpf-transfer', unitId: 'unit-a', unitIds: ['unit-a', 'unit-b'] }),
  ];
  const preview = await previewPatientMasterFileBackfill(io, 'ws-a', records);
  const first = await executePatientMasterFileBackfill(io, 'ws-a', 'owner-1', records, preview);

  assert.equal(first.completed, 3);
  assert.equal(first.failed.length, 0);
  assert.equal(io.files.get('ws-a/mpf-p-active')?.createdAtMs, Date.parse('2026-10-20T08:30:00.000Z'));
  assert.deepEqual(io.files.get('ws-a/mpf-transfer')?.contextIds, ['unit-a', 'unit-b']);
  assert.ok(io.indexes.has('ws-a/unit-b/mpf-transfer'));
  const activeEvent = io.events.get('ws-a/mpf-p-active/patient-admission-p-active');
  assert.equal(activeEvent?.atMs, Date.parse('2026-10-20T08:30:00.000Z'));

  const second = await executePatientMasterFileBackfill(io, 'ws-a', 'owner-1', records, preview);
  assert.equal(second.completed, 3);
  assert.equal(io.files.size, 3);
  assert.equal(io.events.size, 3);
});

test('partial event failure is reported and the same preview safely resumes', async () => {
  const io = memoryIO();
  const records = [patient({ id: 'p-retry' })];
  const preview = await previewPatientMasterFileBackfill(io, 'ws-a', records);
  const createEvent = io.createEvent.bind(io);
  let failOnce = true;
  io.createEvent = async (...args) => {
    if (failOnce) { failOnce = false; throw new Error('temporary write failure'); }
    return createEvent(...args);
  };

  const partial = await executePatientMasterFileBackfill(io, 'ws-a', 'owner-1', records, preview);
  assert.equal(partial.completed, 0);
  assert.equal(partial.failed.length, 1);
  assert.ok(io.files.has('ws-a/mpf-p-retry'));

  const resumed = await executePatientMasterFileBackfill(io, 'ws-a', 'owner-1', records, preview);
  assert.equal(resumed.completed, 1);
  assert.equal(resumed.failed.length, 0);
  assert.equal(io.files.size, 1);
  assert.equal(io.events.size, 1);
});

test('backfill does not invent a timeline date when legacy admission time is absent', async () => {
  const io = memoryIO();
  const records = [patient({ id: 'p-no-date', admissionDate: '', admissionTime: '' })];
  const preview = await previewPatientMasterFileBackfill(io, 'ws-a', records);
  assert.equal(preview.missingAdmissionDates, 1);

  const result = await executePatientMasterFileBackfill(io, 'ws-a', 'owner-1', records, preview);
  assert.equal(result.completed, 1);
  assert.equal(result.eventsWithoutOriginalDate, 1);
  assert.equal(io.files.size, 1);
  assert.equal(io.events.size, 0);
});
