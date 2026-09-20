import { uploadMediaToStorage } from './webFirebase';

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
    const url = await uploadMediaToStorage(file, path);
    return { url, cloud: true };
  } catch (error) {
    console.warn('Firebase Storage upload failed; keeping a local copy instead.', error);
    return { url: await fileToDataUrl(file), cloud: false };
  }
}
