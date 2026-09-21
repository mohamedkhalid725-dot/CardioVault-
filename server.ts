import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy GoogleGenAI client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey: key });
  }
  return genAIClient;
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

function compactPatient(patient: any) {
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
      ? patient.medications.filter((m: any) => !m.status || m.status === 'Active' || m.status === 'Held').slice(0, 40)
      : [],
    labs: Array.isArray(patient.labResults) ? patient.labResults.slice(0, 60) : [],
    laboratoryPanels: Array.isArray(patient.labs) ? patient.labs.slice(0, 3) : [],
    imaging: Array.isArray(patient.imaging) ? patient.imaging.slice(0, 10) : [],
    procedures: Array.isArray(patient.procedures) ? patient.procedures.slice(0, 10) : [],
    progressNotes: Array.isArray(patient.progressNotes) ? patient.progressNotes.slice(0, 8) : [],
  };
}

function buildPrompt(patient: any) {
  return `You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys:
{
  "diagnosticAnalysis": "string (concise clinical synthesis of current acute status)",
  "differentialDiagnoses": [{"diagnosis": "string", "rationale": "string", "urgency": "routine|important|urgent"}],
  "recommendedActions": ["string"],
  "safetyChecks": ["string"],
  "missingData": ["string"],
  "confidence": "low|moderate|high"
}

Use a concise working assessment, explicitly not a confirmed diagnosis. For recommendedActions give general clinician-review actions such as stabilization, monitoring, investigations, medication reconciliation, and escalation when supported by the supplied record. Do not create medication orders. Highlight urgent safety issues and missing clinical information.

PATIENT RECORD:
${JSON.stringify(patient, null, 2)}`;
}

function normalizeResult(data: any) {
  return {
    diagnosticAnalysis: String(data?.diagnosticAnalysis || data?.analysis || 'Clinical synthesis completed based on documented bedside data.'),
    differentialDiagnoses: Array.isArray(data?.differentialDiagnoses)
      ? data.differentialDiagnoses.map((d: any) => ({
          diagnosis: String(d?.diagnosis || ''),
          rationale: String(d?.rationale || ''),
          urgency: ['routine', 'important', 'urgent'].includes(d?.urgency) ? d.urgency : 'routine',
        })).filter((d: any) => d.diagnosis)
      : [],
    recommendedActions: Array.isArray(data?.recommendedActions) ? data.recommendedActions.map(String).filter(Boolean) : [],
    safetyChecks: Array.isArray(data?.safetyChecks) ? data.safetyChecks.map(String).filter(Boolean) : [],
    missingData: Array.isArray(data?.missingData) ? data.missingData.map(String).filter(Boolean) : [],
    confidence: ['low', 'moderate', 'high'].includes(data?.confidence) ? data.confidence : 'moderate',
  };
}

// Server-side AI Clinical Decision Support endpoint
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const rawPatient = req.body?.patient;
    if (!rawPatient) {
      return res.status(400).json({ error: 'Patient data is required for clinical analysis.' });
    }

    const patient = compactPatient(rawPatient);

    // Check if GEMINI_API_KEY is configured
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'CardioVault AI requires GEMINI_API_KEY to be configured in project settings.',
      });
    }

    const ai = getGenAI();
    const candidateModels = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let raw = '';

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: buildPrompt(patient),
          config: {
            responseMimeType: 'application/json',
          },
        });
        raw = String(response.text || '').trim();
        if (raw) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed or unavailable, trying candidate fallback:`, err?.message || err);
      }
    }

    if (!raw && lastError) {
      throw lastError;
    }
    if (!raw) {
      return res.status(502).json({ error: 'Gemini returned an empty clinical response.' });
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = normalizeResult(JSON.parse(cleaned));
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('AI analysis error:', error);
    const msg = String(error?.message || error || 'Clinical analysis failed');
    return res.status(500).json({ error: msg });
  }
});

// Vite middleware / static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CardioVault server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
