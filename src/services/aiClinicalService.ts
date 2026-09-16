import { GoogleGenAI } from '@google/genai';
import { Patient } from '../types/clinical';

export interface AIClinicalResult {
  diagnosticAnalysis:string;
  differentialDiagnoses:Array<{diagnosis:string;rationale:string;urgency:'routine'|'important'|'urgent'}>;
  recommendedActions:string[];
  safetyChecks:string[];
  missingData:string[];
  confidence:'low'|'moderate'|'high';
}

const AI_KEY_STORAGE='cardiovault_gemini_api_key';
const PRIMARY_MODEL='gemini-3.6-flash';
const FALLBACK_MODEL='gemini-3.5-flash';

export const getStoredAIKey=()=>{try{return localStorage.getItem(AI_KEY_STORAGE)||'';}catch{return ''}};
export const saveStoredAIKey=(key:string)=>{try{if(key.trim())localStorage.setItem(AI_KEY_STORAGE,key.trim());else localStorage.removeItem(AI_KEY_STORAGE);}catch{}};
export const clearStoredAIKey=()=>{try{localStorage.removeItem(AI_KEY_STORAGE);}catch{}};

const compactPatient=(p:Patient)=>({
  demographics:{age:p.age,sex:p.sex,weight:p.weight,height:p.height,allergies:p.allergies,codeStatus:p.codeStatus},
  admission:{primaryDiagnosis:p.primaryDiagnosis,secondaryDiagnoses:p.secondaryDiagnoses,date:p.admissionDate,time:p.admissionTime},
  history:p.clinicalSummary,
  cardiovascularHistory:p.cardiovascularHistory,
  latestVitals:p.vitalsHistory?.slice(0,5),
  latestABG:p.ventilator?.abgHistory?.slice(0,3),
  cardiology:p.cardiology,
  activeMedications:(p.medications||[]).filter(m=>!m.status||m.status==='Active'||m.status==='Held').slice(0,40),
  labs:p.labResults?.slice(0,60),
  laboratoryPanels:p.labs?.slice(0,3),
  imaging:p.imaging?.slice(0,10),
  procedures:p.procedures?.slice(0,10),
  progressNotes:p.progressNotes?.slice(0,8)
});

const normalizeResult=(data:any):AIClinicalResult=>({
  diagnosticAnalysis:String(data?.diagnosticAnalysis||data?.analysis||'No clinical synthesis returned.'),
  differentialDiagnoses:Array.isArray(data?.differentialDiagnoses)?data.differentialDiagnoses.map((d:any)=>({
    diagnosis:String(d?.diagnosis||''),
    rationale:String(d?.rationale||''),
    urgency:['routine','important','urgent'].includes(d?.urgency)?d.urgency:'routine'
  })).filter((d:any)=>d.diagnosis):[],
  recommendedActions:Array.isArray(data?.recommendedActions)?data.recommendedActions.map(String).filter(Boolean):[],
  safetyChecks:Array.isArray(data?.safetyChecks)?data.safetyChecks.map(String).filter(Boolean):[],
  missingData:Array.isArray(data?.missingData)?data.missingData.map(String).filter(Boolean):[],
  confidence:['low','moderate','high'].includes(data?.confidence)?data.confidence:'moderate'
});

const buildPrompt=(patient:Patient)=>`You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

Use a concise working assessment, explicitly not a confirmed diagnosis. For recommendedActions give general clinician-review actions such as stabilization, monitoring, investigations, medication reconciliation, and escalation when supported by the supplied record. Do not create medication orders. If medication therapy is discussed, require clinician verification of drug, dose, route, contraindications, interactions and local protocol. Highlight urgent safety issues and missing information. If data are insufficient, say so.

PATIENT RECORD:\n${JSON.stringify(compactPatient(patient))}`;

const isModelUnavailable=(message:string)=>/model.*(not found|unavailable|does not exist)|not found.*model|404|resource.*not found/i.test(message);

async function requestAnalysis(ai:GoogleGenAI,model:string,prompt:string){
  const response=await ai.models.generateContent({
    model,
    contents:prompt,
    config:{responseMimeType:'application/json',temperature:0.1,maxOutputTokens:5000}
  });
  const raw=response.text?.trim();
  if(!raw)throw new Error('The AI returned an empty response.');
  const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  return normalizeResult(JSON.parse(cleaned));
}

export async function analyzePatientWithAI(patient:Patient):Promise<AIClinicalResult>{
  const apiKey=((import.meta as any).env?.VITE_GEMINI_API_KEY||getStoredAIKey()||'').trim();
  if(!apiKey)throw new Error('AI is not configured. Enter a Gemini API key in AI Settings.');

  const ai=new GoogleGenAI({apiKey,apiVersion:'v1'});
  const prompt=buildPrompt(patient);

  try{
    try{
      return await requestAnalysis(ai,PRIMARY_MODEL,prompt);
    }catch(primaryError:any){
      const primaryMessage=String(primaryError?.message||primaryError||'');
      if(!isModelUnavailable(primaryMessage))throw primaryError;
      return await requestAnalysis(ai,FALLBACK_MODEL,prompt);
    }
  }catch(error:any){
    const message=String(error?.message||error||'AI request failed');
    if(/api key|401|403|permission|unauthorized|invalid.*key|invalid.*credential/i.test(message)){
      throw new Error('Gemini API key was rejected. Create a valid Gemini API key, restrict it to the Gemini API, then save it again.');
    }
    if(/quota|429|rate.?limit|resource.?exhausted/i.test(message)){
      throw new Error('Gemini request limit was reached. Wait a moment and try again.');
    }
    if(isModelUnavailable(message)){
      throw new Error('The selected Gemini models are not available for this API key/project. Check Gemini API access in Google AI Studio.');
    }
    if(/failed to fetch|network|fetch|cors|internet/i.test(message)){
      throw new Error('Could not reach Gemini. Check the device internet connection and try again.');
    }
    if(/json|unexpected token|parse/i.test(message)){
      throw new Error('Gemini returned an invalid clinical response. Tap Re-analyze to try again.');
    }
    throw new Error(message.slice(0,400));
  }
}
