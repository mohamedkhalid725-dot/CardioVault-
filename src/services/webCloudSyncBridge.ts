import { StorageService } from './storage';
import { onSnapshot } from 'firebase/firestore';
import { webCurrentUser, webDb, webDoc, webCollection, getDoc, getDocs, setDoc, deleteDoc, query, where } from './webFirebase';
import { MASTER_WORKSPACE_ID, MASTER_ACCOUNT_EMAIL, getStoredWorkspaceAccess, type WorkspaceAccessState } from './workspaceAccess';

const SCHEMA_VERSION=12;
const LAST_SYNC_KEY='cardiovault_last_cloud_sync';
const LAST_ERROR_KEY='cardiovault_last_cloud_sync_error';
const LAST_ERROR_DETAIL_KEY='cardiovault_last_cloud_sync_error_detail';
const path=(workspace:string,collection:string)=>`workspaces/${workspace}/${collection}`;
const safe=(v:any):any=>JSON.parse(JSON.stringify(v??null));

async function accessForUser(uid:string):Promise<WorkspaceAccessState|null>{
  const user=webCurrentUser();
  if(user?.email?.toLowerCase()===MASTER_ACCOUNT_EMAIL.toLowerCase()){
    await setDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}`),{ownerUid:uid,ownerEmail:MASTER_ACCOUNT_EMAIL,schemaVersion:SCHEMA_VERSION,createdAt:new Date().toISOString()},{merge:true});
    const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};
    localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state)); return state;
  }
  // Never trust a cached workspace access state across Firebase accounts.
  // Resolve membership from the currently authenticated UID every time.
  const member=await getDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${uid}`));
  if(!member.exists())return null;
  const m=member.data();
  if(!m?.unitId||!m?.accessCodeHash)return null;
  const code=await getDoc(webDoc(`accessCodes/${m.accessCodeHash}`)); if(!code.exists())return null;
  const c=code.data(); if(!c?.active||c.workspaceId!==MASTER_WORKSPACE_ID)return null;
  const unit=await getDoc(webDoc(`${path(MASTER_WORKSPACE_ID,'units')}/${m.unitId}`));
  const state:WorkspaceAccessState={workspaceId:MASTER_WORKSPACE_ID,role:m.role==='view_only'?'view_only':'clinical_editor',unitId:String(m.unitId),unitName:String(unit.data()?.name||c.unitName||'')};
  localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state)); return state;
}
async function collectionData(p:string,unitId?:string){
  const ref=webCollection(p); const snap=unitId?await getDocs(query(ref,where('unitId','==',unitId))):await getDocs(ref);
  return snap.docs.map(d=>({...d.data(),id:d.id}));
}
export async function webLoadCurrentUserFromCloud(){
  const user=webCurrentUser(); if(!user?.uid)return null;
  try{
    const access=await accessForUser(user.uid); if(!access)return {uid:user.uid,found:false,access:null};
    let units:any[]=[],beds:any[]=[],patients:any[]=[];
    if(access.role==='owner'){
      [units,beds,patients]=await Promise.all([collectionData(path(access.workspaceId,'units')),collectionData(path(access.workspaceId,'beds')),collectionData(path(access.workspaceId,'patients'))]);
    }else if(access.unitId){
      const unit=await getDoc(webDoc(`${path(access.workspaceId,'units')}/${access.unitId}`));
      units=unit.exists()?[{...unit.data(),id:access.unitId}]:[];
      [beds,patients]=await Promise.all([collectionData(path(access.workspaceId,'beds'),access.unitId),collectionData(path(access.workspaceId,'patients'),access.unitId)]);
    }
    localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
    try { StorageService.saveUnits(units); StorageService.saveBeds(beds); StorageService.savePatients(patients); }
    finally { localStorage.removeItem('cardiovault_cloud_restore_in_progress'); }
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString()); localStorage.removeItem(LAST_ERROR_DETAIL_KEY);
    return {uid:user.uid,found:!!(units.length||beds.length||patients.length),access};
  }catch(error:any){
    localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
    localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
    return {uid:user.uid,found:false,access:null};
  }
}
export async function webSyncCurrentUserNow(){
  const user=webCurrentUser(); if(!user?.uid)return false;
  try{
    const access=await accessForUser(user.uid);
    if(!access){
      localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
      localStorage.setItem(LAST_ERROR_DETAIL_KEY,'No CardioVault Workspace is assigned to this Firebase account. Redeem the Unit Access Code for this account first.');
      return false;
    }
    if(access.role==='view_only'){
      localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
      localStorage.setItem(LAST_ERROR_DETAIL_KEY,'This CardioVault account has view-only access and cannot upload changes.');
      return false;
    }
    const sync=async(name:string,records:any[],unitFilter:boolean)=>{
      const current=new Set<string>();
      for(const record of records){if(!record?.id)continue;if(unitFilter&&String(record.unitId)!==String(access.unitId))continue;current.add(String(record.id));await setDoc(webDoc(`${path(access.workspaceId,name)}/${record.id}`),{...safe(record),id:String(record.id),updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true});}
      if(access.role==='owner'){
        const remote=await collectionData(path(access.workspaceId,name));for(const item of remote)if(!current.has(String(item.id)))await deleteDoc(webDoc(`${path(access.workspaceId,name)}/${item.id}`));
      }
    };
    if(access.role==='owner')await sync('units',StorageService.getUnits(),false);
    await sync('beds',StorageService.getBeds(),access.role!=='owner');
    await sync('patients',StorageService.getPatients(),access.role!=='owner');
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());localStorage.removeItem(LAST_ERROR_KEY);localStorage.removeItem(LAST_ERROR_DETAIL_KEY);return true;
  }catch(error:any){localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));return false;}
}


