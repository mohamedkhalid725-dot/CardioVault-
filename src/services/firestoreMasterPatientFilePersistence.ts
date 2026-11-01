import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { collection, getDocFromServer, getDocsFromServer, query, setDoc, where } from 'firebase/firestore';
import type { MasterPatientFile, MasterTimelineEvent } from '../types/clinicArea';
import { webCollection, webDoc } from './webFirebase';
import type { MasterPatientFilePersistenceIO } from './masterPatientFileCloud';

const filesPath = (workspaceId: string) => `workspaces/${workspaceId}/masterFiles`;
const filePath = (workspaceId: string, fileId: string) => `${filesPath(workspaceId)}/${fileId}`;
const eventsPath = (workspaceId: string, fileId: string) => `${filePath(workspaceId, fileId)}/events`;

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
    const path = filesPath(workspaceId);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getCollection({
        reference: path,
        compositeFilter: { type: 'and', queryConstraints: [{ type: 'where', fieldPath: 'contextIds', opStr: 'array-contains', value: unitId }] },
      });
      const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
      snapshots.forEach((snapshot: any) => requireServerSnapshot(snapshot, 'master patient file'));
      return snapshots.flatMap((snapshot: any) => {
        const data = nativeData(snapshot);
        const id = nativeId(snapshot, data);
        return data && id ? [{ ...data, id } as MasterPatientFile] : [];
      });
    }
    const ref = webCollection(path);
    const snapshot = await getDocsFromServer(query(ref, where('contextIds', 'array-contains', unitId)));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as MasterPatientFile));
  },

  async createFile(workspaceId, file) {
    const path = filePath(workspaceId, file.id);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference: path, data: file, merge: false });
      return;
    }
    await setDoc(webDoc(path), file);
  },

  async updateFile(workspaceId, file) {
    const path = filePath(workspaceId, file.id);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference: path, data: { contextIds: file.contextIds, updatedAtMs: file.updatedAtMs }, merge: true });
      return;
    }
    await setDoc(webDoc(path), { contextIds: file.contextIds, updatedAtMs: file.updatedAtMs }, { merge: true });
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
