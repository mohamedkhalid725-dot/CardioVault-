import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './webFirebase';
import { AI_CLIENT_RATE_LIMIT, AI_CLIENT_RATE_WINDOW_MS, AI_DATA_WARNING_PLACEHOLDER, AI_MODEL, AI_TEST_DATA_ONLY } from '../config/aiConfig';

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
        throw new Error('Firebase App Check web setup is incomplete. Add the reCAPTCHA v3 site key in the Firebase configuration.');
      }
      if (import.meta.env.VITE_AI_APPCHECK_DEBUG === 'true') {
        (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(siteKey),
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

function getModel() {
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: AI_MODEL,
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
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
  if (file.size > 15 * 1024 * 1024) throw new Error('The lab image is too large. Please use an image under 15 MB.');
  const data = await blobToBase64(file);
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
  const raw = await generate([{ inlineData: { data, mimeType: file.type } }, prompt]);
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
