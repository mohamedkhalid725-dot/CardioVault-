import { StorageService, stripLegacyDemoData } from './storage';
import { normalizeBedStatus, normalizePatientStatus } from '../types/clinical';
import type { Unit } from '../types/clinical';
import { reconcileClinicalRegistry } from './bedReconciliation';
import { clearPendingLocalChanges, hasPendingLocalChanges, markPendingLocalChanges, mergeClinicalCollections, pendingChangesGeneration } from './clinicalMerge';
import { ensureUnitBeds, pendingUnitBedCounts, type CloudBedRecord, type EnsureUnitBedsResult, type UnitBedsIO } from './unitBeds';
import { onSnapshot } from 'firebase/firestore';
import { webCurrentUser, webDoc, webCollection, getDoc, getDocs, setDoc, deleteDoc, query, where, or } from './webFirebase';
import { ensureOwnerWorkspace, isMasterAccount, getActiveWorkspaceId, type WorkspaceAccessState } from './workspaceAccess';

const SCHEMA_VERSION=12;
const LAST_SYNC_KEY='cardiovault_last_cloud_sync';
const LAST_ERROR_KEY='cardiovault_last_cloud_sync_error';
const LAST_ERROR_DETAIL_KEY='cardiovault_last_cloud_sync_error_detail';
const SYNC_PENDING_KEY='cardiovault_cloud_sync_pending';
const SYNC_EVENT='cardiovault-cloud-sync-state';
const path=(workspace:string,collection:string)=>`workspaces/${workspace}/${collection}`;
const safe=(v:any):any=>JSON.parse(JSON.stringify(v??null));
const setSyncPending=(pending:boolean)=>{try{if(pending)sessionStorage.setItem(SYNC_PENDING_KEY,'1');else sessionStorage.removeItem(SYNC_PENDING_KEY);}catch{};try{window.dispatchEvent(new CustomEvent(SYNC_EVENT,{detail:{pending}}));}catch{}};
const isSyncPending=()=>sessionStorage.getItem(SYNC_PENDING_KEY)==='1';
const withTimeout=<T,>(promise:Promise<T>,timeoutMs=15000):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Cloud sync operation timed out.')),timeoutMs);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});


function mergeClinicalMedia(localPatient:any, cloudPatient:any): any {
  if (!localPatient || !cloudPatient) return cloudPatient;
  const mergeRecords = (cloudRecords:any[], localRecords:any[]) => {
    if (!Array.isArray(cloudRecords)) return cloudRecords;
    const localById = new Map((Array.isArray(localRecords) ? localRecords : []).map((record:any) => [String(record?.id || ''), record]));
    return cloudRecords.map((cloudRecord:any) => {
      const localRecord = localById.get(String(cloudRecord?.id || ''));
      if (!localRecord) return cloudRecord;
      const cloudUrls = Array.isArray(cloudRecord?.imageUrls) ? cloudRecord.imageUrls : [];
      const localUrls = Array.isArray(localRecord?.imageUrls) ? localRecord.imageUrls : [];
      const cloudPaths = Array.isArray(cloudRecord?.imageStoragePaths) ? cloudRecord.imageStoragePaths : [];
      const localPaths = Array.isArray(localRecord?.imageStoragePaths) ? localRecord.imageStoragePaths : [];
      const imageUrls = [...cloudUrls, ...localUrls.filter((url:any) => !cloudUrls.includes(url))];
      const imageStoragePaths = [...cloudPaths, ...localPaths.filter((p:any) => !cloudPaths.includes(p))];
      return { ...cloudRecord, imageUrls, imageStoragePaths };
    });
  };
  const merged = { ...cloudPatient };
  merged.ecgRecords = mergeRecords(cloudPatient.ecgRecords, localPatient.ecgRecords);
  merged.imaging = mergeRecords(Array.isArray(cloudPatient.imaging) ? cloudPatient.imaging : [], Array.isArray(localPatient.imaging) ? localPatient.imaging : []);
  if (Array.isArray(cloudPatient.imagingStudies)) {
    merged.imagingStudies = mergeRecords(cloudPatient.imagingStudies, localPatient.imagingStudies);
  }
  return merged;
}

