import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { StorageService } from './storage';

let installed = false;
let syncing = false;

const currentUid = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await FirebaseAuthentication.getCurrentUser();
    return result.user?.uid || null;
  } catch {
    return null;
  }
};

export async function loadCurrentUserFromCloud(): Promise<{ uid: string; found: boolean } | null> {
  const uid = await currentUid();
  if (!uid) return null;
  try {
    const result = await FirebaseFirestore.getDocument({ reference: `physicians/${uid}` });
    const snapshot: any = result.snapshot as any;
    const data: any = typeof snapshot?.data === 'function' ? snapshot.data() : (snapshot?.data || {});
    if (data && Array.isArray(data.units) && Array.isArray(data.beds) && Array.isArray(data.patients)) {
      StorageService.saveUnits(data.units);
      StorageService.saveBeds(data.beds);
      StorageService.savePatients(data.patients);
      localStorage.setItem('cardiovault_google_uid', uid);
      return { uid, found: true };
    }
    localStorage.setItem('cardiovault_google_uid', uid);
    return { uid, found: false };
  } catch (error) {
    console.warn('Cloud snapshot read failed; continuing with local-first storage.', error);
    localStorage.setItem('cardiovault_google_uid', uid);
    return { uid, found: false };
  }
}

export async function saveCurrentUserToCloud(): Promise<void> {
  if (!Capacitor.isNativePlatform() || syncing || !localStorage.getItem('cardiovault_google_uid')) return;
  const uid = localStorage.getItem('cardiovault_google_uid');
  if (!uid) return;
  syncing = true;
  try {
    await FirebaseFirestore.setDocument({
      reference: `physicians/${uid}`,
      data: {
        units: StorageService.getUnits(),
        beds: StorageService.getBeds(),
        patients: StorageService.getPatients(),
        updatedAt: new Date().toISOString(),
      },
      merge: true,
    });
    localStorage.setItem('cardiovault_last_cloud_sync', new Date().toISOString());
  } catch (error) {
    console.warn('Cloud snapshot write failed; data remains local.', error);
  } finally {
    syncing = false;
  }
}

export function installCloudSyncBridge() {
  if (installed) return;
  installed = true;

  // Keep local-first persistence while mirroring clinical data to Firestore.
  // Do NOT wrap signInWithGoogle itself: the native Google promise must resolve
  // immediately after the account chooser completes. Cloud loading is performed
  // explicitly by LoginScreen after a successful Google authentication.
  const originalUnits = StorageService.saveUnits.bind(StorageService);
  const originalBeds = StorageService.saveBeds.bind(StorageService);
  const originalPatients = StorageService.savePatients.bind(StorageService);
  StorageService.saveUnits = (units) => { originalUnits(units); void saveCurrentUserToCloud(); };
  StorageService.saveBeds = (beds) => { originalBeds(beds); void saveCurrentUserToCloud(); };
  StorageService.savePatients = (patients) => { originalPatients(patients); void saveCurrentUserToCloud(); };
}
