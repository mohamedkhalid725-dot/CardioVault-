import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Server-side AI Clinical Assistant endpoint supporting all 12 capabilities
app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { task, draftType, userPrompt, patient: rawPatient, imageBase64, clinician } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'CardioVault AI requires GEMINI_API_KEY to be configured in project settings.',
      });
    }

    const patient = rawPatient ? compactPatient(rawPatient) : null;
    const ai = getGenAI();
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    const systemInstructions = `You are CardioVault's AI Clinical Assistant, assisting Dr. ${clinician?.name || 'Physician'} (${clinician?.role || 'Clinician'}) in an inpatient Cardiology / CCU / ICU clinical setting.
CRITICAL SAFETY RULES:
1. You are an ASSISTANT, not an autonomous clinician. You must never autonomously prescribe, order, administer, change diagnosis, or modify records.
2. All documentation drafts must be presented in a clean, structured format for the clinician to review, edit, and manually sign off.
3. Keep responses objective, concise, guideline-referenced (ESC, AHA/ACC, KDIGO, Surviving Sepsis), and free of filler phrases.
4. Ground all statements strictly in the supplied patient record. If data is absent, state that explicitly.
5. Emphasize urgent red flags, contraindications, and drug-drug interactions when present.`;

    let taskInstruction = '';
    switch (task) {
      case 'summary':
        taskInstruction = 'Provide a structured Clinical Patient Summary: Current acute status, primary and secondary diagnoses, key hemodynamics, latest laboratory highlights, active interventions, and immediate clinical priorities.';
        break;
      case 'timeline':
        taskInstruction = 'Construct a chronological Clinical Timeline of the patient course from admission to present, highlighting vital changes, lab trends, procedure outcomes, and clinical milestones.';
        break;
      case 'problems':
        taskInstruction = 'Generate an Active Problem List with prioritized acute issues, differential diagnoses, suspected etiology, stability status, and evidence from the chart.';
        break;
      case 'trends':
        taskInstruction = 'Perform a Trend Analysis across documented vitals, hemodynamics, urine output, fluid balance, lactate, biomarkers (troponin, BNP), and renal function. Highlight improving vs deteriorating parameters.';
        break;
      case 'labs':
        taskInstruction = 'Perform a Laboratory Interpretation: Categorize abnormal values, identify acute patterns (e.g. AKI, electrolyte shifts, coagulopathy, inflammatory response), calculate pertinent ratios if data allows, and highlight safety checks.';
        break;
      case 'abg':
        taskInstruction = 'Provide an Arterial Blood Gas (ABG) & Respiratory Interpretation: Primary acid-base disturbance, degree of compensation (expected pCO2 or HCO3), anion gap if electrolytes available, PaO2/FiO2 ratio, and ventilatory optimization suggestions.';
        break;
      case 'ecg':
        taskInstruction = 'Provide an ECG Clinical Assistance Report: Rate, rhythm, axis, PR interval, QRS width, QT/QTc interval, ST-T wave morphology, ischemic / injury patterns, and clinical comparison.';
        break;
      case 'draft_note':
        taskInstruction = `Draft a comprehensive, professional clinical note of type: "${draftType || 'Progress Note'}".
Structure format:
- For 'progress': Subjective, Objective (vitals, exam, labs), Assessment (numbered problem-based), Plan (evidence-based diagnostic and therapeutic steps).
- For 'daily_review': 24-hour events, systems review (Neuro, CVS, Resp, GI/Renal, ID, Heme), active problems, to-do list.
- For 'admission': Chief Complaint, HPI, Past History, Medications, Review of Systems, Initial Exam, Admission Labs/ECG, Working Diagnosis, Initial Orders.
- For 'discharge': Admission Date, Discharge Date, Diagnoses, Hospital Course Summary, Key Investigations, Discharge Medications with changes highlighted, Follow-up instructions.
- For 'consultation': Clinical Question, Brief Summary of Case, Current Findings, Specific input requested.
- For 'handover': I-PASS structured summary.`;
        break;
      case 'handover':
        taskInstruction = 'Generate a structured I-PASS Handover (Illness Severity, Patient Summary, Action List, Situation Awareness & Contingency Planning, Synthesis by Receiver).';
        break;
      case 'medication':
        taskInstruction = 'Provide a Clinical Medication Assistance Review: For each active medication, review clinical indication, ICU/cardiology monitoring parameters, safety precautions, renal/hepatic adjustments, and critical drug-drug interactions.';
        break;
      case 'protocol':
        taskInstruction = 'Identify and summarize applicable Clinical Protocols & Pathways for this patient condition (e.g. STEMI, NSTEMI, ADHF, Sepsis, Shock, Anticoagulation), detailing key protocol steps, safety contraindications, and escalation criteria.';
        break;
      default:
        taskInstruction = 'Address the clinician clinical question or request with evidence-based reasoning, guideline citations, and practical bedside recommendations.';
    }

    let contentsPayload: any[] = [];
    let promptText = `${systemInstructions}\n\nTASK: ${taskInstruction}`;

    if (userPrompt) {
      promptText += `\n\nCLINICIAN QUERY / INSTRUCTIONS:\n${userPrompt}`;
    }

    if (patient) {
      promptText += `\n\nPATIENT RECORD:\n${JSON.stringify(patient, null, 2)}`;
    }

    if (imageBase64) {
      const match = String(imageBase64).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        contentsPayload = [
          {
            role: 'user',
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              },
            ],
          },
        ];
      } else {
        contentsPayload = [{ role: 'user', parts: [{ text: promptText }] }];
      }
    } else {
      contentsPayload = [{ role: 'user', parts: [{ text: promptText }] }];
    }

    let raw = '';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contentsPayload,
        });
        raw = String(response.text || '').trim();
        if (raw) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Assistant model ${modelName} failed, trying fallback:`, err?.message || err);
      }
    }

    if (!raw && lastError) throw lastError;
    if (!raw) return res.status(502).json({ error: 'AI Assistant returned an empty response.' });

    return res.status(200).json({
      text: raw,
      task,
      draftType: draftType || null,
      disclaimer: "AI-generated clinical assistance. Verify against the patient's record, current guidelines, and clinical judgment before acting.",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('AI Assistant API error:', error);
    const msg = String(error?.message || error || 'Clinical assistant request failed.');
    return res.status(500).json({ error: msg });
  }
});

function cleanJsonResponse(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// AI Medical Voice Record Endpoint
app.post('/api/ai/voice-record', async (req, res) => {
  try {
    const { audioBase64, mimeType, patient, clinician, context } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data is required for medical voice processing.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'CardioVault AI requires GEMINI_API_KEY to be configured in project settings.',
      });
    }

    const cleanBase64 = String(audioBase64).replace(/^data:audio\/[a-zA-Z0-9+.-]+;base64,/, '');
    const cleanMimeType = mimeType || 'audio/webm';
    const targetContext = context ? String(context).trim() : 'progressNote';

    const systemPrompt = `You are CardioVault's AI Medical Audio Dictation and Clinical Documentation Engine.
