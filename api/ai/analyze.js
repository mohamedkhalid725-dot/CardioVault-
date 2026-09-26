import { importX509, jwtVerify } from 'jose';

const PROJECT_ID = 'ccu-notebook';
const FIREBASE_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MODEL = 'gemini-3.8-flash';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

let certCache = { expiresAt: 0, certs: null };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

function send(res, status, body) {
  cors(res);
  res.status(status).json(body);
}

async function firebaseCerts() {
  const now = Date.now();
  if (certCache.certs && certCache.expiresAt > now) return certCache.certs;
  const r = await fetch(FIREBASE_CERTS_URL);
  if (!r.ok) throw new Error('Firebase signing certificates unavailable.');
  const certs = await r.json();
  const maxAge = Number((/max-age=(\d+)/i.exec(r.headers.get('cache-control') || '') || [])[1] || 3600);
  certCache = { certs, expiresAt: now + Math.min(Math.max(maxAge, 300), 21600) * 1000 };
  return certs;
}

async function verifyFirebaseToken(token) {
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid Firebase token.');
  let certs = await firebaseCerts();
  let cert = certs[header.kid];
  if (!cert) {
    certCache = { expiresAt: 0, certs: null };
    certs = await firebaseCerts();
    cert = certs[header.kid];
  }
  if (!cert) throw new Error('Unknown Firebase signing key.');
  const key = await importX509(cert, 'RS256');
  const verified = await jwtVerify(token, key, { issuer: FIREBASE_ISSUER, audience: PROJECT_ID });
  return verified.payload;
}

function compactPatient(patient) {
  if (!patient || typeof patient !== 'object') throw new Error('Patient record is required.');
  return {
    demographics: { age:patient.age, sex:patient.sex, weight:patient.weight, height:patient.height, allergies:patient.allergies, codeStatus:patient.codeStatus },
    admission: { primaryDiagnosis:patient.primaryDiagnosis, secondaryDiagnoses:patient.secondaryDiagnoses, date:patient.admissionDate, time:patient.admissionTime },
    history: patient.clinicalSummary,
    cardiovascularHistory: patient.cardiovascularHistory,
    latestVitals: Array.isArray(patient.vitalsHistory) ? patient.vitalsHistory.slice(0,5) : [],
    latestABG: Array.isArray(patient.ventilator?.abgHistory) ? patient.ventilator.abgHistory.slice(0,3) : [],
    cardiology: patient.cardiology,
    activeMedications: Array.isArray(patient.medications) ? patient.medications.filter(m=>!m.status||m.status==='Active'||m.status==='Held').slice(0,40) : [],
    labs: Array.isArray(patient.labResults) ? patient.labResults.slice(0,60) : [],
    laboratoryPanels: Array.isArray(patient.labs) ? patient.labs.slice(0,3) : [],
    imaging: Array.isArray(patient.imaging) ? patient.imaging.slice(0,10) : [],
    procedures: Array.isArray(patient.procedures) ? patient.procedures.slice(0,10) : [],
    progressNotes: Array.isArray(patient.progressNotes) ? patient.progressNotes.slice(0,8) : [],
  };
}

function prompt(patient, task, question, draftType) {
  return `You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

Use a concise working assessment, explicitly not a confirmed diagnosis. Recommended actions are clinician-review suggestions only. Do not create medication orders. Highlight urgent safety issues and missing information.

PATIENT RECORD:
${JSON.stringify(patient)}

ASSISTANT TASK: ${String(task || 'summary')}
DRAFT TYPE: ${String(draftType || '')}
CLINICIAN QUESTION: ${String(question || '')}`;
}

function normalize(data) {
  return {
    diagnosticAnalysis: String(data?.diagnosticAnalysis || data?.analysis || 'No clinical synthesis returned.'),
    differentialDiagnoses: Array.isArray(data?.differentialDiagnoses) ? data.differentialDiagnoses.map(d=>({diagnosis:String(d?.diagnosis||''),rationale:String(d?.rationale||''),urgency:['routine','important','urgent'].includes(d?.urgency)?d.urgency:'routine'})).filter(d=>d.diagnosis) : [],
    recommendedActions: Array.isArray(data?.recommendedActions) ? data.recommendedActions.map(String).filter(Boolean) : [],
    safetyChecks: Array.isArray(data?.safetyChecks) ? data.safetyChecks.map(String).filter(Boolean) : [],
    missingData: Array.isArray(data?.missingData) ? data.missingData.map(String).filter(Boolean) : [],
    confidence: ['low','moderate','high'].includes(data?.confidence) ? data.confidence : 'moderate',
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });

  const auth = String(req.headers.authorization || '');
  const headerToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bodyToken = String(req.body?.firebaseIdToken || '').trim();
  const token = headerToken || bodyToken;
  if (!token) return send(res, 401, { error: 'Authentication required.' });

  let decoded;
  try { decoded = await verifyFirebaseToken(token); }
  catch { return send(res, 401, { error: 'Firebase authentication token is invalid or expired.' }); }

  const body = req.body || {};
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) return send(res, 413, { error: 'Patient record is too large for AI analysis.' });

  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) return send(res, 503, { error: 'CardioVault AI backend is not configured on Vercel.' });

  try {
    const patient = compactPatient(body.patient);
    const parts = [{ text: prompt(patient, body.assistantTask, body.userPrompt, body.draftType) }];
    const image = String(body.imageBase64 || '').trim();
    if (image) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return send(res, 400, { error: 'Invalid AI image attachment format.' });
      const mimeType = String(match[1]).toLowerCase();
      if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/.test(mimeType)) return send(res, 400, { error: 'Unsupported AI image format.' });
      parts.push({ inline_data: { mime_type: mimeType, data: match[2] } });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 5000 },
      }),
    });

    const payload = await response.json().catch(()=>({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || payload?.error || 'Gemini request failed.');
      if (response.status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) return send(res, 429, { error: 'Gemini request limit was reached. Wait a moment and try again.' });
      if (response.status === 401 || response.status === 403 || /api key|permission|unauthorized|invalid.*key/i.test(message)) return send(res, 502, { error: 'The CardioVault AI backend credentials were rejected by Gemini.' });
      return send(res, 502, { error: `Gemini request failed: ${message.slice(0,300)}` });
    }

    const raw = String(payload?.candidates?.[0]?.content?.parts?.map(p=>p?.text||'').join('') || '').trim();
    if (!raw) return send(res, 502, { error: 'Gemini returned an empty clinical response.' });
    const cleaned = raw.replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
    return send(res, 200, normalize(JSON.parse(cleaned)));
  } catch (error) {
    console.error('CardioVault Vercel AI error:', String(error?.message || error).slice(0,500));
    return send(res, 502, { error: 'CardioVault AI could not complete the analysis.' });
  }
}
