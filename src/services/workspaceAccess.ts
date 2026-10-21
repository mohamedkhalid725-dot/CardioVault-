import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {FirebaseFirestore} from '@capacitor-firebase/firestore';
import {webCurrentUser,webDoc,getDoc as webGetDoc,setDoc as webSetDoc,getDocs as webGetDocs,deleteDoc as webDeleteDoc,webCollection} from './webFirebase';
import { sha256Hex } from './codeHash';
import { AuthorizationService } from './authorizationService';
import { UserProfile, ClinicalRole } from '../types/clinical';
export type WorkspaceRole='owner'|'view_only'|'clinical_editor';
export interface WorkspaceAccessState{workspaceId:string;role:WorkspaceRole;unitId:string|null;unitName:string|null;unitIds?:string[];unitNames?:Record<string,string>;}
export interface UnitAccessCode{unitId:string;unitName:string;code:string;role:Exclude<WorkspaceRole,'owner'>;active:boolean;}
export const MASTER_ACCOUNT_EMAIL='mohamedkhalid725@gmail.com';
export const MASTER_WORKSPACE_ID='cardiovault_master_workspace';
const ACTIVE_KEY='cardiovault_active_workspace_access_v1';
const safe=(snapshot:any):any=>{try{return typeof snapshot?.data==='function'?(snapshot.data()||null):(snapshot?.data||null);}catch{return null;}};
const currentUser=async():Promise<any|null>=>{if(!Capacitor.isNativePlatform())return webCurrentUser();try{return (await FirebaseAuthentication.getCurrentUser()).user||null;}catch{return null;}};
const uid=async():Promise<string|null>=>{const user=await currentUser();return user?.uid||null;};
// Exported so the invite and subscription services authenticate through the same
// Capacitor/web branch instead of duplicating the auth plumbing.
export const getCurrentUid=uid;
// Ownership is a document, not an e-mail address. The security rules grant
// administrative authority from /platformOwners/{uid}; the client asks the exact
// same question (the rules allow reading your own entry). The legacy e-mail check
// is kept so a broken read can never lock the real owner out of his own screens.
let ownerFlagCache:{uid:string;value:boolean}|null=null;
export async function isMasterAccount():Promise<boolean>{const user=await currentUser();const firebaseEmail=String(user?.email||'').trim().toLowerCase();if(firebaseEmail===MASTER_ACCOUNT_EMAIL)return true;let savedEmail='';try{const raw=localStorage.getItem('cardiovault_auth_v2');const saved=raw?JSON.parse(raw):null;savedEmail=String(saved?.userEmail||'').trim().toLowerCase();}catch{}if(savedEmail===MASTER_ACCOUNT_EMAIL)return true;const id=String(user?.uid||'');if(!id)return false;if(ownerFlagCache?.uid===id)return ownerFlagCache.value;let value=false,answered=false;try{if(Capacitor.isNativePlatform()){value=!!safe((await FirebaseFirestore.getDocument({reference:`platformOwners/${id}`})).snapshot);}else{value=(await webGetDoc(webDoc(`platformOwners/${id}`))).exists();}answered=true;}catch{answered=false;}/* A denied read during token warm-up must never be cached as "not the owner". */if(answered)ownerFlagCache={uid:id,value};return value;}
const newCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);const raw=Array.from(bytes).map(b=>alphabet[b%alphabet.length]).join('');return`CV-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}`;};
export const getStoredWorkspaceAccess=():WorkspaceAccessState|null=>{try{const value=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');return value?.workspaceId?value:null;}catch{return null;}};
export function getActiveWorkspaceId():string{return getStoredWorkspaceAccess()?.workspaceId||MASTER_WORKSPACE_ID;}
export const setStoredWorkspaceAccess=(state:WorkspaceAccessState|null)=>{if(state)localStorage.setItem(ACTIVE_KEY,JSON.stringify(state));else localStorage.removeItem(ACTIVE_KEY);};
export async function ensureOwnerWorkspace():Promise<WorkspaceAccessState|null>{const id=await uid();if(!id||!(await isMasterAccount()))return null;const ownerEmail=String((await currentUser())?.email||MASTER_ACCOUNT_EMAIL).trim().toLowerCase();const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};const workspaceRef=`workspaces/${MASTER_WORKSPACE_ID}`;try{let data:any=null;if(Capacitor.isNativePlatform()){const result:any=await FirebaseFirestore.getDocument({reference:workspaceRef});data=safe(result?.snapshot);}else{const result=await webGetDoc(webDoc(workspaceRef));data=result.exists()?result.data():null;}if(data?.ownerUid===id||data?.createdBy===id){setStoredWorkspaceAccess(state);}else if((data?.ownerUid||data?.createdBy)&&(data.ownerUid||data.createdBy)!==id){return null;}else{const payload={createdBy:id,createdByEmail:ownerEmail,schemaVersion:12,createdAt:data?.createdAt||new Date().toISOString()};if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:workspaceRef,data:payload,merge:true});else await webSetDoc(webDoc(workspaceRef),payload,{merge:true});setStoredWorkspaceAccess(state);}}catch(error){console.warn('Master workspace bootstrap failed:',error);return null;}try{const owner=AuthorizationService.getCurrentUser();const teamRef=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;const team={...owner,userId:id,uid:id,name:owner.name||'Dr. Mohamed Khalid',email:ownerEmail,role:'department_admin',departmentId:'dept-cardiology',assignedUnitIds:[],status:'active',updatedAt:new Date().toISOString()};if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:teamRef,data:team,merge:true});else await webSetDoc(webDoc(teamRef),team,{merge:true});}catch(error){console.warn('Owner team registration failed:',error);}return state;}
export async function getActiveOwnerWorkspace():Promise<WorkspaceAccessState|null>{const stored=getStoredWorkspaceAccess();if(stored?.role==='owner')return stored;return await ensureOwnerWorkspace();}
export async function redeemUnitAccessCode(raw:string):Promise<WorkspaceAccessState>{
  const id=await uid();
  if(!id)throw new Error('A Firebase account must be signed in before entering an access code.');
  if(await isMasterAccount())return (await ensureOwnerWorkspace())||{workspaceId:MASTER_WORKSPACE_ID,role:'owner',unitId:null,unitName:null};
  const code=raw.trim().toUpperCase();
  if(code.length<6)throw new Error('Invalid Unit Access Code.');
  const accessCodeHash=await sha256Hex(code);
  let access:any;
  if(Capacitor.isNativePlatform()){
    const result:any=await FirebaseFirestore.getDocument({reference:`accessCodes/${accessCodeHash}`});
    access=safe(result?.snapshot);
  }else{
    const result=await webGetDoc(webDoc(`accessCodes/${accessCodeHash}`));
    access=result.exists()?result.data():null;
  }
  const targetWorkspace=String(access?.workspaceId||'');
  if(!access?.active||!targetWorkspace||!access.unitId)throw new Error('Invalid or inactive Unit Access Code.');
  // Point the app at the workspace this code belongs to before the first write so
  // any helper resolving getActiveWorkspaceId() during the join sees the right one.
  // A failed join restores the previous stored state instead of stranding the app.
  const previousAccess=getStoredWorkspaceAccess();
  setStoredWorkspaceAccess({workspaceId:targetWorkspace,role:(access.role==='view_only'?'view_only':'clinical_editor') as WorkspaceRole,unitId:String(access.unitId),unitName:String(access.unitName||''),unitIds:[String(access.unitId)]});
  try{
  const existingMembership = Capacitor.isNativePlatform()
    ? safe((await FirebaseFirestore.getDocument({reference:`workspaces/${targetWorkspace}/members/${id}`})).snapshot) || {}
    : (await webGetDoc(webDoc(`workspaces/${targetWorkspace}/members/${id}`))).data() || {};
  const existingUnitIds = Array.isArray(existingMembership.unitIds) ? existingMembership.unitIds.map(String) : (existingMembership.unitId ? [String(existingMembership.unitId)] : []);
  const unitIds = Array.from(new Set([...existingUnitIds, String(access.unitId)]));
  const membership={uid:id,workspaceId:targetWorkspace,unitId:existingMembership.unitId||access.unitId,unitIds,role:access.role==='view_only'?'view_only':'clinical_editor',accessCodeHash,accessCodeHashes:Array.from(new Set([...(Array.isArray(existingMembership.accessCodeHashes)?existingMembership.accessCodeHashes:[]),accessCodeHash])),active:true,forceReauth:false,joinedAt:existingMembership.joinedAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${targetWorkspace}/members/${id}`,data:membership,merge:true});
    await FirebaseFirestore.setDocument({reference:`workspaces/${targetWorkspace}/members/${id}/units/${access.unitId}`,data:{uid:id,unitId:String(access.unitId),unitName:String(access.unitName||''),accessCodeHash,role:membership.role,active:true,joinedAt:new Date().toISOString()},merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${targetWorkspace}/members/${id}`),membership,{merge:true});
    await webSetDoc(webDoc(`workspaces/${targetWorkspace}/members/${id}/units/${access.unitId}`),{uid:id,unitId:String(access.unitId),unitName:String(access.unitName||''),accessCodeHash,role:membership.role,active:true,joinedAt:new Date().toISOString()},{merge:true});
  }
  const currentProfile = AuthorizationService.getUsers().find(u=>u.userId===id) || AuthorizationService.getCurrentUser();
  const nextRole = currentProfile?.role && !['pending','viewer'].includes(String(currentProfile.role)) ? currentProfile.role : (access.role==='view_only'?'viewer':'pending');
  const teamProfile: UserProfile = {...currentProfile,userId:id,name:currentProfile?.name||'Clinician',email:currentProfile?.email||'',role:nextRole as ClinicalRole,departmentId:'dept-cardiology',assignedUnitIds:unitIds,status:'active',updatedAt:new Date().toISOString()};
  AuthorizationService.saveUsers([...AuthorizationService.getUsers().filter(u=>u.userId!==id),teamProfile]);
  try{
    await writeTeamProfile(targetWorkspace,id,teamProfile);
  }catch(error){console.warn('Team directory cloud registration failed:',error);}
  let unitName=String(access.unitName||'');
  try{
    if(Capacitor.isNativePlatform()){
      const unit:any=await FirebaseFirestore.getDocument({reference:`workspaces/${targetWorkspace}/units/${access.unitId}`});
      unitName=String(safe(unit?.snapshot)?.name||unitName);
    }else{
      const unit=await webGetDoc(webDoc(`workspaces/${targetWorkspace}/units/${access.unitId}`));
      unitName=String(unit.data()?.name||unitName);
    }
  }catch{}
  const state={workspaceId:targetWorkspace,role:(access.role==='view_only'?'view_only':'clinical_editor') as WorkspaceRole,unitId:String(access.unitId),unitName,unitIds,unitNames:{[String(access.unitId)]:unitName}};
  setStoredWorkspaceAccess(state);
  return state;
  }catch(error){
    setStoredWorkspaceAccess(previousAccess);
    throw error;
  }
}
export async function getUnitAccessCodes():Promise<UnitAccessCode[]>{
  const state=await getActiveOwnerWorkspace();if(!state)return[];
  const reference=`workspaces/${state.workspaceId}/accessCodes`;
  let records:any[]=[];
  if(Capacitor.isNativePlatform()){
    const result:any=await FirebaseFirestore.getCollection({reference});
    records=(result?.snapshots||[]).map((s:any)=>safe(s)||{});
  }else{
    const result=await webGetDocs(webCollection(reference));
    records=result.docs.map((d:any)=>d.data());
  }
  return records.map((d:any)=>({
    unitId:String(d.unitId||''),
    unitName:String(d.unitName||'Unit'),
    code:String(d.code||''),
    role:(d.role==='view_only'?'view_only':'clinical_editor') as Exclude<WorkspaceRole,'owner'>,
    active:d.active!==false,
  })).filter(x=>x.unitId&&x.code&&x.active);
}
export async function generateUnitAccessCode(unitId:string,unitName:string,role:Exclude<WorkspaceRole,'owner'>='clinical_editor'):Promise<string>{
  const state=await getActiveOwnerWorkspace();
  if(!state)throw new Error('Only the Master Account can generate Unit Access Codes.');
  const existing=await getUnitAccessCodes();
  for(const item of existing.filter(x=>x.unitId===unitId&&x.active))await revokeUnitAccessCode(item.code);
  const code=newCode();const accessCodeHash=await sha256Hex(code);const now=new Date().toISOString();
  const payload={hash:accessCodeHash,code,workspaceId:state.workspaceId,unitId,unitName,role,active:true,createdAt:now};
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${state.workspaceId}/accessCodes/${accessCodeHash}`,data:{...payload,createdBy:state.workspaceId},merge:false});
    await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:payload,merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${state.workspaceId}/accessCodes/${accessCodeHash}`),{...payload,createdBy:state.workspaceId},{merge:false});
    await webSetDoc(webDoc(`accessCodes/${accessCodeHash}`),payload,{merge:true});
  }
  return code;
}
export async function revokeUnitAccessCode(code:string):Promise<void>{
  const state=await getActiveOwnerWorkspace();
  if(!state)throw new Error('Only the Master Account can revoke Unit Access Codes.');
  const accessCodeHash=await sha256Hex(code);
  const revokedAt=new Date().toISOString();
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${state.workspaceId}/accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});
    await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${state.workspaceId}/accessCodes/${accessCodeHash}`),{active:false,revokedAt},{merge:true});
    await webSetDoc(webDoc(`accessCodes/${accessCodeHash}`),{active:false,revokedAt},{merge:true});
  }
  try{
    const memberCollection=`workspaces/${state.workspaceId}/members`;
    const unitIdFromCode=await (async()=>{
      try{
        if(Capacitor.isNativePlatform()) return String(safe((await FirebaseFirestore.getDocument({reference:`accessCodes/${accessCodeHash}`})).snapshot)?.unitId||'');
        const snap=await webGetDoc(webDoc(`accessCodes/${accessCodeHash}`));
        return String(snap.data()?.unitId||'');
      }catch{return '';}
    })();
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getCollection({reference:memberCollection});
      for(const snapshot of result?.snapshots||[]){
        const memberId=String(snapshot?.id||snapshot?.documentId||'');
        if(!memberId)continue;
        const data=safe(snapshot)||{};
        const hashes=[String(data.accessCodeHash||''),...(Array.isArray(data.accessCodeHashes)?data.accessCodeHashes.map(String):[])].filter(Boolean);
        const unitIds=Array.isArray(data.unitIds)?data.unitIds.map(String):[];
        const matches=hashes.includes(accessCodeHash) || (unitIdFromCode && unitIds.includes(unitIdFromCode));
        if(!matches)continue;
        const remainingUnitIds=unitIds.filter((u:string)=>u!==unitIdFromCode);
        const remainingHashes=hashes.filter((h:string)=>h!==accessCodeHash);
        const patch:any={unitIds:remainingUnitIds,accessCodeHashes:remainingHashes,updatedAt:revokedAt};
        if(String(data.accessCodeHash||'')===accessCodeHash) patch.accessCodeHash=remainingHashes[0]||'';
        if(!remainingUnitIds.length){patch.active=false;patch.forceReauth=true;patch.revokedAt=revokedAt;}
        await FirebaseFirestore.setDocument({reference:`${memberCollection}/${memberId}`,data:patch,merge:true});
        if(unitIdFromCode){try{await FirebaseFirestore.setDocument({reference:`${memberCollection}/${memberId}/units/${unitIdFromCode}`,data:{active:false,revokedAt},merge:true});}catch{}}
      }
    }else{
      const snap=await webGetDocs(webCollection(memberCollection));
      for(const docSnap of snap.docs){
        const data:any=docSnap.data();
        const hashes=[String(data.accessCodeHash||''),...(Array.isArray(data.accessCodeHashes)?data.accessCodeHashes.map(String):[])].filter(Boolean);
        const unitIds=Array.isArray(data.unitIds)?data.unitIds.map(String):[];
        const matches=hashes.includes(accessCodeHash) || (unitIdFromCode && unitIds.includes(unitIdFromCode));
        if(!matches)continue;
        const remainingUnitIds=unitIds.filter((u:string)=>u!==unitIdFromCode);
        const remainingHashes=hashes.filter((h:string)=>h!==accessCodeHash);
        const patch:any={unitIds:remainingUnitIds,accessCodeHashes:remainingHashes,updatedAt:revokedAt};
        if(String(data.accessCodeHash||'')===accessCodeHash) patch.accessCodeHash=remainingHashes[0]||'';
        if(!remainingUnitIds.length){patch.active=false;patch.forceReauth=true;patch.revokedAt=revokedAt;}
        await webSetDoc(webDoc(`${memberCollection}/${docSnap.id}`),patch,{merge:true});
        if(unitIdFromCode){try{await webSetDoc(webDoc(`${memberCollection}/${docSnap.id}/units/${unitIdFromCode}`),{active:false,revokedAt},{merge:true});}catch{}}
      }
    }
  }catch(error){console.warn('Failed to invalidate old unit-code memberships:',error);throw new Error('The old Unit Access Code was revoked, but active memberships could not all be invalidated. Check Firestore permissions.');}
}
// Clinical titles a member may pick for themselves. 'consultant' is not here on
// purpose: it is claimed once per unit through units/{unitId}.consultantUid and
// cleared only by the platform owner.
export type SelfClinicalRole='nurse'|'resident'|'specialist';
export const SELF_CLINICAL_ROLES:SelfClinicalRole[]=['nurse','resident','specialist'];
export async function getOwnTeamProfile():Promise<any|null>{
  const id=await uid();
  if(!id)return null;
  const ref=`workspaces/${getActiveWorkspaceId()}/team/${id}`;
  try{
    if(Capacitor.isNativePlatform())return safe((await FirebaseFirestore.getDocument({reference:ref})).snapshot);
    const snap=await webGetDoc(webDoc(ref));
    return snap.exists()?snap.data():null;
  }catch(error){console.warn('Own team profile lookup failed:',error);return null;}
}
export async function setOwnClinicalProfile(name:string,role:SelfClinicalRole):Promise<any>{
  const cleanName=String(name||'').trim();if(!cleanName)throw new Error('Enter your name.');if(!SELF_CLINICAL_ROLES.includes(role))throw new Error('Select a valid clinical role.');
  const id=await uid();
  if(!id)throw new Error('A Firebase account must be signed in.');
  if(await isMasterAccount())throw new Error('The Master Account does not require a clinical role selection.');
  const ref=`workspaces/${getActiveWorkspaceId()}/team/${id}`;
  let teamExists=false;
  try {
    if(Capacitor.isNativePlatform()) {
      const existing=await FirebaseFirestore.getDocument({reference:ref});
      teamExists=!!safe(existing?.snapshot);
    } else {
      teamExists=(await webGetDoc(webDoc(ref))).exists();
    }
  } catch {}
  const patch={uid:id,workspaceId:getActiveWorkspaceId(),...(!teamExists?{departmentId:'dept-cardiology',status:'active'}:{}),name:cleanName,role,roleSelectedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  try {
    if(Capacitor.isNativePlatform()) {
      await FirebaseFirestore.setDocument({reference:ref,data:patch,merge:true});
    } else {
      await webSetDoc(webDoc(ref),patch,{merge:true});
    }
  } catch (error:any) {
    const code=String(error?.code||'unknown');
    const message=String(error?.message||error||'Unknown Firestore error');
    console.error('Clinical role save failed:',{code,message,path:ref,error});
    throw new Error(`FIRESTORE_ROLE_SAVE_FAILED\\nCode: ${code}\\nMessage: ${message}\\nPath: ${ref}`);
  }
  const users=AuthorizationService.getUsers();
  const local=users.find(u=>u.userId===id);
  if(local)AuthorizationService.saveUsers(users.map(u=>u.userId===id?{...u,name:cleanName,role,updatedAt:patch.updatedAt}:u));
  return {...(local||{}),...patch,userId:id};
}
export async function getTeamDirectoryMembers():Promise<any[]>{
  const id=await uid();
  if(!id)return[];
  const localUsers=AuthorizationService.getUsers();
  const master=await isMasterAccount();
  try{
    if(master)await ensureOwnerWorkspace();
    const workspaceId=getActiveWorkspaceId();
    let teamProfiles:any[]=[];
    let memberRecords:any[]=[];
    if(Capacitor.isNativePlatform()){
      const [teamResult,memberResult]=await Promise.all([
        FirebaseFirestore.getCollection({reference:`workspaces/${workspaceId}/team`}).catch(error=>{console.warn('Team directory team query failed:',error);return null;}),
        master?FirebaseFirestore.getCollection({reference:`workspaces/${workspaceId}/members`}).catch(error=>{console.warn('Team directory membership query failed:',error);return null;}):Promise.resolve(null),
      ]);
      teamProfiles=(teamResult?.snapshots||[]).map((snapshot:any)=>({...safe(snapshot),uid:String(snapshot?.id||snapshot?.documentId||'')}));
      memberRecords=(memberResult?.snapshots||[]).map((snapshot:any)=>({...safe(snapshot),uid:String(snapshot?.id||snapshot?.documentId||'')}));
    }else{
      const [teamSnapshot,memberSnapshot]=await Promise.all([
        webGetDocs(webCollection(`workspaces/${workspaceId}/team`)).catch(error=>{console.warn('Team directory team query failed:',error);return null;}),
        master?webGetDocs(webCollection(`workspaces/${workspaceId}/members`)).catch(error=>{console.warn('Team directory membership query failed:',error);return null;}):Promise.resolve(null),
      ]);
      teamProfiles=(teamSnapshot?.docs||[]).map((doc:any)=>({...doc.data(),uid:doc.id}));
      memberRecords=(memberSnapshot?.docs||[]).map((doc:any)=>({...doc.data(),uid:doc.id}));
    }
    const localById=new Map(localUsers.map(profile=>[String(profile?.userId||''),profile]));
    const profilesById=new Map<string,any>();
    const validRoles=['pending','department_admin','consultant','specialist','resident','nurse','viewer','pharmacist','lab_user','radiology_user','coordinator'];
    for(const profile of teamProfiles){
      const profileId=String(profile?.userId||profile?.uid||'');
      if(!profileId||profileId.startsWith('user-'))continue;
      const local=localById.get(profileId);
      profilesById.set(profileId,{
        ...local,
        ...profile,
        userId:profileId,
        uid:profileId,
        email:'',
        name:String(profile?.name||local?.name||'Team member'),
        role:validRoles.includes(String(profile?.role))?profile.role:(local?.role||'pending'),
        departmentId:String(profile?.departmentId||'dept-cardiology'),
        assignedUnitIds:Array.isArray(profile?.assignedUnitIds)?profile.assignedUnitIds.map(String):[],
        status:profile?.status||'active',
      });
    }
    if(master){
      for(const member of memberRecords){
        const memberId=String(member?.uid||member?.userId||'');
        if(!memberId||memberId.startsWith('user-')||member?.active===false||member?.forceReauth===true)continue;
        const local=localById.get(memberId);
        const existing=profilesById.get(memberId)||{};
        profilesById.set(memberId,{
          ...local,
          ...existing,
          userId:memberId,
          uid:memberId,
          email:'',
          name:String(existing?.name||member?.name||local?.name||'Team member'),
          role:validRoles.includes(String(existing?.role))?existing.role:(validRoles.includes(String(local?.role))?local?.role:'pending'),
          departmentId:String(existing?.departmentId||'dept-cardiology'),
          assignedUnitIds:Array.isArray(existing?.assignedUnitIds)&&existing.assignedUnitIds.length?existing.assignedUnitIds.map(String):Array.from(new Set([...(Array.isArray(member?.unitIds)?member.unitIds:[]),...(member?.unitId?[member.unitId]:[])].map(String).filter(Boolean))),
          status:existing?.status||'active',
        });
      }
    }
    for(const local of localUsers){
      const localId=String(local?.userId||'');
      if(localId&&!localId.startsWith('user-')&&!profilesById.has(localId)&&local?.status!=='inactive')profilesById.set(localId,{...local,email:''});
    }
    return Array.from(profilesById.values()).filter(profile=>profile?.status!=='inactive');
  }catch(error){
    console.warn('Team directory cloud read failed:',error);
    return localUsers.filter((profile:any)=>profile?.userId&&profile.status!=='inactive').map((profile:any)=>({...profile,email:''}));
  }
}
export async function updateTeamDirectoryMember(userId:string,updates:Record<string,any>):Promise<any>{
  const workspaceId=getActiveWorkspaceId(); const master=await isMasterAccount(); if(!master)throw new Error('Only the platform owner can manage the Team Directory.');
  const cleanUnitIds=Array.from(new Set(Array.isArray(updates.assignedUnitIds)?updates.assignedUnitIds.map(String).filter(Boolean):[]));
  if(!cleanUnitIds.length) throw new Error('Assign at least one clinical unit.');
  const now=new Date().toISOString();
  const ref=`workspaces/${workspaceId}/team/${userId}`;
  const patch={...updates,assignedUnitIds:cleanUnitIds,updatedAt:now};
  const existingRef=`workspaces/${workspaceId}/members/${userId}`;
  const existingMember=Capacitor.isNativePlatform()
    ? safe((await FirebaseFirestore.getDocument({reference:existingRef})).snapshot)||{}
    : (await webGetDoc(webDoc(existingRef))).data()||{};
  const membership={
    uid:userId,
    workspaceId,
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
  const workspaceId=getActiveWorkspaceId(); const master=await isMasterAccount(); if(!master)throw new Error('Only the platform owner can remove department members.');
  if(userId===await uid())throw new Error('You cannot remove your own account from the department.');
  const teamRef=`workspaces/${workspaceId}/team/${userId}`;
  const memberRef=`workspaces/${workspaceId}/members/${userId}`;
  const unitsRef=`workspaces/${workspaceId}/members/${userId}/units`;
  const unitIds:string[]=[];
  try{
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getCollection({reference:unitsRef});
      for(const snapshot of result?.snapshots||[])unitIds.push(String(snapshot?.id||snapshot?.documentId||''));
      for(const unitId of unitIds)if(unitId)await FirebaseFirestore.deleteDocument({reference:`${unitsRef}/${unitId}`});
      await FirebaseFirestore.deleteDocument({reference:teamRef});
      await FirebaseFirestore.deleteDocument({reference:memberRef});
    }else{
      const snap=await webGetDocs(webCollection(unitsRef));
      for(const docSnap of snap.docs)await webDeleteDoc(docSnap.ref);
      await webDeleteDoc(webDoc(teamRef));
      await webDeleteDoc(webDoc(memberRef));
    }
  }catch(error){
    console.error('Complete member removal failed:',error);
    throw new Error('Could not completely remove this member from the department. Check Firestore permissions and try again.');
  }
  const users=AuthorizationService.getUsers().filter(u=>u.userId!==userId);
  AuthorizationService.saveUsers(users);
}
export async function validateCurrentWorkspaceAccess():Promise<boolean|null>{
  const id=await uid();
  if(!id)return null;
  if(await isMasterAccount())return !!(await ensureOwnerWorkspace());
  const workspaceId=getActiveWorkspaceId();
  try{
    let membership:any=null;
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${workspaceId}/members/${id}`});
      membership=safe(result?.snapshot);
    }else{
      const result=await webGetDoc(webDoc(`workspaces/${workspaceId}/members/${id}`));
      membership=result.exists()?result.data():null;
    }
    if(!membership)return null;
    if(membership?.active===false||membership?.forceReauth===true)return false;
    // An active membership is sufficient authorization. Access codes are only
    // required when the account is first enrolled; revocation is enforced through
    // membership.active / membership.forceReauth.
    const memberUnitIds=Array.isArray(membership?.unitIds)
      ? membership.unitIds.map(String).filter(Boolean)
      : (membership?.unitId ? [String(membership.unitId)] : []);
    return membership?.active!==false && !membership?.forceReauth && memberUnitIds.length>0;
  }catch(error){console.warn('Workspace access validation failed:',error);return null;}
}
export function isOwnerAccess(){
  const state=getStoredWorkspaceAccess();
  if(state?.role==='owner'&&state?.workspaceId)return true;
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
export async function createTeamWorkspace(name:string):Promise<WorkspaceAccessState>{
  const user=await currentUser();
  const id=String(user?.uid||'');
  const email=String(user?.email||'').trim();
  if(!id||!email)throw new Error('A Firebase account with an e-mail address must be signed in to create a Team Workspace.');
  const cleanName=String(name||'').trim();
  if(cleanName.length<2)throw new Error('Enter a Team Workspace name of at least 2 characters.');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const workspaceId=`ws_${Array.from(bytes).map(b=>alphabet[b%alphabet.length]).join('')}`;
  const now=new Date().toISOString();
  const workspaceRef=`workspaces/${workspaceId}`;
  // No ownerUid and no team profile: creating a workspace grants nothing. The
  // platform owner is the only owner, and access to the workspace comes from a
  // unit membership (access code) like every other account.
  const workspaceDoc={createdBy:id,createdByEmail:email,name:cleanName,schemaVersion:12,createdAt:now};
  if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:workspaceRef,data:workspaceDoc,merge:false});
  else await webSetDoc(webDoc(workspaceRef),workspaceDoc,{merge:false});
  return {workspaceId,role:'view_only',unitId:null,unitName:null};
}
export async function joinTeamWorkspace(code:string):Promise<WorkspaceAccessState>{return redeemUnitAccessCode(code);}