async function accessForUser(uid:string):Promise<WorkspaceAccessState|null>{
  // Ownership is the /platformOwners document (the same check the rules make),
  // not the e-mail address: a renamed or migrated owner account keeps working.
  if(await isMasterAccount()){
    // Master bootstrap stays pinned to the legacy master workspace.
    const ownerState=await ensureOwnerWorkspace();
    if(!ownerState)return null;
    localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(ownerState));
    return ownerState;
  }
  const workspaceId=getActiveWorkspaceId();
  const member=await getDoc(webDoc(`workspaces/${workspaceId}/members/${uid}`));
  if(!member.exists())return null;
  const m=member.data();
  if(m?.active===false||m?.forceReauth===true)return null;
  // Membership is the persistent authorization. Access codes are enrollment
  // credentials; once membership is active, the account remains authorized until
  // membership.active/forceReauth is changed by the workspace admin.
  const unitIds=Array.from(new Set([
    ...(Array.isArray(m?.unitIds)?m.unitIds:[]),
    ...(m?.unitId?[m.unitId]:[]),
  ].map(String).filter(Boolean)));
  if(!unitIds.length)return null;
  const unitNames:Record<string,string>={};
  await Promise.all(unitIds.map(async unitId=>{
    try{
      const unit=await getDoc(webDoc(`${path(workspaceId,'units')}/${unitId}`));
      unitNames[unitId]=String(unit.data()?.name||unitId);
    }catch{
      unitNames[unitId]=unitId;
    }
  }));
  const currentUnitId=String(m?.unitId&&unitIds.includes(String(m.unitId))?m.unitId:unitIds[0]);
  const state:WorkspaceAccessState={
    workspaceId,
    role:m.role==='view_only'?'view_only':'clinical_editor',
    unitId:currentUnitId,
    unitName:unitNames[currentUnitId]||currentUnitId,
    unitIds,
    unitNames,
  };
  localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state)); return state;
}
async function collectionData(p:string,unitId?:string):Promise<Array<Record<string,any>>>{
  const ref=webCollection(p); const snap=unitId?await getDocs(query(ref,where('unitId','==',unitId))):await getDocs(ref);
  return snap.docs.map(d=>({...d.data(),id:d.id}));
}
// A clinical file can be shared by more than one unit: the single document keeps
// a unitIds array with every unit allowed to read it. A unit therefore also asks
// for the files that list it, so a shared file never disappears from a unit that
// shares it.
async function sharedPatientData(p:string,unitId:string):Promise<Array<Record<string,any>>>{
  if(!unitId)return[];
  try{const ref=webCollection(p);const snap=await getDocs(query(ref,where('unitIds','array-contains',unitId)));return snap.docs.map(d=>({...d.data(),id:d.id}));}catch(error){console.warn('Shared clinical file lookup failed:',error);return[];}
}
async function migrateLegacyMemberPatients(uid:string,access:WorkspaceAccessState):Promise<number>{
  if(access.role==='owner'||access.role==='view_only')return 0;
  const unitIds=new Set<string>((Array.isArray((access as any).unitIds)?(access as any).unitIds:[access.unitId]).filter(Boolean).map(String));if(!unitIds.size)return 0;
  const legacyBeds=await collectionData('users/'+uid+'/beds');const legacyPatients=await collectionData('users/'+uid+'/patients');const workspaceBeds=await collectionData(path(access.workspaceId,'beds'));
  const canonicalBeds=new Map<string,{id:string;data:any}>();for(const item of workspaceBeds){const unit=String(item.unitId||'');const number=String(item.bedNumber||'').trim().toLowerCase();if(unit&&number)canonicalBeds.set(unit+'::'+number,{id:String(item.id),data:item});}
  const legacyBedMap=new Map<string,string>();
  for(const item of legacyBeds){const sourceUnit=String(item.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;const bedNumber=String(item.bedNumber||'').trim();if(!bedNumber)continue;const key=targetUnit+'::'+bedNumber.toLowerCase();let canonical=canonicalBeds.get(key);if(!canonical){const canonicalId='bed-'+targetUnit+'-'+bedNumber.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();canonical={id:canonicalId,data:{id:canonicalId,unitId:targetUnit,bedNumber,status:'Empty',schemaVersion:SCHEMA_VERSION}};canonicalBeds.set(key,canonical);}legacyBedMap.set(String(item.id),canonical.id);const legacyPatientId=String(item.patientId||'');const existingPatientId=String(canonical.data?.patientId||'');if((legacyPatientId&&(!existingPatientId||existingPatientId===legacyPatientId))||!existingPatientId){const bed={...canonical.data,...item,id:canonical.id,unitId:targetUnit,bedNumber,migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,status:normalizeBedStatus(item.status||canonical.data?.status||'Not documented')};await withTimeout(setDoc(webDoc(path(access.workspaceId,'beds')+'/'+canonical.id),bed,{merge:true}));canonical.data=bed;}}
  let migrated=0;for(const item of legacyPatients){const sourceUnit=String(item.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;let targetBedId='';const legacyBedId=String(item.bedId||'');if(legacyBedId)targetBedId=legacyBedMap.get(legacyBedId)||'';if(!targetBedId&&legacyBedId){const lb=legacyBeds.find(b=>String(b.id)===legacyBedId);const bn=String(lb?.bedNumber||'').trim();if(bn)targetBedId=canonicalBeds.get(targetUnit+'::'+bn.toLowerCase())?.id||'';}const existing=await getDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id));const patient={...safe(item),id:String(item.id),unitId:targetUnit,bedId:targetBedId||String(item.bedId||''),status:normalizePatientStatus(item.status),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION};if(existing.exists()){const existingUnit=String(existing.data()?.unitId||'');if(existingUnit&&existingUnit!==targetUnit)continue;await withTimeout(setDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id),{unitId:targetUnit,...(targetBedId?{bedId:targetBedId}:{}),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true}));}else{await withTimeout(setDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id),patient,{merge:false}));migrated++;}if(targetBedId){const bedRef=path(access.workspaceId,'beds')+'/'+targetBedId;const bedSnap=await getDoc(webDoc(bedRef));const bedData=bedSnap.exists()?bedSnap.data():{};const occupiedBy=String(bedData?.patientId||'');if(!occupiedBy||occupiedBy===String(item.id))await withTimeout(setDoc(webDoc(bedRef),{patientId:String(item.id),status:normalizeBedStatus(item.status||bedData?.status||'Not documented'),unitId:targetUnit,bedNumber:bedData?.bedNumber||item.bedNumber||'',schemaVersion:SCHEMA_VERSION},{merge:true}));}}
  return migrated;
}

