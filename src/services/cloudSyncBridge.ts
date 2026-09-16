import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { StorageService } from './storage';

/** CardioVault Cloud Sync v7 — account-isolated, Firestore-safe serialization. */
let installed = false;
let syncing = false;
let suppressSync = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRequested = false;

const UID_KEY = 'cardiovault_google_uid';
const LAST_SYNC_KEY = 'cardiovault_last_cloud_sync';
const LAST_ERROR_KEY = 'cardiovault_last_cloud_sync_error';
const LAST_ERROR_DETAIL_KEY = 'cardiovault_last_cloud_sync_error_detail';
const ROOT = 'users';
const SCHEMA_VERSION = 7;

const currentUid = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await FirebaseAuthentication.getCurrentUser();
    return result.user?.uid || null;
  } catch { return null; }
};

const setActiveUid = (uid: string) => localStorage.setItem(UID_KEY, uid);
const rootPath = (uid: string) => `${ROOT}/${uid}`;
const collectionPath = (uid: string, collection: string) => `${rootPath(uid)}/${collection}`;

const errorText = (error: unknown): string => {
  if (!error) return 'Unknown cloud error';
  const value = error as any;
  const code = String(value?.code || value?.errorCode || '').trim();
  const message = String(value?.message || value?.errorMessage || error || '').trim();
  return [code, message].filter(Boolean).join(': ').slice(0, 500) || 'Unknown cloud error';
};
const recordCloudError = (error: unknown) => {
  localStorage.setItem(LAST_ERROR_KEY, new Date().toISOString());
  localStorage.setItem(LAST_ERROR_DETAIL_KEY, errorText(error));
};
const ensureFirestoreNetwork = async () => { if (Capacitor.isNativePlatform()) await FirebaseFirestore.enableNetwork(); };
const readSnapshotData = (snapshot: any): any => { try { return typeof snapshot?.data === 'function' ? snapshot.data() : (snapshot?.data || {}); } catch { return {}; } };
const readSnapshotId = (snapshot: any): string | null => { const id = snapshot?.id || snapshot?.documentId || snapshot?.reference?.id; return typeof id === 'string' && id ? id : null; };

/**
 * Firestore accepts plain JSON-like values only. Capacitor's Firestore bridge is
 * stricter than the browser SDK and can reject undefined/functions/class instances
 * nested inside arrays. Sanitize recursively instead of only cleaning the top level.
 */
const firestoreSafe = (value: any, seen = new WeakSet<object>()): any => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return null;
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => firestoreSafe(item, seen));
  const out: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ownerUid') continue;
    const safe = firestoreSafe(child, seen);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
};