// ═══ Units the signed-in member belongs to ═══════════════════════════════════
// The rules never let a non-owner list the units collection (allow list is
// owner-only), so the ids come from the caller's own membership document and
// every unit is then fetched by id. A unit that cannot be read is skipped
// instead of failing the whole screen.
export interface MyUnit{id:string;name:string;type:string;totalBeds:number;consultantUid:string;capacityLocked:boolean;createdAtMs:number;createdBy:string;}

const readPath=async(path:string):Promise<any>=>{
  if(Capacitor.isNativePlatform()){
    const result:any=await FirebaseFirestore.getDocument({reference:path});
    const snapshot=result?.snapshot;
    try{return typeof snapshot?.data==='function'?(snapshot.data()||null):(snapshot?.data||null);}catch{return null;}
  }
  const snapshot=await webGetDoc(webDoc(path));
  return snapshot.exists()?snapshot.data():null;
};
const writePath=async(path:string,data:Record<string,any>,merge=true):Promise<void>=>{
  if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:path,data,merge});
  else await webSetDoc(webDoc(path),data,{merge});
};
// A NEW team profile must carry uid + workspaceId (+ dept/status), because the
// rules check those on create. An EXISTING one may only change name, role,
// roleSelectedAt and updatedAt, so the bootstrap fields are written only when the
// document is being created — adding them later would be an illegal diff.
const writeTeamProfile=async(workspaceId:string,userId:string,profile:UserProfile):Promise<void>=>{
  const reference=`workspaces/${workspaceId}/team/${userId}`;
  let exists=false;
  try{
    if(Capacitor.isNativePlatform())exists=!!safe((await FirebaseFirestore.getDocument({reference})).snapshot);
    else exists=(await webGetDoc(webDoc(reference))).exists();
  }catch{}
  const payload:Record<string,any>={...profile,uid:userId,workspaceId,...(exists?{}:{departmentId:'dept-cardiology',status:'active'})};
  await writePath(reference,payload,true);
};
const membershipUnitIds=(membership:any):string[]=>Array.from(new Set([
  ...(Array.isArray(membership?.unitIds)?membership.unitIds.map(String):[]),
  ...(membership?.unitId?[String(membership.unitId)]:[]),
].filter(Boolean)));
const toMyUnit=(unitId:string,data:any):MyUnit=>({
  id:String(data?.unitId||unitId),
  name:String(data?.name||'Unit'),
  type:String(data?.type||'ward'),
  totalBeds:Number(data?.totalBeds||0),
  consultantUid:String(data?.consultantUid||''),
  capacityLocked:data?.capacityLocked===true,
  createdAtMs:Number(data?.createdAtMs||0),
  createdBy:String(data?.createdBy||''),
});
export async function getMyUnits():Promise<MyUnit[]>{
  const id=await getCurrentUid();
  if(!id)return[];
  const workspaceId=getActiveWorkspaceId();
  // The platform owner holds no membership document: ownership itself is the
  // grant, and the rules let him list the whole units collection.
  if(await isMasterAccount()){
    try{
      const reference=`workspaces/${workspaceId}/units`;
      if(Capacitor.isNativePlatform()){
        const result:any=await FirebaseFirestore.getCollection({reference});
        return (result?.snapshots||[]).map((snapshot:any)=>{
          const data=safe(snapshot)||{};
          const unitId=String(snapshot?.id||snapshot?.documentId||data?.id||'');
          return unitId?toMyUnit(unitId,data):null;
        }).filter((unit:MyUnit|null):unit is MyUnit=>!!unit);
      }
      const result=await webGetDocs(webCollection(reference));
      return result.docs.map((docSnap:any)=>toMyUnit(docSnap.id,docSnap.data()||{}));
    }catch(error){
      console.warn('Owner unit listing failed:',error);
      return[];
    }
  }
  const membership=await readPath(`workspaces/${workspaceId}/members/${id}`).catch(error=>{console.warn('Own membership read failed:',error);return null;});
  const unitIds=membershipUnitIds(membership);
  if(!unitIds.length)return[];
  const units=await Promise.all(unitIds.map(async unitId=>{
    try{const data=await readPath(`workspaces/${workspaceId}/units/${unitId}`);return data?toMyUnit(unitId,data):null;}
    catch(error){console.warn('Unit lookup failed:',unitId,error);return null;}
  }));
  return units.filter((unit):unit is MyUnit=>!!unit);
}
// Creating a unit makes you its consultant, but access is still granted by the
// membership document. The rules allow exactly one self-service addition: a unit
// whose createdBy is the caller. Waiting for the unit document first keeps this
// ordered behind the sync that creates it.
export async function registerCreatedUnit(unitId:string):Promise<void>{
  const clean=String(unitId||'').trim();
  if(!clean)throw new Error('Select a unit first.');
  const id=await getCurrentUid();
  if(!id)throw new Error('A Firebase account must be signed in.');
  const workspaceId=getActiveWorkspaceId();
  const unitPath=`workspaces/${workspaceId}/units/${clean}`;
  let created=false;
  for(let attempt=0;attempt<10;attempt+=1){
    const unit=await readPath(unitPath).catch(()=>null);
    if(unit){created=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!created)throw new Error('The new unit has not reached the cloud yet, so it could not be added to your membership.');
  const membershipPath=`workspaces/${workspaceId}/members/${id}`;
  const membership=await readPath(membershipPath);
  if(!membership)throw new Error('You need a workspace membership before creating a unit.');
  const unitIds=membershipUnitIds(membership);
  if(unitIds.includes(clean))return;
  await writePath(membershipPath,{
    unitId:clean,
    unitIds:[...unitIds,clean],
    role:String(membership.role||'clinical_editor'),
    clinicalRoles:{...(membership?.clinicalRoles||{})},
    active:true,
    forceReauth:false,
    updatedAt:new Date().toISOString(),
  },true);
  const stored=getStoredWorkspaceAccess();
  if(stored&&stored.workspaceId===workspaceId){
    setStoredWorkspaceAccess({...stored,unitId:stored.unitId||clean,unitIds:[...new Set([...(stored.unitIds||[]),clean])]});
  }
}
export async function getUnitById(unitId:string):Promise<MyUnit|null>{
  const clean=String(unitId||'').trim();
  if(!clean)return null;
  try{
    const data=await readPath(`workspaces/${getActiveWorkspaceId()}/units/${clean}`);
    return data?toMyUnit(clean,data):null;
  }catch(error){console.warn('Unit lookup failed:',error);return null;}
}
// The member's own clinical title lives on the membership document. The rules
// only accept this write when the affected keys are exactly
// ['clinicalRoles','updatedAt'] and every role key is a unit the member already
// belongs to, so the caller must be inside the unit before retitling.
export async function setUnitClinicalRole(unitId:string,role:SelfClinicalRole):Promise<void>{
  const clean=String(unitId||'').trim();
  if(!clean)throw new Error('Select a clinical unit first.');
  if(!SELF_CLINICAL_ROLES.includes(role))throw new Error('Select a valid clinical role.');
  const id=await getCurrentUid();
  if(!id)throw new Error('A Firebase account must be signed in.');
  const workspaceId=getActiveWorkspaceId();
  const membershipPath=`workspaces/${workspaceId}/members/${id}`;
  const membership=await readPath(membershipPath);
  if(!membership||!membershipUnitIds(membership).includes(clean))throw new Error('You are not a member of this unit.');
  const clinicalRoles={...(membership?.clinicalRoles||{}),[clean]:role};
  try{
    await writePath(membershipPath,{clinicalRoles,updatedAt:new Date().toISOString()});
  }catch(error:any){
    console.warn('Clinical title save failed:',error);
    throw new Error(`Could not save your clinical title for this unit. Check that you still belong to it.\nCode: ${String(error?.code||'unknown')}\nMessage: ${String(error?.message||error||'Unknown Firestore error')}`);
  }
}
// A unit has exactly one consultant: units/{unitId}.consultantUid. There is no
// 'consultant' clinical title, so claiming is a separate, one-shot update of an
// EMPTY slot on an existing unit.
export async function claimUnitConsultant(unitId:string):Promise<void>{
  const clean=String(unitId||'').trim();
  if(!clean)throw new Error('Select a clinical unit first.');
  const id=await getCurrentUid();
  if(!id)throw new Error('A Firebase account must be signed in.');
  const unitPath=`workspaces/${getActiveWorkspaceId()}/units/${clean}`;
  const unit=await readPath(unitPath);
  if(!unit)throw new Error('This unit no longer exists.');
  const current=String(unit.consultantUid||'');
  if(current===id)return;
  if(current)throw new Error('This unit already has a consultant. Only the platform owner can clear the consultant slot.');
  try{
    await writePath(unitPath,{consultantUid:id,updatedAt:new Date().toISOString()});
  }catch(error:any){
    console.warn('Consultant slot claim failed:',error);
    throw new Error(`Could not claim the consultant slot. It may have just been taken by somebody else.\nCode: ${String(error?.code||'unknown')}\nMessage: ${String(error?.message||error||'Unknown Firestore error')}`);
  }
}
export async function clearUnitConsultant(unitId:string):Promise<void>{
  const clean=String(unitId||'').trim();
  if(!clean)throw new Error('Select a clinical unit first.');
  if(!await isMasterAccount())throw new Error('Only the platform owner can clear a unit consultant.');
  const unitPath=`workspaces/${getActiveWorkspaceId()}/units/${clean}`;
  const unit=await readPath(unitPath);
  if(!unit)throw new Error('This unit no longer exists.');
  await writePath(unitPath,{consultantUid:'',updatedAt:new Date().toISOString()});
}
// The unit's consultant may close the bed count during provisioning; only the
// platform owner may open it again (the rules refuse any other unlock).
export async function setUnitCapacityLocked(unitId:string,locked:boolean):Promise<void>{
  const clean=String(unitId||'').trim();
  if(!clean)throw new Error('Select a clinical unit first.');
  const owner=await isMasterAccount();
  const id=await getCurrentUid();
  if(!id&&!owner)throw new Error('A Firebase account must be signed in.');
  const unitPath=`workspaces/${getActiveWorkspaceId()}/units/${clean}`;
  const unit=await readPath(unitPath);
  if(!unit)throw new Error('This unit no longer exists.');
  const consultant=String(unit.consultantUid||'');
  if(locked&&!owner&&consultant!==id)throw new Error("Only this unit's consultant or the platform owner can lock the bed count.");
  if(!locked&&!owner)throw new Error('Only the platform owner can unlock the bed count. Ask the workspace owner to change capacity.');
  try{
    await writePath(unitPath,{capacityLocked:!!locked,updatedAt:new Date().toISOString()});
  }catch(error:any){
    console.warn('Unit capacity lock change failed:',error);
    throw new Error(`The bed-count lock could not be changed.\nCode: ${String(error?.code||'unknown')}\nMessage: ${String(error?.message||error||'Unknown Firestore error')}`);
  }
}
// Hidden units are a presentation-only preference stored on the device. They
// must never influence permissions or which records can be read.
const HIDDEN_UNITS_KEY='cardiovault_hidden_units_v1';
export function getHiddenUnitIds():string[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(HIDDEN_UNITS_KEY)||'[]');
    if(!Array.isArray(parsed))return[];
    return Array.from(new Set(parsed.map(String).filter(Boolean)));
  }catch{return[];}
}
export function setUnitHidden(unitId:string,hidden:boolean):void{
  const clean=String(unitId||'').trim();
  if(!clean)return;
  const next=new Set(getHiddenUnitIds());
  if(hidden)next.add(clean);else next.delete(clean);
  try{localStorage.setItem(HIDDEN_UNITS_KEY,JSON.stringify(Array.from(next)));}catch{}
}
// 'consultant' is never stored on the member: it is the unit's consultant slot,
// so the effective title needs the unit document (and the caller's uid).
export function effectiveClinicalRole(unitId:string,unit:MyUnit|null,myClinicalRoles:Record<string,string>|null,myUid?:string):'consultant'|SelfClinicalRole{
  if(myUid&&unit?.consultantUid&&unit.consultantUid===myUid)return 'consultant';
  const stored=String(myClinicalRoles?.[String(unitId||'')]||'');
  return SELF_CLINICAL_ROLES.includes(stored as SelfClinicalRole)?stored as SelfClinicalRole:'resident';
}
