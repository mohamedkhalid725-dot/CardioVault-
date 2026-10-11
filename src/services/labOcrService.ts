// On-device lab-report OCR (free, no quota, works offline after first model load).
// Uses tesseract.js with the English trained data because printed lab reports
// are Latin script + digits. Runs in the WebView, so it works on web staging
// builds and inside the native APK without any native plugin or Capacitor upgrade.
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng').catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

// True when the current runtime can run the OCR worker at all.
export function isLabOcrSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof fetch !== 'undefined';
}

export interface LabOcrProgress {
  status: string;
  progress: number;
}

// Upscale 2x and grayscale through canvas so watermarks and small print
// survive Tesseract better. Falls back to the original blob when canvas
// is unavailable (for example Node tests).
async function preprocessImage(image: Blob): Promise<Blob> {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return image;
    const bitmap = await createImageBitmap(image);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    (ctx as CanvasRenderingContext2D & { imageSmoothingEnabled: boolean }).imageSmoothingEnabled = true;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = data.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      // Gentle contrast lift: printed lab text is dark on white.
      const lifted = gray < 160 ? Math.max(0, gray - 15) : Math.min(255, gray + 10);
      pixels[i] = lifted;
      pixels[i + 1] = lifted;
      pixels[i + 2] = lifted;
    }
    ctx.putImageData(data, 0, 0);
    bitmap.close?.();
    const out: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return out || image;
  } catch {
    return image;
  }
}

// Recognize printed text in a lab-report image. Returns raw text only;
// structuring into results is done by labResultParser, never guessed here.
export async function recognizeLabImage(
  image: Blob,
  onProgress?: (progress: LabOcrProgress) => void,
): Promise<{ text: string }> {
  if (!isLabOcrSupported()) {
    throw new Error('On-device text recognition is not available in this browser.');
  }
  const worker = await getWorker();
  const clean = await preprocessImage(image);
  const result = await worker.recognize(clean, {}, onProgress as never);
  const text = String(result?.data?.text || '').trim();
  if (!text) {
    throw new Error('No readable text was found in the image. Please take a clearer photo.');
  }
  return { text };
}

// Release the cached worker (call when leaving the lab flow on low-end devices).
export async function releaseLabOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  if (worker) await worker.terminate().catch(() => {});
}
