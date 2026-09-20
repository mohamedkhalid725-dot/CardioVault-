import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
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
  apiKey: 'AIzaSyCegfOjWEsNwrz96L6UFlbXsODzVs1jFpQ',
  authDomain: 'ccu-notebook.firebaseapp.com',
  projectId: 'ccu-notebook',
  storageBucket: 'ccu-notebook.firebasestorage.app',
  messagingSenderId: '963615758407',
  appId: '1:963615758407:ios:a113cc828e31dbd550b962',
};

const app = initializeApp(firebaseConfig);
export const webAuth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const webStorage = getStorage(app);

export const webDb: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export async function webGoogleSignIn(): Promise<User> {
  const result = await signInWithPopup(webAuth, new GoogleAuthProvider());
  return result.user;
}
export async function webEmailSignIn(email:string,password:string):Promise<User>{
  return (await signInWithEmailAndPassword(webAuth,email,password)).user;
}
export async function webEmailCreate(email:string,password:string):Promise<User>{
  return (await createUserWithEmailAndPassword(webAuth,email,password)).user;
}
export async function webSignOut(){ await signOut(webAuth); }
export function webCurrentUser(){ return webAuth.currentUser; }

export const webDoc = (path:string) => doc(webDb, path);
export const webCollection = (path:string) => collection(webDb, path);
export { getDoc, getDocs, setDoc, deleteDoc, query, where };


const STORAGE_BUCKET = 'ccu-notebook.firebasestorage.app';

async function getNativeFirebaseIdToken(): Promise<string> {
  const result = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
  if (!result.token) throw new Error('Firebase session token is unavailable. Please sign in again.');
  return result.token;
}

async function nativeStorageUpload(file: Blob, path: string): Promise<string> {
  const token = await getNativeFirebaseIdToken();
  const downloadToken = crypto.randomUUID();
  const metadata = JSON.stringify({
    name: path,
    contentType: file.type || 'application/octet-stream',
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });
  const boundary = `----CardioVault${crypto.randomUUID().replace(/-/g, '')}`;
  const body = new Blob([
    `--${boundary}\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n${metadata}\\r\\n--${boundary}\\r\\nContent-Type: ${file.type || 'application/octet-stream'}\\r\\n\\r\\n`,
    file,
    `\\r\\n--${boundary}--`,
  ]);
  const endpoint = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=multipart&name=${encodeURIComponent(path)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Storage upload failed (${response.status}): ${details.slice(0, 240)}`);
  }
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
}

async function nativeStorageDelete(path: string): Promise<void> {
  const token = await getNativeFirebaseIdToken();
  const endpoint = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const details = await response.text().catch(() => '');
    throw new Error(`Storage delete failed (${response.status}): ${details.slice(0, 240)}`);
  }
}

export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  // Native Capacitor auth lives in the native Firebase SDK. The Firebase JS
  // Storage SDK has a separate web auth state, so using it directly on Android
  // can produce storage/unauthorized even after a successful native login.
  if (Capacitor.isNativePlatform()) return nativeStorageUpload(file, path);

  const ref = storageRef(webStorage, path);
  const snapshot = await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(snapshot.ref);
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeStorageDelete(path);
    return;
  }
  await deleteObject(storageRef(webStorage, path));
}
