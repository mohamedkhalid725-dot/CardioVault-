import { uploadMediaToStorage } from './webFirebase';

const withTimeout = <T,>(promise: Promise<T>, timeoutMs = 30000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Cloud media upload timed out.')), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });

export async function fileToDataUrl(file: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadClinicalMedia(file: Blob, path: string): Promise<{url:string; cloud:boolean}> {
  try {
    const url = await withTimeout(uploadMediaToStorage(file, path), 30000);
    return { url, cloud: true };
  } catch (error) {
    console.warn('Firebase Storage upload failed or timed out; keeping a local copy instead.', error);
    return { url: await fileToDataUrl(file), cloud: false };
  }
}
