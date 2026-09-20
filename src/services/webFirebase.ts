import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
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


async function getNativeIdToken(): Promise<string> {
  const { user } = await FirebaseAuthentication.getCurrentUser();
  if (!user) throw new Error('No authenticated Firebase user is available.');
  const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
  if (!token) throw new Error('Could not obtain the Firebase Auth ID token.');
  return token;
}

const storageBucketName = firebaseConfig.storageBucket;
const storageObjectUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${storageBucketName}/o/${encodeURIComponent(path)}`;

async function nativeStorageUpload(file: Blob, path: string): Promise<string> {
  const token = await getNativeIdToken();
  const downloadToken = crypto.randomUUID();
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucketName}/o?uploadType=media&name=${encodeURIComponent(path)}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Firebase Storage upload failed (${uploadResponse.status}).`);
  }

  const metadataResponse = await fetch(storageObjectUrl(path), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    }),
  });
  if (!metadataResponse.ok) {
    throw new Error(`Firebase Storage metadata update failed (${metadataResponse.status}).`);
  }

  return `${storageObjectUrl(path)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
}

async function nativeStorageDelete(path: string): Promise<void> {
  const token = await getNativeIdToken();
  const response = await fetch(storageObjectUrl(path), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firebase Storage delete failed (${response.status}).`);
  }
}

export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  // Native Android/iOS uses Firebase Auth's native ID token with the Storage REST API.\n  // This avoids loading a separate native Storage plugin and keeps startup stable.\n  if (Capacitor.isNativePlatform()) return nativeStorageUpload(file, path);

  const ref = storageRef(webStorage, path);
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
    task.on(
      'state_changed',
      undefined,
      error => finish(error),
      async () => {
        try {
          finish(undefined, await getDownloadURL(task.snapshot.ref));
        } catch (error) {
          finish(error);
        }
      },
    );
  });
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {\n    await nativeStorageDelete(path);\n    return;\n  }
  await deleteObject(storageRef(webStorage, path));
}
