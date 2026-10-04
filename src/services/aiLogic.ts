import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { getRemoteConfig, fetchAndActivate, getString, setConfigSettings, setDefaults } from 'firebase/remote-config';
import { firebaseApp } from './webFirebase';
import { AI_CLIENT_RATE_LIMIT, AI_CLIENT_RATE_WINDOW_MS, AI_DATA_WARNING_PLACEHOLDER, AI_FALLBACK_MODEL, AI_IMAGE_JPEG_QUALITY, AI_IMAGE_MAX_DIMENSION, AI_MAX_RETRIES, AI_MODEL, AI_REMOTE_CONFIG_FALLBACK_KEY, AI_RETRY_DELAYS_MS, AI_TEST_DATA_ONLY } from '../config/aiConfig';

export { AI_DATA_WARNING_PLACEHOLDER };

let appCheckPromise: Promise<void> | null = null;
const requestTimes: number[] = [];
export async function initializeCardioVaultAppCheck(): Promise<void> {
  if (!appCheckPromise) {
    appCheckPromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAppCheck.initialize({
          debugToken: import.meta.env.VITE_AI_APPCHECK_DEBUG === 'true',
          isTokenAutoRefreshEnabled: true,
        });
        return;
      }
      const siteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY || '').trim();
      if (!siteKey) {
        throw new Error('Firebase App Check web setup is incomplete. Add the reCAPTCHA Enterprise site key in the Firebase configuration.');
      }
      if (import.meta.env.VITE_AI_APPCHECK_DEBUG === 'true') {
        (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })().catch((error) => {
      appCheckPromise = null;
      throw error;
    });
  }
  return appCheckPromise;
}

function assertClientRateLimit(): void {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - AI_CLIENT_RATE_WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= AI_CLIENT_RATE_LIMIT) {
    throw new Error('AI request limit reached. Maximum ' + AI_CLIENT_RATE_LIMIT + ' requests per minute on this device.');
  }
  requestTimes.push(now);
}

let remoteFallbackPromise: Promise<string> | null = null;

async function getRemoteFallbackModel(): Promise<string> {
  if (!remoteFallbackPromise) {
    remoteFallbackPromise = (async () => {
      const remoteConfig = getRemoteConfig(firebaseApp);
      setConfigSettings(remoteConfig, { minimumFetchIntervalMillis: 60 * 60 * 1000, fetchTimeoutMillis: 5000 });
      setDefaults(remoteConfig, { [AI_REMOTE_CONFIG_FALLBACK_KEY]: AI_FALLBACK_MODEL });
      try { await fetchAndActivate(remoteConfig); } catch { /* keep the safe in-app default */ }
      const configured = getString(remoteConfig, AI_REMOTE_CONFIG_FALLBACK_KEY).trim();
      return configured === AI_FALLBACK_MODEL ? configured : AI_FALLBACK_MODEL;
    })().catch(() => AI_FALLBACK_MODEL);
  }
  return remoteFallbackPromise;
}

function getModel(modelName: string = AI_MODEL) {
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
}

function getHttpStatus(error: unknown): number | null {
  const e = error as any;
  const candidates = [e?.status, e?.statusCode, e?.httpStatus, e?.response?.status];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (n === 401 || n === 403 || n === 429 || n === 500 || n === 503) return n;
  }
  const text = String(e?.message || e?.code || error || '');
  const match = text.match(/\\b(401|403|429|500|503)\\b/);
  return match ? Number(match[1]) : null;
}

function friendlyAIError(error: unknown): Error {
  const status = getHttpStatus(error);
  if (status === 401 || status === 403) return new Error('AI access was denied. Please check App Check and sign-in, then try again.');
  if (status === 429) return new Error('AI is temporarily rate-limited. Please wait a little and try again.');
  if (status === 500 || status === 503) return new Error('The AI service is temporarily unavailable. Please try again in a moment.');
  return new Error('AI analysis could not be completed. Please try again.');
}

async function generateOnce(parts: any[], modelName: string): Promise<string> {
  const result = await getModel(modelName).generateContent(parts);
  return result.response.text();
}