async function migrateAllLegacyMembersIntoWorkspace(workspaceId:string):Promise<number>{
  const members=await collectionData(path(workspaceId,'members'));
  let migrated=0;
  for(const member of members){
    const uid=String(member?.uid||member?.id||'');
    if(!uid||member?.active===false||member?.forceReauth===true)continue;
    const hashes=Array.from(new Set([
      ...(Array.isArray(member?.accessCodeHashes)?member.accessCodeHashes:[]),
      member?.accessCodeHash,
    ].filter(Boolean).map(String)));
    const activeCodes:any[]=[];
    for(const hash of hashes){
      try{
        const code=await getDoc(webDoc('accessCodes/'+hash));
        if(code.exists()&&code.data()?.active===true&&code.data()?.workspaceId===workspaceId)activeCodes.push(code.data());
      }catch(error){console.warn('Legacy member access-code check failed:',uid,error);}
    }
    if(!activeCodes.length)continue;
    const memberUnits=Array.from(new Set([
      ...(Array.isArray(member?.unitIds)?member.unitIds:[]),
      ...(member?.unitId?[member.unitId]:[]),
    ].map(String).filter(Boolean)));
    const activeUnitIds=new Set(activeCodes.map(code=>String(code.unitId||'')).filter(Boolean));
    let unitIds=memberUnits.filter(unitId=>activeUnitIds.has(unitId));
    try{
      const team=await getDoc(webDoc(path(workspaceId,'team')+'/'+uid));
      if(team.exists()){
        const teamData=team.data();
        if(teamData?.status!=='active')continue;
        const assigned=Array.isArray(teamData?.assignedUnitIds)?teamData.assignedUnitIds.map(String):[];
        if(assigned.length)unitIds=unitIds.filter(unitId=>assigned.includes(unitId));
        if(teamData?.role==='view_only'||member?.role==='view_only')continue;
      }else if(member?.role==='view_only')continue;
    }catch(error){console.warn('Legacy member team check failed:',uid,error);continue;}
    if(!unitIds.length)continue;
    try{
      migrated+=await migrateLegacyMemberPatients(uid,{
        workspaceId,
        role:'clinical_editor',
        unitId:unitIds.includes(String(member?.unitId||''))?String(member.unitId):unitIds[0],
        unitName:'',
        unitIds,
      });
    }catch(error){
      console.warn('Legacy member migration skipped:',uid,error);
    }
  }
  return migrated;
}

