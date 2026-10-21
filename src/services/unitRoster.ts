import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import {
  webCollection,
  webDoc,
  getDocs as webGetDocs,
  setDoc as webSetDoc,
  deleteDoc as webDeleteDoc,
} from './webFirebase';

/**
 * Unit-scoped roster.
 *
 * The workspace-level `team` collection is a directory of every account that
 * ever joined the workspace. It is NOT a safe way to show a member who their
 * colleagues are: its documents are filtered by nothing, so any member could
 * read the name and role of every colleague in every unit.
 *
 * A roster document is written once per (unit, member) pair and is readable
 * only by the members of that unit (and the platform owner). That is the only
 * source the Team screen may use for non-owner accounts.
 */
export interface UnitRosterEntry {
  uid: string;
  name: string;
  /** Workspace access level: clinical_editor | view_only | owner */
  role: string;
  /** Clinical title inside this unit: nurse | resident | specialist | consultant */
  clinicalRole?: string;
  status: 'active' | 'inactive';
  joinedAtMs: number;
  updatedAtMs: number;
  addedBy?: string;
  email?: string;
}

export const unitRosterPath = (workspaceId: string, unitId: string): string =>
  `workspaces/${workspaceId}/units/${unitId}/roster`;

const raw = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null;
  } catch {
    return null;
  }
};

/** Reads the roster of one unit. Returns [] when the caller has no access. */
export async function listUnitRoster(workspaceId: string, unitId: string): Promise<UnitRosterEntry[]> {
  if (!workspaceId || !unitId) return [];
  try {
    let rows: any[] = [];
    if (Capacitor.isNativePlatform()) {
      const result: any = await FirebaseFirestore.getCollection({ reference: unitRosterPath(workspaceId, unitId) });
      rows = (result?.snapshots || []).map((snapshot: any) => ({
        ...raw(snapshot),
        uid: String(snapshot?.id || snapshot?.documentId || raw(snapshot)?.uid || ''),
      }));
    } else {
      const snapshot = await webGetDocs(webCollection(unitRosterPath(workspaceId, unitId)));
      rows = (snapshot?.docs || []).map((doc: any) => ({ ...doc.data(), uid: doc.id }));
    }
    return rows
      .filter((row) => row && row.uid)
      .map((row): UnitRosterEntry => ({
        uid: String(row.uid),
        name: String(row.name || 'Team member'),
        role: String(row.role || 'clinical_editor'),
        clinicalRole: row.clinicalRole ? String(row.clinicalRole) : undefined,
        status: row.status === 'inactive' ? 'inactive' : 'active',
        joinedAtMs: Number(row.joinedAtMs || 0),
        updatedAtMs: Number(row.updatedAtMs || 0),
        addedBy: row.addedBy ? String(row.addedBy) : undefined,
        email: row.email ? String(row.email) : undefined,
      }))
      .filter((row) => row.status !== 'inactive')
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn('Unit roster read failed:', error);
    return [];
  }
}

/** Creates or refreshes one roster entry. Idempotent. */
export async function upsertRosterEntry(
  workspaceId: string,
  unitId: string,
  entry: Omit<UnitRosterEntry, 'joinedAtMs' | 'updatedAtMs'> & { joinedAtMs?: number }
): Promise<void> {
  if (!workspaceId || !unitId || !entry?.uid) return;
  const now = Date.now();
  const payload = {
    uid: entry.uid,
    name: entry.name || 'Team member',
    role: entry.role || 'clinical_editor',
    clinicalRole: entry.clinicalRole || null,
    status: entry.status === 'inactive' ? 'inactive' : 'active',
    joinedAtMs: entry.joinedAtMs || now,
    updatedAtMs: now,
    addedBy: entry.addedBy || entry.uid,
    email: entry.email || '',
  };
  const path = `${unitRosterPath(workspaceId, unitId)}/${entry.uid}`;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.setDocument({ reference: path, data: payload, merge: true });
  } else {
    await webSetDoc(webDoc(path), payload, { merge: true });
  }
}

/** Removes one person from one unit roster. */
export async function removeRosterEntry(workspaceId: string, unitId: string, uid: string): Promise<void> {
  if (!workspaceId || !unitId || !uid) return;
  const path = `${unitRosterPath(workspaceId, unitId)}/${uid}`;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.deleteDocument({ reference: path });
  } else {
    await webDeleteDoc(webDoc(path));
  }
}

/**
 * Merges the rosters of several units into one de-duplicated list.
 * A member in three units appears once, with the union of their unit ids.
 */
export interface RosterMember extends UnitRosterEntry {
  unitIds: string[];
}

export async function listRosterForUnits(
  workspaceId: string,
  unitIds: string[]
): Promise<RosterMember[]> {
  const unique = Array.from(new Set(unitIds.filter(Boolean)));
  const rosters = await Promise.all(unique.map((unitId) => listUnitRoster(workspaceId, unitId)));
  const byUid = new Map<string, RosterMember>();
  rosters.forEach((roster, index) => {
    const unitId = unique[index];
    roster.forEach((entry) => {
      const existing = byUid.get(entry.uid);
      if (existing) {
        if (!existing.unitIds.includes(unitId)) existing.unitIds.push(unitId);
        return;
      }
      byUid.set(entry.uid, { ...entry, unitIds: [unitId] });
    });
  });
  return Array.from(byUid.values()).sort((a, b) => a.name.localeCompare(b.name));
}
