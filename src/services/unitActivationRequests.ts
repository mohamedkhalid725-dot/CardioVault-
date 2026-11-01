import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webCollection, webDoc, getDoc as webGetDoc, getDocs as webGetDocs, setDoc as webSetDoc } from './webFirebase';
import { getActiveWorkspaceId, getCurrentUid, isMasterAccount } from './workspaceAccess';
import { activateNewUnitForOwner, setUnitActiveByOwner } from './unitLicenseCloud';
import { createUnitActivationRequest, isUnitActivationRequestActionable, unitActivationRequestId, type UnitActivationRequest } from './unitActivationModel';
import type { Unit } from '../types/clinical';

const COLLECTION = 'unitActivationRequests';
export { unitActivationRequestId } from './unitActivationModel';
export const unitActivationRequestPath = (requestId: string) => `${COLLECTION}/${requestId}`;

const readPath = async (path: string): Promise<Record<string, any> | null> => {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getDocument({ reference: path });
    const snapshot = result?.snapshot;
    try { return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null; }
    catch { return null; }
  }
  const snapshot = await webGetDoc(webDoc(path));
  return snapshot.exists() ? snapshot.data() : null;
};

const writePath = async (path: string, data: Record<string, any>, merge: boolean) => {
  if (Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({ reference: path, data, merge });
  else await webSetDoc(webDoc(path), data, { merge });
};

export async function submitUnitActivationRequest(unit: Unit, requesterName: string): Promise<UnitActivationRequest> {
  if (await isMasterAccount()) throw new Error('Platform-owner units activate automatically; they do not need an approval request.');
  const requester = await getCurrentUid();
  const workspaceId = getActiveWorkspaceId();
  const unitId = String(unit?.id || '').trim();
  if (!requester || !workspaceId || !unitId) throw new Error('A signed-in workspace member and saved unit are required.');
  const requestId = unitActivationRequestId(workspaceId, unitId);
  const path = unitActivationRequestPath(requestId);
  const existing = await readPath(path) as UnitActivationRequest | null;
  if (existing) {
    if (existing.workspaceId !== workspaceId || existing.unitId !== unitId || existing.requestedBy !== requester) {
      throw new Error('An activation request already exists for this unit. Contact the platform owner.');
    }
    return existing;
  }
  const request = createUnitActivationRequest({ workspaceId, unitId, unitName: String(unit.name || unitId),
    requestedBedCount: Math.max(0, Math.trunc(Number(unit.totalBeds) || 0)), requestedBy: requester,
    requestedByName: requesterName, requestedAtMs: Date.now() });
  await writePath(path, request as unknown as Record<string, any>, false);
  return request;
}

export async function listUnitActivationRequests(): Promise<UnitActivationRequest[]> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can view unit activation requests.');
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getCollection({ reference: COLLECTION });
    return (result?.snapshots || []).flatMap((snapshot: any) => {
      try {
        const data = typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data;
        return data ? [data as UnitActivationRequest] : [];
      } catch { return []; }
    }).sort((a: UnitActivationRequest, b: UnitActivationRequest) => a.requestedAtMs - b.requestedAtMs);
  }
  const snapshot = await webGetDocs(webCollection(COLLECTION));
  return snapshot.docs.map(item => item.data() as UnitActivationRequest)
    .sort((a, b) => a.requestedAtMs - b.requestedAtMs);
}

export async function beginUnitActivationApproval(request: UnitActivationRequest, nowMs = Date.now()): Promise<UnitActivationRequest> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can approve a unit.');
  const actor = await getCurrentUid();
  if (!actor) throw new Error('The platform owner must be signed in.');
  const path = unitActivationRequestPath(request.requestId);
  const latest = await readPath(path) as UnitActivationRequest | null;
  if (!latest || latest.workspaceId !== request.workspaceId || latest.unitId !== request.unitId) throw new Error('This unit request could not be verified. Refresh the Tasks view.');
  if (!isUnitActivationRequestActionable(latest.status)) return latest;
  if (latest.status === 'approving') {
    if (latest.approvedBy !== actor || !latest.approvalStartedAtMs) throw new Error('Another owner approval is already in progress.');
    return latest;
  }
  const approvalStartedAtMs = Math.floor(nowMs);
  const next = { ...latest, status: 'approving' as const, approvedBy: actor, approvalStartedAtMs };
  await writePath(path, { status: next.status, approvedBy: actor, approvalStartedAtMs }, true);
  return next;
}

