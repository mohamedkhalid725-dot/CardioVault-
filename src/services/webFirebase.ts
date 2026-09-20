import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseStorage } from '@capacitor-firebase/storage';
import { Filesystem, Directory } from '@capacitor/filesystem';
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


async function blobToBase64(file: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not prepare image for native upload.'));
    reader.readAsDataURL(file);
  });
}

async function nativeStorageUpload(file: Blob, path: string): Promise<string> {
  const tempName = `cardiovault-upload-${Date.now()}-${Math.random().toString(36).slice(2)}-${path.split('/').pop() || 'image'}`;
  const base64 = await blobToBase64(file);
  let uri = '';
  try {
    const written = await Filesystem.writeFile({
      path: tempName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const resolved = await Filesystem.getUri({ directory: Directory.Cache, path: tempName });
    uri = resolved.uri || written.uri || '';
    if (!uri) throw new Error('Could not create a temporary image file.');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Native Firebase Storage upload timed out.')), 60000);
      FirebaseStorage.uploadFile(
        {
          path,
          uri,
        },
        (event, error) => {
          if (error) {
            clearTimeout(timeout);
            finish(error);
          } else if (event?.completed) {
            clearTimeout(timeout);
            finish();
          }
        },
      ).catch(error => {
        clearTimeout(timeout);
        finish(error);
      });
    });

    const { downloadUrl } = await FirebaseStorage.getDownloadUrl({ path });
    if (!downloadUrl) throw new Error('Firebase Storage returned no download URL.');
    return downloadUrl;
  } finally {
    try {
      await Filesystem.deleteFile({ directory: Directory.Cache, path: tempName });
    } catch {
      // Temporary cache cleanup is best-effort.
    }
  }
}

async function nativeStorageDelete(path: string): Promise<void> {
  await FirebaseStorage.deleteFile({ path });
}

export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  // Native Android/iOS uses the Firebase Storage native SDK, so it shares the
  // same native Firebase Auth session and avoids WebView fetch/REST issues.
  if (Capacitor.isNativePlatform()) return nativeStorageUpload(file, path);

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
  if (Capacitor.isNativePlatform()) {
    await nativeStorageDelete(path);
    return;
  }
  await deleteObject(storageRef(webStorage, path));
}
