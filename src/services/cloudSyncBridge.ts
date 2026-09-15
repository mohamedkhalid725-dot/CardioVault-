import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { StorageService } from './storage';

/**
 * CardioVault Cloud Sync v2
 *
 * Local storage remains the source of truth for immediate UI operations.
 * Firestore mirrors each resource in its own collection instead of storing
 * the entire clinical database in one physician document.
 *
 * physicians/{uid}
 *   ├── metadata/profile
 *   ├── units/{unitId}
 *   ├── beds/{bedId}
 *   └── patients/{patientId}
 */

let installed = false;
let syncing = false;
let suppressSync = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRequested = false;

const UID_KEY = 'cardiovault_google_uid';
const LAST_SYNC_KEY = 'cardiovault_last_cloud_sync';
const ROOT = 'physicians';

const currentUid = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await FirebaseAuthentication.getCurrentUser();
    return result.user?.uid || null;
  } catch {
    return null;
  }
};

const setActiveUid = (uid: string) => localStorage.setItem(UID_KEY, uid);

const rootPath = (uid: string) => `${ROOT}/${uid}`;
const collectionPath = (uid: string, collection: string) => `${rootPath(uid)}/${collection}`;

const readSnapshotData = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? snapshot.data() : (snapshot?.data || {});
  } catch {
    return {};
  }
};

const readSnapshotId = (snapshot: any): string | null => {
  const id = snapshot?.id || snapshot?.documentId || snapshot?.reference?.id;
  return typeof id === 'string' && id ? id : null;
};

const normalizeEntity = (value: any) => {
  if (!value || typeof value !== 'object') return value;
  const { id: _ignored, ...data } = value;
  return data;
};

async function getCollectionDocuments(reference: string): Promise<Array<{ id: string; data: any }>> {
  const result: any = await FirebaseFirestore.getCollection({ reference });
  const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
  return snapshots
    .map((snapshot: any) => ({ id: readSnapshotId(snapshot) || '', data: readSnapshotData(snapshot) }))
    .filter((item: { id: string }) => !!item.id);
}

async function syncCollection(uid: string, collection: string, records: any[]): Promise<void> {
  const reference = collectionPath(uid, collection);
  const currentIds = new Set<string>();

  for (const record of records) {
    if (!record?.id) continue;
    const id = String(record.id);
    currentIds.add(id);
    await FirebaseFirestore.setDocument({
      reference: `${reference}/${id}`,
      data: {
        ...normalizeEntity(record),
        id,
        updatedAt: new Date().toISOString(),
      },
      merge: true,
    });
  }

  // Remove documents that were deleted locally. This keeps archive/delete flows
  // consistent without ever deleting anything from local storage.
  const remote = await getCollectionDocuments(reference);
  for (const item of remote) {
    if (!currentIds.has(item.id)) {
      await FirebaseFirestore.deleteDocument({ reference: `${reference}/${item.id}` });
    }
  }
}

async function writeMetadata(uid: string): Promise<void> {
  await FirebaseFirestore.setDocument({
    reference: `${rootPath(uid)}/metadata`,
    data: {
      schemaVersion: 2,
      lastClientSync: new Date().toISOString(),
      platform: Capacitor.getPlatform(),
    },
    merge: true,
  });
}

async function syncLocalDatabase(uid: string): Promise<void> {
  if (syncing || suppressSync) {
    syncRequested = true;
    return;
  }

  syncing = true;
  syncRequested = false;
  try {
    await syncCollection(uid, 'units', StorageService.getUnits());
    await syncCollection(uid, 'beds', StorageService.getBeds());
    await syncCollection(uid, 'patients', StorageService.getPatients());
    await writeMetadata(uid);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } finally {
    syncing = false;
    if (syncRequested) {
      syncRequested = false;
      scheduleSync(300);
    }
  }
}

function scheduleSync(delay = 900) {
  if (suppressSync || !Capacitor.isNativePlatform()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void (async () => {
      const uid = await currentUid();
      if (!uid) return;
      setActiveUid(uid);
      try {
        await syncLocalDatabase(uid);
      } catch (error) {
        console.warn('Cloud sync queued operation failed; will retry on the next local change.', error);
      }
    })();
  }, delay);
}

/**
 * Load the new normalized cloud database. If no v2 collections exist, fall
 * back to the old physicians/{uid} snapshot once and immediately migrate it.
 */
export async function loadCurrentUserFromCloud(): Promise<{ uid: string; found: boolean } | null> {
  const uid = await currentUid();
  if (!uid) return null;
  setActiveUid(uid);

  suppressSync = true;
  try {
    const [units, beds, patients] = await Promise.all([
      getCollectionDocuments(collectionPath(uid, 'units')),
      getCollectionDocuments(collectionPath(uid, 'beds')),
      getCollectionDocuments(collectionPath(uid, 'patients')),
    ]);

    if (units.length || beds.length || patients.length) {
      StorageService.saveUnits(units.map(item => ({ ...item.data, id: item.id })));
      StorageService.saveBeds(beds.map(item => ({ ...item.data, id: item.id })));
      StorageService.savePatients(patients.map(item => ({ ...item.data, id: item.id })));
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      return { uid, found: true };
    }

    // Backward compatibility with the previous single-document schema.
    try {
      const legacyResult: any = await FirebaseFirestore.getDocument({ reference: rootPath(uid) });
      const legacy = readSnapshotData(legacyResult?.snapshot);
      if (Array.isArray(legacy?.units) && Array.isArray(legacy?.beds) && Array.isArray(legacy?.patients)) {
        StorageService.saveUnits(legacy.units);
        StorageService.saveBeds(legacy.beds);
        StorageService.savePatients(legacy.patients);
        await syncLocalDatabase(uid);
        return { uid, found: true };
      }
    } catch (error) {
      console.warn('Legacy cloud migration check failed:', error);
    }

    return { uid, found: false };
  } catch (error) {
    console.warn('Cloud database read failed; local data remains available.', error);
    return { uid, found: false };
  } finally {
    suppressSync = false;
  }
}

export async function saveCurrentUserToCloud(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const uid = (await currentUid()) || localStorage.getItem(UID_KEY);
  if (!uid) return;
  setActiveUid(uid);
  scheduleSync(250);
}

/** Explicit sync entry point for Settings / future sync UI. */
export async function syncCurrentUserNow(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const uid = await currentUid();
  if (!uid) return false;
  setActiveUid(uid);
  try {
    await syncLocalDatabase(uid);
    return true;
  } catch (error) {
    console.warn('Manual cloud sync failed:', error);
    return false;
  }
}

export function getLastCloudSyncTime(): string {
  return localStorage.getItem(LAST_SYNC_KEY) || '';
}

export function installCloudSyncBridge() {
  if (installed) return;
  installed = true;

  const originalUnits = StorageService.saveUnits.bind(StorageService);
  const originalBeds = StorageService.saveBeds.bind(StorageService);
  const originalPatients = StorageService.savePatients.bind(StorageService);

  // Local writes stay synchronous and immediate. Cloud writes are debounced so
  // a single clinical action that updates several stores creates one sync pass.
  StorageService.saveUnits = (units) => {
    originalUnits(units);
    if (!suppressSync) void saveCurrentUserToCloud();
  };
  StorageService.saveBeds = (beds) => {
    originalBeds(beds);
    if (!suppressSync) void saveCurrentUserToCloud();
  };
  StorageService.savePatients = (patients) => {
    originalPatients(patients);
    if (!suppressSync) void saveCurrentUserToCloud();
  };
}
