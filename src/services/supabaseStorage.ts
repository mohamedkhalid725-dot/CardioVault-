import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
export const SUPABASE_CLINICAL_BUCKET = 'clinical-media';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

let client: SupabaseClient | null = null;

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

function getClient(): SupabaseClient {
  if (!isSupabaseStorageConfigured()) {
    throw new Error('Supabase Storage is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the CardioVault build environment.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: getFirebaseIdToken,
    });
  }
  return client;
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

export async function uploadToSupabaseStorage(file: Blob, path: string): Promise<string> {
  const storagePath = cleanPath(path);
  const { data, error } = await getClient().storage.from(SUPABASE_CLINICAL_BUCKET).upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error || !data?.path) throw unwrapSupabaseError(error || new Error('No storage path returned.'), 'upload');
  const { data: signed, error: signedError } = await getClient().storage.from(SUPABASE_CLINICAL_BUCKET).createSignedUrl(data.path, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) throw unwrapSupabaseError(signedError || new Error('No signed URL returned.'), 'signed URL creation');
  return signed.signedUrl;
}

export async function resolveSupabaseStorageUrls(paths: string[]): Promise<string[]> {
  const cleanPaths = paths.filter(Boolean).map(cleanPath);
  if (!cleanPaths.length) return [];
  const { data, error } = await getClient().storage.from(SUPABASE_CLINICAL_BUCKET).createSignedUrls(cleanPaths, SIGNED_URL_TTL_SECONDS);
  if (error) throw unwrapSupabaseError(error, 'signed URL refresh');
  return (data || []).map((item: any, index: number) => {
    if (!item?.signedUrl) throw new Error(`Supabase Storage could not create a signed URL for clinical image #${index + 1}.`);
    return item.signedUrl;
  });
}

export async function deleteFromSupabaseStorage(path: string): Promise<void> {
  const storagePath = cleanPath(path);
  const { error } = await getClient().storage.from(SUPABASE_CLINICAL_BUCKET).remove([storagePath]);
  if (error) throw unwrapSupabaseError(error, 'delete');
}
