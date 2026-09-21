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

// The endpoint defaults to local /api/ai/analyze or custom VITE_CARDIOVAULT_AI_ENDPOINT
const getAIEndpoint=()=>String((import.meta as any).env?.VITE_CARDIOVAULT_AI_ENDPOINT||'/api/ai/analyze').trim();

export const isAIBackendConfigured=()=>true;

async function getFirebaseIdToken():Promise<string>{
  if(!Capacitor.isNativePlatform()){
    const webUser=webCurrentUser();
    if(!webUser)throw new Error('No authenticated Firebase web user is available.');
    const token=await webUser.getIdToken(false);
    if(token)return token;
  }
  try{
    const current=await FirebaseAuthentication.getCurrentUser();
    if(current?.user){
      const result=await FirebaseAuthentication.getIdToken({forceRefresh:false});
      const token=String(result?.token||'').trim();
      if(token)return token;
    }
  }catch{}
  throw new Error('Could not obtain a valid Firebase Auth ID token.');
}

export async function analyzePatientWithAI(patient:Patient):Promise<AIClinicalResult>{
  const endpoint=getAIEndpoint();
  if(!endpoint)throw new Error('CardioVault AI backend is not configured yet.');
  const token=await getFirebaseIdToken();
  let response:Response;
  try{
    response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({patient})});
  }catch{
    throw new Error('Could not reach the CardioVault AI server. Check the device internet connection and try again.');
  }

  let payload:any={};
  try{payload=await response.json();}catch{payload={};}
  if(!response.ok){
    const message=String(payload?.error||'CardioVault AI request failed.');
    if(response.status===401)throw new Error('Your CardioVault session expired. Sign in again, then retry.');
    if(response.status===429)throw new Error(message);
    throw new Error(message.slice(0,400));
  }

  if(!payload?.diagnosticAnalysis)throw new Error('The AI server returned an incomplete clinical response. Tap Re-analyze to try again.');
  return payload as AIClinicalResult;
}

export type AIAssistantTask =
  | 'summary'
  | 'timeline'
  | 'problems'
  | 'trends'
  | 'labs'
  | 'abg'
  | 'ecg'
  | 'draft_note'
  | 'handover'
  | 'medication'
  | 'protocol'
  | 'general';

export type AIDraftType =
  | 'progress'
  | 'daily_review'
  | 'admission'
  | 'discharge'
  | 'consultation'
  | 'handover';

export interface AIAssistantRequest {
  task: AIAssistantTask;
  draftType?: AIDraftType;
  userPrompt?: string;
  patient?: Patient | null;
  imageBase64?: string;
  clinician?: { name: string; role: string };
}

export interface AIAssistantResponse {
  text: string;
  task: AIAssistantTask;
  draftType?: AIDraftType;
  disclaimer: string;
  timestamp: string;
}

export async function callAIAssistant(req: AIAssistantRequest): Promise<AIAssistantResponse> {
  const token = await getFirebaseIdToken();
  let response: Response;
  try {
    response = await fetch('https://us-central1-ccu-notebook.cloudfunctions.net/analyzeClinicalPatient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({patient:req.patient,assistantTask:req.task,draftType:req.draftType,userPrompt:req.userPrompt,imageBase64:req.imageBase64||undefined}),
    });
  } catch {
    throw new Error('Could not reach the CardioVault AI server. Verify network connection and try again.');
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = String(payload?.error || 'AI Assistant request failed.');
    throw new Error(message);
  }

  const text = [
    payload?.diagnosticAnalysis ? `Clinical synthesis:\n${payload.diagnosticAnalysis}` : '',
    Array.isArray(payload?.differentialDiagnoses)&&payload.differentialDiagnoses.length ? `Differential considerations:\n${payload.differentialDiagnoses.map((d:any)=>`• ${d.diagnosis}: ${d.rationale} [${d.urgency}]`).join('\n')}` : '',
    Array.isArray(payload?.recommendedActions)&&payload.recommendedActions.length ? `Suggested clinician-review actions:\n${payload.recommendedActions.map((x:any)=>`• ${x}`).join('\n')}` : '',
    Array.isArray(payload?.safetyChecks)&&payload.safetyChecks.length ? `Safety checks:\n${payload.safetyChecks.map((x:any)=>`• ${x}`).join('\n')}` : '',
    Array.isArray(payload?.missingData)&&payload.missingData.length ? `Missing/uncertain data:\n${payload.missingData.map((x:any)=>`• ${x}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return {text:text||'No clinical synthesis returned.',task:req.task,draftType:req.draftType,disclaimer:'AI-generated clinical assistance. Verify against the patient record, current guidelines and clinical judgment before acting.',timestamp:new Date().toISOString()} as AIAssistantResponse;
}

