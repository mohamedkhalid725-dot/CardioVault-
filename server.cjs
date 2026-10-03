var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "10mb" }));
var genAIClient = null;
function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }
  if (!genAIClient) {
    genAIClient = new import_genai.GoogleGenAI({ apiKey: key });
  }
  return genAIClient;
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", serverTime: (/* @__PURE__ */ new Date()).toISOString() });
});
function compactPatient(patient) {
  if (!patient || typeof patient !== "object") throw new Error("Patient record is required.");
  return {
    demographics: {
      age: patient.age,
      sex: patient.sex,
      weight: patient.weight,
      height: patient.height,
      allergies: patient.allergies,
      codeStatus: patient.codeStatus
    },
    admission: {
      primaryDiagnosis: patient.primaryDiagnosis,
      secondaryDiagnoses: patient.secondaryDiagnoses,
      date: patient.admissionDate,
      time: patient.admissionTime
    },
    history: patient.clinicalSummary,
    cardiovascularHistory: patient.cardiovascularHistory,
    latestVitals: Array.isArray(patient.vitalsHistory) ? patient.vitalsHistory.slice(0, 5) : [],
    latestABG: Array.isArray(patient.ventilator?.abgHistory) ? patient.ventilator.abgHistory.slice(0, 3) : [],
    cardiology: patient.cardiology,
    activeMedications: Array.isArray(patient.medications) ? patient.medications.filter((m) => !m.status || m.status === "Active" || m.status === "Held").slice(0, 40) : [],
    labs: Array.isArray(patient.labResults) ? patient.labResults.slice(0, 60) : [],
    laboratoryPanels: Array.isArray(patient.labs) ? patient.labs.slice(0, 3) : [],
    imaging: Array.isArray(patient.imaging) ? patient.imaging.slice(0, 10) : [],
    procedures: Array.isArray(patient.procedures) ? patient.procedures.slice(0, 10) : [],
    progressNotes: Array.isArray(patient.progressNotes) ? patient.progressNotes.slice(0, 8) : []
  };
}
function buildPrompt(patient) {
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
function normalizeResult(data) {
  return {
    diagnosticAnalysis: String(data?.diagnosticAnalysis || data?.analysis || "Clinical synthesis completed based on documented bedside data."),
    differentialDiagnoses: Array.isArray(data?.differentialDiagnoses) ? data.differentialDiagnoses.map((d) => ({
      diagnosis: String(d?.diagnosis || ""),
      rationale: String(d?.rationale || ""),
      urgency: ["routine", "important", "urgent"].includes(d?.urgency) ? d.urgency : "routine"
    })).filter((d) => d.diagnosis) : [],
    recommendedActions: Array.isArray(data?.recommendedActions) ? data.recommendedActions.map(String).filter(Boolean) : [],
    safetyChecks: Array.isArray(data?.safetyChecks) ? data.safetyChecks.map(String).filter(Boolean) : [],
    missingData: Array.isArray(data?.missingData) ? data.missingData.map(String).filter(Boolean) : [],
    confidence: ["low", "moderate", "high"].includes(data?.confidence) ? data.confidence : "moderate"
  };
}
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const rawPatient = req.body?.patient;
    if (!rawPatient) {
      return res.status(400).json({ error: "Patient data is required for clinical analysis." });
    }
    const patient = compactPatient(rawPatient);
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "CardioVault AI requires GEMINI_API_KEY to be configured in project settings."
      });
    }
    const ai = getGenAI();
    const candidateModels = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
    let lastError = null;
    let raw = "";
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: buildPrompt(patient),
          config: {
            responseMimeType: "application/json"
          }
        });
        raw = String(response.text || "").trim();
        if (raw) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${modelName} failed or unavailable, trying candidate fallback:`, err?.message || err);
      }
    }
    if (!raw && lastError) {
      throw lastError;
    }
    if (!raw) {
      return res.status(502).json({ error: "Gemini returned an empty clinical response." });
    }
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const result = normalizeResult(JSON.parse(cleaned));
    return res.status(200).json(result);
  } catch (error) {
    console.error("AI analysis error:", error);
    const msg = String(error?.message || error || "Clinical analysis failed");
    return res.status(500).json({ error: msg });
  }
});
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { task, draftType, userPrompt, patient: rawPatient, imageBase64, clinician } = req.body || {};
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "CardioVault AI requires GEMINI_API_KEY to be configured in project settings."
      });
    }
    const patient = rawPatient ? compactPatient(rawPatient) : null;
    const ai = getGenAI();
    const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    const systemInstructions = `You are CardioVault's AI Clinical Assistant, assisting Dr. ${clinician?.name || "Physician"} (${clinician?.role || "Clinician"}) in an inpatient Cardiology / CCU / ICU clinical setting.
