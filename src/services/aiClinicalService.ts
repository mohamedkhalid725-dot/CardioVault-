import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { webCurrentUser } from './webFirebase';
import { Patient } from '../types/clinical';

export interface AIClinicalResult {
  diagnosticAnalysis:string;
  differentialDiagnoses:Array<{diagnosis:string;rationale:string;urgency:'routine'|'important'|'urgent'}>;
  recommendedActions:string[];
  safetyChecks:string[];
  missingData:string[];
  confidence:'low'|'moderate'|'high';
}

const DEFAULT_AI_ENDPOINT='https://cardio-vault-git-department-system-v1-aiashy.vercel.app/api/ai/analyze';
const getAIEndpoint=()=>String((import.meta as any).env?.VITE_CARDIOVAULT_AI_ENDPOINT||DEFAULT_AI_ENDPOINT).trim();

export const isAIBackendConfigured=()=>true;

function compactAIPatient(patient:Patient|null|undefined):any{
  if(!patient)return null;
  return {
    id:patient.id,mrn:patient.mrn,fullName:patient.fullName,age:patient.age,sex:patient.sex,
    weight:patient.weight,height:patient.height,allergies:patient.allergies,codeStatus:patient.codeStatus,
    unitId:patient.unitId,primaryDiagnosis:patient.primaryDiagnosis,secondaryDiagnoses:patient.secondaryDiagnoses,
    admissionDate:patient.admissionDate,admissionTime:patient.admissionTime,
    clinicalSummary:patient.clinicalSummary,cardiovascularHistory:patient.cardiovascularHistory,
    vitalsHistory:patient.vitalsHistory?.slice(0,20),
    ventilator:{...(patient.ventilator||{}),abgHistory:patient.ventilator?.abgHistory?.slice(0,10)},
    cardiology:patient.cardiology,
    medications:patient.medications?.slice(0,40),
    labs:patient.labs?.slice(0,60),
    labResults:(patient as any).labResults?.slice(0,60),
    imaging:patient.imaging?.slice(0,10),
    procedures:patient.procedures?.slice(0,10),
    progressNotes:patient.progressNotes?.slice(0,10),
  };
}

async function getFirebaseIdToken(forceRefresh=false):Promise<string>{
  if(!Capacitor.isNativePlatform()){
    const webUser=webCurrentUser();
    if(!webUser)throw new Error('No authenticated Firebase web user is available.');
    const token=await webUser.getIdToken(forceRefresh);
    if(token)return token;
  }
  try{
    const current=await FirebaseAuthentication.getCurrentUser();
    if(current?.user){
      const result=await FirebaseAuthentication.getIdToken({forceRefresh});
      const token=String(result?.token||'').trim();
      if(token)return token;
    }
  }catch{}
  throw new Error('Could not obtain a valid Firebase Auth ID token.');
}

async function postAIAssistant(req:AIAssistantRequest,token:string):Promise<Response>{
  return fetch(getAIEndpoint(),{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({
      patient:compactAIPatient(req.patient),
      assistantTask:req.task,
      draftType:req.draftType,
      userPrompt:req.userPrompt,
      imageBase64:req.imageBase64||undefined,
    }),
  });
}

export async function analyzePatientWithAI(patient:Patient):Promise<AIClinicalResult>{
  const endpoint=getAIEndpoint();
  if(!endpoint)throw new Error('CardioVault AI backend is not configured yet.');
  const token=await getFirebaseIdToken(false);
  let response:Response;
  try{
    response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({patient:compactAIPatient(patient)})});
  }catch{
    throw new Error('Could not reach the CardioVault AI server. Check the device internet connection and try again.');
  }
  let payload:any={};
  try{payload=await response.json();}catch{payload={};}
  if(!response.ok){
    const message=String(payload?.error||`CardioVault AI server returned HTTP ${response.status}.`);
    if(response.status===401)throw new Error('Your CardioVault session expired. Sign in again, then retry.');
    if(response.status===429)throw new Error(message);
    throw new Error(message.slice(0,400));
  }
  if(!payload?.diagnosticAnalysis)throw new Error('The AI server returned an incomplete clinical response. Tap Re-analyze to try again.');
  return payload as AIClinicalResult;
}

export type AIAssistantTask =
  | 'summary'|'timeline'|'problems'|'trends'|'labs'|'abg'|'ecg'|'draft_note'|'handover'|'medication'|'protocol'|'general';

export type AIDraftType =
  | 'progress'|'daily_review'|'admission'|'discharge'|'consultation'|'handover';

export interface AIAssistantRequest {
  task:AIAssistantTask;
  draftType?:AIDraftType;
  userPrompt?:string;
  patient?:Patient|null;
  imageBase64?:string;
  clinician?:{name:string;role:string};
}

export interface AIAssistantResponse {
  text:string;
  task:AIAssistantTask;
  draftType?:AIDraftType;
  disclaimer:string;
  timestamp:string;
}

export async function callAIAssistant(req:AIAssistantRequest):Promise<AIAssistantResponse>{
  let token=await getFirebaseIdToken(false);
  let response:Response;
  try{
    response=await postAIAssistant(req,token);
  }catch{
    throw new Error('Could not reach the CardioVault AI server. Verify network connection and try again.');
  }

  let payload:any={};
  let rawText='';
  try{
    rawText=await response.text();
    try{payload=rawText?JSON.parse(rawText):{};}catch{payload={};}
  }catch{
    payload={};
  }

  // Native Firebase tokens can occasionally be stale after a long-lived Android session.
  // Refresh once and retry only on authentication failure.
  if(response.status===401){
    token=await getFirebaseIdToken(true);
    try{
      response=await postAIAssistant(req,token);
      rawText=await response.text();
      try{payload=rawText?JSON.parse(rawText):{};}catch{payload={};}
    }catch{
      throw new Error('Could not reach the CardioVault AI server after refreshing your Firebase session.');
    }
  }

  if(!response.ok){
    const message=String(payload?.error||rawText?.trim()||`AI server returned HTTP ${response.status}.`);
    if(response.status===401)throw new Error('Your CardioVault Firebase session is not authorized for AI. Sign in again, then retry.');
    throw new Error(message.slice(0,500));
  }

  const text=[
    payload?.diagnosticAnalysis?`Clinical synthesis:\\n${payload.diagnosticAnalysis}`:'',
    Array.isArray(payload?.differentialDiagnoses)&&payload.differentialDiagnoses.length?`Differential considerations:\\n${payload.differentialDiagnoses.map((d:any)=>`• ${d.diagnosis}: ${d.rationale} [${d.urgency}]`).join('\\n')}`:'',
    Array.isArray(payload?.recommendedActions)&&payload.recommendedActions.length?`Suggested clinician-review actions:\\n${payload.recommendedActions.map((x:any)=>`• ${x}`).join('\\n')}`:'',
    Array.isArray(payload?.safetyChecks)&&payload.safetyChecks.length?`Safety checks:\\n${payload.safetyChecks.map((x:any)=>`• ${x}`).join('\\n')}`:'',
    Array.isArray(payload?.missingData)&&payload.missingData.length?`Missing/uncertain data:\\n${payload.missingData.map((x:any)=>`• ${x}`).join('\\n')}`:'',
  ].filter(Boolean).join('\\n\\n');

  if(!text)throw new Error('The AI server returned an empty clinical response.');
  return {text,task:req.task,draftType:req.draftType,disclaimer:'AI-generated clinical assistance. Verify against the patient record, current guidelines and clinical judgment before acting.',timestamp:new Date().toISOString()};
}
