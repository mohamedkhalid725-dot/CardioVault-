import { Patient } from '../types/clinical';
import { fileToDataUrl } from './mediaStorage';

export interface MedicalVoiceRecordResult {
  context?: string;
  transcription: string;
  medicalText?: string;
  confidence?: number;
  uncertainItems?: string[];
  detectedLanguage?: 'English' | 'Arabic' | 'Mixed';
  clinicalNote: {
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    pastMedicalHistory?: string;
    pastSurgicalHistory?: string;
    drugHistory?: string;
    allergies?: string;
    examination?: string;
    vitalSigns?: {
      sbp?: number | null;
      dbp?: number | null;
      hr?: number | null;
      rr?: number | null;
      spo2?: number | null;
      temp?: number | null;
      gcs?: number | null;
      pain?: number | null;
      notes?: string;
    };
    investigations?: string[];
    ecg?: string;
    echo?: string;
    laboratoryResults?: Array<{
      name: string;
      value: string;
      unit?: string;
      referenceRange?: string;
    }>;
    medications?: Array<{
      name: string;
      dose?: string;
      route?: string;
      frequency?: string;
      status?: string;
    }>;
    assessment?: string;
    diagnosis?: string;
    plan?: string;
    progressNote?: string;
  };
  uncertainties?: string[];
}

export interface LabAnalysisTestItem {
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'Normal' | 'High' | 'Low' | 'Critical' | 'Abnormal' | 'Unknown';
  confidence: number;
  isUncertain?: boolean;
}

export interface LabAnalysisResult {
  patientName?: string | null;
  reportDate?: string | null;
  reportTime?: string | null;
  laboratoryName?: string | null;
  panelName: string;
  imageQuality: 'good' | 'acceptable' | 'blurry' | 'partially_unreadable';
  qualityNotes?: string;
  tests: LabAnalysisTestItem[];
  interpretationSummary?: string;
}

/**
 * Sends recorded audio to server-side AI pipeline for verbatim transcription and medical structuring.
 * Supports English, Arabic, and mixed Arabic/English clinical speech.
 */
export async function processMedicalVoiceRecord(
  audioBlob: Blob,
  patient?: Patient,
  clinician?: { name: string; role: string },
  signal?: AbortSignal,
  context?: string
): Promise<MedicalVoiceRecordResult> {
  if (!audioBlob || audioBlob.size <= 0) {
    throw new Error('Recorded audio file is empty or corrupted.');
  }

  // Convert audio blob to base64 Data URL
  const audioDataUrl = await fileToDataUrl(audioBlob);
  const mimeType = audioBlob.type || 'audio/webm';

  const baseEndpoint = String(import.meta.env.VITE_CARDIOVAULT_AI_ENDPOINT || '').replace(/\/$/, '');
  const endpoint = baseEndpoint ? `${baseEndpoint}/voice-record` : '/api/ai/voice-record';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioBase64: audioDataUrl,
      mimeType,
      context,
      patient: patient
        ? {
            id: patient.id,
            fullName: patient.fullName,
            age: patient.age,
            primaryDiagnosis: patient.primaryDiagnosis,
            medications: patient.medications,
          }
        : null,
      clinician,
    }),
    signal,
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson?.error || '';
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(errorDetail || `Voice processing failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response structure from medical voice processing engine.');
  }

  return {
    context: data.context || context || 'progressNote',
    transcription: String(data.transcription || ''),
    medicalText: String(data.medicalText || data.clinicalNote?.progressNote || data.transcription || ''),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.95,
    uncertainItems: Array.isArray(data.uncertainItems) ? data.uncertainItems.map(String) : Array.isArray(data.uncertainties) ? data.uncertainties.map(String) : [],
    detectedLanguage: data.detectedLanguage || 'English',
    clinicalNote: data.clinicalNote || {},
    uncertainties: Array.isArray(data.uncertainties) ? data.uncertainties.map(String) : [],
  };
}

/**
 * Sends laboratory report image to server-side AI pipeline for optical recognition and structured extraction.
 * Preserves exact numerical values, decimals, reference ranges, and test statuses.
 */
export async function analyzeLabReportImage(
  imageBlob: Blob,
  patientNameHint?: string,
  clinician?: { name: string; role: string },
  signal?: AbortSignal
): Promise<LabAnalysisResult> {
  if (!imageBlob || imageBlob.size <= 0) {
    throw new Error('Selected image is empty.');
  }

  const imageDataUrl = await fileToDataUrl(imageBlob);
  const mimeType = imageBlob.type || 'image/jpeg';

  const baseEndpoint = String(import.meta.env.VITE_CARDIOVAULT_AI_ENDPOINT || '').replace(/\/$/, '');
  const endpoint = baseEndpoint ? `${baseEndpoint}/analyze-lab` : '/api/ai/analyze-lab';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: imageDataUrl,
      mimeType,
      patientNameHint,
      clinician,
    }),
    signal,
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson?.error || '';
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(errorDetail || `Laboratory analysis failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response structure from laboratory image analysis engine.');
  }

  const rawTests = Array.isArray(data.tests) ? data.tests : [];
  const tests: LabAnalysisTestItem[] = rawTests.map((t: any) => ({
    testName: String(t.testName || t.name || 'Laboratory Test').trim(),
    value: String(t.value ?? '').trim(),
    unit: String(t.unit || '').trim(),
    referenceRange: String(t.referenceRange || '').trim(),
    status: (['Normal', 'High', 'Low', 'Critical', 'Abnormal', 'Unknown'].includes(t.status)
      ? t.status
      : 'Normal') as LabAnalysisTestItem['status'],
    confidence: typeof t.confidence === 'number' ? Math.min(100, Math.max(0, Math.round(t.confidence))) : 90,
    isUncertain: !!t.isUncertain,
  })).filter(t => t.testName && t.value);

  return {
    patientName: data.patientName ? String(data.patientName).trim() : null,
    reportDate: data.reportDate ? String(data.reportDate).trim() : null,
    reportTime: data.reportTime ? String(data.reportTime).trim() : null,
    laboratoryName: data.laboratoryName ? String(data.laboratoryName).trim() : null,
    panelName: String(data.panelName || 'General Laboratory').trim(),
    imageQuality: (['good', 'acceptable', 'blurry', 'partially_unreadable'].includes(data.imageQuality)
      ? data.imageQuality
      : 'good') as LabAnalysisResult['imageQuality'],
    qualityNotes: data.qualityNotes ? String(data.qualityNotes).trim() : '',
    tests,
    interpretationSummary: data.interpretationSummary ? String(data.interpretationSummary).trim() : '',
  };
}
