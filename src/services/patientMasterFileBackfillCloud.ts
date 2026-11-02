import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDocsFromServer } from 'firebase/firestore';
import type { Patient } from '../types/clinical.ts';
import { getActiveWorkspaceId, getCurrentUid, isMasterAccount } from './workspaceAccess.ts';
import { webCollection } from './webFirebase.ts';
import { firestoreMasterPatientFilePersistence } from './firestoreMasterPatientFilePersistence.ts';
import {
  executePatientMasterFileBackfill,
  previewPatientMasterFileBackfill,
  type PatientMasterFileBackfillIO,
  type PatientMasterFileBackfillPreview,
  type PatientMasterFileBackfillProgress,
} from './patientMasterFileBackfill.ts';

const patientCollectionPath = (workspaceId: string) => `workspaces/${workspaceId}/patients`;

function nativeData(snapshot: any): Record<string, any> | null {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null;
  } catch {
    return null;
  }
}

async function listWorkspacePatients(workspaceId: string): Promise<Patient[]> {
  const path = patientCollectionPath(workspaceId);
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.enableNetwork();
    const result: any = await FirebaseFirestore.getCollection({ reference: path });
    const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
    if (snapshots.some((snapshot: any) => snapshot?.metadata?.fromCache !== false)) {
      throw new Error('Patient list was not confirmed by the Firestore server. Connect and preview again.');
    }
    return snapshots.flatMap((snapshot: any) => {
      const data = nativeData(snapshot);
      const id = String(snapshot?.id || snapshot?.documentId || data?.id || '');
      return data && id ? [{ ...data, id } as Patient] : [];
    });
  }
  const snapshot = await getDocsFromServer(webCollection(path));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Patient));
}

async function requireOwnerWorkspace(): Promise<{ workspaceId: string; uid: string }> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can manage patient master-file backfill.');
  const workspaceId = getActiveWorkspaceId();
  const uid = await getCurrentUid();
  if (!workspaceId || !uid) throw new Error('The owner workspace session is unavailable.');
  return { workspaceId, uid };
}

function backfillIO(): PatientMasterFileBackfillIO {
  return Object.assign({}, firestoreMasterPatientFilePersistence, { listPatients: listWorkspacePatients });
}

export async function previewCurrentWorkspacePatientMasterFileBackfill(): Promise<PatientMasterFileBackfillPreview> {
  const { workspaceId } = await requireOwnerWorkspace();
  const patients = await listWorkspacePatients(workspaceId);
  return previewPatientMasterFileBackfill(backfillIO(), workspaceId, patients);
}

export async function runCurrentWorkspacePatientMasterFileBackfill(
  preview: PatientMasterFileBackfillPreview,
  onProgress?: (progress: PatientMasterFileBackfillProgress) => void,
  signal?: AbortSignal,
) {
  const { workspaceId, uid } = await requireOwnerWorkspace();
  if (preview.workspaceId !== workspaceId) throw new Error('The workspace changed after preview. Run the preview again.');
  const patients = await listWorkspacePatients(workspaceId);
  return executePatientMasterFileBackfill(backfillIO(), workspaceId, uid, patients, preview, onProgress, Date.now(), signal);
}
