import { initializeApp, type FirebaseApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject, type FirebaseStorage } from 'firebase/storage';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCegfOjWEsNwrz96L6UFlbXsODzVs1jFpQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ccu-notebook.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ccu-notebook',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ccu-notebook.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '963615758407',
};

// The native Android/iOS builds use the Capacitor Firebase plugins.
// Do not initialize Firebase Web Auth/Firestore/Storage inside the native WebView.
// Keeping the Web SDK lazy also prevents IndexedDB persistence from touching startup.
const app: FirebaseApp = initializeApp(firebaseConfig);

let webAuthInstance: Auth | null = null;
let webStorageInstance: FirebaseStorage | null = null;
let webDbInstance: Firestore | null = null;

function assertWebPlatform(): void {
  if (Capacitor.isNativePlatform()) {
    throw new Error('Firebase Web SDK is unavailable on native CardioVault builds.');
  }
}

function getWebAuth(): Auth {
  assertWebPlatform();
  if (!webAuthInstance) {
    webAuthInstance = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return webAuthInstance;
}

function getWebStorage(): FirebaseStorage {
  assertWebPlatform();
  if (!webStorageInstance) webStorageInstance = getStorage(app);
  return webStorageInstance;
}

function getWebDb(): Firestore {
  assertWebPlatform();
  if (!webDbInstance) {
    webDbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return webDbInstance;
}

export async function webGoogleSignIn(): Promise<User> {
  const auth = getWebAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  // Mobile browsers and embedded/in-app browsers frequently block Firebase popups.
  // Use the redirect flow on small screens so Google can present the account chooser
  // reliably, then restore the Firebase session from getRedirectResult() on boot.
  const useRedirect = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  if (useRedirect) {
    await signInWithRedirect(auth, provider);
    throw new Error('Redirecting to Google Sign-In...');
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider);
      throw new Error('Redirecting to Google Sign-In...');
    }
    throw err;
  }
}
export async function checkWebRedirectResult(): Promise<User | null> {
  if (Capacitor.isNativePlatform()) return null;
  try {
    const result = await getRedirectResult(getWebAuth());
    return result?.user || null;
  } catch {
    return null;
  }
}
export function subscribeWebAuthState(callback: (user: User | null) => void): () => void {
  if (Capacitor.isNativePlatform()) return () => {};
  return onAuthStateChanged(getWebAuth(), callback);
}
export async function webEmailSignIn(email:string,password:string):Promise<User>{
  return (await signInWithEmailAndPassword(getWebAuth(),email,password)).user;
}
export async function webEmailCreate(email:string,password:string):Promise<User>{
  return (await createUserWithEmailAndPassword(getWebAuth(),email,password)).user;
}
export async function webSignOut(){ await signOut(getWebAuth()); }
export function webCurrentUser(){ return Capacitor.isNativePlatform() ? null : getWebAuth().currentUser; }

export const webDoc = (path:string) => doc(getWebDb(), path);
export const webCollection = (path:string) => collection(getWebDb(), path);
export { getDoc, getDocs, setDoc, deleteDoc, query, where };

async function getNativeIdToken(): Promise<string> {
  const { user } = await FirebaseAuthentication.getCurrentUser();
  if (!user) throw new Error('No authenticated Firebase user is available.');
  const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
  if (!token) throw new Error('Could not obtain the Firebase Auth ID token.');
  return token;
}

// Firebase projects can have either the modern `.firebasestorage.app` default bucket
// or a legacy `.appspot.com` bucket. The app config normally points to the active
// bucket, but older projects can retain the legacy bucket. Try the configured bucket
// first and transparently fall back to the legacy name only when the service returns 404.
const storageBucketCandidates = Array.from(new Set([
  firebaseConfig.storageBucket,
  firebaseConfig.storageBucket.endsWith('.firebasestorage.app')
    ? firebaseConfig.storageBucket.replace('.firebasestorage.app', '.appspot.com')
    : firebaseConfig.storageBucket.endsWith('.appspot.com')
      ? firebaseConfig.storageBucket.replace('.appspot.com', '.firebasestorage.app')
      : firebaseConfig.storageBucket,
]));

const storageObjectUrl = (bucket: string, path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`;

async function readStorageError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body ? `: ${body.slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

async function nativeStorageUpload(file: Blob, path: string): Promise<string> {
  const token = await getNativeIdToken();
  const downloadToken = crypto.randomUUID();
  let lastError = '';

  for (const bucket of storageBucketCandidates) {
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });

    if (uploadResponse.ok) {
      const metadataResponse = await fetch(storageObjectUrl(bucket, path), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: downloadToken } }),
      });
      if (!metadataResponse.ok) {
        throw new Error(`Firebase Storage metadata update failed (${metadataResponse.status})${await readStorageError(metadataResponse)}.`);
      }
      return `${storageObjectUrl(bucket, path)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
    }

    lastError = `Firebase Storage upload failed (${uploadResponse.status})${await readStorageError(uploadResponse)}`;
    if (uploadResponse.status !== 404) break;
  }

  throw new Error(lastError || 'Firebase Storage upload failed.');
}

async function nativeStorageDelete(path: string): Promise<void> {
  const token = await getNativeIdToken();
  let lastError = '';

  for (const bucket of storageBucketCandidates) {
    const response = await fetch(storageObjectUrl(bucket, path), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok || response.status === 404) {
      if (response.ok) return;
      continue;
    }
    lastError = `Firebase Storage delete failed (${response.status})${await readStorageError(response)}`;
    break;
  }

  if (lastError) throw new Error(lastError);
}

export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  if (Capacitor.isNativePlatform()) return nativeStorageUpload(file, path);
  const ref = storageRef(getWebStorage(), path);
  return await new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(ref, file, { contentType: file.type || 'application/octet-stream' });
    let settled = false;
    const finish = (error?: unknown, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve(url || '');
    };
    const timeout = setTimeout(() => {
      task.cancel();
      finish(new Error('Firebase Storage upload timed out. Check your connection and try again.'));
    }, 60000);
    task.on('state_changed', undefined, error => finish(error), async () => {
      try { finish(undefined, await getDownloadURL(task.snapshot.ref)); }
      catch (error) { finish(error); }
    });
  });
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  if (path.startsWith('firestore:')) {
    const { deleteFirestoreMedia } = await import('./mediaStorage');
    await deleteFirestoreMedia(path);
    return;
  }
  const storagePath = path.startsWith('firebase:') ? path.slice('firebase:'.length) : path;
  if (Capacitor.isNativePlatform()) {
    await nativeStorageDelete(storagePath);
    return;
  }
  await deleteObject(storageRef(getWebStorage(), storagePath));
}
