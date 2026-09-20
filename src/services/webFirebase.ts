import { initializeApp } from 'firebase/app';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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


export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  const ref = storageRef(webStorage, path);
  const snapshot = await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(snapshot.ref);
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  await deleteObject(storageRef(webStorage, path));
}


export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  const ref = storageRef(webStorage, path);
  const snapshot = await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(snapshot.ref);
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  await deleteObject(storageRef(webStorage, path));
}
