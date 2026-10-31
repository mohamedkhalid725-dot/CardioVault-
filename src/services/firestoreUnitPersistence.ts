import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDocFromServer, getDocsFromServer, query, where } from 'firebase/firestore';
import type { Bed, Unit } from '../types/clinical';
import { getActiveWorkspaceId } from './workspaceAccess';
import { webCollection, webDoc } from './webFirebase';
import type { UnitCloudVerificationIO } from './unitPersistence';

const unitPath = (unitId: string) => `workspaces/${getActiveWorkspaceId()}/units/${unitId}`;
const bedsPath = () => `workspaces/${getActiveWorkspaceId()}/beds`;

function readNativeData(snapshot: any): any {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data || null;
  } catch {
    return null;
  }
}

function requireNativeServerSnapshot(snapshot: any): void {
  if (snapshot?.metadata?.fromCache !== false) {
    throw new Error('Firestore returned a cached or unverified result; cloud persistence is not confirmed. Connect to the internet and retry.');
  }
}

export const firestoreUnitVerificationIO: UnitCloudVerificationIO = {
  async getUnit(id: string): Promise<Unit | null> {
    const path = unitPath(id);
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      requireNativeServerSnapshot(result?.snapshot);
      const data = readNativeData(result?.snapshot);
      return data ? { ...data, id: String(data.id || id) } as Unit : null;
    }
    const snapshot = await getDocFromServer(webDoc(path));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Unit : null;
  },

  async listBeds(unitId: string): Promise<Bed[]> {
    const path = bedsPath();
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.enableNetwork();
      const result: any = await FirebaseFirestore.getCollection({
        reference: path,
        compositeFilter: {
          type: 'and',
          queryConstraints: [{ type: 'where', fieldPath: 'unitId', opStr: '==', value: unitId }],
        },
      });
      const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
      snapshots.forEach(requireNativeServerSnapshot);
      return snapshots.flatMap((snapshot: any) => {
        const data = readNativeData(snapshot);
        const id = String(snapshot?.id || snapshot?.documentId || data?.id || '');
        return data && id ? [{ ...data, id } as Bed] : [];
      });
    }
    const reference = webCollection(path);
    const snapshot = await getDocsFromServer(query(reference, where('unitId', '==', unitId)));
    return snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Bed));
  },
};
