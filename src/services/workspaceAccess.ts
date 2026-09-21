import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {FirebaseFirestore} from '@capacitor-firebase/firestore';
import {webCurrentUser,webDoc,getDoc as webGetDoc,setDoc as webSetDoc} from './webFirebase';
import { isSupabaseStorageConfigured, registerSupabaseUnitAccessCode, revokeSupabaseUnitAccessCode, redeemSupabaseUnitAccessCode } from './supabaseStorage';
export type WorkspaceRole='owner'|'view_only'|'clinical_editor';
export interface WorkspaceAccessState{workspaceId:string;role:WorkspaceRole;unitId:string|null;unitName:string|null;}
export interface UnitAccessCode{unitId:string;unitName:string;code:string;role:Exclude<WorkspaceRole,'owner'>;active:boolean;}
export const MASTER_ACCOUNT_EMAIL='mohamedkhalid725@gmail.com';
export const MASTER_WORKSPACE_ID='cardiovault_master_workspace';
const ACTIVE_KEY='cardiovault_active_workspace_access_v1';
const safe=(snapshot:any):any=>{try{return typeof snapshot?.data==='function'?(snapshot.data()||null):(snapshot?.data||null);}catch{return null;}};
const currentUser=async():Promise<any|null>=>{if(!Capacitor.isNativePlatform())return webCurrentUser();try{return (await FirebaseAuthentication.getCurrentUser()).user||null;}catch{return null;}};
const uid=async():Promise<string|null>=>{const user=await currentUser();return user?.uid||null;};
export async function isMasterAccount():Promise<boolean>{const user=await currentUser();const firebaseEmail=String(user?.email||'').trim().toLowerCase();if(firebaseEmail===MASTER_ACCOUNT_EMAIL)return true;try{const raw=localStorage.getItem('cardiovault_auth_v2');const saved=raw?JSON.parse(raw):null;return String(saved?.userEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL;}catch{return false;}}
const hash=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.trim().toUpperCase()));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');};
const newCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);const raw=Array.from(bytes).map(b=>alphabet[b%alphabet.length]).join('');return`CV-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}`;};
export const getStoredWorkspaceAccess=():WorkspaceAccessState|null=>{try{const value=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');return value?.workspaceId?value:null;}catch{return null;}};
export const setStoredWorkspaceAccess=(state:WorkspaceAccessState|null)=>{if(state)localStorage.setItem(ACTIVE_KEY,JSON.stringify(state));else localStorage.removeItem(ACTIVE_KEY);};
export async function ensureOwnerWorkspace():Promise<WorkspaceAccessState|null>{const id=await uid();if(!id||!(await isMasterAccount()))return null;const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};try{const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}`});const data=safe(result?.snapshot);if(data?.ownerUid===id&&String(data?.ownerEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL){setStoredWorkspaceAccess(state);return state;}if(data?.ownerUid&&data.ownerUid!==id)return null;}catch(error){console.warn('Master workspace read failed; attempting bootstrap:',error);}try{await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}`,data:{ownerUid:id,ownerEmail:MASTER_ACCOUNT_EMAIL,schemaVersion:12,createdAt:new Date().toISOString()},merge:true});setStoredWorkspaceAccess(state);return state;}catch(error){console.warn('Master workspace bootstrap failed:',error);return null;}}
export async function redeemUnitAccessCode(raw:string):Promise<WorkspaceAccessState>{
  const id=await uid();
  if(!id)throw new Error('A Firebase account must be signed in before entering an access code.');
  if(await isMasterAccount())return (await ensureOwnerWorkspace())||{workspaceId:MASTER_WORKSPACE_ID,role:'owner',unitId:null,unitName:null};
  const code=raw.trim().toUpperCase();
  if(code.length<6)throw new Error('Invalid Unit Access Code.');
  const accessCodeHash=await hash(code);
  let supabaseAccess: { unitId:string; unitName:string; role:'view_only'|'clinical_editor' } | null = null;
  if (isSupabaseStorageConfigured()) {
    try { supabaseAccess = await redeemSupabaseUnitAccessCode(code); }
    catch (error) { console.warn('Supabase Unit membership redemption failed:', error); }
  }
  let access:any;
  if(Capacitor.isNativePlatform()){
    const result:any=await FirebaseFirestore.getDocument({reference:`accessCodes/${accessCodeHash}`});
    access=safe(result?.snapshot);
  }else{
    const result=await webGetDoc(webDoc(`accessCodes/${accessCodeHash}`));
    access=result.exists()?result.data():null;
  }
  if(supabaseAccess) access={...access,unitId:supabaseAccess.unitId,unitName:supabaseAccess.unitName,role:supabaseAccess.role};
  if(!access?.active||access.workspaceId!==MASTER_WORKSPACE_ID||!access.unitId)throw new Error('Invalid or inactive Unit Access Code.');
  const membership={uid:id,workspaceId:MASTER_WORKSPACE_ID,unitId:access.unitId,role:access.role==='view_only'?'view_only':'clinical_editor',accessCodeHash,joinedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`,data:membership,merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`),membership,{merge:true});
  }
  let unitName=String(access.unitName||'');
  try{
    if(Capacitor.isNativePlatform()){
      const unit:any=await FirebaseFirestore.getDocument({reference:`${MASTER_WORKSPACE_ID}/units/${access.unitId}`});
      unitName=String(safe(unit?.snapshot)?.name||unitName);
    }else{
      const unit=await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/units/${access.unitId}`));
      unitName=String(unit.data()?.name||unitName);
    }
  }catch{}
  const state={workspaceId:MASTER_WORKSPACE_ID,role:(access.role==='view_only'?'view_only':'clinical_editor') as WorkspaceRole,unitId:String(access.unitId),unitName};
  setStoredWorkspaceAccess(state);
  return state;
}
export async function getUnitAccessCodes():Promise<UnitAccessCode[]>{const state=await ensureOwnerWorkspace();if(!state)return[];const result:any=await FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes`});const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];return snapshots.map((s:any)=>{const d=safe(s)||{};return{unitId:String(d.unitId||''),unitName:String(d.unitName||'Unit'),code:String(d.code||''),role:(d.role==='view_only'?'view_only':'clinical_editor') as Exclude<WorkspaceRole,'owner'>,active:d.active!==false};}).filter(x=>x.unitId&&x.code&&x.active);}
export async function generateUnitAccessCode(unitId:string,unitName:string,role:Exclude<WorkspaceRole,'owner'>='clinical_editor'):Promise<string>{const state=await ensureOwnerWorkspace();if(!state)throw new Error('Only the Master Account can generate Unit Access Codes.');const existing=await getUnitAccessCodes();for(const item of existing.filter(x=>x.unitId===unitId&&x.active))await revokeUnitAccessCode(item.code);const code=newCode();const accessCodeHash=await hash(code);const now=new Date().toISOString();const payload={hash:accessCodeHash,code,workspaceId:MASTER_WORKSPACE_ID,unitId,unitName,role,active:true,createdAt:now};await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{...payload,createdBy:state.workspaceId},merge:false});await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:payload,merge:true});return code;}
export async function revokeUnitAccessCode(code:string):Promise<void>{const state=await ensureOwnerWorkspace();if(!state)throw new Error('Only the Master Account can revoke Unit Access Codes.');const accessCodeHash=await hash(code);await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{active:false,revokedAt:new Date().toISOString()},merge:true});await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:{active:false,revokedAt:new Date().toISOString()},merge:true});}
export function isOwnerAccess(){
  const state=getStoredWorkspaceAccess();
  if(state?.role==='owner'&&state?.workspaceId===MASTER_WORKSPACE_ID)return true;
  try{
    const raw=localStorage.getItem('cardiovault_auth_v2');
    const saved=raw?JSON.parse(raw):null;
    return String(saved?.userEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL.toLowerCase();
  }catch{return false;}
}
export function canEditClinicalData(){
  if(isOwnerAccess())return true;
  const role=getStoredWorkspaceAccess()?.role;
  return role==='owner'||role==='clinical_editor';
}
export function canManageStructure(){return isOwnerAccess();}