The user is Dr. ${clinician?.name || 'Physician'} (${clinician?.role || 'Clinician'}) in an inpatient Cardiology / CCU / ICU clinical setting.
The clinician is recording a clinical dictation, patient examination, bedside rounding note, or section-specific medical entry.
The recording can be in English, Arabic, or mixed English/Arabic (medical terms in English with Arabic conversation/connectives, e.g. "المريض عنده سكر وضغط وعنده ischemic heart disease وكان عامل PCI وركب stent من سنتين").

TARGET CLINICAL SECTION: "${targetContext}"

CONTEXT-AWARE TRANSFORMATION DIRECTIVES:
- If target is "chiefComplaint": Produce a concise, standard clinical Chief Complaint (e.g. "Acute crushing substernal chest pain radiating to left arm x 2 hours").
- If target is "history" or "hpi": Produce an accurate, chronologically structured History of Present Illness (HPI).
- If target is "pmh": Transform into concise standard medical terminology (e.g. "Known case of diabetes mellitus type 2, essential hypertension, and ischemic heart disease").
- If target is "psh": Transform into concise surgical history (e.g. "Status post PCI with drug-eluting stent placement 2 years ago, appendectomy 2015").
- If target is "drugHistory" or "medications": Transform into clear medication entries with drug name, dose, route, frequency where stated.
- If target is "allergies": Transform into specific documented allergies and reaction types, or "No known drug allergies (NKDA)".
- If target is "examination": Transform into formal physical examination documentation (General, CVS, Resp, Abdomen, Neuro, Extremities).
- If target is "assessment": Transform into clinical assessment and diagnostic synthesis language.
- If target is "plan": Transform into structured medical/interventional/monitoring management plan.
- If target is "progressNote": Produce a comprehensive, cohesive, structured progress note (SOAP / clinical summary).
- If target is "investigations": List diagnostic tests, labs, imaging, or cardiac procedures ordered or discussed.

