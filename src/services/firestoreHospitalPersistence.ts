import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDocFromServer, getDocsFromServer, writeBatch as webWriteBatch } from 'firebase/firestore';
import type { HospitalDocument, HospitalPersistenceIO, HospitalWrite } from './hospitalPersistence';
import type { Unit } from '../types/clinical';
import { webCollection, webDoc, getDoc as webGetDoc, getDocs as webGetDocs } from './webFirebase';

const hospitalsPath = (workspaceId: string) => `workspaces/${workspaceId}/hospitals`;
const unitsPath = (workspaceId: string) => `workspaces/${workspaceId}/units`;

function nativeData(snapshot: any): any {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data || null;
  } catch {
    return null;
  }
}

function requireNativeServerSnapshot(snapshot: any): void {
  if (snapshot?.metadata?.fromCache !== false) {
    throw new Error('Firestore returned a cached or unverified hospital record. Connect to the internet and retry.');
  }
}

export const firestoreHospitalPersistence: HospitalPersistenceIO = {
  async getHospital(workspaceId: string, hospitalId: string): Promise<HospitalDocument | null> {
    const path = `${hospitalsPath(workspaceId)}/${hospitalId}`;
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      requireNativeServerSnapshot(result?.snapshot);
      const data = nativeData(result?.snapshot);
      return data ? { ...data, id: String(data.id || hospitalId) } as HospitalDocument : null;
    }
    const snapshot = await getDocFromServer(webDoc(path));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as HospitalDocument : null;
  },

  async listHospitals(workspaceId: string): Promise<HospitalDocument[]> {
    const path = hospitalsPath(workspaceId);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getCollection({ reference: path });
      (Array.isArray(result?.snapshots) ? result.snapshots : []).forEach(requireNativeServerSnapshot);
      return (Array.isArray(result?.snapshots) ? result.snapshots : []).flatMap((snapshot: any) => {
        const data = nativeData(snapshot);
        const id = String(snapshot?.id || snapshot?.documentId || data?.id || '');
        return data && id ? [{ ...data, id } as HospitalDocument] : [];
      });
    }
    const snapshot = await getDocsFromServer(webCollection(path));
    return snapshot.docs.map((item: any) => ({ ...item.data(), id: item.id } as HospitalDocument));
  },

  async getUnit(workspaceId: string, unitId: string): Promise<Unit | null> {
    const path = `${unitsPath(workspaceId)}/${unitId}`;
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      requireNativeServerSnapshot(result?.snapshot);
      const data = nativeData(result?.snapshot);
      return data ? { ...data, id: String(data.id || unitId) } as Unit : null;
    }
    const snapshot = await getDocFromServer(webDoc(path));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Unit : null;
  },

  async commit(workspaceId: string, writes: HospitalWrite[]): Promise<void> {
    if (!writes.length) return;
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.writeBatch({
        operations: writes.map((write) => ({
          type: 'set' as const,
          reference: `${write.collection === 'hospitals' ? hospitalsPath(workspaceId) : unitsPath(workspaceId)}/${write.id}`,
          data: write.data,
          options: { merge: write.merge !== false },
        })),
      });
      return;
    }

    const firstPath = `${writes[0].collection === 'hospitals' ? hospitalsPath(workspaceId) : unitsPath(workspaceId)}/${writes[0].id}`;
    const firstReference = webDoc(firstPath);
    const batch = webWriteBatch(firstReference.firestore);
    for (const write of writes) {
      const path = `${write.collection === 'hospitals' ? hospitalsPath(workspaceId) : unitsPath(workspaceId)}/${write.id}`;
      const reference = webDoc(path);
      if (write.merge === false) batch.set(reference, write.data);
      else batch.set(reference, write.data, { merge: true });
    }
    await batch.commit();
  },
};