export async function webLoadCurrentUserFromCloud(){
  const user=webCurrentUser(); if(!user?.uid)return null;
  try{
    const access=await accessForUser(user.uid); if(!access)return {uid:user.uid,found:false,access:null}; if(access.role==='owner'){try{await migrateAllLegacyMembersIntoWorkspace(access.workspaceId);}catch(error){localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());localStorage.setItem(LAST_ERROR_DETAIL_KEY,String((error as any)?.message||error));console.warn('Legacy member workspace migration failed:',error);}}else if(access.role!=='view_only'){try{await migrateLegacyMemberPatients(user.uid,access);}catch(error){localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());localStorage.setItem(LAST_ERROR_DETAIL_KEY,String((error as any)?.message||error));console.warn('Legacy member patient migration failed:',error);}}
    let units:any[]=[],beds:any[]=[],patients:any[]=[];
    if(access.role==='owner'){
      [units,beds,patients]=await Promise.all([collectionData(path(access.workspaceId,'units')),collectionData(path(access.workspaceId,'beds')),collectionData(path(access.workspaceId,'patients'))]);
    }else{
      const unitIds=Array.from(new Set((access.unitIds?.length?access.unitIds:[access.unitId]).filter(Boolean).map(String)));
      const loaded=await Promise.all(unitIds.map(async unitId=>{
        const unit=await getDoc(webDoc(`${path(access.workspaceId,'units')}/${unitId}`));
        const [scopedBeds,scopedPatients,sharedPatients]=await Promise.all([
          collectionData(path(access.workspaceId,'beds'),unitId),
          collectionData(path(access.workspaceId,'patients'),unitId),
          sharedPatientData(path(access.workspaceId,'patients'),unitId),
        ]);
        const patientsById=new Map<string,Record<string,any>>();for(const item of scopedPatients)patientsById.set(String(item.id),item);for(const item of sharedPatients)if(!patientsById.has(String(item.id)))patientsById.set(String(item.id),item);
        return {
          unit:unit.exists()?{...unit.data(),id:unitId}:null,
          beds:scopedBeds,
          patients:Array.from(patientsById.values()),
        };
      }));
      loaded.forEach(item=>{if(item.unit)units.push(item.unit);beds.push(...item.beds);patients.push(...item.patients);});
    }
    const cleaned = stripLegacyDemoData(units, beds, patients);
    units=cleaned.units; beds=cleaned.beds; patients=cleaned.patients;
    // The cloud snapshot must not wipe work the doctor has not seen uploaded
    // yet: a unit whose bed documents are still on their way to the cloud
    // would come back with a bed count of zero.
    const merged=mergeClinicalCollections(
      {units,beds,patients},
      {units:StorageService.getUnits(),beds:StorageService.getBeds(),patients:StorageService.getPatients()},
      {keepLocalOnly:hasPendingLocalChanges()},
    );
    units=merged.units; beds=merged.beds; patients=merged.patients;
    const reconciled=reconcileClinicalRegistry(units,beds,patients);
    units=reconciled.units; beds=reconciled.beds; patients=reconciled.patients;
    localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
    try { StorageService.saveUnits(units); StorageService.saveBeds(beds); StorageService.savePatients(patients); }
    finally { localStorage.removeItem('cardiovault_cloud_restore_in_progress'); }
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString()); localStorage.removeItem(LAST_ERROR_KEY); localStorage.removeItem(LAST_ERROR_DETAIL_KEY); setSyncPending(false);
    return {uid:user.uid,found:!!(units.length||beds.length||patients.length),access};
  }catch(error:any){
    localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
    localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
    return {uid:user.uid,found:false,access:null};
  }
}
/**
 * Creates every bed document a unit is missing and verifies the cloud copy.
 *
 * The unit document and its beds are separate writes, so the creation flow
 * cannot assume that pushing "the workspace" also pushed the beds. This is the
 * step that makes a unit with N declared beds really hold N bed documents, and
 * repeating it is safe: existing beds are never touched.
 */
