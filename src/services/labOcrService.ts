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
  const result = await worker.recognize(image, {}, onProgress as never);
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
