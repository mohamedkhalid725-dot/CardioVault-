import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webDoc, getDoc as webGetDoc, setDoc as webSetDoc } from './webFirebase';
import { getActiveWorkspaceId, getCurrentUid, isMasterAccount } from './workspaceAccess';
import { createUnitLicenseRecord, type UnitLicenseRecord } from './unitLicense';
import { sha256Hex } from './codeHash';

export const unitLicensePath = (workspaceId: string, unitId: string) =>
  `workspaces/${workspaceId}/unitLicenses/${unitId}`;
export const unitLicenseCodePath = (workspaceId: string, codeHash: string) =>
  `workspaces/${workspaceId}/unitLicenseCodes/${codeHash}`;

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

export async function getUnitLicense(workspaceId: string, unitId: string): Promise<UnitLicenseRecord | null> {
  try {
    const record = await readPath(unitLicensePath(workspaceId, unitId));
    if (!record || record.workspaceId !== workspaceId || record.unitId !== unitId) return null;
    return record as UnitLicenseRecord;
  } catch (error) {
    console.warn('Unit license read failed:', error);
    return null;
  }
}

/** Initial activation is owner-controlled and idempotent; an existing license is never extended here. */
export async function activateNewUnitForOwner(
  workspaceId: string,
  unitId: string,
  options: { approvalRequestId?: string; approvalStartedAtMs?: number; nowMs?: number } = {},
): Promise<UnitLicenseRecord> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can activate a new unit.');
  const updatedBy = await getCurrentUid();
  if (!updatedBy) throw new Error('The platform owner must be signed in.');
  const current = await getUnitLicense(workspaceId, unitId);
  if (current) {
    if (current.expiresAtMs <= Date.now()) throw new Error('An initial unit license already exists but has expired; use the renewal-code workflow.');
    return current;
  }
  const issuedAtMs = Math.floor(options.approvalStartedAtMs ?? options.nowMs ?? Date.now());
  const record = createUnitLicenseRecord({ workspaceId, unitId, updatedBy, nowMs: issuedAtMs });
  const persisted = {
    ...record,
    ...(options.approvalRequestId ? { activationRequestId: options.approvalRequestId } : {}),
  };
  await writePath(unitLicensePath(workspaceId, unitId), persisted as unknown as Record<string, any>, false);
  return persisted as UnitLicenseRecord;
}

export async function setUnitActiveByOwner(
  workspaceId: string,
  unitId: string,
  activatedAtMs: number,
): Promise<void> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can activate a unit.');
  await writePath(`workspaces/${workspaceId}/units/${unitId}`, {
    activationStatus: 'active', activatedAtMs: Math.floor(activatedAtMs),
  }, true);
}

export interface IssuedUnitLicenseCode {
  code: string;
  workspaceId: string;
  unitId: string;
  codeExpiresAtMs: number;
}

const makeLicenseCode = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `CVL-${Array.from(bytes, byte => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte % 32]).join('')}`;
};

/** Creates a one-use, one-unit renewal code. It does not activate the unit until redeemed. */
export async function issueUnitLicenseCode(
  unitId: string,
  options: { workspaceId?: string; nowMs?: number } = {},
): Promise<IssuedUnitLicenseCode> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can issue a unit license code.');
  const issuedBy = await getCurrentUid();
  if (!issuedBy) throw new Error('A signed-in platform owner is required.');
  const workspaceId = String(options.workspaceId || getActiveWorkspaceId()).trim();
  const normalizedUnitId = String(unitId || '').trim();
  if (!workspaceId || !normalizedUnitId) throw new Error('Select a workspace and unit first.');
  const nowMs = Math.floor(options.nowMs ?? Date.now());
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = makeLicenseCode();
    const codeHash = await sha256Hex(code);
    const codeExpiresAtMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    try {
      await writePath(unitLicenseCodePath(workspaceId, codeHash), {
        workspaceId, unitId: normalizedUnitId, codeHash, issuedBy,
        issuedAtMs: nowMs, codeExpiresAtMs, status: 'active', schemaVersion: 1,
      }, false);
      return { code, workspaceId, unitId: normalizedUnitId, codeExpiresAtMs };
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error('Could not generate a unique unit license code.');
}

/** Redeems the one-use code for an existing member; it never edits membership records. */
export async function redeemUnitLicenseCode(rawCode: string, options: { nowMs?: number } = {}): Promise<UnitLicenseRecord> {
  const uid = await getCurrentUid();
  if (!uid) throw new Error('Sign in before redeeming a unit license code.');
  const workspaceId = getActiveWorkspaceId();
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^CVL-[A-Z2-9]{12}$/.test(code)) throw new Error('Enter a valid unit license code.');
  const codeHash = await sha256Hex(code);
  const codePath = unitLicenseCodePath(workspaceId, codeHash);
  const codeRecord = await readPath(codePath);
  if (!codeRecord || codeRecord.workspaceId !== workspaceId || codeRecord.codeHash !== codeHash) {
    throw new Error('This unit license code is not recognized in the active workspace.');
  }
  const unitId = String(codeRecord.unitId || '');
  if (!unitId) throw new Error('This license code is not linked to a unit.');
  const nowMs = Math.floor(options.nowMs ?? Date.now());
  let licenseExpiresAtMs = Number(codeRecord.licenseExpiresAtMs);
  if (codeRecord.status === 'active') {
    if (Number(codeRecord.codeExpiresAtMs) <= nowMs) throw new Error('This unit license code has expired. Ask the owner for a new one.');
    const current = await getUnitLicense(workspaceId, unitId);
    const record = createUnitLicenseRecord({ workspaceId, unitId, updatedBy: uid, nowMs, currentExpiryMs: current?.expiresAtMs });
    licenseExpiresAtMs = record.expiresAtMs;
    await writePath(codePath, {
      status: 'redeemed', redeemedBy: uid, redeemedAtMs: nowMs,
      licenseExpiresAtMs, activationCodeHash: codeHash,
    }, true);
  } else if (codeRecord.status !== 'redeemed' || codeRecord.redeemedBy !== uid || !Number.isFinite(licenseExpiresAtMs)) {
    throw new Error('This unit license code has already been redeemed.');
  }

  const current = await getUnitLicense(workspaceId, unitId);
  if (current?.expiresAtMs === licenseExpiresAtMs) return current;
  const license: UnitLicenseRecord & { activationCodeHash: string } = {
    workspaceId, unitId, issuedAtMs: Number(codeRecord.redeemedAtMs) || nowMs,
    expiresAtMs: licenseExpiresAtMs, updatedBy: uid, schemaVersion: 1,
    activationCodeHash: codeHash,
  };
  await writePath(unitLicensePath(workspaceId, unitId), license, true);
  return license;
}

export async function listUnitLicenses(workspaceId: string, unitIds: string[]): Promise<Record<string, UnitLicenseRecord | null>> {
  const rows = await Promise.all(unitIds.map(async unitId => [unitId, await getUnitLicense(workspaceId, unitId)] as const));
  return Object.fromEntries(rows);
}