export async function finishUnitActivationApproval(request: UnitActivationRequest, nowMs = Date.now()): Promise<UnitActivationRequest> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can approve a unit.');
  const actor = await getCurrentUid();
  if (!actor) throw new Error('The platform owner must be signed in.');
  const path = unitActivationRequestPath(request.requestId);
  const latest = await readPath(path) as UnitActivationRequest | null;
  if (!latest || latest.status !== 'approving' || latest.approvedBy !== actor || !latest.approvalStartedAtMs) throw new Error('This request is not awaiting completion by this owner.');
  await writePath(path, { status: 'approved', approvedAtMs: Math.floor(nowMs) }, true);
  return { ...latest, status: 'approved', approvedAtMs: Math.floor(nowMs) };
}

async function readCloudUnitAndBeds(workspaceId: string, unitId: string): Promise<{ unit: Record<string, any> | null; beds: Record<string, any>[] }> {
  const unitPath = `workspaces/${workspaceId}/units/${unitId}`;
  const bedsPath = `workspaces/${workspaceId}/beds`;
  if (Capacitor.isNativePlatform()) {
    const [unitResult, bedResult]: any[] = await Promise.all([
      FirebaseFirestore.getDocument({ reference: unitPath }),
      FirebaseFirestore.getCollection({ reference: bedsPath }),
    ]);
    const snapshotData = (snapshot: any) => {
      try { return typeof snapshot?.data === 'function' ? snapshot.data() || null : snapshot?.data || null; }
      catch { return null; }
    };
    return {
      unit: snapshotData(unitResult?.snapshot),
      beds: (bedResult?.snapshots || []).map(snapshotData).filter((data: any) => data?.unitId === unitId),
    };
  }
  const [unitSnapshot, bedSnapshot] = await Promise.all([
    webGetDoc(webDoc(unitPath)), webGetDocs(webCollection(bedsPath)),
  ]);
  return {
    unit: unitSnapshot.exists() ? unitSnapshot.data() : null,
    beds: bedSnapshot.docs.map(snapshot => snapshot.data()).filter(data => data.unitId === unitId),
  };
}

/** Completes owner approval as a retry-safe sequence; pending units remain blocked until the final active marker. */
export async function approveUnitActivationRequest(request: UnitActivationRequest): Promise<UnitActivationRequest> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can approve a unit.');
  const before = await readCloudUnitAndBeds(request.workspaceId, request.unitId);
  const expected = Math.max(0, Math.trunc(Number(request.requestedBedCount) || 0));
  if (!before.unit || (before.unit.activationStatus !== 'pending' && !(request.status === 'approving' && before.unit.activationStatus === 'active'))) throw new Error('The requested unit is missing or is no longer pending.');
  if (Number(before.unit.totalBeds) !== expected || before.beds.length !== expected) {
    throw new Error(`Bed setup is incomplete: ${before.beds.length} of ${expected} beds are confirmed in Firestore.`);
  }
  const approving = await beginUnitActivationApproval(request);
  if (before.unit.activationStatus !== 'active') await setUnitActiveByOwner(request.workspaceId, request.unitId, approving.approvalStartedAtMs!);
  const license = await activateNewUnitForOwner(request.workspaceId, request.unitId, {
    approvalRequestId: request.requestId,
    approvalStartedAtMs: approving.approvalStartedAtMs,
  });
  if (String((license as any).activationRequestId || '') !== request.requestId) throw new Error('An unrelated license already exists for this unit; the request was not activated.');
  const after = await readCloudUnitAndBeds(request.workspaceId, request.unitId);
  if (after.unit?.activationStatus !== 'active' || after.beds.length !== expected) {
    throw new Error('Activation was not fully confirmed in Firestore. The unit remains clinically blocked; retry approval.');
  }
  return finishUnitActivationApproval(approving);
}

export async function autoActivateOwnerCreatedUnit(workspaceId: string, unitId: string, nowMs = Date.now()): Promise<void> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can automatically activate an owner-created unit.');
  const { unit, beds } = await readCloudUnitAndBeds(workspaceId, unitId);
  if (!unit || Number(unit.totalBeds) !== beds.length) throw new Error(`Bed setup is incomplete: ${beds.length} beds are confirmed in Firestore.`);
  await setUnitActiveByOwner(workspaceId, unitId, nowMs);
  const license = await activateNewUnitForOwner(workspaceId, unitId, { nowMs });
  if ((license as any).activationRequestId) throw new Error('This unit already has a customer activation request and cannot use the owner-created activation path.');
  const confirmed = await readCloudUnitAndBeds(workspaceId, unitId);
  if (confirmed.unit?.activationStatus !== 'active' || confirmed.beds.length !== beds.length || license.expiresAtMs <= nowMs) {
    throw new Error('The unit activation was not fully confirmed in Firestore. Retry setup.');
  }
}
