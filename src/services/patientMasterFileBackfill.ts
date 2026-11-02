import type { MasterTimelineEvent } from '../types/clinicArea.ts';
import type { Patient } from '../types/clinical.ts';
import {
  appendPatientMasterEvent,
  ensureMasterFileUnitContext,
  ensurePatientMasterFile,
  masterFileIdForPatient,
  type MasterPatientFilePersistenceIO,
} from './masterPatientFileCloud.ts';

const BACKFILL_BATCH_SIZE = 10;

export interface PatientMasterFileBackfillIO extends MasterPatientFilePersistenceIO {
  listPatients(workspaceId: string): Promise<Patient[]>;
}

export interface PatientMasterFileBackfillPreview {
  workspaceId: string;
  previewedAtMs: number;
  totalPatients: number;
  archivedPatients: number;
  missingMasterFiles: number;
  existingMasterFiles: number;
  missingAdmissionDates: number;
  skippedPatients: number;
  candidatePatientIds: string[];
}

export interface PatientMasterFileBackfillProgress {
  processed: number;
  total: number;
  completed: number;
  failed: Array<{ patientId: string; message: string }>;
  cancelled: boolean;
}

export interface PatientMasterFileBackfillResult extends PatientMasterFileBackfillProgress {
  missingMasterFilesCreated: number;
  indexesRepaired: number;
  eventsCreatedOrConfirmed: number;
  eventsWithoutOriginalDate: number;
}

function admissionTimestamp(patient: Patient): number | null {
  const currentStart = Date.parse(String(patient.currentAdmissionStartedAt || ''));
  if (Number.isFinite(currentStart) && currentStart > 0) return Math.floor(currentStart);
  const date = String(patient.admissionDate || '').trim();
  const time = String(patient.admissionTime || '00:00').trim() || '00:00';
  if (!date) return null;
  const originalAdmission = Date.parse(`${date}T${time}`);
  return Number.isFinite(originalAdmission) && originalAdmission > 0 ? Math.floor(originalAdmission) : null;
}

function candidate(patient: Patient): { patientId: string; fileId: string; unitIds: string[]; atMs: number | null } | null {
  const patientId = String(patient?.id || '').trim();
  const primaryUnitId = String(patient?.unitId || '').trim();
  if (!patientId || !primaryUnitId) return null;
  let fileId: string;
  try {
    fileId = String(patient.masterFileId || masterFileIdForPatient(patientId));
    if (!fileId || fileId.includes('/')) return null;
  } catch {
    return null;
  }
  const unitIds = [...new Set([primaryUnitId, ...(Array.isArray(patient.unitIds) ? patient.unitIds : [])]
    .map(value => String(value || '').trim()).filter(Boolean))];
  return { patientId, fileId, unitIds, atMs: admissionTimestamp(patient) };
}

export async function previewPatientMasterFileBackfill(
  io: PatientMasterFileBackfillIO,
  workspaceId: string,
  patients: Patient[],
  nowMs = Date.now(),
): Promise<PatientMasterFileBackfillPreview> {
  const rows = patients.map(patient => ({ patient, candidate: candidate(patient) }));
  const eligible = rows.filter((row): row is { patient: Patient; candidate: NonNullable<ReturnType<typeof candidate>> } => !!row.candidate);
  let missingMasterFiles = 0;
  let existingMasterFiles = 0;
  for (let index = 0; index < eligible.length; index += BACKFILL_BATCH_SIZE) {
    const batch = eligible.slice(index, index + BACKFILL_BATCH_SIZE);
    const files = await Promise.all(batch.map(row => io.getFile(workspaceId, row.candidate.fileId)));
    files.forEach(file => { if (file) existingMasterFiles += 1; else missingMasterFiles += 1; });
  }
  return {
    workspaceId,
    previewedAtMs: Math.floor(nowMs),
    totalPatients: patients.length,
    archivedPatients: patients.filter(patient => !!patient.isArchived).length,
    missingMasterFiles,
    existingMasterFiles,
    missingAdmissionDates: eligible.filter(row => row.candidate.atMs === null).length,
    skippedPatients: rows.length - eligible.length,
    candidatePatientIds: eligible.map(row => row.candidate.patientId),
  };
}

export async function executePatientMasterFileBackfill(
  io: PatientMasterFileBackfillIO,
  workspaceId: string,
  ownerUid: string,
  patients: Patient[],
  preview: PatientMasterFileBackfillPreview,
  onProgress?: (progress: PatientMasterFileBackfillProgress) => void,
  nowMs = Date.now(),
  signal?: AbortSignal,
): Promise<PatientMasterFileBackfillResult> {
  if (preview.workspaceId !== workspaceId) throw new Error('The workspace changed after preview. Run the preview again.');
  const patientById = new Map(patients.map(patient => [String(patient.id || ''), patient]));
  const result: PatientMasterFileBackfillResult = {
    processed: 0, total: preview.candidatePatientIds.length, completed: 0, failed: [], cancelled: false,
    missingMasterFilesCreated: 0, indexesRepaired: 0, eventsCreatedOrConfirmed: 0, eventsWithoutOriginalDate: 0,
  };

  for (let offset = 0; offset < preview.candidatePatientIds.length; offset += BACKFILL_BATCH_SIZE) {
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }
    const batchIds = preview.candidatePatientIds.slice(offset, offset + BACKFILL_BATCH_SIZE);
    for (const patientId of batchIds) {
      const patient = patientById.get(patientId);
      const row = patient && candidate(patient);
      try {
        if (!patient || !row) throw new Error('Patient record is missing or has no valid unit scope. Preview again.');
        let file = await io.getFile(workspaceId, row.fileId);
        if (!file) {
          file = await ensurePatientMasterFile(io, workspaceId, {
            patientId: row.patientId,
            masterFileId: row.fileId,
            name: String(patient.fullName || patient.name || patient.id),
            ageYears: Number(patient.age) || 0,
            unitId: row.unitIds[0],
            createdBy: ownerUid,
            atMs: row.atMs ?? Math.floor(nowMs),
          });
          result.missingMasterFilesCreated += 1;
        }
        for (const unitId of row.unitIds) {
          const before = file.contextIds.includes(unitId);
          file = await ensureMasterFileUnitContext(io, workspaceId, file.id, unitId, nowMs);
          if (!before) result.indexesRepaired += 1;
        }
        if (row.atMs === null) {
          result.eventsWithoutOriginalDate += 1;
        } else {
          const event: MasterTimelineEvent = {
            id: `patient-admission-${encodeURIComponent(row.patientId)}`,
            kind: 'patient-admission',
            atMs: row.atMs,
            title: 'Historical patient admission',
            summary: `Admission record backfilled from the original patient record.`,
            detail: `Original admission date and time were preserved from the patient record.`,
            createdBy: ownerUid,
            context: { unitId: row.unitIds[0] },
            refId: file.id,
            schemaVersion: 1,
          };
          await appendPatientMasterEvent(io, workspaceId, file.id, event);
          result.eventsCreatedOrConfirmed += 1;
        }
        result.completed += 1;
      } catch (error) {
        result.failed.push({ patientId, message: String((error as any)?.message || error) });
      } finally {
        result.processed += 1;
        onProgress?.({ processed: result.processed, total: result.total, completed: result.completed, failed: [...result.failed], cancelled: false });
      }
    }
  }
  result.cancelled ||= !!signal?.aborted && result.processed < result.total;
  if (result.cancelled) onProgress?.({ processed: result.processed, total: result.total, completed: result.completed, failed: [...result.failed], cancelled: true });
  return result;
}
