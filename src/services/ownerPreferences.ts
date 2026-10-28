// Owner dashboard preferences: which units the owner sees on their own dashboard.
//
// The preference itself is old news: `getHiddenUnitIds()` in `workspaceAccess`
// has always hidden a unit card and nothing else. It lived in localStorage, so
// the same owner account saw a different dashboard on every device.
//
// This module moves that ONE preference to Firestore:
//
//     ownerPreferences/{uid} -> { hiddenUnitIds: string[], updatedAtMs, schemaVersion }
//
// `firestore.rules` allows the document only for the platform owner, and only
// for their own uid. The preference grants nothing: no unit is deleted, no
// membership changes, no subscription state is touched, and a hidden unit stays
// fully readable for everyone who could read it before.
//
// Failure handling is deliberately boring:
//  - the device keeps its local list as a fallback and the caller is told the
//    value did NOT sync, so the UI can say so out loud;
//  - a non-owner account never touches the collection (the rules would deny it
//    anyway) and keeps the device-local behaviour it always had.
//
// The module itself has no static imports: identity and Firestore are resolved
// lazily, so the pure helpers and the injected-IO tests never load a browser,
// a Capacitor plugin or Firebase.

export const OWNER_PREFERENCES_SCHEMA_VERSION = 1;

/** A corrupt document can never turn into an unbounded list. */
export const MAX_HIDDEN_UNITS = 200;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const ownerPreferencePath = (uid: string): string => `ownerPreferences/${clean(uid)}`;

/** Minimal Firestore surface. Injected by the tests, never by the UI. */
export interface OwnerPreferenceIo {
  getDoc(path: string): Promise<Record<string, any> | null>;
  setDoc(path: string, data: Record<string, any>, merge: boolean): Promise<void>;
}

export type OwnerPreferenceFailure =
  | 'not-owner'
  | 'no-account'
  | 'cloud-disabled'
  | 'read-failed'
  | 'write-failed';

export interface UnitVisibilityLoad {
  /** True only when the cloud copy was read successfully. */
  ok: boolean;
  synced: boolean;
  hiddenUnitIds: string[];
  reason?: OwnerPreferenceFailure;
}

export interface UnitVisibilitySave {
  ok: boolean;
  synced: boolean;
  reason?: OwnerPreferenceFailure;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Unit visibility is a presentation list, so the only things worth keeping are
 * non-empty strings. Order is stable (the dashboard does not care) and the list
 * is de-duplicated and capped so a hand-written document cannot grow it.
 */
export function normalizeHiddenUnitIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const entry of list) {
    const id = clean(entry);
    if (!id) continue;
    seen.add(id);
    if (seen.size >= MAX_HIDDEN_UNITS) break;
  }
  return [...seen];
}

/**
 * Reads a stored document. Returns null when the document does not describe a
 * visibility list at all, so a malformed cloud copy never silently wipes the
 * device list.
 */
export function parseUnitVisibilityDoc(data: Record<string, any> | null): string[] | null {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.hiddenUnitIds)) return null;
  return normalizeHiddenUnitIds(data.hiddenUnitIds);
}

// ---------------------------------------------------------------------------
// Platform IO (lazy: the isolated preview and Node tests never load Firebase)
// ---------------------------------------------------------------------------

async function nativeIo(): Promise<OwnerPreferenceIo> {
  const { FirebaseFirestore } = await import('@capacitor-firebase/firestore');
  return {
    getDoc: async (path) => {
      const result: any = await FirebaseFirestore.getDocument({ reference: path });
      const snapshot = result?.snapshot;
      return snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : null;
    },
    setDoc: async (path, data, merge) => {
      await FirebaseFirestore.setDocument({ reference: path, data, merge });
    },
  };
}

async function webIo(): Promise<OwnerPreferenceIo> {
  const { webDoc, getDoc, setDoc } = await import('./webFirebase');
  return {
    getDoc: async (path) => {
      const snapshot = await getDoc(webDoc(path));
      return snapshot.exists() ? snapshot.data() : null;
    },
    setDoc: async (path, data, merge) => {
      await setDoc(webDoc(path), data, { merge });
    },
  };
}

async function resolveIo(injected?: OwnerPreferenceIo | null): Promise<OwnerPreferenceIo | null> {
  if (injected) return injected;
  const { isLocalPreview } = await import('../config/localPreview');
  if (isLocalPreview()) return null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform() ? await nativeIo() : await webIo();
  } catch (error) {
    console.warn('Owner preference driver unavailable:', error);
    return null;
  }
}

interface ResolvedIdentity {
  uid: string;
  owner: boolean;
}

