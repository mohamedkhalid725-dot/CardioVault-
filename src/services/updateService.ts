import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDoc as webGetDoc, webDoc } from './webFirebase';

// The app version is injected at build time from package.json (vite.config.ts
// `define`) so the web build knows what it is without shipping package.json.
declare const __APP_VERSION__: string;

export interface ReleaseInfo {
  latestVersionCode: number;
  latestVersionName: string;
  url: string;
  notes?: string;
  mandatory?: boolean;
  publishedAtMs?: number;
}

export interface UpdateAvailable {
  latestVersionCode: number;
  latestVersionName: string;
  url: string;
  notes?: string;
  mandatory: boolean;
  installedVersion: string;
  installedVersionCode: number;
}

const RELEASE_DOC = 'appConfig/release';
const DISMISSED_KEY = 'cardiovault_dismissed_update_version';
// A release check is a nicety, never a gate: give the network a few seconds and
// then quietly give up.
const CHECK_TIMEOUT_MS = 8000;

const readBuildVersion = (): string => {
  try {
    if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) return __APP_VERSION__;
  } catch { /* define not injected (e.g. jest/tsx runtime) */ }
  try {
    const envVersion = (import.meta as any)?.env?.VITE_APP_VERSION;
    if (typeof envVersion === 'string' && envVersion) return envVersion;
  } catch { /* import.meta unavailable */ }
  return '0.0.0';
};

// Same shape handling as workspaceAccess.safe(): the Capacitor Firestore plugin
// returns { data: object } while the web SDK returns a DocumentSnapshot.
const snapshotValue = (snapshot: any): any => {
  try {
    return typeof snapshot?.data === 'function' ? (snapshot.data() || null) : (snapshot?.data || null);
  } catch {
    return null;
  }
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>(resolve => window.setTimeout(() => resolve(null), ms)),
  ]);

/** Installed app version. Native reads the real binary; web uses the build version. */
export async function getInstalledVersion(): Promise<{ version: string; versionCode: number }> {
  if (!Capacitor.isNativePlatform()) return { version: readBuildVersion(), versionCode: 0 };
  try {
    const info = await CapacitorApp.getInfo();
    const version = String(info?.version || readBuildVersion());
    const parsed = Number.parseInt(String(info?.build || ''), 10);
    return { version, versionCode: Number.isFinite(parsed) ? parsed : 0 };
  } catch (error) {
    console.warn('Installed app version unavailable:', error);
    return { version: readBuildVersion(), versionCode: 0 };
  }
}

async function readReleaseDoc(): Promise<any | null> {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getDocument({ reference: RELEASE_DOC });
    return snapshotValue(result?.snapshot);
  }
  const snapshot = await webGetDoc(webDoc(RELEASE_DOC));
  return snapshot.exists() ? snapshot.data() : null;
}

const normalizeRelease = (raw: any): ReleaseInfo | null => {
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const latestVersionName = String(raw.latestVersionName || '').trim();
  const parsedCode = Number(raw.latestVersionCode);
  const latestVersionCode = Number.isFinite(parsedCode) ? parsedCode : 0;
  if (!latestVersionName && !latestVersionCode) return null;
  const publishedAtMs = Number(raw.publishedAtMs);
  return {
    latestVersionCode,
    latestVersionName,
    url,
    notes: raw.notes ? String(raw.notes) : undefined,
    mandatory: raw.mandatory === true,
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : undefined,
  };
};

const compareVersions = (a: string, b: string): number => {
  const parts = (value: string) => value.split(/[.+-]/).map(part => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const left = parts(a), right = parts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

const updateKey = (update: UpdateAvailable) => String(update.latestVersionCode || update.latestVersionName || '');

export const isUpdateDismissed = (update: UpdateAvailable): boolean => {
  try { return localStorage.getItem(DISMISSED_KEY) === updateKey(update); } catch { return false; }
};

export const dismissUpdate = (update: UpdateAvailable): void => {
  try { localStorage.setItem(DISMISSED_KEY, updateKey(update)); } catch { /* private mode */ }
};

/**
 * Returns the pending release, or null when up to date, not configured, or the
 * check failed. Never throws and never blocks the app: callers can mount it and
 * forget it.
 */
export async function checkForUpdate(): Promise<UpdateAvailable | null> {
  try {
    const installed = await getInstalledVersion();
    const raw = await withTimeout(readReleaseDoc().catch(() => null), CHECK_TIMEOUT_MS);
    const release = normalizeRelease(raw);
    if (!release) return null;
    // versionCode is authoritative on native; the web build has no versionCode,
    // so it falls back to comparing the published version name.
    const isNewer = installed.versionCode > 0 && release.latestVersionCode > 0
      ? release.latestVersionCode > installed.versionCode
      : compareVersions(release.latestVersionName, installed.version) > 0;
    if (!isNewer) return null;
    return {
      latestVersionCode: release.latestVersionCode,
      latestVersionName: release.latestVersionName || installed.version,
      url: release.url,
      notes: release.notes,
      mandatory: release.mandatory === true,
      installedVersion: installed.version,
      installedVersionCode: installed.versionCode,
    };
  } catch (error) {
    console.warn('Update check skipped:', error);
    return null;
  }
}

/**
 * Opens the download page. On Android an external http(s) URL is intercepted by
 * Capacitor's bridge and handed to the system browser, so the WebView keeps the
 * current screen untouched.
 */
export function openUpdateUrl(url: string): void {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return;
  if (Capacitor.isNativePlatform()) {
    try { window.location.href = target; } catch (error) { console.warn('Could not open update link:', error); }
    return;
  }
  try {
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (opened) { try { opened.opener = null; } catch { /* ignore */ } return; }
  } catch { /* popup blocked */ }
  try { window.location.href = target; } catch (error) { console.warn('Could not open update link:', error); }
}
