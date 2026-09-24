import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {FirebaseFirestore} from '@capacitor-firebase/firestore';
import {webCurrentUser,webDoc,getDoc as webGetDoc,setDoc as webSetDoc,getDocs as webGetDocs,deleteDoc as webDeleteDoc,webCollection} from './webFirebase';
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
export async function isMasterAccount():Promise<boolean>{const user=await currentUser();const firebaseEmail=String(user?.email||'').trim().toLowerCase();if(firebaseEmail===MASTER_ACCOUNT_EMAIL)return true;try{const raw=localStorage.getItem('cardiovault_auth_v2');const saved=raw?JSON.parse(raw):null;return String(saved?.userEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL;}catch{return false;}}
const hash=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.trim().toUpperCase()));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');};
const newCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);const raw=Array.from(bytes).map(b=>alphabet[b%alphabet.length]).join('');return`CV-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}`;};
export const getStoredWorkspaceAccess=():WorkspaceAccessState|null=>{try{const value=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');return value?.workspaceId?value:null;}catch{return null;}};
export const setStoredWorkspaceAccess=(state:WorkspaceAccessState|null)=>{if(state)localStorage.setItem(ACTIVE_KEY,JSON.stringify(state));else localStorage.removeItem(ACTIVE_KEY);};
export async function ensureOwnerWorkspace():Promise<WorkspaceAccessState|null>{const id=await uid();if(!id||!(await isMasterAccount()))return null;const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};const workspaceRef=`workspaces/${MASTER_WORKSPACE_ID}`;try{let data:any=null;if(Capacitor.isNativePlatform()){const result:any=await FirebaseFirestore.getDocument({reference:workspaceRef});data=safe(result?.snapshot);}else{const result=await webGetDoc(webDoc(workspaceRef));data=result.exists()?result.data():null;}if(data?.ownerUid===id&&String(data?.ownerEmail||'').trim().toLowerCase()===MASTER_ACCOUNT_EMAIL){setStoredWorkspaceAccess(state);}else if(data?.ownerUid&&data.ownerUid!==id){return null;}else{const payload={ownerUid:id,ownerEmail:MASTER_ACCOUNT_EMAIL,schemaVersion:12,createdAt:data?.createdAt||new Date().toISOString()};if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:workspaceRef,data:payload,merge:true});else await webSetDoc(webDoc(workspaceRef),payload,{merge:true});setStoredWorkspaceAccess(state);}}catch(error){console.warn('Master workspace bootstrap failed:',error);return null;}try{const owner=AuthorizationService.getCurrentUser();const teamRef=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;const team={...owner,userId:id,uid:id,name:owner.name||'Dr. Mohamed Khalid',email:MASTER_ACCOUNT_EMAIL,role:'department_admin',departmentId:'dept-cardiology',assignedUnitIds:['unit-ccu-1','unit-ccu-2','unit-cardiology-ward','unit-icu-1'],status:'active',updatedAt:new Date().toISOString()};if(Capacitor.isNativePlatform())await FirebaseFirestore.setDocument({reference:teamRef,data:team,merge:true});else await webSetDoc(webDoc(teamRef),team,{merge:true});}catch(error){console.warn('Owner team registration failed:',error);}return state;}
export async function redeemUnitAccessCode(raw:string):Promise<WorkspaceAccessState>{
  const id=await uid();
  if(!id)throw new Error('A Firebase account must be signed in before entering an access code.');
  if(await isMasterAccount())return (await ensureOwnerWorkspace())||{workspaceId:MASTER_WORKSPACE_ID,role:'owner',unitId:null,unitName:null};
  const code=raw.trim().toUpperCase();
  if(code.length<6)throw new Error('Invalid Unit Access Code.');
  const accessCodeHash=await hash(code);
  let access:any;
  if(Capacitor.isNativePlatform()){
    const result:any=await FirebaseFirestore.getDocument({reference:`accessCodes/${accessCodeHash}`});
    access=safe(result?.snapshot);
  }else{
    const result=await webGetDoc(webDoc(`accessCodes/${accessCodeHash}`));
    access=result.exists()?result.data():null;
  }
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
  const nextRole = currentProfile?.role && !['pending','viewer'].includes(String(currentProfile.role)) ? currentProfile.role : (access.role==='view_only'?'viewer':'pending');
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
export async function getUnitAccessCodes():Promise<UnitAccessCode[]>{
  const state=await ensureOwnerWorkspace();if(!state)return[];
  const reference=`workspaces/${MASTER_WORKSPACE_ID}/accessCodes`;
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
  const state=await ensureOwnerWorkspace();
  if(!state)throw new Error('Only the Master Account can generate Unit Access Codes.');
  const existing=await getUnitAccessCodes();
  for(const item of existing.filter(x=>x.unitId===unitId&&x.active))await revokeUnitAccessCode(item.code);
  const code=newCode();const accessCodeHash=await hash(code);const now=new Date().toISOString();
  const payload={hash:accessCodeHash,code,workspaceId:MASTER_WORKSPACE_ID,unitId,unitName,role,active:true,createdAt:now};
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{...payload,createdBy:state.workspaceId},merge:false});
    await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:payload,merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`),{...payload,createdBy:state.workspaceId},{merge:false});
    await webSetDoc(webDoc(`accessCodes/${accessCodeHash}`),payload,{merge:true});
  }
  return code;
}
export async function revokeUnitAccessCode(code:string):Promise<void>{
  const state=await ensureOwnerWorkspace();
  if(!state)throw new Error('Only the Master Account can revoke Unit Access Codes.');
  const accessCodeHash=await hash(code);
  const revokedAt=new Date().toISOString();
  if(Capacitor.isNativePlatform()){
    await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});
    await FirebaseFirestore.setDocument({reference:`accessCodes/${accessCodeHash}`,data:{active:false,revokedAt},merge:true});
  }else{
    await webSetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/accessCodes/${accessCodeHash}`),{active:false,revokedAt},{merge:true});
    await webSetDoc(webDoc(`accessCodes/${accessCodeHash}`),{active:false,revokedAt},{merge:true});
  }
  try{
    const memberCollection=`workspaces/${MASTER_WORKSPACE_ID}/members`;
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
export type SelfClinicalRole='nurse'|'resident'|'specialist'|'consultant';
export const SELF_CLINICAL_ROLES:SelfClinicalRole[]=['nurse','resident','specialist','consultant'];
export async function getOwnTeamProfile():Promise<any|null>{
  const id=await uid();
  if(!id)return null;
  const ref=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;
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
  const ref=`workspaces/${MASTER_WORKSPACE_ID}/team/${id}`;
  let teamExists=false;
  try {
    if(Capacitor.isNativePlatform()) {
      const existing=await FirebaseFirestore.getDocument({reference:ref});
      teamExists=!!safe(existing?.snapshot);
    } else {
      teamExists=(await webGetDoc(webDoc(ref))).exists();
    }
  } catch {}
  const patch={uid:id,workspaceId:MASTER_WORKSPACE_ID,...(!teamExists?{departmentId:'dept-cardiology',status:'active'}:{}),name:cleanName,role,roleSelectedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
    let teamProfiles:any[]=[];
    let memberRecords:any[]=[];
    if(Capacitor.isNativePlatform()){
      const [teamResult,memberResult]=await Promise.all([
        FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/team`}).catch(error=>{console.warn('Team directory team query failed:',error);return null;}),
        master?FirebaseFirestore.getCollection({reference:`workspaces/${MASTER_WORKSPACE_ID}/members`}).catch(error=>{console.warn('Team directory membership query failed:',error);return null;}):Promise.resolve(null),
      ]);
      teamProfiles=(teamResult?.snapshots||[]).map((snapshot:any)=>({...safe(snapshot),uid:String(snapshot?.id||snapshot?.documentId||'')}));
      memberRecords=(memberResult?.snapshots||[]).map((snapshot:any)=>({...safe(snapshot),uid:String(snapshot?.id||snapshot?.documentId||'')}));
    }else{
      const [teamSnapshot,memberSnapshot]=await Promise.all([
        webGetDocs(webCollection(`workspaces/${MASTER_WORKSPACE_ID}/team`)).catch(error=>{console.warn('Team directory team query failed:',error);return null;}),
        master?webGetDocs(webCollection(`workspaces/${MASTER_WORKSPACE_ID}/members`)).catch(error=>{console.warn('Team directory membership query failed:',error);return null;}):Promise.resolve(null),
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
  const master=await isMasterAccount(); const own=await getOwnTeamProfile(); const consultant=own?.role==='consultant'&&own?.status==='active'; if(!master&&own?.role!=='department_admin'&&!consultant) throw new Error('Only the Master Account, Department Admin, or Consultant can manage the Team Directory.'); const target=Capacitor.isNativePlatform()?safe((await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/team/${userId}`})).snapshot):(await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/team/${userId}`))).data(); if(consultant&&target?.role==='department_admin')throw new Error('Consultants cannot change a Department Admin.'); if(updates.role==='department_admin'&&!master)throw new Error('Only the Master Account can assign Department Admin.');
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
  const master=await isMasterAccount(); const own=await getOwnTeamProfile(); if(!master&&own?.role!=='department_admin')throw new Error('Only the Master Account or Department Admin can remove department members.');
  if(userId===await uid())throw new Error('You cannot remove your own account from the department.');
  const teamRef=`workspaces/${MASTER_WORKSPACE_ID}/team/${userId}`;
  const memberRef=`workspaces/${MASTER_WORKSPACE_ID}/members/${userId}`;
  const unitsRef=`workspaces/${MASTER_WORKSPACE_ID}/members/${userId}/units`;
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
  try{
    let membership:any=null;
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`});
      membership=safe(result?.snapshot);
    }else{
      const result=await webGetDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${id}`));
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