STRICT ANTI-HALLUCINATION RULES:
1. Verbatim Transcription: In "transcription", transcribe faithfully what was spoken in the audio. If spoken in Arabic or mixed, capture the actual words spoken.
2. Medical Transformation: In "medicalText", convert what was spoken into proper, professional medical English documentation suitable for the target section "${targetContext}".
3. ZERO INVENTIONS: NEVER invent diagnoses, medications, doses, duration, lab values, vital signs, procedures, dates, or events that were not spoken in the audio.
4. If the physician did not say it, do NOT add it.
5. If a spoken number, name, or word is ambiguous or unclear, preserve the uncertainty and list it in "uncertainItems".
6. In addition to "medicalText", also populate the structured "clinicalNote" object fields where relevant.

${patient ? `Patient Context (for reference only, do not assume findings not spoken in audio): Patient: ${patient.fullName || patient.name || 'Unknown'}, Age: ${patient.age || '—'}, Diagnosis: ${patient.primaryDiagnosis || '—'}` : ''}

Return ONLY valid JSON with this exact structure:
{
  "context": "${targetContext}",
  "transcription": "Verbatim spoken words",
  "medicalText": "Transformed professional medical documentation for the target section",
  "confidence": 0.95,
  "uncertainItems": [],
  "detectedLanguage": "English|Arabic|Mixed",
  "clinicalNote": {
    "chiefComplaint": "",
    "historyOfPresentIllness": "",
    "pastMedicalHistory": "",
    "pastSurgicalHistory": "",
    "drugHistory": "",
    "allergies": "",
    "examination": "",
    "vitalSigns": {
      "sbp": null,
      "dbp": null,
      "hr": null,
      "rr": null,
      "spo2": null,
      "temp": null,
      "gcs": null,
      "pain": null,
      "notes": ""
    },
    "investigations": [],
    "ecg": "",
    "echo": "",
    "laboratoryResults": [],
    "medications": [],
    "assessment": "",
    "diagnosis": "",
    "plan": "",
    "progressNote": ""
  },
  "uncertainties": []
}`;

    const ai = getGenAI();
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-transcribe', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let raw = '';

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64,
                  },
                },
                { text: systemPrompt },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        raw = String(response.text || '').trim();
        if (raw) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Voice record model ${modelName} failed, trying candidate fallback:`, err?.message || err);
      }
    }

    if (!raw && lastError) throw lastError;
    if (!raw) return res.status(502).json({ error: 'AI returned an empty response for audio transcription.' });

    const result = cleanJsonResponse(raw);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('AI Voice Record error:', error);
    const msg = String(error?.message || error || 'Medical voice processing failed.');
    return res.status(500).json({ error: msg });
  }
});