CRITICAL SAFETY RULES:
1. You are an ASSISTANT, not an autonomous clinician. You must never autonomously prescribe, order, administer, change diagnosis, or modify records.
2. All documentation drafts must be presented in a clean, structured format for the clinician to review, edit, and manually sign off.
3. Keep responses objective, concise, guideline-referenced (ESC, AHA/ACC, KDIGO, Surviving Sepsis), and free of filler phrases.
4. Ground all statements strictly in the supplied patient record. If data is absent, state that explicitly.
5. Emphasize urgent red flags, contraindications, and drug-drug interactions when present.`;
    let taskInstruction = "";
    switch (task) {
      case "summary":
        taskInstruction = "Provide a structured Clinical Patient Summary: Current acute status, primary and secondary diagnoses, key hemodynamics, latest laboratory highlights, active interventions, and immediate clinical priorities.";
        break;
      case "timeline":
        taskInstruction = "Construct a chronological Clinical Timeline of the patient course from admission to present, highlighting vital changes, lab trends, procedure outcomes, and clinical milestones.";
        break;
      case "problems":
        taskInstruction = "Generate an Active Problem List with prioritized acute issues, differential diagnoses, suspected etiology, stability status, and evidence from the chart.";
        break;
      case "trends":
        taskInstruction = "Perform a Trend Analysis across documented vitals, hemodynamics, urine output, fluid balance, lactate, biomarkers (troponin, BNP), and renal function. Highlight improving vs deteriorating parameters.";
        break;
      case "labs":
        taskInstruction = "Perform a Laboratory Interpretation: Categorize abnormal values, identify acute patterns (e.g. AKI, electrolyte shifts, coagulopathy, inflammatory response), calculate pertinent ratios if data allows, and highlight safety checks.";
        break;
      case "abg":
        taskInstruction = "Provide an Arterial Blood Gas (ABG) & Respiratory Interpretation: Primary acid-base disturbance, degree of compensation (expected pCO2 or HCO3), anion gap if electrolytes available, PaO2/FiO2 ratio, and ventilatory optimization suggestions.";
        break;
      case "ecg":
        taskInstruction = "Provide an ECG Clinical Assistance Report: Rate, rhythm, axis, PR interval, QRS width, QT/QTc interval, ST-T wave morphology, ischemic / injury patterns, and clinical comparison.";
        break;
      case "draft_note":
        taskInstruction = `Draft a comprehensive, professional clinical note of type: "${draftType || "Progress Note"}".
Structure format:
- For 'progress': Subjective, Objective (vitals, exam, labs), Assessment (numbered problem-based), Plan (evidence-based diagnostic and therapeutic steps).
- For 'daily_review': 24-hour events, systems review (Neuro, CVS, Resp, GI/Renal, ID, Heme), active problems, to-do list.
- For 'admission': Chief Complaint, HPI, Past History, Medications, Review of Systems, Initial Exam, Admission Labs/ECG, Working Diagnosis, Initial Orders.
- For 'discharge': Admission Date, Discharge Date, Diagnoses, Hospital Course Summary, Key Investigations, Discharge Medications with changes highlighted, Follow-up instructions.
- For 'consultation': Clinical Question, Brief Summary of Case, Current Findings, Specific input requested.
- For 'handover': I-PASS structured summary.`;
        break;
      case "handover":
        taskInstruction = "Generate a structured I-PASS Handover (Illness Severity, Patient Summary, Action List, Situation Awareness & Contingency Planning, Synthesis by Receiver).";
        break;
      case "medication":
        taskInstruction = "Provide a Clinical Medication Assistance Review: For each active medication, review clinical indication, ICU/cardiology monitoring parameters, safety precautions, renal/hepatic adjustments, and critical drug-drug interactions.";
        break;
      case "protocol":
        taskInstruction = "Identify and summarize applicable Clinical Protocols & Pathways for this patient condition (e.g. STEMI, NSTEMI, ADHF, Sepsis, Shock, Anticoagulation), detailing key protocol steps, safety contraindications, and escalation criteria.";
        break;
      default:
        taskInstruction = "Address the clinician clinical question or request with evidence-based reasoning, guideline citations, and practical bedside recommendations.";
    }
    let contentsPayload = [];
    let promptText = `${systemInstructions}

TASK: ${taskInstruction}`;
    if (userPrompt) {
      promptText += `

CLINICIAN QUERY / INSTRUCTIONS:
${userPrompt}`;
    }
    if (patient) {
      promptText += `

PATIENT RECORD:
${JSON.stringify(patient, null, 2)}`;
    }
    if (imageBase64) {
      const match = String(imageBase64).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        contentsPayload = [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: match[1],
                  data: match[2]
                }
              }
            ]
          }
        ];
      } else {
        contentsPayload = [{ role: "user", parts: [{ text: promptText }] }];
      }
    } else {
      contentsPayload = [{ role: "user", parts: [{ text: promptText }] }];
    }
    let raw = "";
    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contentsPayload
        });
        raw = String(response.text || "").trim();
        if (raw) break;
      } catch (err) {
        lastError = err;
        console.warn(`Assistant model ${modelName} failed, trying fallback:`, err?.message || err);
      }
    }
    if (!raw && lastError) throw lastError;
    if (!raw) return res.status(502).json({ error: "AI Assistant returned an empty response." });
    return res.status(200).json({
      text: raw,
      task,
      draftType: draftType || null,
      disclaimer: "AI-generated clinical assistance. Verify against the patient's record, current guidelines, and clinical judgment before acting.",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    console.error("AI Assistant API error:", error);
    const msg = String(error?.message || error || "Clinical assistant request failed.");
    return res.status(500).json({ error: msg });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CardioVault server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
