import { GoogleGenAI } from '@google/genai';
import { Patient } from '../types/clinical';

export interface AIClinicalResult { diagnosticAnalysis:string; differentialDiagnoses:Array<{diagnosis:string;rationale:string;urgency:'routine'|'important'|'urgent'}>; recommendedActions:string[]; safetyChecks:string[]; missingData:string[]; confidence:'low'|'moderate'|'high'; }
const AI_KEY_STORAGE='cardiovault_gemini_api_key';
export const getStoredAIKey=()=>{try{return localStorage.getItem(AI_KEY_STORAGE)||'';}catch{return ''}};
export const saveStoredAIKey=(key:string)=>{try{if(key.trim())localStorage.setItem(AI_KEY_STORAGE,key.trim());else localStorage.removeItem(AI_KEY_STORAGE);}catch{}};
export const clearStoredAIKey=()=>{try{localStorage.removeItem(AI_KEY_STORAGE);}catch{}};
const compactPatient=(p:Patient)=>({demographics:{age:p.age,sex:p.sex,weight:p.weight,height:p.height,allergies:p.allergies,codeStatus:p.codeStatus},admission:{primaryDiagnosis:p.primaryDiagnosis,secondaryDiagnoses:p.secondaryDiagnoses,date:p.admissionDate,time:p.admissionTime},history:p.clinicalSummary,cardiovascularHistory:p.cardiovascularHistory,latestVitals:p.vitalsHistory?.slice(0,5),latestABG:p.ventilator?.abgHistory?.slice(0,3),cardiology:p.cardiology,activeMedications:(p.medications||[]).filter(m=>!m.status||m.status==='Active'||m.status==='Held').slice(0,40),labs:p.labResults?.slice(0,60),laboratoryPanels:p.labs?.slice(0,3),imaging:p.imaging?.slice(0,10),procedures:p.procedures?.slice(0,10),progressNotes:p.progressNotes?.slice(0,8)});
const normalizeResult=(data:any):AIClinicalResult=>({diagnosticAnalysis:String(data?.diagnosticAnalysis||data?.analysis||'No clinical synthesis returned.'),differentialDiagnoses:Array.isArray(data?.differentialDiagnoses)?data.differentialDiagnoses.map((d:any)=>({diagnosis:String(d?.diagnosis||''),rationale:String(d?.rationale||''),urgency:['routine','important','urgent'].includes(d?.urgency)?d.urgency:'routine'})).filter((d:any)=>d.diagnosis):[],recommendedActions:Array.isArray(data?.recommendedActions)?data.recommendedActions.map(String).filter(Boolean):[],safetyChecks:Array.isArray(data?.safetyChecks)?data.safetyChecks.map(String).filter(Boolean):[],missingData:Array.isArray(data?.missingData)?data.missingData.map(String).filter(Boolean):[],confidence:['low','moderate','high'].includes(data?.confidence)?data.confidence:'moderate'});
export async function analyzePatientWithAI(patient:Patient):Promise<AIClinicalResult>{
 const apiKey=(import.meta as any).env?.VITE_GEMINI_API_KEY||getStoredAIKey();
 if(!apiKey)throw new Error('AI is not configured. Enter your Gemini API key in AI Settings.');
 const ai=new GoogleGenAI({apiKey});
 const prompt=`You are a clinical decision-support assistant for a physician using CardioVault. Analyze ONLY the supplied patient record. Do not invent findings, diagnoses, medications, doses, contraindications, or test results. Do not make autonomous treatment decisions.

Return ONLY valid JSON with exactly these keys: diagnosticAnalysis (string), differentialDiagnoses (array of {diagnosis,rationale,urgency}), recommendedActions (array of strings), safetyChecks (array of strings), missingData (array of strings), confidence (low|moderate|high).

Use a concise working assessment, explicitly not a confirmed diagnosis. For recommendedActions give general clinician-review actions such as stabilization, monitoring, investigations, medication reconciliation, and escalation when supported by the supplied record. Do not create medication orders. If medication therapy is discussed, require clinician verification of drug, dose, route, contraindications, interactions and local protocol. Highlight urgent safety issues and missing information. If data are insufficient, say so.

PATIENT RECORD:\n${JSON.stringify(compactPatient(patient))}`;
 try{
  const response=await ai.models.generateContent({model:'gemini-2.5-flash',contents:prompt,config:{responseMimeType:'application/json',temperature:0.1}});
  const raw=response.text?.trim(); if(!raw)throw new Error('The AI returned an empty response.');
  const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  return normalizeResult(JSON.parse(cleaned));
 }catch(error:any){
  const message=String(error?.message||error||'AI request failed');
  if(/api key|401|403|permission|unauthorized|invalid/i.test(message))throw new Error('Gemini API key was rejected. Check the key and try again.');
  if(/quota|429|rate/i.test(message))throw new Error('Gemini request limit was reached. Wait and try again.');
  throw new Error(message.slice(0,300));
 }
}
