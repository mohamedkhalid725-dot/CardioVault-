import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDocsFromServer, writeBatch as webWriteBatch } from 'firebase/firestore';
import { webCollection, webDoc, getDoc as webGetDoc, setDoc as webSetDoc } from './webFirebase';
import { getActiveWorkspaceId, getCurrentUid, isMasterAccount } from './workspaceAccess';
import { createUnitLicenseRecord, UNIT_LICENSE_MS, type UnitLicenseRecord } from './unitLicense';
import { sha256Hex } from './codeHash';

export const unitLicensePath = (workspaceId: string, unitId: string) =>
  `workspaces/${workspaceId}/unitLicenses/${unitId}`;
export const unitLicenseCodePath = (workspaceId: string, codeHash: string) =>
  `workspaces/${workspaceId}/unitLicenseCodes/${codeHash}`;

const readPath = async (path: string): Promise<Record<string, any> | null> => {
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.enableNetwork();
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

type BatchOperation = { type: 'set' | 'delete'; reference: string; data?: Record<string, any>; options?: { merge: boolean } };

async function commitBatch(operations: BatchOperation[]): Promise<void> {
  if (!operations.length) return;
  if (operations.length > 500) throw new Error('This operation exceeds Firestore’s 500-write safety limit. No changes were made.');
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.writeBatch({ operations });
    return;
  }
  const batch = webWriteBatch(webDoc(operations[0].reference).firestore);
  for (const operation of operations) {
    const reference = webDoc(operation.reference);
    if (operation.type === 'delete') batch.delete(reference);
    else batch.set(reference, operation.data || {}, { merge: operation.options?.merge === true });
  }
  await batch.commit();
}

async function listServerDocuments(path: string): Promise<Array<{ id: string; data: Record<string, any> }>> {
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.enableNetwork();
    const result: any = await FirebaseFirestore.getCollection({ reference: path });
    const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
    if (snapshots.some((snapshot: any) => snapshot?.metadata?.fromCache !== false)) {
      throw new Error('Could not verify current Firestore data. Connect to the internet and retry; no licenses were changed.');
    }
    return snapshots.flatMap((snapshot: any) => {
      const data = typeof snapshot?.data === 'function' ? snapshot.data() : snapshot?.data;
      const id = String(snapshot?.id || snapshot?.documentId || data?.id || '');
      return data && id ? [{ id, data }] : [];
    });
  }
  const snapshot = await getDocsFromServer(webCollection(path));
  return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
}

export interface UnitLicenseResetPreview {
  workspaceId: string;
  eligibleUnitIds: string[];
  activeCodesToCancel: number;
}

/** Reads authoritative cloud state before asking the owner to confirm a reset. */
export async function previewUnitLicenseReset(): Promise<UnitLicenseResetPreview> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can reset unit licenses.');
  const workspaceId = getActiveWorkspaceId();
  const [units, codes] = await Promise.all([
    listServerDocuments(`workspaces/${workspaceId}/units`),
    listServerDocuments(`workspaces/${workspaceId}/unitLicenseCodes`),
  ]);
  const eligibleUnitIds = units
    .filter(({ data }) => data.deleted !== true && !data.deletedAt)
    .map(({ id }) => id);
  const activeCodesToCancel = codes.filter(({ data }) => data.status === 'active').length;
  return { workspaceId, eligibleUnitIds, activeCodesToCancel };
}

/** Resets eligible units and invalidates outstanding CVLs in bounded batches. */
export interface UnitLicenseResetResult {
  unitCount: number;
  cancelledCodeCount: number;
  failedUnitIds: string[];
  failedCodeIds: string[];
}

export async function resetEligibleUnitLicenses(preview: UnitLicenseResetPreview, options: { nowMs?: number } = {}): Promise<UnitLicenseResetResult> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can reset unit licenses.');
  if (preview.workspaceId !== getActiveWorkspaceId()) throw new Error('The active workspace changed. Refresh the license list and retry.');
  const fresh = await previewUnitLicenseReset();
  if (fresh.workspaceId !== preview.workspaceId || fresh.activeCodesToCancel !== preview.activeCodesToCancel) {
    throw new Error('The active workspace or outstanding-code count changed since confirmation. Refresh and confirm the reset again; no changes were made.');
  }
  const [unitDocs, codes] = await Promise.all([
    listServerDocuments(`workspaces/${preview.workspaceId}/units`),
    listServerDocuments(`workspaces/${preview.workspaceId}/unitLicenseCodes`),
  ]);
  const unitById = new Map(unitDocs.map(document => [document.id, document.data]));
  const eligible = preview.eligibleUnitIds.filter(id => {
    const unit = unitById.get(id);
    return !!unit && unit.deleted !== true && !unit.deletedAt;
  });
  // A unit deleted after confirmation is skipped rather than blocking resets
  // for every other still-live unit. Newly-created units are not added to this
  // confirmed ID set.
  const activeCodes = codes.filter(({ data }) => data.status === 'active');
  if (activeCodes.length !== fresh.activeCodesToCancel) throw new Error('The outstanding CVL codes changed before reset. Refresh and confirm again; no changes were made.');
  const uid = await getCurrentUid();
  if (!uid) throw new Error('The platform owner must be signed in.');
  const nowMs = Math.floor(options.nowMs ?? Date.now());
  const chunks = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
  // Revoke old codes first; if revocation fails, do not change any license.
  let cancelledCodes = 0;
  const failedCodeIds: string[] = [];
  for (const codeChunk of chunks(activeCodes, 400)) {
    let completed = false;
    for (let attempt = 0; attempt < 3 && !completed; attempt++) {
      try {
        await commitBatch(codeChunk.map(({ id }) => ({ type: 'delete' as const, reference: unitLicenseCodePath(preview.workspaceId, id) })));
        cancelledCodes += codeChunk.length;
        completed = true;
      } catch (error) {
        if (attempt === 2) failedCodeIds.push(...codeChunk.map(({ id }) => id));
      }
    }
  }
  let appliedUnits = 0;
  const failedUnitIds: string[] = [];
  // Each small batch is retried independently and later batches still run.
  // This keeps a transient rules/network failure from stranding unrelated units.
  for (const unitChunk of chunks(eligible, 10)) {
    let completed = false;
    for (let attempt = 0; attempt < 3 && !completed; attempt++) {
      try {
        await commitBatch(unitChunk.map(unitId => ({
          type: 'set' as const,
          reference: unitLicensePath(preview.workspaceId, unitId),
          data: { workspaceId: preview.workspaceId, unitId, issuedAtMs: nowMs, expiresAtMs: nowMs + UNIT_LICENSE_MS, updatedBy: uid, schemaVersion: 1 },
          options: { merge: false },
        })));
        appliedUnits += unitChunk.length;
        completed = true;
      } catch (error) {
        if (attempt === 2) failedUnitIds.push(...unitChunk);
      }
    }
  }
  return { unitCount: appliedUnits, cancelledCodeCount: cancelledCodes, failedUnitIds, failedCodeIds };
}

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
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can activate a unit license code.');
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
    const license: UnitLicenseRecord & { activationCodeHash: string } = { ...record, activationCodeHash: codeHash };
    await commitBatch([
      { type: 'set', reference: codePath, data: {
        ...codeRecord, status: 'redeemed', redeemedBy: uid, redeemedAtMs: nowMs, licenseExpiresAtMs,
      }, options: { merge: true } },
      { type: 'set', reference: unitLicensePath(workspaceId, unitId), data: license, options: { merge: true } },
    ]);
    return license;
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