/**
 * Reads the signed-in identity from the app. Loaded lazily so this module can be
 * imported by a plain Node test (the workspace module pulls in Firebase and the
 * Capacitor plugins).
 */
async function defaultIdentity(): Promise<ResolvedIdentity> {
  try {
    const access = await import('./workspaceAccess.ts');
    const uid = clean(await access.getCurrentUid().catch(() => ''));
    const owner = !!(await access.isMasterAccount().catch(() => false));
    return { uid, owner };
  } catch (error) {
    console.warn('Owner identity unavailable:', error);
    return { uid: '', owner: false };
  }
}

async function resolveIdentity(options: {
  uid?: string;
  isOwner?: () => Promise<boolean>;
}): Promise<ResolvedIdentity> {
  const providedUid = clean(options.uid);
  const providedOwner = options.isOwner ? !!(await options.isOwner().catch(() => false)) : null;
  const hasUid = Object.prototype.hasOwnProperty.call(options, 'uid');
  if (hasUid && providedOwner !== null) return { uid: providedUid, owner: providedOwner };
  const fallback = await defaultIdentity();
  return {
    uid: providedUid || fallback.uid,
    owner: providedOwner === null ? fallback.owner : providedOwner,
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Reads the owner's synced preference. Never throws.
 *
 * `hiddenUnitIds` is empty unless the read really succeeded, so the caller must
 * keep its device list when `synced` is false.
 */
export async function loadOwnerUnitVisibility(options: {
  io?: OwnerPreferenceIo | null;
  uid?: string;
  isOwner?: () => Promise<boolean>;
} = {}): Promise<UnitVisibilityLoad> {
  const identity = await resolveIdentity(options);
  if (!identity.owner) return { ok: false, synced: false, hiddenUnitIds: [], reason: 'not-owner' };
  if (!identity.uid) return { ok: false, synced: false, hiddenUnitIds: [], reason: 'no-account' };

  const io = await resolveIo(options.io);
  if (!io) return { ok: false, synced: false, hiddenUnitIds: [], reason: 'cloud-disabled' };

  try {
    const data = await io.getDoc(ownerPreferencePath(identity.uid));
    const parsed = parseUnitVisibilityDoc(data);
    if (parsed === null) {
      // No document yet (or a malformed one): the owner's first save creates it.
      // The device keeps its current list until then.
      return { ok: true, synced: false, hiddenUnitIds: [], reason: undefined };
    }
    return { ok: true, synced: true, hiddenUnitIds: parsed };
  } catch (error) {
    console.warn('Owner unit visibility read failed:', error);
    return { ok: false, synced: false, hiddenUnitIds: [], reason: 'read-failed' };
  }
}

/**
 * Writes the caller's full, current list.
 *
 * It is intentionally NOT a union with the cloud copy: un-hiding a unit has to
 * be able to remove it from the list, and a union would silently resurrect it
 * from another device's stale copy. Last write wins, which is what a personal
 * dashboard preference should do.
 */
export async function saveOwnerUnitVisibility(
  hiddenUnitIds: string[],
  options: {
    io?: OwnerPreferenceIo | null;
    uid?: string;
    isOwner?: () => Promise<boolean>;
  } = {},
): Promise<UnitVisibilitySave> {
  const identity = await resolveIdentity(options);
  if (!identity.owner) return { ok: false, synced: false, reason: 'not-owner' };
  if (!identity.uid) return { ok: false, synced: false, reason: 'no-account' };

  const io = await resolveIo(options.io);
  if (!io) return { ok: false, synced: false, reason: 'cloud-disabled' };

  const requested = normalizeHiddenUnitIds(hiddenUnitIds);
  try {
    await io.setDoc(
      ownerPreferencePath(identity.uid),
      {
        hiddenUnitIds: requested,
        updatedAtMs: Date.now(),
        schemaVersion: OWNER_PREFERENCES_SCHEMA_VERSION,
      },
      true,
    );
    return { ok: true, synced: true };
  } catch (error) {
    console.warn('Owner unit visibility write failed:', error);
    return { ok: false, synced: false, reason: 'write-failed' };
  }
}

/** English, user-facing explanation. The panel shows this verbatim. */
export function describeVisibilitySync(reason?: string): string {
  switch (reason) {
    case 'not-owner':
      return 'Saved on this device. The synced preference belongs to the platform owner account.';
    case 'no-account':
      return 'Sign in to sync this preference. It is saved on this device for now.';
    case 'cloud-disabled':
      return 'Cloud sync is disabled on this build. This preference is saved on this device only.';
    case 'read-failed':
      return 'The saved preference could not be read from the cloud. Showing this device copy.';
    case 'write-failed':
      return 'The change could not reach the cloud. It is saved on this device only.';
    default:
      return 'Saved on this device.';
  }
}

