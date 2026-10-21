// Temporary unit invites.
//
// A code is a one-shot, time-boxed enrolment into exactly one unit of exactly one
// workspace. The hash of the code is the document id everywhere:
//
//   workspaces/{ws}/invites/{sha256}   authoritative state (this file writes it)
//   /invites/{sha256}                  routing index, readable by any signed-in
//                                      account so a stranger's app can learn which
//                                      workspace the code belongs to
//
// The security rules own the contract: the index is never trusted, the workspace
// document is burned exactly once, and the membership document must carry the
// same inviteId that was just burned.
import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import {
  webCollection,
  webDoc,
  deleteDoc as webDeleteDoc,
  getDoc as webGetDoc,
  getDocs as webGetDocs,
  setDoc as webSetDoc,
  query,
  where,
} from './webFirebase';
import { AuthorizationService } from './authorizationService';
import { UserProfile, ClinicalRole } from '../types/clinical';
import { sha256Hex } from './codeHash';
import {
  MASTER_WORKSPACE_ID,
  WorkspaceAccessState,
  WorkspaceRole,
  claimUnitConsultant,
  ensureOwnerWorkspace,
  getActiveWorkspaceId,
  getCurrentUid,
  getStoredWorkspaceAccess,
  isMasterAccount,
  setStoredWorkspaceAccess,
} from './workspaceAccess';

export type InviteRole = 'clinical_editor' | 'view_only';
export type InviteClinicalRole = 'nurse' | 'resident' | 'specialist' | 'consultant';

export interface UnitInvite {
  inviteId: string;
  code: string;
  unitId: string;
  unitName: string;
  role: InviteRole;
  clinicalRole: InviteClinicalRole;
  createdBy: string;
  createdAtMs: number;
  expiresAtMs: number;
  used: boolean;
  usedBy?: string;
  revoked: boolean;
}

// Same alphabet and shape as the legacy Unit Access Codes (CV-XXXX-XXXX-XXXX),
// so one input keeps accepting both families of code.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_EXPIRY_HOURS = 48;
const MIN_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 720;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
// The rules cap an invite at `request.time.toMillis() + 2592000000` (30 days).
// Server time can trail the device clock (and a device whose clock is behind
// makes the computed expiry look longer to the server), so the maximum is
// trimmed a little to keep a 30-day invite valid.
const MAX_INVITE_LIFETIME_MS = 30 * DAY_MS;
const CLOCK_SKEW_MS = 5 * 60000;
const CLINICAL_ROLES: InviteClinicalRole[] = ['nurse', 'resident', 'specialist', 'consultant'];

const snapshotData = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? (snapshot.data() || null) : (snapshot?.data || null);
  } catch {
    return null;
  }
};

const readPath = async (path: string): Promise<any> => {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getDocument({ reference: path });
    return snapshotData(result?.snapshot);
  }
  const snapshot = await webGetDoc(webDoc(path));
  return snapshot.exists() ? snapshot.data() : null;
};

const writePath = async (path: string, data: Record<string, any>, merge = true): Promise<void> => {
  if (Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({ reference: path, data, merge });
  else await webSetDoc(webDoc(path), data, { merge });
};

const removePath = async (path: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) await FirebaseFirestore.deleteDocument({ reference: path });
  else await webDeleteDoc(webDoc(path));
};