export async function ensureWebUnitBeds(unitId:string,expected:number):Promise<EnsureUnitBedsResult>{
  const user=webCurrentUser(); if(!user?.uid)throw new Error('Sign in again to upload this unit.');
  const access=await accessForUser(user.uid);
  if(!access)throw new Error('No CardioVault Workspace is assigned to this Firebase account.');
  const workspaceId=access.workspaceId;
  const io:UnitBedsIO={
    async listBeds(id:string){
      return (await withTimeout(collectionData(path(workspaceId,'beds'),id))) as CloudBedRecord[];
    },
    async createBed(_id:string,bed){
      const reference=webDoc(`${path(workspaceId,'beds')}/${bed.id}`);
      // Never overwrite a bed that already exists: it may already be occupied.
      const existing=await withTimeout(getDoc(reference)).catch(()=>null);
      if(existing?.exists())return;
      await withTimeout(setDoc(reference,{...safe(bed),id:String(bed.id),updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true}));
    },
  };
  return ensureUnitBeds({unitId,expected,io});
}

let webSyncRunning=false;
let webSyncInflight:Promise<boolean>|null=null;
let webSyncPendingRun:Promise<boolean>|null=null;

async function waitForWebSyncIdle():Promise<void>{
  for(let attempt=0;attempt<300;attempt+=1){
    if(!webSyncRunning)return;
    const current=webSyncInflight;
    if(current){try{await current;}catch{}}
    else await new Promise(resolve=>setTimeout(resolve,100));
  }
}

async function runWebSync():Promise<boolean>{
  const user=webCurrentUser(); if(!user?.uid)return false;
  webSyncRunning=true;
  // The realtime listeners persist snapshots wholesale. While a sync is
  // running the local state is the doctor's latest intent, so they stay quiet.
  setSyncPending(true);
  const generation=pendingChangesGeneration();
  let uploaded=false;
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
    const allowedUnitIds=new Set((access.unitIds?.length?access.unitIds:[access.unitId]).filter(Boolean).map(String));
    // A creator owns the unit and its beds even before the membership catches
    // up: the rules make him the unit's consultant. Uploading the units but not
    // their beds left exactly the units he created with a bed count of zero.
    const myCreatedUnitIds=new Set(StorageService.getUnits().filter(unit=>String((unit as any).createdBy||'')===String(user.uid)).map(unit=>String(unit.id)));
    const sync=async(name:string,records:any[],unitScoped:boolean,extra?:(record:any)=>boolean)=>{
      const current=new Set<string>();
      for(const record of records){
        if(!record?.id)continue;
        if(unitScoped&&!allowedUnitIds.has(String(record.unitId||''))&&!(extra?.(record)))continue;
        current.add(String(record.id));
        await withTimeout(setDoc(webDoc(`${path(access.workspaceId,name)}/${record.id}`),{...safe(record),id:String(record.id),updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true}));
      }
      if(access.role==='owner'){
        const remote=await collectionData(path(access.workspaceId,name));
        for(const item of remote)if(!current.has(String(item.id)))await deleteDoc(webDoc(`${path(access.workspaceId,name)}/${item.id}`));
      }
    };
    if(access.role==='owner'){
      await sync('units',StorageService.getUnits(),false);
    }else{
      // A member owns only the units on their membership plus any unit they created
      // themselves (the rules make the creator that unit's consultant). Pushing the
      // whole local list would be denied for every unit they do not belong to.
      await sync('units',StorageService.getUnits().filter(u=>allowedUnitIds.has(String(u.id))||String((u as any).createdBy||'')===String(user.uid)),false);
    }
    await sync('beds',StorageService.getBeds(),access.role!=='owner',(bed:any)=>myCreatedUnitIds.has(String(bed?.unitId||'')));
    await sync('patients',StorageService.getPatients(),access.role!=='owner');
    // Only a sync that saw no new local write may declare the workspace clean.
    // A save that landed mid-upload leaves the flag set, so the next sync still
    // treats the local copy as the doctor's latest intent.
    if(pendingChangesGeneration()===generation)clearPendingLocalChanges();
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());localStorage.removeItem(LAST_ERROR_KEY);localStorage.removeItem(LAST_ERROR_DETAIL_KEY);uploaded=true;return true;
  }catch(error:any){
    markPendingLocalChanges();
    localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
    localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
    return false;
  }finally{
    webSyncRunning=false;
    webSyncInflight=null;
    // A failed upload leaves records the cloud has never seen, so the listeners
    // stay quiet until an upload succeeds; otherwise the next snapshot would
    // replace them with the older cloud copy.
    setSyncPending(!uploaded);
  }
}

