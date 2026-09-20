import { uploadMediaToStorage } from './webFirebase';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function uploadWithRetry(file: Blob, path: string): Promise<string> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Never leave the UI stuck on "Uploading…" if Firebase Storage/network
      // does not settle its request (especially on mobile browsers).
      return await withTimeout(uploadMediaToStorage(file, path), 20000, 'Firebase Storage upload timed out. Check your internet connection and try again.');
    } catch (error) {
      last = error;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  throw last instanceof Error ? last : new Error('Clinical media upload failed.');
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepare camera/gallery images before upload.
 *
 * Phone camera images can be 4–12 MB. We keep a clinically useful
 * resolution but resize/compress them locally before Firebase Storage.
 * The fallback path uses an HTMLImageElement because some Android
 * WebViews cannot decode every camera format through createImageBitmap.
 */
export const isClinicalImageFile = (file: File) => /^image\//i.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);

export async function optimizeClinicalImage(file: File): Promise<File> {
  if (!file || file.size <= 0) throw new Error('The selected image is empty.');
  if (!isClinicalImageFile(file) || file.size <= 900 * 1024) return file;

  const maxDimension = 2048;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  let bitmap: ImageBitmap | null = null;
  let objectUrl = '';

  try {
    if ('createImageBitmap' in window) {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        draw = (ctx, width, height) => ctx.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
      } catch {
        bitmap = null;
      }
    }

    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Could not decode the selected image on this device.'));
        element.src = objectUrl;
      });
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
      canvas.toBlob(
        result => result
          ? resolve(result)
          : reject(new Error('Could not compress image.')),
        'image/jpeg',
        0.82
      );
    });

    // Never replace a file with a larger compressed version.
    if (blob.size >= file.size) return file;

    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/i, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Clinical media is persisted in Firebase Storage, not as base64 in Firestore.
 * Uploads remain cloud-backed so they survive reload/sync.
 */
export async function uploadClinicalMedia(
  file: Blob,
  path: string
): Promise<{ url: string; cloud: true }> {
  if (!file || file.size <= 0) throw new Error('The selected file is empty.');
  const url = await uploadWithRetry(file, path);
  if (!url) throw new Error('Firebase Storage returned no download URL.');
  return { url, cloud: true };
}
