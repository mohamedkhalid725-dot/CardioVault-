// Workspace subscription clock.
//
// One document per workspace: workspaces/{ws}/subscription/current
//
//   {status, trialStartedAtMs, trialEndsAtMs, periodEndMs, graceEndsAtMs,
//    updatedAt, updatedBy, plan, renewalRef?}
//
// Every time value is an integer number of milliseconds, because the security
// rules compare them with `request.time.toMillis()`. Writes are platform-owner
// only and `periodEndMs` may only move forward (the rules enforce both).
//
// A workspace WITHOUT a subscription document is grandfathered and never locks:
// that is exactly what the rules' subActive() says, so a missing or unreadable
// clock must resolve to status 'none' — never to 'locked'.
//
// Clock semantics:
//   trial  : trialEndsAtMs = trial start + 3 days, periodEndMs = trialEndsAtMs
//   active : now < periodEndMs
//   grace  : now < graceEndsAtMs (periodEndMs + 2 days)
//   locked : otherwise — read-only for everyone except the platform owner
//   renew  : max(now, periodEndMs ?? now) + 30 days
import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webDoc, getDoc as webGetDoc, setDoc as webSetDoc } from './webFirebase';
import { getActiveWorkspaceId, getCurrentUid, isMasterAccount } from './workspaceAccess';

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'grace' | 'locked';

export interface SubscriptionState {
  workspaceId: string;
  status: SubscriptionStatus;
  trialEndsAtMs: number | null;
  periodEndMs: number | null;
  graceEndsAtMs: number | null;
  /** Whole days until the current phase ends, rounded up, never negative. */
  daysLeft: number | null;
  msLeft: number | null;
}

export const TRIAL_DAYS = 3;
export const PERIOD_DAYS = 30;
export const GRACE_DAYS = 2;

const DAY_MS = 86400000;

const readPath = async (path: string): Promise<any> => {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getDocument({ reference: path });
    const snapshot = result?.snapshot;
    try {
      return typeof snapshot?.data === 'function' ? (snapshot.data() || null) : (snapshot?.data || null);
    } catch {
      return null;
    }
  }
  const snapshot = await webGetDoc(webDoc(path));
  return snapshot.exists() ? snapshot.data() : null;
};

const writePath = async (path: string, data: Record<string, any>, merge = true): Promise<void> => {
  if (Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({ reference: path, data, merge });
  else await webSetDoc(webDoc(path), data, { merge });
};

// Stored clocks are integers in ms; anything else is treated as "no value".
const msOf = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// Renewing early stacks on top of the period already paid for; renewing after
// expiry counts from the moment of renewal. Never shortens a paid period.
export function renewalPeriodEnd(periodEndMs: number | null, now: number): number {
  const current = msOf(periodEndMs);
  const base = current === null ? now : Math.max(now, current);
  return base + PERIOD_DAYS * DAY_MS;
}

export function computeSubscriptionState(workspaceId: string, doc: any | null, now: number): SubscriptionState {
  const at = Number.isFinite(now) ? now : Date.now();
  const state = (
    status: SubscriptionStatus,
    trialEndsAtMs: number | null,
    periodEndMs: number | null,
    graceEndsAtMs: number | null,
    msLeft: number | null,
  ): SubscriptionState => ({
    workspaceId,
    status,
    trialEndsAtMs,
    periodEndMs,
    graceEndsAtMs,
    msLeft,
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / DAY_MS)),
  });

  if (!doc) return state('none', null, null, null, null);

  const trialEndsAtMs = msOf(doc.trialEndsAtMs);
  const periodEndMs = msOf(doc.periodEndMs);
  const graceEndsAtMs = msOf(doc.graceEndsAtMs);

  // No grace clock at all means no clock was ever created for this workspace.
  // subActive() in the rules lets such a workspace write forever, so it must not
  // report 'locked' just because a half-written document exists.
  if (graceEndsAtMs === null) return state('none', trialEndsAtMs, periodEndMs, null, null);

  const running = (status: SubscriptionStatus, endsAt: number): SubscriptionState =>
    state(status, trialEndsAtMs, periodEndMs, graceEndsAtMs, Math.max(0, endsAt - at));

  if (trialEndsAtMs !== null && at < trialEndsAtMs) return running('trial', trialEndsAtMs);
  if (periodEndMs !== null && at < periodEndMs) return running('active', periodEndMs);
  if (at < graceEndsAtMs) return running('grace', graceEndsAtMs);
  return state('locked', trialEndsAtMs, periodEndMs, graceEndsAtMs, 0);
}

