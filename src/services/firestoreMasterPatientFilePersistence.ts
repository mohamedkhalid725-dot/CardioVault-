import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { collection, getDocFromServer, getDocsFromServer, setDoc, writeBatch } from 'firebase/firestore';
import type { MasterPatientFile, MasterTimelineEvent } from '../types/clinicArea';
import { webCollection, webDoc } from './webFirebase';
import type { MasterPatientFilePersistenceIO } from './masterPatientFileCloud';

const filesPath = (workspaceId: string) => `workspaces/${workspaceId}/masterFiles`;
const filePath = (workspaceId: string, fileId: string) => `${filesPath(workspaceId)}/${fileId}`;
const eventsPath = (workspaceId: string, fileId: string) => `${filePath(workspaceId, fileId)}/events`;
const unitIndexPath = (workspaceId: string, unitId: string) => `workspaces/${workspaceId}/units/${unitId}/masterIndex`;

function masterIndexRecord(workspaceId: string, unitId: string, masterFileId: string) {
  return { workspaceId, unitId, masterFileId };
}

async function writeMasterFileAndIndexes(
  workspaceId: string,
  file: MasterPatientFile,
  fileData: Record<string, unknown>,
  merge: boolean,
  indexUnitIds: string[],
): Promise<void> {
  const indexOperations = [...new Set(indexUnitIds.filter(Boolean))].map(unitId => ({
    reference: `${unitIndexPath(workspaceId, unitId)}/${file.id}`,
    data: masterIndexRecord(workspaceId, unitId, file.id),
  }));
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.writeBatch({ operations: [
      { type: 'set', reference: filePath(workspaceId, file.id), data: fileData, options: { merge } },
      ...indexOperations.map(operation => ({ type: 'set' as const, ...operation, options: { merge: false } })),
    ] });
    return;
  }
  const batch = writeBatch(webDoc(filePath(workspaceId, file.id)).firestore);
  batch.set(webDoc(filePath(workspaceId, file.id)), fileData, { merge });
  for (const operation of indexOperations) batch.set(webDoc(operation.reference), operation.data);
  await batch.commit();
}

function nativeData(snapshot: any): any {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data || null;
  } catch {
    return null;
  }
}

function requireServerSnapshot(snapshot: any, what: string): void {
  if (snapshot?.metadata?.fromCache !== false) {
    throw new Error(`Firestore returned a cached or unverified ${what}. Connect to the internet and retry.`);
  }
}

function nativeId(snapshot: any, data: any): string {
  return String(snapshot?.id || snapshot?.documentId || data?.id || '');
}

export const firestoreMasterPatientFilePersistence: MasterPatientFilePersistenceIO = {
  async getFile(workspaceId, fileId) {
    const path = filePath(workspaceId, fileId);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      requireServerSnapshot(result?.snapshot, 'master patient file');
      const data = nativeData(result?.snapshot);
      return data ? { ...data, id: nativeId(result.snapshot, data) || fileId } as MasterPatientFile : null;
    }
    const snapshot = await getDocFromServer(webDoc(path));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as MasterPatientFile : null;
  },

  async listFilesForUnit(workspaceId, unitId) {
    if (!unitId) return [];
    const indexPath = unitIndexPath(workspaceId, unitId);
    let fileIds: string[];
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getCollection({ reference: indexPath });
      const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
      snapshots.forEach((snapshot: any) => requireServerSnapshot(snapshot, 'unit master-file index'));
      fileIds = snapshots.flatMap((snapshot: any) => {
        const data = nativeData(snapshot);
        const id = String(data?.masterFileId || nativeId(snapshot, data));
        return data && id ? [id] : [];
      });
    } else {
      const snapshot = await getDocsFromServer(webCollection(indexPath));
      fileIds = snapshot.docs.map(item => String(item.data().masterFileId || item.id)).filter(Boolean);
    }
    const files = await Promise.all([...new Set(fileIds)].map(fileId => this.getFile(workspaceId, fileId)));
    return files.filter((file): file is MasterPatientFile => !!file);
  },

  async createFile(workspaceId, file) {
    await writeMasterFileAndIndexes(workspaceId, file, file as unknown as Record<string, unknown>, false, file.contextIds);
  },

  async updateFile(workspaceId, file) {
    const current = await this.getFile(workspaceId, file.id);
    if (!current) throw new Error('The master patient file is unavailable for unit sharing.');
    const addedUnitIds = file.contextIds.filter(unitId => !current.contextIds.includes(unitId));
    await writeMasterFileAndIndexes(workspaceId, file, { contextIds: file.contextIds, updatedAtMs: file.updatedAtMs }, true, addedUnitIds);
  },

  async ensureUnitIndex(workspaceId, fileId, unitId) {
    const file = await this.getFile(workspaceId, fileId);
    if (!file || !file.contextIds.includes(unitId)) throw new Error('The master patient file is not authorized for this unit.');
    const reference = `${unitIndexPath(workspaceId, unitId)}/${fileId}`;
    const data = masterIndexRecord(workspaceId, unitId, fileId);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference, data, merge: false });
      return;
    }
    await setDoc(webDoc(reference), data);
  },

  async getEvent(workspaceId, fileId, eventId) {
    const path = `${eventsPath(workspaceId, fileId)}/${eventId}`;
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      requireServerSnapshot(result?.snapshot, 'master timeline event');
      const data = nativeData(result?.snapshot);
      return data ? { ...data, id: nativeId(result.snapshot, data) || eventId } as MasterTimelineEvent : null;
    }
    const snapshot = await getDocFromServer(webDoc(path));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as MasterTimelineEvent : null;
  },

  async listEvents(workspaceId, fileId) {
    const path = eventsPath(workspaceId, fileId);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getCollection({ reference: path });
      const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
      snapshots.forEach((snapshot: any) => requireServerSnapshot(snapshot, 'master timeline event'));
      return snapshots.flatMap((snapshot: any) => {
        const data = nativeData(snapshot);
        const id = nativeId(snapshot, data);
        return data && id ? [{ ...data, id } as MasterTimelineEvent] : [];
      });
    }
    const snapshot = await getDocsFromServer(collection(webDoc(filePath(workspaceId, fileId)), 'events'));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as MasterTimelineEvent));
  },

  async createEvent(workspaceId, fileId, event) {
    const path = `${eventsPath(workspaceId, fileId)}/${event.id}`;
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference: path, data: event, merge: false });
      return;
    }
    await setDoc(webDoc(path), event);
  },
};