async function getCollectionDocuments(reference: string): Promise<Array<{ id: string; data: any }>> {
  const result: any = await FirebaseFirestore.getCollection({ reference });
  const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
  return snapshots.map((snapshot: any) => ({ id: readSnapshotId(snapshot) || '', data: readSnapshotData(snapshot) })).filter(x => !!x.id);
}
async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try { return await operation(); }
    catch (error) { lastError = error; if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * 2 ** i)); }
  }
  throw lastError;
}
async function syncCollection(uid: string, collection: string, records: any[]): Promise<void> {
  const reference = collectionPath(uid, collection);
  const currentIds = new Set<string>();
  for (const record of records) {
    if (!record?.id) continue;
    const id = String(record.id);
    currentIds.add(id);
    const safeRecord = firestoreSafe(record) || {};
    await withRetry(() => FirebaseFirestore.setDocument({
      reference: `${reference}/${id}`,
      data: { ...safeRecord, id, ownerUid: uid, updatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION },
      merge: true,
    }));
  }
  try {
    const remote = await getCollectionDocuments(reference);
    for (const item of remote) if (!currentIds.has(item.id)) await withRetry(() => FirebaseFirestore.deleteDocument({ reference: `${reference}/${item.id}` }));
  } catch (error) { recordCloudError(error); console.warn(`Cloud remote cleanup skipped for ${collection}:`, error); }
}
async function writeMetadata(uid: string): Promise<void> {
  await withRetry(() => FirebaseFirestore.setDocument({
    reference: rootPath(uid),
    data: { ownerUid: uid, schemaVersion: SCHEMA_VERSION, lastClientSync: new Date().toISOString(), platform: Capacitor.getPlatform() },
    merge: true,
  }));
}
function clearLocalClinicalData(): void {
  const previous = suppressSync; suppressSync = true;
  try { StorageService.saveUnits([]); StorageService.saveBeds([]); StorageService.savePatients([]); } finally { suppressSync = previous; }
}
async function syncLocalDatabase(uid: string): Promise<void> {
  const verifiedUid = await currentUid();
  if (!verifiedUid || verifiedUid !== uid) throw new Error('Authenticated account changed during sync.');
  if (syncing || suppressSync) { syncRequested = true; return; }
  syncing = true; syncRequested = false;
  try {
    await ensureFirestoreNetwork();
    const verifiedAgain = await currentUid();
    if (!verifiedAgain || verifiedAgain !== uid) throw new Error('Authenticated account changed before cloud write.');
    await syncCollection(uid, 'units', StorageService.getUnits());
    await syncCollection(uid, 'beds', StorageService.getBeds());
    await syncCollection(uid, 'patients', StorageService.getPatients());
    await writeMetadata(uid);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    localStorage.removeItem(LAST_ERROR_KEY); localStorage.removeItem(LAST_ERROR_DETAIL_KEY);
  } catch (error) { recordCloudError(error); throw error; }
  finally { syncing = false; if (syncRequested) { syncRequested = false; scheduleSync(500); } }
}
function scheduleSync(delay = 900) {
  if (suppressSync || !Capacitor.isNativePlatform()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void (async () => { const uid = await currentUid(); if (!uid) return; setActiveUid(uid); try { await syncLocalDatabase(uid); } catch (error) { console.warn('Cloud sync failed; local data remains available and will retry.', error); } })(); }, delay);
}
export async function loadCurrentUserFromCloud(): Promise<{ uid: string; found: boolean } | null> {
  const uid = await currentUid(); if (!uid) return null; setActiveUid(uid); suppressSync = true;
  try {
    await ensureFirestoreNetwork(); clearLocalClinicalData();
    const [units, beds, patients] = await Promise.all([getCollectionDocuments(collectionPath(uid, 'units')), getCollectionDocuments(collectionPath(uid, 'beds')), getCollectionDocuments(collectionPath(uid, 'patients'))]);
    const owned = (items: Array<{id:string;data:any}>) => items.filter(item => !item.data?.ownerUid || item.data.ownerUid === uid);
    const safeUnits = owned(units), safeBeds = owned(beds), safePatients = owned(patients);
    if (safeUnits.length || safeBeds.length || safePatients.length) {
      StorageService.saveUnits(safeUnits.map(x => ({ ...x.data, id: x.id })));
      StorageService.saveBeds(safeBeds.map(x => ({ ...x.data, id: x.id })));
      StorageService.savePatients(safePatients.map(x => ({ ...x.data, id: x.id })));
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); localStorage.removeItem(LAST_ERROR_KEY); localStorage.removeItem(LAST_ERROR_DETAIL_KEY);
      return { uid, found: true };
    }
    clearLocalClinicalData(); return { uid, found: false };
  } catch (error) { recordCloudError(error); clearLocalClinicalData(); console.warn('Cloud database read failed; active workspace was isolated.', error); return { uid, found: false }; }
  finally { suppressSync = false; }
}
export async function saveCurrentUserToCloud(): Promise<void> { if (!Capacitor.isNativePlatform()) return; const uid = await currentUid(); if (!uid) return; setActiveUid(uid); scheduleSync(250); }
export async function syncCurrentUserNow(): Promise<boolean> { if (!Capacitor.isNativePlatform()) return false; const uid = await currentUid(); if (!uid) return false; setActiveUid(uid); try { await syncLocalDatabase(uid); return true; } catch (error) { recordCloudError(error); console.warn('Manual cloud sync failed:', error); return false; } }
export function getLastCloudSyncTime(): string { return localStorage.getItem(LAST_SYNC_KEY) || ''; }
export function getLastCloudSyncErrorTime(): string { return localStorage.getItem(LAST_ERROR_KEY) || ''; }
export function getLastCloudSyncErrorDetail(): string { return localStorage.getItem(LAST_ERROR_DETAIL_KEY) || ''; }
export function installCloudSyncBridge() {
  if (installed) return; installed = true;
  const originalUnits = StorageService.saveUnits.bind(StorageService), originalBeds = StorageService.saveBeds.bind(StorageService), originalPatients = StorageService.savePatients.bind(StorageService);
  StorageService.saveUnits = units => { originalUnits(units); if (!suppressSync) void saveCurrentUserToCloud(); };
  StorageService.saveBeds = beds => { originalBeds(beds); if (!suppressSync) void saveCurrentUserToCloud(); };
  StorageService.savePatients = patients => { originalPatients(patients); if (!suppressSync) void saveCurrentUserToCloud(); };
}
export function clearActiveClinicalWorkspace(): void { clearLocalClinicalData(); }