// AI Laboratory Image Analyzer Endpoint
app.post('/api/ai/analyze-lab', async (req, res) => {
  try {
    const { imageBase64, mimeType, patientNameHint, clinician } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'Laboratory report image is required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'CardioVault AI requires GEMINI_API_KEY to be configured in project settings.',
      });
    }

    const cleanBase64 = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const cleanMimeType = mimeType || 'image/jpeg';

    const systemPrompt = `You are CardioVault's AI Clinical Laboratory Document Analyzer.
Examine this medical laboratory report image with optical character recognition and clinical accuracy.

MANDATORY RULES:
1. Extract ALL readable laboratory tests shown in the document. Do not limit to a predefined list.
2. PRESERVE NUMERICAL VALUES EXACTLY: Keep all decimal places (e.g. 2.9 must remain 2.9, 0.7 must remain 0.7; NEVER round 2.9 to 3). Preserve symbols (<, >, +, -), units, and scientific notation.
3. Status determination: For each test, compare the extracted value to the test's SPECIFIC REFERENCE RANGE shown on THIS report:
   - "Normal": value is within the stated reference range
   - "High": value is above the upper limit of the reference range
   - "Low": value is below the lower limit of the reference range
   - "Critical": value is marked with panic/critical flags (*, H*, L*, CRITICAL, PANIC, RED) or is at extreme dangerous levels
   - "Abnormal": test is abnormal or positive for qualitative/binary tests
   - "Unknown": no reference range is visible on the report
4. Extract document header information if legible:
   - patientName: Patient name printed on the report, or null if obscured/not present
   - reportDate: Date of report (YYYY-MM-DD format if possible), or null
   - reportTime: Time of report (HH:MM format if possible), or null
   - laboratoryName: Name of the laboratory or hospital facility, or null
   - panelName: Primary category or panel name (e.g. "Complete Blood Count (CBC)", "Comprehensive Metabolic Panel (CMP)", "Cardiac Markers", "Coagulation Profile", "Arterial Blood Gas (ABG)", "Electrolytes", "Liver Function Tests", "Lipid Profile", "Renal Function", "Urinalysis", "Special Chemistry", "General Laboratory")
5. Assess image readability/quality:
   - imageQuality: "good" | "acceptable" | "blurry" | "partially_unreadable"
   - qualityNotes: Brief description if any part is cut off, shadowed, skewed, or illegible
6. DO NOT INVENT OR FABRICATE ANY VALUES, TESTS, UNITS, DATES, OR PATIENT NAMES. If a value is unreadable, cut off, or blurry, omit it or flag it as uncertain.
${patientNameHint ? `Current patient name in system: ${patientNameHint}` : ''}

Return ONLY valid JSON matching this exact structure:
{
  "patientName": null,
  "reportDate": null,
  "reportTime": null,
  "laboratoryName": null,
  "panelName": "General Laboratory",
  "imageQuality": "good",
  "qualityNotes": "",
  "tests": [
    {
      "testName": "Example Test",
      "value": "1.0",
      "unit": "mg/dL",
      "referenceRange": "0.5 - 1.5",
      "status": "Normal",
      "confidence": 95,
      "isUncertain": false
    }
  ],
  "interpretationSummary": ""
}`;

    const ai = getGenAI();
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let raw = '';

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64,
                  },
                },
                { text: systemPrompt },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        raw = String(response.text || '').trim();
        if (raw) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Lab analyzer model ${modelName} failed, trying candidate fallback:`, err?.message || err);
      }
    }

    if (!raw && lastError) throw lastError;
    if (!raw) return res.status(502).json({ error: 'AI returned an empty response for laboratory analysis.' });

    const result = cleanJsonResponse(raw);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('AI Lab Analyzer error:', error);
    const msg = String(error?.message || error || 'Laboratory report analysis failed.');
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