export async function webSyncCurrentUserNow():Promise<boolean>{
  if(webSyncRunning){
    // A burst of local saves used to start one full workspace upload each, and
    // whichever finished first cleared the pending flag while the others were
    // still writing. Coalesce them into a single follow-up sync instead.
    if(!webSyncPendingRun){
      webSyncPendingRun=(async()=>{await waitForWebSyncIdle();return startWebSync();})().finally(()=>{webSyncPendingRun=null;});
    }
    return webSyncPendingRun;
  }
  return startWebSync();
}

function startWebSync():Promise<boolean>{
  const run=runWebSync();
  webSyncInflight=run;
  return run;
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
      if (isSyncPending()) return;
      let values:any[] = snap.docs.map((d:any)=>({...d.data(), id:d.id}));
      if (name==='units') values=stripLegacyDemoData(values, [], []).units;
      if (name==='beds') values=stripLegacyDemoData([], values, []).beds;
      if (name==='patients') values=stripLegacyDemoData([], [], values).patients;
      // A unit whose bed documents are still on their way to the cloud must not
      // lose them here. Replacing the local beds with the cloud snapshot wiped
      // exactly the beds the doctor had just created, and because the clinical
      // store is memory-only the loss survived every later sync and reload.
      if (name==='beds') {
        const owedUnits=Object.keys(pendingUnitBedCounts());
        if (owedUnits.length) {
          const incoming=new Set(values.map((value:any)=>String(value.id)));
          const owed=StorageService.getBeds().filter(
            (bed)=>owedUnits.includes(String(bed.unitId))&&!incoming.has(String(bed.id)),
          );
          if (owed.length) {
            values=[...values,...owed];
            void webSyncCurrentUserNow();
          }
        }
      }
      if (access.role==='owner' && name==='units') {
        const localUnits=StorageService.getUnits();
        if (localUnits.length>values.length && values.length>0) {
          void webSyncCurrentUserNow();
          onRefresh?.();
          return;
        }
      }
      localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
      try {
        if (name==='units') StorageService.saveUnits(values as Unit[]);
        else if (name==='beds') StorageService.saveBeds(values);
        else {
          StorageService.savePatients(values);
        }
      } finally {
        localStorage.removeItem('cardiovault_cloud_restore_in_progress');
      }
      localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
      onRefresh?.();
    };

    const listenCollection = (name:'units'|'beds'|'patients', unitId?:string) => {
      const ref = webCollection(path(access.workspaceId,name));
      const target = unitId ? (name==='patients' ? query(ref, or(where('unitId','==',unitId), where('unitIds','array-contains',unitId))) : query(ref, where('unitId','==',unitId))) : ref;
      const unsubscribe = onSnapshot(target, {includeMetadataChanges:true}, snap => persistCollection(name,snap), error => {
        localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
        localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
      });
      webRealtimeUnsubscribes.push(unsubscribe);
    };

    if (access.role==='owner') {
      listenCollection('units');
      listenCollection('beds');
      listenCollection('patients');
    } else {
      // A member can see every unit on their own membership (the rules allow a get
      // per unit, never a list). Merge each snapshot into the local list instead of
      // replacing it, otherwise a second unit would erase the first.
      const memberUnitIds=[...new Set([...(access.unitIds||[]),access.unitId].filter(Boolean).map(String))];
      for (const unitId of memberUnitIds) {
        const unitRef = webDoc(`${path(access.workspaceId,'units')}/${unitId}`);
        const unsubscribeUnit = onSnapshot(unitRef, snap => {
          if (!snap.exists()) return;
          const incoming={...snap.data(), id:snap.id} as Unit;
          localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
          try {
            const local=StorageService.getUnits();
            const exists=local.some(u=>String(u.id)===String(incoming.id));
            StorageService.saveUnits(exists?local.map(u=>String(u.id)===String(incoming.id)?incoming:u):[...local,incoming]);
          }
          finally { localStorage.removeItem('cardiovault_cloud_restore_in_progress'); }
          localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
          onRefresh?.();
        }, error => {
          localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());
          localStorage.setItem(LAST_ERROR_DETAIL_KEY,String(error?.message||error));
        });
        webRealtimeUnsubscribes.push(unsubscribeUnit);
      }
      // The bed/patient listeners persist a whole collection snapshot, so they are
      // only safe when there is a single unit to scope them to. Multi-unit members
      // still get a full pull on load and on demand.
      if (memberUnitIds.length===1) {
        listenCollection('beds',memberUnitIds[0]);
        listenCollection('patients',memberUnitIds[0]);
      }
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
