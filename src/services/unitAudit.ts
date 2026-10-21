import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webCollection, webDoc, getDocs as webGetDocs, setDoc as webSetDoc } from './webFirebase';

/**
 * Unit-scoped audit trail.
 *
 * Hard rules it enforces (client side; the Firestore rules are the real gate):
 *  - an event always belongs to exactly ONE unit;
 *  - the actor recorded is the signed-in account, never somebody else;
 *  - an event can never be updated or deleted (append-only);
 *  - an account that is not a member of the unit can neither write nor read it.
 *
 * The legacy localStorage log (`auditTrailService`) stays as an offline buffer;
 * this service is the durable, cross-device copy.
 */
export interface UnitAuditEvent {
  id: string;
  unitId: string;
  workspaceId: string;
  /** Stable machine action, e.g. patient.create, patient.transfer, member.add */
  action: string;
  entityType: string;
  entityId: string;
  /** Human readable one-liner, no free-text clinical detail. */
  summary: string;
  actorUid: string;
  actorName: string;
  createdAtMs: number;
  meta?: Record<string, unknown>;
}

export interface UnitAuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}

export const unitAuditPath = (workspaceId: string, unitId: string): string =>
  `workspaces/${workspaceId}/units/${unitId}/audit`;

const raw = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null;
  } catch {
    return null;
  }
};

/**
 * Appends one event. Never throws: an audit write must not break the clinical
 * action that triggered it.
 */
export async function logUnitEvent(
  workspaceId: string,
  unitId: string,
  actor: { uid: string; name?: string },
  input: UnitAuditInput
): Promise<void> {
  if (!workspaceId || !unitId || !actor?.uid || !input?.action) return;
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    unitId,
    workspaceId,
    action: String(input.action),
    entityType: String(input.entityType || ''),
    entityId: String(input.entityId || ''),
    summary: String(input.summary || '').slice(0, 500),
    actorUid: actor.uid,
    actorName: String(actor.name || ''),
    createdAtMs: now,
    meta: input.meta || {},
  };
  const path = `${unitAuditPath(workspaceId, unitId)}/${id}`;
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({ reference: path, data: payload, merge: false });
    } else {
      await webSetDoc(webDoc(path), payload, { merge: false });
    }
  } catch (error) {
    console.warn('Unit audit write failed:', error);
  }
}

/** Reads the newest events first. Returns [] when the unit is not readable. */
export async function listUnitAudit(
  workspaceId: string,
  unitId: string,
  max = 200
): Promise<UnitAuditEvent[]> {
  if (!workspaceId || !unitId) return [];
  try {
    let rows: any[] = [];
    if (Capacitor.isNativePlatform()) {
      const result: any = await FirebaseFirestore.getCollection({ reference: unitAuditPath(workspaceId, unitId) });
      rows = (result?.snapshots || []).map((snapshot: any) => ({
        ...raw(snapshot),
        id: String(snapshot?.id || snapshot?.documentId || ''),
      }));
    } else {
      const snapshot = await webGetDocs(webCollection(unitAuditPath(workspaceId, unitId)));
      rows = (snapshot?.docs || []).map((doc: any) => ({ ...doc.data(), id: doc.id }));
    }
    return rows
      .filter((row) => row && row.action)
      .map((row) => ({
        id: String(row.id || ''),
        unitId: String(row.unitId || unitId),
        workspaceId: String(row.workspaceId || workspaceId),
        action: String(row.action),
        entityType: String(row.entityType || ''),
        entityId: String(row.entityId || ''),
        summary: String(row.summary || ''),
        actorUid: String(row.actorUid || ''),
        actorName: String(row.actorName || ''),
        createdAtMs: Number(row.createdAtMs || 0),
        meta: row.meta || {},
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, Math.max(1, max));
  } catch (error) {
    console.warn('Unit audit read failed:', error);
    return [];
  }
}
