export type UnitActivationRequestStatus = 'pending' | 'approving' | 'approved';

export interface UnitActivationRequest {
  requestId: string;
  workspaceId: string;
  unitId: string;
  unitName: string;
  requestedBedCount: number;
  requestedBy: string;
  requestedByName: string;
  requestedAtMs: number;
  status: UnitActivationRequestStatus;
  schemaVersion: 1;
  approvedBy?: string;
  approvalStartedAtMs?: number;
  approvedAtMs?: number;
}

export const unitActivationRequestId = (workspaceId: string, unitId: string) => `${workspaceId}__${unitId}`;

export function createUnitActivationRequest(input: {
  workspaceId: string;
  unitId: string;
  unitName: string;
  requestedBedCount: number;
  requestedBy: string;
  requestedByName: string;
  requestedAtMs: number;
}): UnitActivationRequest {
  const workspaceId = String(input.workspaceId || '').trim();
  const unitId = String(input.unitId || '').trim();
  const requestedBy = String(input.requestedBy || '').trim();
  const requestedBedCount = Math.trunc(Number(input.requestedBedCount));
  const requestedAtMs = Math.floor(Number(input.requestedAtMs));
  if (!workspaceId || !unitId || !requestedBy) throw new Error('Workspace, unit and requester are required.');
  if (!Number.isFinite(requestedBedCount) || requestedBedCount < 0) throw new Error('Requested bed count must be a non-negative integer.');
  if (!Number.isFinite(requestedAtMs) || requestedAtMs <= 0) throw new Error('A valid request timestamp is required.');
  return {
    requestId: unitActivationRequestId(workspaceId, unitId), workspaceId, unitId,
    unitName: String(input.unitName || unitId).trim().slice(0, 120), requestedBedCount,
    requestedBy, requestedByName: String(input.requestedByName || 'Workspace administrator').trim().slice(0, 120),
    requestedAtMs, status: 'pending', schemaVersion: 1,
  };
}

export const isUnitActivationRequestActionable = (status: UnitActivationRequestStatus) => status !== 'approved';
