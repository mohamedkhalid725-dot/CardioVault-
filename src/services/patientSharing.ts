import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webDoc, getDoc as webGetDoc, setDoc as webSetDoc } from './webFirebase';
import { logUnitEvent } from './unitAudit';
import type { Patient } from '../types/clinical';

/**
 * Sharing one clinical file with a second unit.
 *
 * The patient document stays exactly ONE document. On accept:
 *  - unitId moves to the unit the patient is physically in now (the chosen bed
 *    belongs to that unit);
 *  - unitIds keeps every unit that may read the file and gains the new one;
 *  - the previous bed is freed and the chosen bed is occupied;
 *  - each unit's audit trail gets its own `patient.share` event, written in the
 *    actor's own name (logUnitEvent never throws: an audit failure must not undo
 *    the clinical action).
 *
 * The Firestore rules are the real gate for step 1/2: a member can never add a
 * unit he does not belong to, and never edit a file of a unit he is not in.
 */

export interface ShareActor {
  uid: string;
  name?: string;
}

export interface ShareUnitNames {
  /** Display name of the unit the file came from. */
  source?: string;
  /** Display name of the unit the file is being shared with. */
  target?: string;
}

/** Union of the file's existing readers, its physical unit and the new unit. */
export function mergeUnitIds(current: unknown, primaryUnitId: string, addedUnitId: string): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    const id = String(value || '');
    if (id && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(current)) for (const item of current) push(item);
  push(primaryUnitId);
  push(addedUnitId);
  return out;
}

const snapshotData = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null;
  } catch {
    return null;
  }
};

async function readPatientDocument(workspaceId: string, patientId: string): Promise<any | null> {
  const reference = `workspaces/${workspaceId}/patients/${patientId}`;
  try {
    if (Capacitor.isNativePlatform()) {
      const result: any = await FirebaseFirestore.getDocument({ reference });
      return snapshotData(result?.snapshot);
    }
    const snapshot = await webGetDoc(webDoc(reference));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    console.warn('Shared patient read failed:', error);
    return null;
  }
}

async function writePatientDocument(workspaceId: string, patientId: string, data: Record<string, unknown>): Promise<void> {
  const reference = `workspaces/${workspaceId}/patients/${patientId}`;
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.setDocument({ reference, data: payload, merge: true });
  } else {
    await webSetDoc(webDoc(reference), payload, { merge: true });
  }
}

async function writeBedDocument(workspaceId: string, bedId: string, data: Record<string, unknown>): Promise<void> {
  const reference = `workspaces/${workspaceId}/beds/${bedId}`;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.setDocument({ reference, data, merge: true });
  } else {
    await webSetDoc(webDoc(reference), data, { merge: true });
  }
}

/**
 * Moves `patient`'s single file into `targetUnitId`'s bed and lets that unit read
 * it too. Throws when the cloud write of the file itself is refused, so the
 * caller can tell the doctor nothing was shared; the two audit writes never
 * throw.
 */
export async function sharePatientIntoUnit(
  workspaceId: string,
  patient: Patient,
  targetUnitId: string,
  targetBedId: string,
  actor: ShareActor,
  unitNames?: ShareUnitNames,
): Promise<void> {
  if (!workspaceId || !patient?.id || !targetUnitId || !targetBedId || !actor?.uid) return;

  const patientId = String(patient.id);
  const remote = await readPatientDocument(workspaceId, patientId);
  const sourceUnitId = String(remote?.unitId || patient.unitId || '');
  const previousBedId = String(remote?.bedId || patient.bedId || '');
  const unitIds = mergeUnitIds(remote?.unitIds ?? patient.unitIds, sourceUnitId, targetUnitId);

  if (previousBedId && previousBedId !== targetBedId) {
    await writeBedDocument(workspaceId, previousBedId, { patientId: '', status: 'Empty' });
  }
  await writeBedDocument(workspaceId, targetBedId, {
    patientId,
    status: String(remote?.status || patient.status || 'Not documented'),
    unitId: targetUnitId,
  });
  await writePatientDocument(workspaceId, patientId, { unitId: targetUnitId, bedId: targetBedId, unitIds });

  const targetName = unitNames?.target || targetUnitId;
  const sourceName = unitNames?.source || sourceUnitId || 'another unit';
  await logUnitEvent(workspaceId, sourceUnitId || targetUnitId, actor, {
    action: 'patient.share',
    entityType: 'patient',
    entityId: patientId,
    summary: `File shared with ${targetName}`,
    meta: { sharedWithUnitId: targetUnitId },
  });
  if (sourceUnitId && sourceUnitId !== targetUnitId) {
    await logUnitEvent(workspaceId, targetUnitId, actor, {
      action: 'patient.share',
      entityType: 'patient',
      entityId: patientId,
      summary: `File shared from ${sourceName}`,
      meta: { sharedFromUnitId: sourceUnitId },
    });
  }
}