const newInviteCode = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes).map(byte => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('');
  return `CV-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
};

const clampExpiryHours = (value: number | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRY_HOURS;
  return Math.min(MAX_EXPIRY_HOURS, Math.max(MIN_EXPIRY_HOURS, Math.floor(parsed)));
};

const isInviteClinicalRole = (value: unknown): value is InviteClinicalRole =>
  CLINICAL_ROLES.includes(value as InviteClinicalRole);

const toUnitInvite = (inviteId: string, data: any): UnitInvite => {
  const invite: UnitInvite = {
    inviteId: String(inviteId || ''),
    code: String(data?.code || ''),
    unitId: String(data?.unitId || ''),
    unitName: String(data?.unitName || 'Unit'),
    role: data?.role === 'view_only' ? 'view_only' : 'clinical_editor',
    clinicalRole: isInviteClinicalRole(data?.clinicalRole) ? data.clinicalRole : 'resident',
    createdBy: String(data?.createdBy || ''),
    createdAtMs: Number(data?.createdAtMs || 0),
    expiresAtMs: Number(data?.expiresAtMs || 0),
    used: data?.used === true,
    revoked: data?.revoked === true,
  };
  if (data?.usedBy) invite.usedBy = String(data.usedBy);
  return invite;
};

const asWorkspaceRole = (role: InviteRole): WorkspaceRole => (role === 'view_only' ? 'view_only' : 'clinical_editor');

// Creates a single-use invite for a unit the caller already belongs to.
// The workspace document is written first (it is the authoritative state) and the
// public routing index second; a code whose index never landed is unusable, so
// the workspace document is withdrawn again instead of leaving a silent orphan.
export async function createUnitInvite(input: {
  unitId: string;
  unitName: string;
  role: InviteRole;
  clinicalRole: InviteClinicalRole;
  expiresInHours?: number;
}): Promise<UnitInvite> {
  const unitId = String(input?.unitId || '').trim();
  if (!unitId) throw new Error('Select a unit before creating an invite code.');
  if (input?.role !== 'clinical_editor' && input?.role !== 'view_only') throw new Error('Select a valid access level for the invite.');
  if (!isInviteClinicalRole(input?.clinicalRole)) throw new Error('Select a valid clinical title for the invite.');

  const uid = await getCurrentUid();
  if (!uid) throw new Error('A Firebase account must be signed in to create an invite code.');
  const workspaceId = getActiveWorkspaceId();
  const unitName = String(input?.unitName || '').trim() || unitId;
  const now = Date.now();
  const expiresAtMs = Math.min(now + clampExpiryHours(input?.expiresInHours) * HOUR_MS, now + MAX_INVITE_LIFETIME_MS - CLOCK_SKEW_MS);

  // The rules refuse a consultant invite while the unit's single consultant slot
  // is taken; fail here with a readable message instead of a permission error.
  if (input.clinicalRole === 'consultant') {
    const unit = await readPath(`workspaces/${workspaceId}/units/${unitId}`);
    if (unit && String(unit.consultantUid || '')) throw new Error('This unit already has a consultant.');
  }

  const code = newInviteCode();
  const inviteId = await sha256Hex(code);
  const inviteDoc = {
    workspaceId,
    unitId,
    unitName,
    role: input.role,
    clinicalRole: input.clinicalRole,
    createdBy: uid,
    createdAtMs: now,
    expiresAtMs,
    used: false,
    revoked: false,
    // Kept on the authoritative document only, so the issuer can re-display the
    // code. The routing index never carries it.
    code,
  };
  try {
    await writePath(`workspaces/${workspaceId}/invites/${inviteId}`, inviteDoc, false);
  } catch (error: any) {
    console.warn('Invite create failed:', error);
    throw new Error(`The invite code could not be created. The workspace may be read-only, or you may no longer belong to this unit.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
  }

  try {
    await writePath(`invites/${inviteId}`, {
      workspaceId,
      unitId,
      unitName,
      role: input.role,
      clinicalRole: input.clinicalRole,
      createdBy: uid,
      createdAtMs: now,
      expiresAtMs,
    }, false);
  } catch (error) {
    console.warn('Invite routing index write failed:', error);
    try {
      await removePath(`workspaces/${workspaceId}/invites/${inviteId}`);
    } catch (cleanupError) {
      console.warn('Orphan invite cleanup failed:', cleanupError);
    }
    throw new Error('The invite code could not be activated. Check your connection and try again.');
  }

  return toUnitInvite(inviteId, inviteDoc);
}