// Read-only: this never creates or advances a clock, and never throws. A clock we
// cannot read resolves to 'none' (grandfathered), which is also what the rules do.
export async function getSubscription(): Promise<SubscriptionState> {
  const workspaceId = getActiveWorkspaceId();
  try {
    const doc = await readPath(`workspaces/${workspaceId}/subscription/current`);
    return computeSubscriptionState(workspaceId, doc, Date.now());
  } catch (error) {
    console.warn('Subscription read failed:', error);
    return computeSubscriptionState(workspaceId, null, Date.now());
  }
}

// Owner-only bootstrap of the 3-day trial. Runs once, only for the workspace the
// app is pointed at and only when that workspace document actually exists.
// Never throws: a permission error just means no trial was started.
export async function ensureTrialStarted(): Promise<SubscriptionState | null> {
  try {
    const workspaceId = getActiveWorkspaceId();
    if (!workspaceId) return null;

    const workspace = await readPath(`workspaces/${workspaceId}`);
    if (!workspace) return null;

    const uid = await getCurrentUid();
    if (!uid) return null;

    // The platform owner runs every clock; the account that created a customer
    // workspace may open that workspace's one three-day trial. The rules enforce
    // exactly the same pair, so this guard only avoids a guaranteed denial.
    const owner = await isMasterAccount();
    if (!owner && String(workspace.createdBy || '') !== uid) return null;

    const existing = await readPath(`workspaces/${workspaceId}/subscription/current`);
    if (existing) return computeSubscriptionState(workspaceId, existing, Date.now());

    const now = Date.now();
    const trialEndsAtMs = now + TRIAL_DAYS * DAY_MS;
    const periodEndMs = trialEndsAtMs;
    const graceEndsAtMs = periodEndMs + GRACE_DAYS * DAY_MS;
    const payload = {
      status: 'trial',
      trialStartedAtMs: now,
      trialEndsAtMs,
      periodEndMs,
      graceEndsAtMs,
      updatedAt: now,
      updatedBy: uid,
      plan: 'standard',
    };
    await writePath(`workspaces/${workspaceId}/subscription/current`, payload, false);
    return computeSubscriptionState(workspaceId, payload, now);
  } catch (error) {
    console.warn('Subscription trial start failed:', error);
    return null;
  }
}

// Platform-owner renewal. periodEndMs only ever moves forward, so an early
// renewal stacks 30 days on the current end and a late one counts from now.
export async function renewSubscription(reference?: string): Promise<SubscriptionState> {
  if (!(await isMasterAccount())) throw new Error('Only the platform owner can renew the workspace subscription.');
  const uid = await getCurrentUid();
  if (!uid) throw new Error('A Firebase account must be signed in to renew the subscription.');
  const workspaceId = getActiveWorkspaceId();
  const current = await readPath(`workspaces/${workspaceId}/subscription/current`).catch(error => {
    console.warn('Subscription read before renewal failed:', error);
    return null;
  });

  const now = Date.now();
  const periodEndMs = renewalPeriodEnd(msOf(current?.periodEndMs), now);
  const graceEndsAtMs = periodEndMs + GRACE_DAYS * DAY_MS;
  const payload: Record<string, any> = {
    status: 'active',
    periodEndMs,
    graceEndsAtMs,
    updatedAt: now,
    updatedBy: uid,
    plan: 'standard',
  };
  const cleanReference = String(reference || '').trim();
  if (cleanReference) payload.renewalRef = cleanReference;

  try {
    await writePath(`workspaces/${workspaceId}/subscription/current`, payload, true);
  } catch (error: any) {
    console.warn('Subscription renewal failed:', error);
    throw new Error(`The subscription could not be renewed.\nCode: ${String(error?.code || 'unknown')}\nMessage: ${String(error?.message || error || 'Unknown Firestore error')}`);
  }

  return computeSubscriptionState(workspaceId, { ...(current || {}), ...payload }, now);
}
