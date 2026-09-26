import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

const PROJECT_ID = 'ccu-notebook';
const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
const FIREBASE_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MAX_BODY_BYTES = 450000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map();
let certCache = { expiresAt: 0, certs: null };

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
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

async function getFirebaseCerts() {
  const now = Date.now();
  if (certCache.certs && certCache.expiresAt > now) return certCache.certs;
  const response = await fetch(FIREBASE_CERTS_URL, { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error('Firebase signing certificates could not be loaded.');
  const certs = await response.json();
  const maxAgeMatch = /max-age=(\d+)/i.exec(response.headers.get('cache-control') || '');
  const maxAge = maxAgeMatch ? Math.max(300, Number(maxAgeMatch[1])) : 3600;
  certCache = { certs, expiresAt: now + Math.min(maxAge, 21600) * 1000 };
  return certs;
}

async function verifyFirebaseToken(token) {
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid Firebase token header.');
  const certs = await getFirebaseCerts();
  const certificate = certs[header.kid];
  if (!certificate) {
    certCache = { expiresAt: 0, certs: null };
    const refreshed = await getFirebaseCerts();
    if (!refreshed[header.kid]) throw new Error('Unknown Firebase signing key.');
    const publicKey = await importX509(refreshed[header.kid], 'RS256');
    const verified = await jwtVerify(token, publicKey, { issuer: FIREBASE_ISSUER, audience: PROJECT_ID });
    return verified.payload;
  }
  const publicKey = await importX509(certificate, 'RS256');
  const verified = await jwtVerify(token, publicKey, { issuer: FIREBASE_ISSUER, audience: PROJECT_ID });
  return verified.payload;
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

function buildPrompt(patient) {
  return `You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

Use a concise working assessment, explicitly not a confirmed diagnosis. For recommendedActions give general clinician-review actions such as stabilization, monitoring, investigations, medication reconciliation, and escalation when supported by the supplied record. Do not create medication orders. If medication therapy is discussed, require clinician verification of drug, dose, route, contraindications, interactions and local protocol. Highlight urgent safety issues and missing information. If data are insufficient, say so.

PATIENT RECORD:\n${JSON.stringify(patient)}`;
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

async function generateClinicalAnalysis(patient, apiKey) {
  const models = [...MODELS];
  let lastError = null;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(patient) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  diagnosticAnalysis: { type: 'STRING' },
                  differentialDiagnoses: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        diagnosis: { type: 'STRING' },
                        rationale: { type: 'STRING' },
                        urgency: { type: 'STRING', enum: ['routine', 'important', 'urgent'] },
                      },
                      required: ['diagnosis', 'rationale', 'urgency'],
                    },
                  },
                  recommendedActions: { type: 'ARRAY', items: { type: 'STRING' } },
                  safetyChecks: { type: 'ARRAY', items: { type: 'STRING' } },
                  missingData: { type: 'ARRAY', items: { type: 'STRING' } },
                  confidence: { type: 'STRING', enum: ['low', 'moderate', 'high'] },
                },
                required: ['diagnosticAnalysis', 'differentialDiagnoses', 'recommendedActions', 'safetyChecks', 'missingData', 'confidence'],
              },
              maxOutputTokens: 3500,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = String(payload?.error?.message || payload?.error || 'Gemini request failed.');
          lastError = new Error(`Gemini ${model} HTTP ${response.status}: ${message.slice(0, 350)}`);

          if (response.status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
            if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 1200)); continue; }
            break;
          }
          if (response.status === 500 || response.status === 502 || response.status === 503 || /high demand|temporarily unavailable|overloaded|internal server/i.test(message)) {
            if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
            break;
          }
          if (response.status === 401 || response.status === 403 || /api key|permission|unauthorized|invalid.*key/i.test(message)) {
            throw new Error('The CardioVault AI backend credentials were rejected by Gemini.');
          }
          if (response.status === 404 || /model.*(not found|unavailable|does not exist)/i.test(message)) {
            break;
          }
          throw lastError;
        }

        const raw = String(payload?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') || '').trim();
        if (!raw) throw new Error(`Gemini ${model} returned an empty clinical response.`);
        const cleaned = raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '').trim();
        return normalizeResult(JSON.parse(cleaned));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === 0 && /fetch|network|timed out|temporarily unavailable/i.test(lastError.message)) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('All Gemini AI models are temporarily unavailable. Please try again later.');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return optionsResponse();
    if (request.method !== 'POST') return json({ error: 'POST required.' }, 405);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return json({ error: 'Patient record is too large for AI analysis.' }, 413);

    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return json({ error: 'Authentication required.' }, 401);

    let decoded;
    try {
      decoded = await verifyFirebaseToken(token);
    } catch (error) {
      console.error('Firebase token verification failed:', String(error?.message || error).slice(0, 300));
      return json({ error: 'Firebase authentication token is invalid or expired.' }, 401);
    }

    const uid = String(decoded.sub || '');
    if (!uid) return json({ error: 'Firebase authentication token has no user id.' }, 401);
    if (!allowRate(uid)) return json({ error: 'AI request limit reached. Please wait a moment and try again.' }, 429);

    let body;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: 'Patient record is too large for AI analysis.' }, 413);
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Invalid JSON request.' }, 400);
    }

    try {
      if (!env.GEMINI_API_KEY) return json({ error: 'CardioVault AI backend is not configured yet.' }, 503);
      const patient = compactPatient(body?.patient);
      const result = await generateClinicalAnalysis(patient, env.GEMINI_API_KEY);
      return json(result, 200);
    } catch (error) {
      const message = String(error?.message || error || 'AI request failed');
      console.error('CardioVault AI request failed:', message.slice(0, 500));
      if (/JSON|Unexpected token|parse/i.test(message)) return json({ error: 'Gemini returned an invalid clinical response. Please re-analyze.' }, 502);
      return json({ error: message.slice(0, 400) }, 502);
    }
  },
};