// Only live codes (unused, not revoked, not expired) are returned, newest first.
// The rules filter the list down to the caller's own invites; the where() clause
// is what makes that list query provable to Firestore.
export async function listMyUnitInvites(unitId?: string): Promise<UnitInvite[]> {
  const uid = await getCurrentUid();
  if (!uid) return [];
  const workspaceId = getActiveWorkspaceId();
  const reference = `workspaces/${workspaceId}/invites`;
  const records: Array<{ id: string; data: any }> = [];

  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getCollection({
      reference,
      compositeFilter: {
        type: 'and',
        queryConstraints: [{ type: 'where', fieldPath: 'createdBy', opStr: '==', value: uid }],
      },
    });
    for (const snapshot of result?.snapshots || []) {
      records.push({ id: String(snapshot?.id || ''), data: snapshotData(snapshot) || {} });
    }
  } else {
    const snapshot = await webGetDocs(query(webCollection(reference), where('createdBy', '==', uid)));
    for (const doc of snapshot.docs) records.push({ id: doc.id, data: doc.data() });
  }

  const targetUnitId = String(unitId || '').trim();
  const now = Date.now();
  return records
    .map(record => toUnitInvite(record.id, record.data))
    .filter(invite => !!invite.inviteId)
    .filter(invite => invite.createdBy === uid)
    .filter(invite => !invite.used && !invite.revoked && invite.expiresAtMs > now)
    .filter(invite => !targetUnitId || invite.unitId === targetUnitId)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function revokeUnitInvite(inviteId: string): Promise<void> {
  const clean = String(inviteId || '').trim();
  if (!clean) throw new Error('Select an invite code to revoke.');
  const uid = await getCurrentUid();
  if (!uid) throw new Error('A Firebase account must be signed in.');
  const workspaceId = getActiveWorkspaceId();
  const invitePath = `workspaces/${workspaceId}/invites/${clean}`;
  const invite = await readPath(invitePath);
  if (!invite) throw new Error('This invite code no longer exists.');
  if (invite.used === true) throw new Error('This invite code was already used and cannot be revoked.');
  if (invite.revoked === true) return;
  if (String(invite.createdBy || '') !== uid && !(await isMasterAccount())) {
    throw new Error('Only the member who created this invite can revoke it.');
  }

  // The rules only accept `revoked` + `revokedAt` on an unused invite.
  try {
    await writePath(invitePath, { revoked: true, revokedAt: Date.now() });
  } catch (error: any) {
    console.warn('Invite revoke failed:', error);
    throw new Error(`The invite code could not be revoked.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
  }

  // Best-effort: the routing index is dead weight once the code is revoked.
  try {
    await removePath(`invites/${clean}`);
  } catch (error) {
    console.warn('Invite routing index cleanup failed:', error);
  }
}

// Cheap pre-flight for the access gate: does the routing index exist, is it still
// live, and can it be routed at all? Never throws.
export async function isValidInviteCode(raw: string): Promise<boolean> {
  const code = String(raw || '').trim().toUpperCase();
  if (code.length < 6) return false;
  try {
    const index = await readPath(`invites/${await sha256Hex(code)}`);
    if (!index) return false;
    // The index normally carries neither flag; revoking deletes it. Both are
    // checked so a document that does carry them is still treated as dead.
    if (index.revoked === true || index.used === true) return false;
    if (!String(index.workspaceId || '')) return false;
    const expiresAtMs = Number(index.expiresAtMs || 0);
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  } catch {
    return false;
  }
}

// Ordered redemption, as the rules require:
//   (a) /invites/{hash}            → which workspace
//   (b) workspaces/{ws}/invites/{hash} → live, unused, unexpired?
//   (c) burn it (used/usedBy/usedAt) BEFORE the membership exists
//   (d) create the membership carrying the same inviteId
//   (e) per-unit receipt
//   (f) team profile (needed by unitMember() in the rules)
//   (g) claim the unit's consultant slot when the invite says consultant
export async function redeemUnitInvite(raw: string): Promise<WorkspaceAccessState> {
  const uid = await getCurrentUid();
  if (!uid) throw new Error('A Firebase account must be signed in before entering an invite code.');
  if (await isMasterAccount()) {
    return (await ensureOwnerWorkspace()) || { workspaceId: MASTER_WORKSPACE_ID, role: 'owner', unitId: null, unitName: null };
  }

  const code = String(raw || '').trim().toUpperCase();
  if (code.length < 6) throw new Error('Enter a valid invite code.');
  const inviteId = await sha256Hex(code);

  // (a) routing index
  const index = await readPath(`invites/${inviteId}`);
  const workspaceId = String(index?.workspaceId || '');
  if (!index || !workspaceId) throw new Error('This invite code is not recognised. Check the code and try again.');

  // (b) authoritative invite
  const invitePath = `workspaces/${workspaceId}/invites/${inviteId}`;
  const invite = await readPath(invitePath);
  if (!invite) throw new Error('This invite code is no longer available. Ask for a new one.');
  if (invite.used === true) throw new Error('This invite code has already been used.');
  if (invite.revoked === true) throw new Error('This invite code was revoked by the member who created it.');
  const expiresAtMs = Number(invite.expiresAtMs || 0);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) throw new Error('This invite code has expired. Ask for a new one.');

  const unitId = String(invite.unitId || index?.unitId || '');
  if (!unitId) throw new Error('This invite code is not linked to a unit.');
  const role: InviteRole = invite.role === 'view_only' ? 'view_only' : 'clinical_editor';
  const membershipRole = asWorkspaceRole(role);
  const unitName = String(invite.unitName || index?.unitName || unitId);

  // An existing membership may only be extended, never replaced: the rules accept
  // one additive update whose proof is the same inviteId. Read it first so a
  // revoked or already-granted account is refused BEFORE a single-use code burns.
  let existing: any = null;
  try {
    existing = await readPath(`workspaces/${workspaceId}/members/${uid}`);
  } catch (error) {
    console.warn('Existing membership read failed:', error);
  }
  if (existing) {
    const existingUnitIds = Array.isArray(existing.unitIds) ? existing.unitIds.map(String) : [];
    const alreadyInUnit = existingUnitIds.includes(unitId) || String(existing.unitId || '') === unitId;
    if (existing.active !== false && existing.forceReauth !== true && alreadyInUnit) {
      // Already enrolled on this account: grant nothing new and leave the code
      // untouched for whoever it was meant for.
      const state: WorkspaceAccessState = {
        workspaceId,
        role: existing.role === 'view_only' ? 'view_only' : 'clinical_editor',
        unitId,
        unitName,
        unitIds: Array.from(new Set([...existingUnitIds, unitId])),
        unitNames: { [unitId]: unitName },
      };
      setStoredWorkspaceAccess(state);
      return state;
    }
    if (existing.active === false || existing.forceReauth === true) {
      throw new Error('Access to that workspace was revoked for this account, so a unit invite cannot re-enrol it. The code was left unused — ask the workspace owner to restore your access.');
    }
    // Otherwise this is an existing member joining a SECOND unit. The rules accept
    // exactly one additive shape (see step d), so the join proceeds and the
    // workspace-wide access level is preserved.
  }

  // Point the app at the invite's workspace before the first write so any helper
  // resolving getActiveWorkspaceId() during the join sees the right one. A failed
  // join restores the previous state instead of stranding the app.
  const previousAccess = getStoredWorkspaceAccess();
  setStoredWorkspaceAccess({ workspaceId, role: membershipRole, unitId, unitName, unitIds: [unitId], unitNames: { [unitId]: unitName } });

  let burned = false;
  try {
    // (c) burn the code once, bound to this account.
    await writePath(invitePath, { used: true, usedBy: uid, usedAt: Date.now() });
    burned = true;

    // (d) membership. A brand-new membership is born with exactly the one unit
    // the invite grants, and carries the inviteId the rules just verified. An
    // existing membership only gains the unit: its access level and active flag
    // are echoed unchanged, because a join must never change either.
    const joinedAt = new Date().toISOString();
    const clinicalRoles: Record<string, string> = {};
    if (invite.clinicalRole !== 'consultant' && isInviteClinicalRole(invite.clinicalRole)) {
      clinicalRoles[unitId] = invite.clinicalRole;
    }
    const existingUnitIds = Array.isArray(existing?.unitIds) ? existing.unitIds.map(String) : [];
    const existingInviteIds = Array.isArray(existing?.inviteIds) ? existing.inviteIds.map(String) : [];
    const keptRole = String(existing?.role || membershipRole);
    const mergedUnitIds = Array.from(new Set([...existingUnitIds, unitId]));
    if (existing) {
      try {
        await writePath(`workspaces/${workspaceId}/members/${uid}`, {
          unitId,
          unitIds: mergedUnitIds,
          role: keptRole,
          clinicalRoles: { ...(existing?.clinicalRoles || {}), ...clinicalRoles },
          active: true,
          forceReauth: false,
          inviteId,
          inviteIds: Array.from(new Set([...existingInviteIds, inviteId])),
          updatedAt: joinedAt,
        }, true);
      } catch (error: any) {
        console.error('Invite membership extension failed:', { workspaceId, unitId, error });
        throw new Error(`Your invite code was accepted, but the unit could not be added to your existing membership. Ask the workspace owner to add it.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
      }
    } else {
      const membership = {
        uid,
        workspaceId,
        unitId,
        unitIds: [unitId],
        role: membershipRole,
        clinicalRoles,
        // No access code was used; the invite branch of the rules is the authority.
        accessCodeHash: '',
        accessCodeHashes: [],
        inviteId,
        inviteIds: [inviteId],
        active: true,
        forceReauth: false,
        joinedAt,
        updatedAt: joinedAt,
      };
      try {
        await writePath(`workspaces/${workspaceId}/members/${uid}`, membership, true);
      } catch (error: any) {
        console.error('Invite membership write failed:', { workspaceId, unitId, error });
        throw new Error(`Your invite code was accepted, but your workspace membership could not be created. Ask the workspace owner for a new code.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
      }
    }

    // (e) per-unit receipt, used by the revoke flow.
    try {
      await writePath(`workspaces/${workspaceId}/members/${uid}/units/${unitId}`, {
        uid,
        unitId,
        unitName,
        inviteId,
        role: membershipRole,
        active: true,
        joinedAt,
      }, true);
    } catch (error) {
      console.warn('Unit receipt write failed after invite join:', error);
    }

    // (f) team profile. unitMember() in the rules requires an active team profile,
    // so this is attempted before anything is reported as finished — but a failure
    // never undoes a membership that already landed.
    try {
      const currentProfile = AuthorizationService.getUsers().find(profile => profile.userId === uid) || AuthorizationService.getCurrentUser();
      // 'consultant' is not a stored clinical title: it maps to Specialist and the
      // consultant slot is claimed in step (g).
      const teamRole: ClinicalRole = invite.clinicalRole === 'nurse'
        ? 'nurse'
        : invite.clinicalRole === 'specialist' || invite.clinicalRole === 'consultant'
          ? 'specialist'
          : 'resident';
      // Merge instead of replace, but never trust the local preset profile: the
      // rules require assignedUnitIds to be a subset of the membership's units.
      const teamUnits = existing ? mergedUnitIds : [unitId];
      const teamProfile: UserProfile = {
        ...currentProfile,
        userId: uid,
        name: currentProfile?.name || 'Clinician',
        email: currentProfile?.email || '',
        role: teamRole,
        departmentId: 'dept-cardiology',
        assignedUnitIds: teamUnits,
        status: 'active',
        updatedAt: joinedAt,
      };
      AuthorizationService.saveUsers([...AuthorizationService.getUsers().filter(profile => profile.userId !== uid), teamProfile]);
      if (existing) {
        // An existing team document may only be retitled: assignedUnitIds is an
        // access path in the rules, so a join cannot rewrite it. The membership
        // document (step d) is the authority for the new unit.
        await writePath(`workspaces/${workspaceId}/team/${uid}`, {
          name: teamProfile.name,
          role: teamRole,
          updatedAt: joinedAt,
        }, true);
      } else {
        // The team document cannot exist yet: it requires a membership (created in
        // step d) and this branch only runs for a brand-new membership, so the
        // create-only bootstrap fields (uid + workspaceId + dept/status) are safe.
        await writePath(`workspaces/${workspaceId}/team/${uid}`, { ...teamProfile, uid, workspaceId }, true);
      }
    } catch (error) {
      console.warn('Team directory registration failed after invite join:', error);
    }

    // (g) consultant invite: the slot is claimed after the membership exists,
    // because claiming requires unitMember(). A taken slot must not undo the join.
    if (invite.clinicalRole === 'consultant') {
      try {
        await claimUnitConsultant(unitId);
      } catch (error) {
        console.warn('Consultant slot claim failed after invite join:', error);
      }
    }

    let resolvedUnitName = unitName;
    try {
      const unit = await readPath(`workspaces/${workspaceId}/units/${unitId}`);
      resolvedUnitName = String(unit?.name || resolvedUnitName);
    } catch { /* keep the name carried by the invite */ }

    const storedNames = getStoredWorkspaceAccess()?.unitNames || {};
    const state: WorkspaceAccessState = {
      workspaceId,
      role: existing ? (keptRole === 'view_only' ? 'view_only' : 'clinical_editor') : membershipRole,
      unitId,
      unitName: resolvedUnitName,
      unitIds: mergedUnitIds,
      unitNames: { ...storedNames, [unitId]: resolvedUnitName },
    };
    setStoredWorkspaceAccess(state);

    // Best-effort audit event: the rules make the trail append-only, and a failed
    // audit write must never break a join that already succeeded.
    try {
      const eventId = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await writePath(`workspaces/${workspaceId}/audit/${eventId}`, {
        type: 'invite.redeemed',
        actorUid: uid,
        workspaceId,
        unitId,
        targetUid: uid,
        detail: inviteId,
        atMs: Date.now(),
      }, false);
    } catch (error) {
      console.warn('Invite audit event failed:', error);
    }

    return state;
  } catch (error: any) {
    setStoredWorkspaceAccess(previousAccess);
    if (burned) throw error;
    console.warn('Invite redemption failed before the code was burned:', error);
    throw new Error(`The invite code could not be redeemed. It may have just expired or been used — ask for a new one.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
  }
}
