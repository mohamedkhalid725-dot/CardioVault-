import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
export const SUPABASE_CLINICAL_BUCKET = 'clinical-media';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

let apiClient: SupabaseClient | null = null;
let storageClient: SupabaseClient | null = null;

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

async function getFirebaseIdToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (!user) return null;
    const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
    return token || null;
  }

  const { webCurrentUser } = await import('./webFirebase');
  const user = webCurrentUser();
  return user ? await user.getIdToken(false) : null;
}

function getApiClient(): SupabaseClient {
  if (!isSupabaseStorageConfigured()) {
    throw new Error('Supabase Storage is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the CardioVault build environment.');
  }
  if (!apiClient) {
    apiClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: getFirebaseIdToken,
    });
  }
  return apiClient;
}

function getDirectStorageUrl(): string {
  const parsed = new URL(SUPABASE_URL);
  const hostname = parsed.hostname.replace(/\.supabase\.co$/i, '.storage.supabase.co');
  if (hostname === parsed.hostname) {
    throw new Error('Supabase Storage direct hostname could not be derived from VITE_SUPABASE_URL.');
  }
  return `${parsed.protocol}//${hostname}`;
}

function getStorageClient(): SupabaseClient {
  if (!isSupabaseStorageConfigured()) {
    throw new Error('Supabase Storage is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the CardioVault build environment.');
  }
  if (!storageClient) {
    storageClient = createClient(getDirectStorageUrl(), SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: getFirebaseIdToken,
    });
  }
  return storageClient;
}

function unwrapSupabaseError(error: any, action: string): Error {
  const status = error?.statusCode ? ` (${error.statusCode})` : '';
  const message = error?.message || error?.error || String(error);
  return new Error(`Supabase Storage ${action} failed${status}: ${message}`);
}

function cleanPath(path: string): string {
  return path.startsWith('supabase:') ? path.slice('supabase:'.length) : path;
}

export function markSupabaseStoragePath(path: string): string {
  return `supabase:${cleanPath(path)}`;
}

export function isSupabaseStoragePath(path: string): boolean {
  return path.startsWith('supabase:');
}

export async function registerSupabaseUnitAccessCode(code: string, unitId: string, unitName: string, role: 'view_only' | 'clinical_editor'): Promise<void> {
  const { error } = await getApiClient().rpc('cardio_register_access_code', { p_code: code, p_unit_id: unitId, p_unit_name: unitName, p_role: role });
  if (error) throw unwrapSupabaseError(error, 'access-code registration');
}

export async function revokeSupabaseUnitAccessCode(code: string): Promise<void> {
  const { error } = await getApiClient().rpc('cardio_revoke_access_code', { p_code: code });
  if (error) throw unwrapSupabaseError(error, 'access-code revocation');
}

export async function redeemSupabaseUnitAccessCode(code: string): Promise<{ unitId: string; unitName: string; role: 'view_only' | 'clinical_editor' }> {
  const { data, error } = await getApiClient().rpc('cardio_redeem_access_code', { p_code: code });
  if (error) throw unwrapSupabaseError(error, 'access-code redemption');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.unit_id) throw new Error('Supabase did not return a Unit membership.');
  return {
    unitId: String(row.unit_id),
    unitName: String(row.unit_name || 'Unit'),
    role: row.role === 'view_only' ? 'view_only' : 'clinical_editor',
  };
}

export async function uploadToSupabaseStorage(file: Blob, path: string): Promise<string> {
  const storagePath = cleanPath(path);
  const { data, error } = await getStorageClient().storage.from(SUPABASE_CLINICAL_BUCKET).upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error || !data?.path) throw unwrapSupabaseError(error || new Error('No storage path returned.'), 'upload');
  const { data: signed, error: signedError } = await getStorageClient().storage.from(SUPABASE_CLINICAL_BUCKET).createSignedUrl(data.path, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) throw unwrapSupabaseError(signedError || new Error('No signed URL returned.'), 'signed URL creation');
  return signed.signedUrl;
}

export async function resolveSupabaseStorageUrls(paths: string[]): Promise<string[]> {
  const cleanPaths = paths.filter(Boolean).map(cleanPath);
  if (!cleanPaths.length) return [];
  const { data, error } = await getStorageClient().storage.from(SUPABASE_CLINICAL_BUCKET).createSignedUrls(cleanPaths, SIGNED_URL_TTL_SECONDS);
  if (error) throw unwrapSupabaseError(error, 'signed URL refresh');
  return (data || []).map((item: any, index: number) => {
    if (!item?.signedUrl) throw new Error(`Supabase Storage could not create a signed URL for clinical image #${index + 1}.`);
    return item.signedUrl;
  });
}

export async function deleteFromSupabaseStorage(path: string): Promise<void> {
  const storagePath = cleanPath(path);
  const { error } = await getStorageClient().storage.from(SUPABASE_CLINICAL_BUCKET).remove([storagePath]);
  if (error) throw unwrapSupabaseError(error, 'delete');
}
