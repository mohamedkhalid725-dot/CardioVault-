const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { GoogleGenAI } = require('@google/genai');

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const requestWindows = new Map();
const MAX_BODY_BYTES = 9 * 1024 * 1024;

function json(res, status, body) {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}
function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function size(req) {
  const n = Number(req.get('content-length') || 0);
  return Number.isFinite(n) ? n : 0;
}
async function authorize(req, res) {
  const header = String(req.get('authorization') || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) { json(res, 401, { error: 'Authentication required.' }); return null; }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const now = Date.now();
    const active = (requestWindows.get(decoded.uid) || []).filter(t => now - t < 60000);
    if (active.length >= 12) { json(res, 429, { error: 'AI request limit reached. Please wait and try again.' }); return null; }
    active.push(now); requestWindows.set(decoded.uid, active);
    return decoded;
  } catch {
    json(res, 401, { error: 'Firebase authentication token is invalid or expired.' });
    return null;
  }
}
function aiClient() {
  const key = String(geminiApiKey.value() || '').trim();
  if (!key) throw new Error('AI service is not configured.');
  return new GoogleGenAI({ apiKey: key, apiVersion: 'v1' });
}
function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI returned invalid structured data.');
  }
}
function handler(work) {
  return onRequest({ region: 'us-central1', secrets: [geminiApiKey], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return json(res, 405, { error: 'POST required.' });
    if (size(req) > MAX_BODY_BYTES) return json(res, 413, { error: 'Request is too large. Reduce the audio or image size and try again.' });
    if (!await authorize(req, res)) return;
    try { await work(req, res, aiClient()); }
    catch (error) {
      const message = String(error?.message || error || '');
      console.error('CardioVault AI endpoint failed:', message.slice(0, 500));
      if (/quota|429|rate.?limit|resource.?exhausted/i.test(message)) return json(res, 429, { error: 'Gemini request limit reached. Please wait and try again.' });
      if (/api key|401|403|permission|unauthorized|credential/i.test(message)) return json(res, 502, { error: 'AI service credentials were rejected.' });
      return json(res, 502, { error: 'AI could not complete this request. Please retry.' });
    }
  });
}

exports.transcribeClinical = handler(async (req, res, ai) => {
  const audio = String(req.body?.audioBase64 || '');
  const field = String(req.body?.field || 'clinical_note').slice(0, 80);
  const match = audio.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
  if (!match) return json(res, 400, { error: 'Unsupported audio format.' });
  if (match[2].length > 8_000_000) return json(res, 413, { error: 'Recorded audio is too large. Shorten it and retry.' });
  const mimeType = match[1].toLowerCase();
  if (!['audio/webm','audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/ogg','audio/3gpp'].includes(mimeType)) {
    return json(res, 400, { error: 'Unsupported audio format.' });
  }
  const transcriptResponse = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe the clinician audio exactly as spoken, in the original Arabic, English, or code-switched language. Do not summarize or add facts. Preserve clinical terms, numbers, units, medication names, doses, and dates.' },
      { inlineData: { mimeType, data: match[2] } }
    ] }],
    config: { httpOptions: { timeout: 60000 } }
  });
  const transcript = String(transcriptResponse.text || '').trim();
  if (!transcript) return json(res, 502, { error: 'No speech was recognized. Please retry or edit the recording.' });
  const normalizedResponse = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [[
      'Convert this clinician transcript into concise professional Medical English for the target clinical field.',
      'Translate Arabic and mixed Arabic/English faithfully. Preserve only facts explicitly spoken; never infer or add diagnoses, findings, doses, dates, or units.',
      'Preserve uncertain words/numbers as uncertain and report them as warnings rather than guessing.',
      'Return only JSON with keys normalizedEnglish, sourceLanguage (ar|en|mixed|unknown), confidence (low|moderate|high), warnings (array).',
      'FIELD: ' + field, 'TRANSCRIPT:', transcript
    ].join('\n')],
    config: { responseMimeType: 'application/json', httpOptions: { timeout: 60000 } }
  });
  const result = parseJson(normalizedResponse.text);
  return json(res, 200, {
    transcript,
    normalizedEnglish: String(result.normalizedEnglish || transcript).trim(),
    sourceLanguage: ['ar','en','mixed','unknown'].includes(result.sourceLanguage) ? result.sourceLanguage : 'unknown',
    confidence: ['low','moderate','high'].includes(result.confidence) ? result.confidence : 'moderate',
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String).filter(Boolean) : []
  });
});

exports.scanLab = handler(async (req, res, ai) => {
  const image = String(req.body?.imageBase64 || '');
  const patientName = String(req.body?.patientName || '').slice(0, 160);
  const match = image.match(/^data:(image\/(?:png|jpe?g|webp|heic|heif));base64,(.+)$/is);
  if (!match) return json(res, 400, { error: 'Unsupported lab image format.' });
  if (match[2].length > 8_000_000) return json(res, 413, { error: 'Lab image is too large. Select a smaller image and retry.' });
  const prompt = [
    'Extract only values visibly present on this laboratory report. Never guess missing digits or values.',
    'Detect the laboratory panel. For each test return testName, value, unit, referenceRange, status, confidence.',
    'Use report-provided reference ranges. If absent, leave referenceRange empty and status unknown unless the report itself marks high/low/critical.',
    'Extract patient name and report date only when visible. Compare report name with current patient only for a mismatch warning.',
    'Return JSON only with keys panel, patientName, reportDate, tests, warnings. statuses normal|low|high|critical|unknown; confidence low|moderate|high.',
    'Current patient name: ' + patientName
  ].join('\n');
  let raw = '';
  for (const model of ['gemini-3.5-flash-lite','gemini-3.8-flash']) {
    try {
      const response = await ai.models.generateContent({
        model, contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } }] }],
        config: { responseMimeType: 'application/json', httpOptions: { timeout: 60000 } }
      });
      raw = String(response.text || '').trim();
      if (raw) break;
    } catch (error) { console.error('Lab scan model failed:', String(error?.message || error).slice(0, 300)); }
  }
  if (!raw) return json(res, 502, { error: 'AI could not read the laboratory report. Please retry.' });
  const parsed = parseJson(raw);
  const tests = Array.isArray(parsed.tests) ? parsed.tests.map(t => ({
    testName: String(t?.testName || ''), value: t?.value ?? '', unit: String(t?.unit || ''),
    referenceRange: String(t?.referenceRange || ''),
    status: ['normal','low','high','critical','unknown'].includes(t?.status) ? t.status : 'unknown',
    confidence: ['low','moderate','high'].includes(t?.confidence) ? t.confidence : 'moderate'
  })).filter(t => t.testName && t.value !== '') : [];
  return json(res, 200, {
    panel: String(parsed.panel || 'Custom Lab'), patientName: String(parsed.patientName || ''),
    reportDate: String(parsed.reportDate || ''), tests,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean) : []
  });
});
