import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {FirebaseFirestore} from '@capacitor-firebase/firestore';
import {webCurrentUser,webDoc,getDoc as webGetDoc,setDoc as webSetDoc,getDocs as webGetDocs,webCollection} from './webFirebase';
import { AuthorizationService } from './authorizationService';
import { UserProfile, ClinicalRole } from '../types/clinical';
import { isSupabaseStorageConfigured, registerSupabaseUnitAccessCode, revokeSupabaseUnitAccessCode, redeemSupabaseUnitAccessCode } from './supabaseStorage';
export type WorkspaceRole='owner'|'view_only'|'clinical_editor';
export interface WorkspaceAccessState{workspaceId:string;role:WorkspaceRole;unitId:string|null;unitName:string|null;unitIds?:string[];unitNames?:Record<string,string>;}
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
export async function ensureOwnerWorkspace():Promise<WorkspaceAccessState|null>{const id=await uid();if(!id||!(await isMasterAccount()))return null;const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};try{const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}`});const data=safe(result?.snapshot);if(data?.ownerUid===id&&String(data?.ownerEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL){setStoredWorkspaceAccess(state);return state;}if(data?.ownerUid&&data.ownerUid!==id)return null;}catch(error){console.warn('Master workspace read failed; attempting bootstrap:',error);}try{await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}`,data:{ownerUid:id,ownerEmail:MASTER_ACCOUNT_EMAIL,schemaVersion:12,createdAt:new Date().toISOString()},merge:true});setStoredWorkspaceAccess(state);try{const owner=AuthorizationService.getCurrentUser();const teamRef=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;const team={...owner,userId:id,uid:id,name:owner.name||'Dr. Mohamed Khalid',email:MASTER_ACCOUNT_EMAIL,role:'department_admin',departmentId:'dept-cardiology',assignedUnitIds:['unit-ccu-1','unit-ccu-2','unit-cardiology-ward','unit-icu-1'],status:'active',updatedAt:new Date().toISOString()};if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:teamRef,data:team,merge:true});else await webSetDoc(webDoc(teamRef),team,{merge:true});}catch(error){console.warn('Owner team registration failed:',error);}return state;}catch(error){console.warn('Master workspace bootstrap failed:',error);return null;}}
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
  const existingMembership = Capacitor.isNativePlatform()
    ? safe((await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`})).snapshot) || {}
    : (await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`))).data() || {};
  const existingUnitIds = Array.isArray(existingMembership.unitIds) ? existingMembership.unitIds.map(String) : (existingMembership.unitId ? [String(existingMembership.unitId)] : []);
  const unitIds = Array.from(new Set([...existingUnitIds, String(access.unitId)]));
  const membership={uid:id,workspaceId:MASTER_WORKSPACE_ID,unitId:existingMembership.unitId||access.unitId,unitIds,role:access.role==='view_only'?'view_only':'clinical_editor',accessCodeHash,accessCodeHashes:Array.from(new Set([...(Array.isArray(existingMembership.accessCodeHashes)?existingMembership.accessCodeHashes:[]),accessCodeHash])),active:true,forceReauth:false,joinedAt:existingMembership.joinedAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`,data:membership,merge:true});
    await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}/units/${access.unitId}`,data:{uid:id,unitId:String(access.unitId),unitName:String(access.unitName||''),accessCodeHash,role:membership.role,active:true,joinedAt:new Date().toISOString()},merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`),membership,{merge:true});
    await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}/units/${access.unitId}`),{uid:id,unitId:String(access.unitId),unitName:String(access.unitName||''),accessCodeHash,role:membership.role,active:true,joinedAt:new Date().toISOString()},{merge:true});
  }
  const currentProfile = AuthorizationService.getUsers().find(u=>u.userId===id) || AuthorizationService.getCurrentUser();
  const nextRole = currentProfile?.role && currentProfile.role!=='viewer' ? currentProfile.role : (access.role==='view_only'?'viewer':'resident');
  const teamProfile: UserProfile = {...currentProfile,userId:id,name:currentProfile?.name||'Clinician',email:currentProfile?.email||'',role:nextRole as ClinicalRole,departmentId:'dept-cardiology',assignedUnitIds:unitIds,status:'active',updatedAt:new Date().toISOString()};
  AuthorizationService.saveUsers([...AuthorizationService.getUsers().filter(u=>u.userId!==id),teamProfile]);
  try{
    const teamRef=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;
    if(Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({reference:teamRef,data:{...teamProfile,uid:id},merge:true});
    else await webSetDoc(webDoc(teamRef),{...teamProfile,uid:id},{merge:true});
  }catch(error){console.warn('Team directory cloud registration failed:',error);}
  let unitName=String(access.unitName||'');
  try{
    if(Capacitor.isNativePlatform()){
      const unit:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/units/${access.unitId}`});
      unitName=String(safe(unit?.snapshot)?.name||unitName);
    }else{
      const unit=await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/units/${access.unitId}`));
      unitName=String(unit.data()?.name||unitName);
    }
  }catch{}
  const state={workspaceId:MASTER_WORKSPACE_ID,role:(access.role==='view_only'?'view_only':'clinical_editor') as WorkspaceRole,unitId:String(access.unitId),unitName,unitIds,unitNames:{[String(access.unitId)]:unitName}};
  setStoredWorkspaceAccess(state);
  return state;
}
export async function getUnitAccessCodes():Promise<UnitAccessCode[]>{const state=await ensureOwnerWorkspace();if(!state)return[];const result:any=await FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes`});const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];return snapshots.map((s:any)=>{const d=safe(s)||{};return{unitId:String(d.unitId||''),unitName:String(d.unitName||'Unit'),code:String(d.code||''),role:(d.role==='view_only'?'view_only':'clinical_editor') as Exclude<WorkspaceRole,'owner'>,active:d.active!==false};}).filter(x=>x.unitId&&x.code&&x.active);}
export async function generateUnitAccessCode(unitId:string,unitName:string,role:Exclude<WorkspaceRole,'owner'>='clinical_editor'):Promise<string>{const state=await ensureOwnerWorkspace();if(!state)throw new Error('Only the Master Account can generate Unit Access Codes.');const existing=await getUnitAccessCodes();for(const item of existing.filter(x=>x.unitId===unitId&&x.active))await revokeUnitAccessCode(item.code);const code=newCode();const accessCodeHash=await hash(code);const now=new Date().toISOString();const payload={hash:accessCodeHash,code,workspaceId:MASTER_WORKSPACE_ID,unitId,unitName,role,active:true,createdAt:now};await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{...payload,createdBy:state.workspaceId},merge:false});await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:payload,merge:true});return code;}
export async function revokeUnitAccessCode(code:string):Promise<void>{const state=await ensureOwnerWorkspace();if(!state)throw new Error('Only the Master Account can revoke Unit Access Codes.');const accessCodeHash=await hash(code);const revokedAt=new Date().toISOString();await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});try{if(Capacitor.isNativePlatform()){const result:any=await FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/members`});const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];for(const snapshot of snapshots){const data=safe(snapshot)||{};if(String(data.accessCodeHash||'')===accessCodeHash){const memberId=String(snapshot?.id||snapshot?.documentId||snapshot?.reference?.id||'');if(memberId)await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${memberId}`,data:{active:false,forceReauth:true,revokedAt},merge:true});}}}else{const snap=await webGetDocs(webCollection(`workspaces/${MASTER_WORKSPACE_ID}/members`));for(const docSnap of snap.docs){const data:any=docSnap.data();if(String(data.accessCodeHash||'')===accessCodeHash)await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${docSnap.id}`),{active:false,forceReauth:true,revokedAt},{merge:true});}}}catch(error){console.warn('Failed to invalidate old unit-code memberships:',error);throw new Error('The old Unit Access Code was revoked, but active memberships could not all be invalidated. Check Firestore permissions.');}}
export async function getTeamDirectoryMembers():Promise<any[]>{
  const id=await uid();
  if(!id) return [];
  try{
    // The master account must bootstrap/validate the workspace before listing the team.
    // This also guarantees that the owner's team profile exists before the directory query.
    if(await isMasterAccount()) await ensureOwnerWorkspace();
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/team`});
      return (result?.snapshots||[]).map((s:any)=>safe(s)||{}).filter((x:any)=>(x?.uid||x?.userId)&&!String(x?.userId||x?.uid).startsWith('user-')&&!String(x?.email||'').endsWith('@cardiovault.org'));
    }
    const snap=await webGetDocs(webCollection(`workspaces/${MASTER_WORKSPACE_ID}/team`));
    return snap.docs.map((d:any)=>d.data()).filter((x:any)=>!String(x?.userId||x?.uid||'').startsWith('user-')&&!String(x?.email||'').endsWith('@cardiovault.org'));
  }catch(error){console.warn('Team directory cloud read failed:',error);return [];}
}
export async function updateTeamDirectoryMember(userId:string,updates:Record<string,any>):Promise<any>{
  const state=await ensureOwnerWorkspace(); if(!state) throw new Error('Only the Master Account can manage the Team Directory.');
  const cleanUnitIds=Array.from(new Set(Array.isArray(updates.assignedUnitIds)?updates.assignedUnitIds.map(String).filter(Boolean):[]));
  if(!cleanUnitIds.length) throw new Error('Assign at least one clinical unit.');
  const now=new Date().toISOString();
  const ref=`workspaces/${MASTER_WORKSPACE_ID}/team/${userId}`;
  const patch={...updates,assignedUnitIds:cleanUnitIds,updatedAt:now};
  const existingRef=`workspaces/${MASTER_WORKSPACE_ID}/members/${userId}`;
  const existingMember=Capacitor.isNativePlatform()
    ? safe((await FirebaseFirestore.getDocument({reference:existingRef})).snapshot)||{}
    : (await webGetDoc(webDoc(existingRef))).data()||{};
  const membership={
    uid:userId,
    workspaceId:MASTER_WORKSPACE_ID,
    unitId:cleanUnitIds[0],
    unitIds:cleanUnitIds,
    role:updates['role']==='viewer'?'view_only':'clinical_editor',
    active:updates['status']!=='inactive',
    forceReauth:false,
    joinedAt:existingMember.joinedAt||now,
    updatedAt:now,
  };
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:ref,data:patch,merge:true});
    await FirebaseFirestore.setDocument({reference:existingRef,data:membership,merge:true});
  }else{
    await webSetDoc(webDoc(ref),patch,{merge:true});
    await webSetDoc(webDoc(existingRef),membership,{merge:true});
  }
  const users=AuthorizationService.getUsers(); const local=users.find(u=>u.userId===userId);
  if(local){ const updated={...local,...patch}; AuthorizationService.saveUsers(users.map(u=>u.userId===userId?updated:u)); return updated; }
  return patch;
}
export async function removeTeamDirectoryMember(userId:string):Promise<void>{
  await updateTeamDirectoryMember(userId,{status:'inactive'});
  try{
    if(Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${userId}`,data:{active:false,forceReauth:true,updatedAt:new Date().toISOString()},merge:true});
    else await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${userId}`),{active:false,forceReauth:true,updatedAt:new Date().toISOString()},{merge:true});
  }catch(error){console.warn('Member access revocation failed:',error);}
}
export async function validateCurrentWorkspaceAccess():Promise<boolean|null>{const id=await uid();if(!id)return null;if(await isMasterAccount())return !!(await ensureOwnerWorkspace());try{let membership:any=null;if(Capacitor.isNativePlatform()){const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`});membership=safe(result?.snapshot);}else{const result=await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`));membership=result.exists()?result.data():null;}if(!membership)return null;if(membership?.active===false||membership?.forceReauth===true)return false;if(Array.isArray(membership.unitIds)&&membership.unitIds.length)return true;const hashes=Array.from(new Set([membership.accessCodeHash,...(Array.isArray(membership.accessCodeHashes)?membership.accessCodeHashes:[])].filter(Boolean).map(String)));if(!hashes.length)return false;for(const h of hashes){let access:any=null;if(Capacitor.isNativePlatform()){const result:any=await FirebaseFirestore.getDocument({reference:`accessCodes/${h}`});access=safe(result?.snapshot);}else{const result=await webGetDoc(webDoc(`accessCodes/${h}`));access=result.exists()?result.data():null;}if(access?.active&&access.workspaceId===MASTER_WORKSPACE_ID)return true;}return false;}catch(error){console.warn('Workspace access validation failed:',error);return null;}}
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
