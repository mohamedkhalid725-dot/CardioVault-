import type { MasterPatientFile, MasterTimelineEvent } from '../types/clinicArea.ts';

export interface MasterPatientFilePersistenceIO {
  getFile(workspaceId: string, fileId: string): Promise<MasterPatientFile | null>;
  listFilesForUnit(workspaceId: string, unitId: string): Promise<MasterPatientFile[]>;
  createFile(workspaceId: string, file: MasterPatientFile): Promise<void>;
  updateFile(workspaceId: string, file: MasterPatientFile): Promise<void>;
  ensureUnitIndex(workspaceId: string, fileId: string, unitId: string): Promise<void>;
  getEvent(workspaceId: string, fileId: string, eventId: string): Promise<MasterTimelineEvent | null>;
  listEvents(workspaceId: string, fileId: string): Promise<MasterTimelineEvent[]>;
  createEvent(workspaceId: string, fileId: string, event: MasterTimelineEvent): Promise<void>;
}

export interface EnsurePatientMasterFileInput {
  patientId: string;
  linkedPatientIds?: string[];
  masterFileId?: string;
  name: string;
  ageYears: number;
  unitId: string;
  createdBy: string;
  atMs: number;
}

export function masterFileIdForPatient(patientId: string): string {
  const clean = String(patientId || '').trim();
  if (!clean) throw new Error('A stable patient record ID is required for the master file.');
  const id = `mpf-${encodeURIComponent(clean)}`;
  if (id.length > 128) throw new Error('Patient record ID is too long to create a stable master file.');
  return id;
}

export async function ensurePatientMasterFile(
  io: MasterPatientFilePersistenceIO,
  workspaceId: string,
  input: EnsurePatientMasterFileInput,
): Promise<MasterPatientFile> {
  const id = input.masterFileId || masterFileIdForPatient(input.patientId);
  const existing = await io.getFile(workspaceId, id);
  if (existing) {
    if (existing.workspaceId && existing.workspaceId !== workspaceId) throw new Error('The master patient file belongs to another workspace.');
    if (input.masterFileId && !existing.contextIds.includes(input.unitId)) {
      throw new Error('The selected master patient file is not available in the admitting unit.');
    }
    await io.ensureUnitIndex(workspaceId, id, input.unitId);
    return existing;
  }
  const file: MasterPatientFile = {
    id, workspaceId, name: String(input.name || '').trim(), ageYears: Math.max(0, Math.trunc(Number(input.ageYears) || 0)),
    sourcePatientIds: [...new Set([input.patientId, ...(input.linkedPatientIds || [])].filter(Boolean))], riskFactors: [], history: '', pastOperations: [], pastImaging: [],
    contextIds: [input.unitId], timeline: [], createdAtMs: Math.floor(input.atMs), createdBy: input.createdBy,
    updatedAtMs: Math.floor(input.atMs), schemaVersion: 1, ownerUnitId: input.unitId,
  };
  try { await io.createFile(workspaceId, file); }
  catch (error) { if (!await io.getFile(workspaceId, id).catch(() => null)) throw error; }
  const saved = await io.getFile(workspaceId, id);
  if (!saved || saved.ownerUnitId !== input.unitId || !(saved.sourcePatientIds || []).includes(input.patientId)
    || (input.linkedPatientIds || []).some(id => !(saved.sourcePatientIds || []).includes(id))) {
    throw new Error('Master patient file creation was not confirmed by Firestore.');
  }
  await io.ensureUnitIndex(workspaceId, id, input.unitId);
  return saved;
}

export async function ensureMasterFileUnitContext(
  io: MasterPatientFilePersistenceIO, workspaceId: string, fileId: string, unitId: string, atMs = Date.now(),
): Promise<MasterPatientFile> {
  const current = await io.getFile(workspaceId, fileId);
  if (!current) throw new Error('The master patient file is unavailable in this workspace.');
  if (current.contextIds.includes(unitId)) {
    await io.ensureUnitIndex(workspaceId, fileId, unitId);
    return current;
  }
  await io.updateFile(workspaceId, { ...current, contextIds: [...current.contextIds, unitId], updatedAtMs: Math.floor(atMs) });
  const saved = await io.getFile(workspaceId, fileId);
  if (!saved || !saved.contextIds.includes(unitId) || !saved.contextIds.includes(current.ownerUnitId || current.contextIds[0])) {
    throw new Error('The destination unit was not linked to the existing master file in Firestore.');
  }
  await io.ensureUnitIndex(workspaceId, fileId, unitId);
  return saved;
}

export async function appendPatientMasterEvent(
  io: MasterPatientFilePersistenceIO, workspaceId: string, fileId: string, event: MasterTimelineEvent,
): Promise<MasterTimelineEvent> {
  const current = await io.getEvent(workspaceId, fileId, event.id);
  if (current) return current;
  try { await io.createEvent(workspaceId, fileId, event); }
  catch (error) { if (!await io.getEvent(workspaceId, fileId, event.id).catch(() => null)) throw error; }
  const saved = await io.getEvent(workspaceId, fileId, event.id);
  if (!saved || saved.id !== event.id || saved.refId !== event.refId) throw new Error('Master timeline event was not confirmed by Firestore.');
  return saved;
}

export async function loadMasterFilesForUnits(
  io: MasterPatientFilePersistenceIO, workspaceId: string, unitIds: string[],
): Promise<MasterPatientFile[]> {
  const perUnit = await Promise.all([...new Set(unitIds.filter(Boolean))].map(unitId => io.listFilesForUnit(workspaceId, unitId)));
  const unique = new Map<string, MasterPatientFile>();
  for (const file of perUnit.flat()) unique.set(file.id, file);
  return Promise.all([...unique.values()].map(async file => {
    const events = await io.listEvents(workspaceId, file.id);
    const merged = new Map([...(file.timeline || []), ...events].map(event => [event.id, event]));
    return { ...file, timeline: [...merged.values()].sort((a, b) => a.atMs - b.atMs) };
  }));
}