let webRealtimeUnsubscribes: Array<()=>void> = [];

export async function installWebRealtimeCloudSync(onRefresh?:()=>void): Promise<()=>void> {
  for (const unsubscribe of webRealtimeUnsubscribes.splice(0)) {
    try { unsubscribe(); } catch {}
  }
  const user = webCurrentUser();
  if (!user?.uid) return () => {};
  try {
    const access = await accessForUser(user.uid);
    if (!access) return () => {};

    const persistCollection = (name:'units'|'beds'|'patients', snap:any) => {
      const values = snap.docs.map((d:any)=>({...d.data(), id:d.id}));
      localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
      try {
        if (name==='units') StorageService.saveUnits(values);
        else if (name==='beds') StorageService.saveBeds(values);
        else StorageService.savePatients(values);
      } finally {
        localStorage.removeItem('cardiovault_cloud_restore_in_progress');
      }
      localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
      onRefresh?.();
    };

    const listenCollection = (name:'units'|'beds'|'patients', unitId?:string) => {
      const ref = webCollection(path(access.workspaceId,name));
      const target = unitId ? query(ref, where('unitId','==',unitId)) : ref;
      const unsubscribe = onSnapshot(target, snap => persistCollection(name,snap), error => {
        localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
        localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
      });
      webRealtimeUnsubscribes.push(unsubscribe);
    };

    if (access.role==='owner') {
      listenCollection('units');
      listenCollection('beds');
      listenCollection('patients');
    } else if (access.unitId) {
      const unitRef = webDoc(`${path(access.workspaceId,'units')}/${access.unitId}`);
      const unsubscribeUnit = onSnapshot(unitRef, snap => {
        const values = snap.exists() ? [{...snap.data(), id:snap.id}] : [];
        localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
        try { StorageService.saveUnits(values); }
        finally { localStorage.removeItem('cardiovault_cloud_restore_in_progress'); }
        localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
        onRefresh?.();
      }, error => {
        localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
        localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
      });
      webRealtimeUnsubscribes.push(unsubscribeUnit);
      listenCollection('beds',String(access.unitId));
      listenCollection('patients',String(access.unitId));
    }
  } catch (error:any) {
    localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
    localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
  }

  return () => {
    for (const unsubscribe of webRealtimeUnsubscribes.splice(0)) {
      try { unsubscribe(); } catch {}
    }
  };
}
