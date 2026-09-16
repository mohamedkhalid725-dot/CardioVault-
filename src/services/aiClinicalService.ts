import { GoogleGenAI } from '@google/genai';
import { Patient } from '../types/clinical';

export interface AIClinicalResult {
  diagnosticAnalysis: string;
  differentialDiagnoses: Array<{ diagnosis: string; rationale: string; urgency: 'routine'|'important'|'urgent' }>;
  recommendedActions: string[];
  safetyChecks: string[];
  missingData: string[];
  confidence: 'low'|'moderate'|'high';
}

const compactPatient = (p: Patient) => ({
  demographics: { age:p.age, sex:p.sex, weight:p.weight, height:p.height, allergies:p.allergies, codeStatus:p.codeStatus },
  admission: { primaryDiagnosis:p.primaryDiagnosis, secondaryDiagnoses:p.secondaryDiagnoses, date:p.admissionDate, time:p.admissionTime },
  history:p.clinicalSummary,
  cardiovascularHistory:p.cardiovascularHistory,
  latestVitals:p.vitalsHistory?.slice(0,5),
  latestABG:p.ventilator?.abgHistory?.slice(0,3),
  cardiology:p.cardiology,
  activeMedications:(p.medications||[]).filter(m=>!m.status||m.status==='Active'||m.status==='Held').slice(0,40),
  labs:p.labResults?.slice(0,40),
  laboratoryPanels:p.labs?.slice(0,3),
  imaging:p.imaging?.slice(0,10),
  procedures:p.procedures?.slice(0,10),
  progressNotes:p.progressNotes?.slice(0,8),
});

export async function analyzePatientWithAI(patient: Patient): Promise<AIClinicalResult> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) throw new Error('AI is not configured. Add VITE_GEMINI_API_KEY to the application environment.');
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. This is clinician decision support, not an autonomous diagnosis or prescribing system.

Return JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

For diagnosticAnalysis, provide a concise clinical synthesis and explicitly call the output a differential/working assessment rather than a confirmed diagnosis. For recommendedActions, provide general evidence-aligned actions for clinician review, prioritizing stabilization, monitoring, investigations, medication reconciliation, and escalation when appropriate. NEVER present a medication order as automatic or definitive; if a drug is mentioned, state that selection/dose/contraindications must be verified by the treating clinician. Flag red-flag data and missing information. Never claim certainty when the record is incomplete.

PATIENT RECORD:\n${JSON.stringify(compactPatient(patient))}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  const raw = response.text?.trim();
  if (!raw) throw new Error('The AI returned an empty response.');
  try { return JSON.parse(raw) as AIClinicalResult; }
  catch { throw new Error('The AI response was not valid structured JSON.'); }
}
