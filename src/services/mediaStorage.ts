import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webCollection, webDoc, getDoc, getDocs, setDoc, deleteDoc } from './webFirebase';

const MEDIA_WORKSPACE = 'cardiovault_master_workspace';
const CHUNK_SIZE = 600_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export const isClinicalImageFile = (file: File) =>
  /^image\//i.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);

export async function optimizeClinicalImage(file: File): Promise<File> {
  if (!file || file.size <= 0) throw new Error('The selected image is empty.');
  if (!isClinicalImageFile(file)) return file;

  // Android galleries/cameras may provide HEIC/HEIF (and other formats that
  // are not reliably renderable inside every Android WebView). Always
  // normalize those formats to JPEG, even when the original file is small.
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  const mustNormalize = /image\/(heic|heif)/i.test(type) || /\.(heic|heif)$/i.test(name);
  if (!mustNormalize && file.size <= 900 * 1024) return file;

  const maxDimension = 2048;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let draw: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | undefined;
  let bitmap: ImageBitmap | null = null;
  let objectUrl = '';

  try {
    if ('createImageBitmap' in window) {
      try {
        bitmap = await withTimeout(createImageBitmap(file, { imageOrientation: 'from-image' }), 8000, 'Image decoder timed out.');
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        draw = (ctx, width, height) => ctx.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
      } catch { bitmap = null; }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      const img = await withTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Could not decode the selected image on this device.'));
        element.src = objectUrl;
      }), 8000, 'Image decoder timed out.');
      sourceWidth = img.naturalWidth;
      sourceHeight = img.naturalHeight;
      draw = (ctx, width, height) => ctx.drawImage(img, 0, 0, width, height);
    }
    if (!sourceWidth || !sourceHeight || !draw) return file;

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    draw(ctx, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not compress image.')), 'image/jpeg', 0.82);
    });
    if (blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/i, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function nativeSnapshotData(snapshot: any): any {
  try { return typeof snapshot?.data === 'function' ? snapshot.data() : (snapshot?.data || {}); }
  catch { return {}; }
}

async function writeDoc(reference: string, data: any, merge = false): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.setDocument({ reference, data, merge });
    return;
  }
  await setDoc(webDoc(reference), data, { merge });
}

async function readDoc(reference: string): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getDocument({ reference });
    return nativeSnapshotData(result?.snapshot);
  }
  const result: any = await getDoc(webDoc(reference));
  return result.exists() ? result.data() : null;
}

async function readCollection(reference: string): Promise<Array<{ id: string; data: any }>> {
  if (Capacitor.isNativePlatform()) {
    const result: any = await FirebaseFirestore.getCollection({ reference });
    return (Array.isArray(result?.snapshots) ? result.snapshots : []).map((snapshot: any) => ({
      id: String(snapshot?.id || snapshot?.documentId || snapshot?.reference?.id || ''),
      data: nativeSnapshotData(snapshot),
    })).filter((item: any) => item.id);
  }
  const result: any = await getDocs(webCollection(reference));
  return result.docs.map((item: any) => ({ id: item.id, data: item.data() }));
}

async function removeDoc(reference: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.deleteDocument({ reference });
    return;
  }
  await deleteDoc(webDoc(reference));
}

function parseMediaId(value: string): string | null {
  const raw = String(value || '');
  if (raw.startsWith('firestore-media:')) return raw.slice('firestore-media:'.length) || null;
  if (raw.startsWith('firestore:')) return raw.slice('firestore:'.length) || null;
  return raw || null;
}

export async function uploadClinicalMedia(
  file: Blob,
  path: string
): Promise<{ url: string; cloud: boolean; storagePath?: string }> {
  if (!file || file.size <= 0) throw new Error('The selected file is empty.');

  // Firebase Storage is unavailable in this project, so clinical media is stored
  // as encrypted-in-transit Firestore chunks under the same Firebase account.
  // The patient document stores only a short media reference, never the image bytes.
  const dataUrl = await fileToDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Could not encode the selected image.');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mediaId = await sha256Hex(path);
  const prefix = `workspaces/${MEDIA_WORKSPACE}/media/${mediaId}`;
  const chunks = Math.ceil(base64.length / CHUNK_SIZE);

  await writeDoc(prefix, {
    id: mediaId,
    unitId: path.split('/')[1] || '',
    patientId: path.split('/')[3] || '',
    path,
    mime: file.type || header.match(/^data:([^;]+)/)?.[1] || 'image/jpeg',
    header,
    chunks,
    size: file.size,
    updatedAt: new Date().toISOString(),
  }, false);

  for (let index = 0; index < chunks; index++) {
    const data = base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    await writeDoc(`${prefix}/chunks/${index}`, { index, data }, false);
  }

  return {
    url: `firestore-media:${mediaId}`,
    cloud: true,
    storagePath: `firestore:${mediaId}`,
  };
}

async function loadFirestoreMedia(mediaId: string): Promise<string> {
  const metadata: any = await readDoc(`workspaces/${MEDIA_WORKSPACE}/media/${mediaId}`);
  if (!metadata) throw new Error('Clinical image is no longer available in cloud storage.');

  const chunks = await readCollection(`workspaces/${MEDIA_WORKSPACE}/media/${mediaId}/chunks`);
  chunks.sort((a, b) => Number(a.data?.index ?? a.id) - Number(b.data?.index ?? b.id));
  if (chunks.length !== Number(metadata.chunks || chunks.length)) {
    throw new Error('Clinical image download is incomplete. Please run Cloud Sync again.');
  }
  return String(metadata.header || `data:${metadata.mime || 'image/jpeg'};base64`) + ',' + chunks.map(item => String(item.data?.data || '')).join('');
}

export async function resolveClinicalMediaUrl(value: string, storagePath = ''): Promise<string> {
  const mediaId = parseMediaId(storagePath) || parseMediaId(value);
  return mediaId ? loadFirestoreMedia(mediaId) : value;
}

export async function refreshClinicalMediaUrls(
  imageUrls: string[] = [],
  imageStoragePaths: string[] = []
): Promise<string[]> {
  const result: string[] = [];
  for (let index = 0; index < imageUrls.length; index++) {
    const url = imageUrls[index];
    const path = imageStoragePaths[index] || '';
    const mediaId = parseMediaId(path) || parseMediaId(url);
    if (mediaId) {
      try { result.push(await loadFirestoreMedia(mediaId)); }
      catch (error) { console.warn('Clinical media restore failed:', error); result.push(url); }
    } else {
      result.push(url);
    }
  }
  return result;
}

export async function deleteFirestoreMedia(value: string): Promise<void> {
  const mediaId = parseMediaId(value);
  if (!mediaId) return;
  const prefix = `workspaces/${MEDIA_WORKSPACE}/media/${mediaId}`;
  const chunks = await readCollection(`${prefix}/chunks`);
  for (const chunk of chunks) await removeDoc(`${prefix}/chunks/${chunk.id}`);
  try { await removeDoc(prefix); } catch {}
}
