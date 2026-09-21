const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { GoogleGenAI } = require('@google/genai');

initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const MODEL = 'gemini-3.8-flash';
const MAX_BODY_BYTES = 450000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map();

function json(res, status, body) {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function extractBearer(req) {
  const header = String(req.get('authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requestSize(req) {
  const value = Number(req.get('content-length') || 0);
  return Number.isFinite(value) ? value : 0;
}

function allowRate(uid) {
  const now = Date.now();
  const previous = requestWindows.get(uid) || [];
  const active = previous.filter(timestamp => now - timestamp < WINDOW_MS);
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(uid, active);
    return false;
  }
  active.push(now);
  requestWindows.set(uid, active);
  if (requestWindows.size > 5000) {
    for (const [key, timestamps] of requestWindows) {
      if (!timestamps.some(timestamp => now - timestamp < WINDOW_MS)) requestWindows.delete(key);
    }
  }
  return true;
}

function compactPatient(patient) {
  if (!patient || typeof patient !== 'object') throw new Error('Patient record is required.');
  return {
    demographics: {
      age: patient.age,
      sex: patient.sex,
      weight: patient.weight,
      height: patient.height,
      allergies: patient.allergies,
      codeStatus: patient.codeStatus,
    },
    admission: {
      primaryDiagnosis: patient.primaryDiagnosis,
      secondaryDiagnoses: patient.secondaryDiagnoses,
      date: patient.admissionDate,
      time: patient.admissionTime,
    },
    history: patient.clinicalSummary,
    cardiovascularHistory: patient.cardiovascularHistory,
    latestVitals: Array.isArray(patient.vitalsHistory) ? patient.vitalsHistory.slice(0, 5) : [],
    latestABG: Array.isArray(patient.ventilator?.abgHistory) ? patient.ventilator.abgHistory.slice(0, 3) : [],
    cardiology: patient.cardiology,
    activeMedications: Array.isArray(patient.medications)
      ? patient.medications.filter(m => !m.status || m.status === 'Active' || m.status === 'Held').slice(0, 40)
      : [],
    labs: Array.isArray(patient.labResults) ? patient.labResults.slice(0, 60) : [],
    laboratoryPanels: Array.isArray(patient.labs) ? patient.labs.slice(0, 3) : [],
    imaging: Array.isArray(patient.imaging) ? patient.imaging.slice(0, 10) : [],
    procedures: Array.isArray(patient.procedures) ? patient.procedures.slice(0, 10) : [],
    progressNotes: Array.isArray(patient.progressNotes) ? patient.progressNotes.slice(0, 8) : [],
  };
}

function buildPrompt(patient, assistantTask, userPrompt, draftType) {
  return `You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

Use a concise working assessment, explicitly not a confirmed diagnosis. For recommendedActions give general clinician-review actions such as stabilization, monitoring, investigations, medication reconciliation, and escalation when supported by the supplied record. Do not create medication orders. If medication therapy is discussed, require clinician verification of drug, dose, route, contraindications, interactions and local protocol. Highlight urgent safety issues and missing information. If data are insufficient, say so.

PATIENT RECORD:\n${JSON.stringify(patient)}\n\nASSISTANT TASK: ${String(assistantTask || 'summary')}\nDRAFT TYPE: ${String(draftType || '')}\nCLINICIAN QUESTION: ${String(userPrompt || '')}`;
}

function normalizeResult(data) {
  return {
    diagnosticAnalysis: String(data?.diagnosticAnalysis || data?.analysis || 'No clinical synthesis returned.'),
    differentialDiagnoses: Array.isArray(data?.differentialDiagnoses)
      ? data.differentialDiagnoses.map(d => ({
          diagnosis: String(d?.diagnosis || ''),
          rationale: String(d?.rationale || ''),
          urgency: ['routine', 'important', 'urgent'].includes(d?.urgency) ? d.urgency : 'routine',
        })).filter(d => d.diagnosis)
      : [],
    recommendedActions: Array.isArray(data?.recommendedActions) ? data.recommendedActions.map(String).filter(Boolean) : [],
    safetyChecks: Array.isArray(data?.safetyChecks) ? data.safetyChecks.map(String).filter(Boolean) : [],
    missingData: Array.isArray(data?.missingData) ? data.missingData.map(String).filter(Boolean) : [],
    confidence: ['low', 'moderate', 'high'].includes(data?.confidence) ? data.confidence : 'moderate',
  };
}

exports.analyzeClinicalPatient = onRequest(
  {
    region: 'us-central1',
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return json(res, 405, { error: 'POST required.' });
    if (requestSize(req) > MAX_BODY_BYTES) return json(res, 413, { error: 'Patient record is too large for AI analysis.' });

    const token = extractBearer(req);
    if (!token) return json(res, 401, { error: 'Authentication required.' });

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch {
      return json(res, 401, { error: 'Firebase authentication token is invalid or expired.' });
    }

    if (!allowRate(decoded.uid)) return json(res, 429, { error: 'AI request limit reached. Please wait a moment and try again.' });

    try {
      const patient = compactPatient(req.body?.patient);
      const key = String(geminiApiKey.value() || '').trim();
      if (!key) return json(res, 503, { error: 'CardioVault AI backend is not configured yet.' });

      const ai = new GoogleGenAI({ apiKey: key, apiVersion: 'v1' });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: buildPrompt(patient, req.body?.assistantTask, req.body?.userPrompt, req.body?.draftType),
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 5000,
        },
      });

      const raw = String(response.text || '').trim();
      if (!raw) return json(res, 502, { error: 'Gemini returned an empty clinical response.' });
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const result = normalizeResult(JSON.parse(cleaned));
      return json(res, 200, result);
    } catch (error) {
      const message = String(error?.message || error || 'AI request failed');
      console.error('CardioVault AI request failed:', message.slice(0, 500));
      if (/quota|429|rate.?limit|resource.?exhausted/i.test(message)) return json(res, 429, { error: 'Gemini request limit was reached. Wait a moment and try again.' });
      if (/api key|401|403|permission|unauthorized|invalid.*key|invalid.*credential/i.test(message)) return json(res, 502, { error: 'The CardioVault AI backend credentials were rejected by Gemini.' });
      if (/model.*(not found|unavailable|does not exist)|not found.*model|404|resource.*not found/i.test(message)) return json(res, 502, { error: 'The configured Gemini model is not available for this project.' });
      if (/json|unexpected token|parse/i.test(message)) return json(res, 502, { error: 'Gemini returned an invalid clinical response. Please re-analyze.' });
      return json(res, 502, { error: 'CardioVault AI could not complete the analysis.' });
    }
  }
);