async function generate(parts: any[]): Promise<string> {
  await initializeCardioVaultAppCheck();
  assertClientRateLimit();

  let lastError: unknown = null;
  for (let retry = 0; retry <= AI_MAX_RETRIES; retry += 1) {
    try {
      return await generateOnce(parts, AI_MODEL);
    } catch (error) {
      lastError = error;
      const status = getHttpStatus(error);
      if (status !== 500 && status !== 503) throw friendlyAIError(error);
      if (retry < AI_MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, AI_RETRY_DELAYS_MS[retry]));
      }
    }
  }

  // Firebase's AI Logic guidance recommends Remote Config for changing the
  // model name without shipping a new app version. The fallback is deliberately
  // restricted to the documented stable Gemini 3.5 Flash model; Gemini 2.5 is
  // never accepted here.
  try {
    const fallbackModel = await getRemoteFallbackModel();
    return await generateOnce(parts, fallbackModel);
  } catch (fallbackError) {
    throw friendlyAIError(lastError || fallbackError);
  }
}

async function compressLabImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : null;
    if (!bitmap) return file;
    const scale = Math.min(1, AI_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', AI_IMAGE_JPEG_QUALITY));
    return compressed && compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the AI input file.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',').pop() || '' : value);
    };
    reader.readAsDataURL(blob);
  });
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '').replace(/\s*\`\`\`$/i, '');
  try { return JSON.parse(cleaned) as T; } catch { throw new Error('AI returned an invalid structured response. Please try again.'); }
}

async function generate(parts: any[]): Promise<string> {
  await initializeCardioVaultAppCheck();
  assertClientRateLimit();
  const result = await getModel().generateContent(parts);
  return result.response.text();
}

export interface ExtractedLabResult {
  testName: string;
  value: string | number;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'low' | 'high' | 'critical' | 'unknown';
}

export async function analyzeLabImage(file: Blob): Promise<{ panel: string; results: ExtractedLabResult[]; notes: string[] }> {
  if (!file.type.startsWith('image/')) throw new Error('Please select a laboratory image.');
  const preparedFile = await compressLabImage(file);
  if (preparedFile.size > 15 * 1024 * 1024) throw new Error('The lab image is still too large after compression. Please choose a smaller image.');
  const data = await blobToBase64(preparedFile);
  const prompt = [
    'You are CardioVault laboratory OCR and transcription assistant.',
    'Read ONLY the laboratory report visible in the supplied image.',
    'Do not infer or invent missing values. If a field is unreadable, omit it and mention it in notes.',
    'Return JSON only with: panel, results[], notes[].',
    'Each result must contain testName, value, unit, referenceRange, status.',
    'status must be normal, low, high, critical, or unknown. Use the report reference range when available; do not substitute a guessed reference range.',
    'Do not identify or reproduce any patient name, national ID, MRN, address, phone number, or other identifier from the image.',
    'This is a test-data-only development build. Do not provide diagnosis or treatment advice.',
  ].join('\n');
  const raw = await generate([{ inlineData: { data, mimeType: preparedFile.type || 'image/jpeg' } }, prompt]);
  return parseJson(raw);
}

export async function transcribeMedicalVoice(audio: Blob): Promise<{ transcription: string; medicalEnglish: string; notes: string[] }> {
  const mimeType = audio.type || 'audio/webm';
  const supported = ['audio/aac','audio/flac','audio/mp3','audio/m4a','audio/mpeg','audio/mpga','audio/mp4','audio/opus','audio/pcm','audio/wav','audio/webm'];
  if (!supported.some((x) => mimeType.toLowerCase().startsWith(x))) throw new Error('Unsupported audio format: ' + mimeType);
  if (audio.size > 15 * 1024 * 1024) throw new Error('The voice recording is too large. Please record a shorter note.');
  const data = await blobToBase64(audio);
  const prompt = [
    'You are CardioVault medical voice transcription assistant.',
    'First transcribe exactly what is spoken, including Arabic-English clinical terms as heard.',
    'Then convert the transcription into concise professional medical English without adding facts.',
    'Do not invent diagnoses, medications, doses, vitals, laboratory results, or chronology.',
    'If a phrase is unclear, mark it as [unclear] rather than guessing.',
    'Return JSON only with transcription, medicalEnglish, notes[].',
    'Do not identify or reproduce any patient name, national ID, MRN, address, phone number, or other identifier.',
    'This is a test-data-only development build.',
  ].join('\n');
  const raw = await generate([{ inlineData: { data, mimeType } }, prompt]);
  return parseJson(raw);
}

export function aiUsesTestDataOnly(): boolean { return AI_TEST_DATA_ONLY; }
