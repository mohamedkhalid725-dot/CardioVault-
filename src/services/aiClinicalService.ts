import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
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
  try{
    const current=await FirebaseAuthentication.getCurrentUser();
    if(current?.user){
      const result=await FirebaseAuthentication.getIdToken({forceRefresh:false});
      const token=String(result?.token||'').trim();
      if(token) return token;
    }
  }catch{}
  // Web session fallback
  return 'cardiovault-web-session';
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
