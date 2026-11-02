import test from 'node:test';
import assert from 'node:assert/strict';
import type { MasterPatientFile, MasterTimelineEvent } from '../src/types/clinicArea.ts';
import {
  appendPatientMasterEvent,
  ensureMasterFileUnitContext,
  ensurePatientMasterFile,
  loadMasterFilesForUnits,
  masterFileIdForPatient,
  type MasterPatientFilePersistenceIO,
} from '../src/services/masterPatientFileCloud.ts';

function memoryIO(): MasterPatientFilePersistenceIO {
  const files = new Map<string, MasterPatientFile>();
  const events = new Map<string, MasterTimelineEvent>();
  const key = (workspace: string, id: string) => `${workspace}/${id}`;
  return {
    async getFile(workspace, id) { return files.get(key(workspace, id)) || null; },
    async listFilesForUnit(workspace, unitId) {
      return [...files.values()].filter(file => file.contextIds.includes(unitId));
    },
    async createFile(workspace, file) {
      const id = key(workspace, file.id);
      if (files.has(id)) throw new Error('already exists');
      files.set(id, structuredClone(file));
    },
    async updateFile(workspace, file) { files.set(key(workspace, file.id), structuredClone(file)); },
    async ensureUnitIndex() {},
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
}

test('master-file IDs are deterministic from patient record IDs, never names', () => {
  assert.equal(masterFileIdForPatient('patient-123'), 'mpf-patient-123');
  assert.equal(masterFileIdForPatient('patient-123'), masterFileIdForPatient('patient-123'));
  assert.notEqual(masterFileIdForPatient('patient-123'), masterFileIdForPatient('patient-456'));
  assert.throws(() => masterFileIdForPatient(''), /stable patient record ID/);
});

test('every admission creates one owner-unit master file and retry does not duplicate it', async () => {
  const io = memoryIO();
  const input = { patientId: 'p-1', name: 'Example', ageYears: 54, unitId: 'unit-a', createdBy: 'doctor-a', atMs: 100 };
  const first = await ensurePatientMasterFile(io, 'ws-1', input);
  const retry = await ensurePatientMasterFile(io, 'ws-1', { ...input, unitId: 'unit-b', atMs: 200 });
  assert.equal(first.id, retry.id);
  assert.equal(retry.ownerUnitId, 'unit-a');
  assert.deepEqual(retry.contextIds, ['unit-a']);
});

test('transfer links the destination unit to the same original master file', async () => {
  const io = memoryIO();
  const file = await ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'p-1', name: 'Example', ageYears: 54, unitId: 'unit-a', createdBy: 'doctor-a', atMs: 100,
  });
  const moved = await ensureMasterFileUnitContext(io, 'ws-1', file.id, 'unit-b', 200);
  assert.equal(moved.id, file.id);
  assert.equal(moved.ownerUnitId, 'unit-a');
  assert.deepEqual(moved.contextIds, ['unit-a', 'unit-b']);
});

test('a selected master file is reused only inside its already-authorized unit', async () => {
  const io = memoryIO();
  const existing = await ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'original-admission', name: 'Example', ageYears: 54,
    unitId: 'unit-a', createdBy: 'doctor-a', atMs: 100,
  });
  const linked = await ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'new-admission', masterFileId: existing.id, name: 'Example', ageYears: 54,
    unitId: 'unit-a', createdBy: 'doctor-a', atMs: 200,
  });
  assert.equal(linked.id, existing.id);
  await assert.rejects(() => ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'unauthorized-admission', masterFileId: existing.id, name: 'Example', ageYears: 54,
    unitId: 'unit-b', createdBy: 'doctor-b', atMs: 300,
  }), /not available in the admitting unit/);
});

test('new master file preserves the archived patient source when an active admission is added', async () => {
  const io = memoryIO();
  const file = await ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'new-admission', linkedPatientIds: ['archived-source'], masterFileId: 'legacy-master',
    name: 'Example', ageYears: 54, unitId: 'unit-a', createdBy: 'doctor-a', atMs: 100,
  });
  assert.deepEqual(file.sourcePatientIds, ['new-admission', 'archived-source']);
});

test('immutable timeline event retries are idempotent and concurrent events are retained', async () => {
  const io = memoryIO();
  const file = await ensurePatientMasterFile(io, 'ws-1', {
    patientId: 'p-1', name: 'Example', ageYears: 54, unitId: 'unit-a', createdBy: 'doctor-a', atMs: 100,
  });
  const event = (id: string, atMs: number): MasterTimelineEvent => ({
    id, kind: 'patient-transfer', atMs, title: id, summary: id, detail: '', createdBy: 'doctor-a',
    context: { unitId: 'unit-a' }, refId: file.id, schemaVersion: 1,
  });
  await Promise.all([
    appendPatientMasterEvent(io, 'ws-1', file.id, event('transfer-1', 200)),
    appendPatientMasterEvent(io, 'ws-1', file.id, event('transfer-2', 201)),
  ]);
  await appendPatientMasterEvent(io, 'ws-1', file.id, event('transfer-1', 200));
  const loaded = await loadMasterFilesForUnits(io, 'ws-1', ['unit-a', 'unit-b']);
  assert.deepEqual(loaded[0].timeline.map(item => item.id), ['transfer-1', 'transfer-2']);
});
