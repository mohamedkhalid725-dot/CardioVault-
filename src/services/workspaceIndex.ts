import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webCollection, webDoc, getDoc as webGetDoc, getDocs as webGetDocs, setDoc as webSetDoc, deleteDoc as webDeleteDoc } from './webFirebase';

/**
 * The team index: "which teams does this account belong to?"
 *
 * A doctor can work in more than one team with the same Google account. The
 * index is only a HINT for the team picker - it grants nothing. Opening a team
 * still goes through the membership document, exactly as before, and the rules
 * refuse to index a team the account is not really a member of.
 *
 * Shape: userWorkspaces/{uid}/workspaces/{workspaceId}
 */

export interface IndexedWorkspace {
  workspaceId: string;
  name: string;
  unitNames?: string[];
  updatedAt?: string;
}

const indexRoot = (uid: string): string => `userWorkspaces/${uid}/workspaces`;

const safeData = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null;
  } catch {
    return null;
  }
};

const snapshotId = (snapshot: any): string => {
  try {
    return String(snapshot?.id || snapshot?.documentId || snapshot?.ref?.id || snapshot?.reference?.id || '');
  } catch {
    return '';
  }
};

const toEntry = (id: string, data: any): IndexedWorkspace => ({
  workspaceId: String(id || data?.workspaceId || ''),
  name: String(data?.name || data?.workspaceId || id || ''),
  unitNames: Array.isArray(data?.unitNames) ? data.unitNames.map(String) : undefined,
  updatedAt: data?.updatedAt ? String(data.updatedAt) : undefined,
});

/** Every team this account is indexed in. Never throws: an empty list is a valid answer. */
export async function listIndexedWorkspaces(uid: string): Promise<IndexedWorkspace[]> {
  if (!uid) return [];
  try {
    if (Capacitor.isNativePlatform()) {
      const result: any = await FirebaseFirestore.getCollection({ reference: indexRoot(uid) });
      const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
      return snapshots
        .map((snapshot: any) => toEntry(snapshotId(snapshot), safeData(snapshot)))
        .filter((entry: IndexedWorkspace) => !!entry.workspaceId);
    }
    const snapshot = await webGetDocs(webCollection(indexRoot(uid)));
    return snapshot.docs.map((doc: any) => toEntry(doc.id, doc.data() || {}));
  } catch (error) {
    console.warn('Team index read failed:', error);
    return [];
  }
}

/** Adds (or refreshes) one team in the account's index. Returns false when the rules refused it (the account is not really a member of that team). */
export async function registerWorkspaceInIndex(uid: string, entry: IndexedWorkspace): Promise<boolean> {
  if (!uid || !entry?.workspaceId) return false;
  const reference = `${indexRoot(uid)}/${entry.workspaceId}`;
  const payload = {
    workspaceId: entry.workspaceId,
    name: entry.name || entry.workspaceId,
    unitNames: entry.unitNames || [],
    updatedAt: new Date().toISOString(),
  };
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference, data: payload, merge: true });
    } else {
      await webSetDoc(webDoc(reference), payload, { merge: true });
    }
    return true;
  } catch (error) {
    console.warn('Team index write failed:', error);
    return false;
  }
}

/** Removes one team from the account's index (for example after leaving it). */
export async function removeWorkspaceFromIndex(uid: string, workspaceId: string): Promise<void> {
  if (!uid || !workspaceId) return;
  const reference = `${indexRoot(uid)}/${workspaceId}`;
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.deleteDocument({ reference });
    } else {
      await webDeleteDoc(webDoc(reference));
    }
  } catch (error) {
    console.warn('Team index removal failed:', error);
  }
}

/**
 * The display name of a team. Only a real member (or the platform owner) can
 * read the workspace document, so this returns the id when it is not readable.
 */
export async function readWorkspaceName(workspaceId: string): Promise<string> {
  if (!workspaceId) return '';
  try {
    const reference = `workspaces/${workspaceId}`;
    if (Capacitor.isNativePlatform()) {
      const result: any = await FirebaseFirestore.getDocument({ reference });
      const data = safeData(result?.snapshot);
      return String(data?.name || data?.teamName || workspaceId);
    }
    const snapshot = await webGetDoc(webDoc(reference));
    if (!snapshot.exists()) return workspaceId;
    const data = snapshot.data() || {};
    return String(data.name || data.teamName || workspaceId);
  } catch {
    return workspaceId;
  }
}

