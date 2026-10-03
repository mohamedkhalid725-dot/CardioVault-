import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { firebaseApp } from './webFirebase';
import { AI_MAX_REQUESTS_PER_MINUTE, AI_MODEL, AI_TEST_MODE } from '../config/ai';

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, {
  model: AI_MODEL,
  generationConfig: {
    temperature: 0.1,
  },
});

let requestTimes: number[] = [];

function rateLimit() {
  const now = Date.now();
  requestTimes = requestTimes.filter((t) => now - t < 60_000);
  if (requestTimes.length >= AI_MAX_REQUESTS_PER_MINUTE) {
    throw new Error('AI request limit reached. Please wait a moment and try again.');
  }
  requestTimes.push(now);
}

function ensureTestMode() {
  if (!AI_TEST_MODE) return;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\b(?:patient|name|full\s*name|mrn|national\s*id|nid)\s*[:=-].*$/gim, '').trim();
}

export async function analyzeLabImage(image: Blob) {
  ensureTestMode();
  rateLimit();
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const prompt = [
    'You are a laboratory transcription assistant for a physician.',
    'Analyze ONLY the laboratory report image supplied below.',
    'Do not infer or invent values. If a field is unreadable, return "not documented".',
    'Do not identify the patient and do not output any patient name, MRN, national ID, address, phone number, or other identifier even if visible.',
    'Return a JSON array of tests with: panel, testName, value, unit, referenceRange, status.',
    'status must be normal, low, high, critical, or not documented.',
    'This is a transcription/extraction task, not a diagnosis or treatment recommendation.',
  ].join('\n');
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType: image.type || 'image/jpeg' } },
  ]);
  const text = result.response.text().trim();
  try {
    const parsed = JSON.parse(text.replace(/^\`\`\`json\s*/i, '').replace(/\s*\`\`\`$/i, ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('AI returned an invalid laboratory result. Please re-analyze.');
  }
}

export async function transcribeClinicalAudio(audio: Blob) {
  ensureTestMode();
  rateLimit();
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const prompt = [
    'Transcribe this clinician voice note and convert it into professional medical English.',
    'Preserve only information actually spoken. Do not invent diagnoses, medications, doses, laboratory values, dates, or findings.',
    'If something is unclear, write "not documented".',
    'Do not output or infer patient name, MRN, national ID, address, phone number, or other patient identifier.',
    'Return concise clinical documentation suitable for review before saving.',
  ].join('\n');
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType: audio.type || 'audio/aac' } },
  ]);
  return cleanText(result.response.text());
}

export async function generatePatientSummary(source: Record<string, unknown>) {
  ensureTestMode();
  rateLimit();
  const safe = { ...source };
  delete safe.fullName;
  delete safe.name;
  delete safe.mrn;
  delete safe.nationalId;
  delete safe.patientName;
  const result = await model.generateContent([
    'Generate 3-5 short professional medical English lines summarizing ONLY the saved clinical data supplied below.',
    'Never invent or infer missing information. For missing information say "not documented".',
    'Do not include patient identifiers.',
    JSON.stringify(safe),
  ]);
  return result.response.text().trim();
}
