import { initializeApp, type FirebaseApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { deleteFromSupabaseStorage, isSupabaseStoragePath, uploadToSupabaseStorage } from './supabaseStorage';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
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
  apiKey: 'AIzaSyCegfOjWEsNwrz96L6UFlbXsODzVs1jFpQ',
  authDomain: 'ccu-notebook.firebaseapp.com',
  projectId: 'ccu-notebook',
  storageBucket: 'ccu-notebook.firebasestorage.app',
  messagingSenderId: '963615758407',
  appId: '1:963615758407:ios:a113cc828e31dbd550b962',
};

// The native Android/iOS builds use the Capacitor Firebase plugins.
// Do not initialize Firebase Web Auth/Firestore/Storage inside the native WebView.
// Keeping the Web SDK lazy also prevents IndexedDB persistence from touching startup.
const app: FirebaseApp = initializeApp(firebaseConfig);

let webAuthInstance: Auth | null = null;
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

function getWebDb(): Firestore {
  assertWebPlatform();
  if (!webDbInstance) {
    webDbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return webDbInstance;
}

export function webGoogleSignIn(): Promise<User> {
  return signInWithPopup(getWebAuth(), new GoogleAuthProvider()).then(result => result.user);
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

export async function uploadMediaToStorage(file: Blob, path: string): Promise<string> {
  return uploadToSupabaseStorage(file, path);
}

export async function deleteMediaFromStorage(path: string): Promise<void> {
  if (!isSupabaseStoragePath(path)) {
    throw new Error('This clinical image belongs to the retired Firebase Storage backend and cannot be deleted from the new storage backend.');
  }
  await deleteFromSupabaseStorage(path);
}
