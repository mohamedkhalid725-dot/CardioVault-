import { StorageService, stripLegacyDemoData } from './storage';
import type { Unit } from '../types/clinical';
import { reconcileClinicalRegistry } from './bedReconciliation';
import { onSnapshot } from 'firebase/firestore';
import { webCurrentUser, webDoc, webCollection, getDoc, getDocs, setDoc, deleteDoc, query, where } from './webFirebase';
import { MASTER_WORKSPACE_ID, MASTER_ACCOUNT_EMAIL, type WorkspaceAccessState } from './workspaceAccess';

const SCHEMA_VERSION=12;
const LAST_SYNC_KEY='cardiovault_last_cloud_sync';
const LAST_ERROR_KEY='cardiovault_last_cloud_sync_error';
const LAST_ERROR_DETAIL_KEY='cardiovault_last_cloud_sync_error_detail';
const path=(workspace:string,collection:string)=>`workspaces/${workspace}/${collection}`;
const safe=(v:any):any=>JSON.parse(JSON.stringify(v??null));
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
  const user=webCurrentUser();
  if(user?.email?.toLowerCase()===MASTER_ACCOUNT_EMAIL.toLowerCase()){
    await setDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}`),{ownerUid:uid,ownerEmail:MASTER_ACCOUNT_EMAIL,schemaVersion:SCHEMA_VERSION,createdAt:new Date().toISOString()},{merge:true});
    const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};
    localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state)); return state;
  }
  const member=await getDoc(webDoc(`workspaces/${MASTER_WORKSPACE_ID}/members/${uid}`));
  if(!member.exists())return null;
  const m=member.data();
  if(m?.active===false||m?.forceReauth===true)return null;
  const hashes=Array.from(new Set([
    ...(Array.isArray(m?.accessCodeHashes)?m.accessCodeHashes:[]),
    m?.accessCodeHash,
  ].filter(Boolean).map(String)));
  if(!hashes.length)return null;
  const activeCodes:any[]=[];
  for(const hash of hashes){
    const code=await getDoc(webDoc(`accessCodes/${hash}`));
    if(code.exists()){
      const data=code.data();
      if(data?.active===true&&data.workspaceId===MASTER_WORKSPACE_ID)activeCodes.push({hash,data});
    }
  }
  if(!activeCodes.length)return null;
  const unitIds=Array.from(new Set([
    ...(Array.isArray(m?.unitIds)?m.unitIds:[]),
    ...(m?.unitId?[m.unitId]:[]),
  ].map(String).filter(Boolean)));
  if(!unitIds.length)return null;
  const unitNames:Record<string,string>={};
  await Promise.all(unitIds.map(async unitId=>{
    try{
      const unit=await getDoc(webDoc(`${path(MASTER_WORKSPACE_ID,'units')}/${unitId}`));
      const codeForUnit=activeCodes.find(x=>String(x.data?.unitId)===unitId);
      unitNames[unitId]=String(unit.data()?.name||codeForUnit?.data?.unitName||unitId);
    }catch{
      const codeForUnit=activeCodes.find(x=>String(x.data?.unitId)===unitId);
      unitNames[unitId]=String(codeForUnit?.data?.unitName||unitId);
    }
  }));
  const currentUnitId=String(m?.unitId&&unitIds.includes(String(m.unitId))?m.unitId:unitIds[0]);
  const currentCode=activeCodes.find(x=>String(x.data?.unitId)===currentUnitId)||activeCodes[0];
  const state:WorkspaceAccessState={
    workspaceId:MASTER_WORKSPACE_ID,
    role:m.role==='view_only'?'view_only':'clinical_editor',
    unitId:currentUnitId,
    unitName:unitNames[currentUnitId]||String(currentCode?.data?.unitName||currentUnitId),
    unitIds,
    unitNames,
  };
  localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state)); return state;
}
async function collectionData(p:string,unitId?:string){
  const ref=webCollection(p); const snap=unitId?await getDocs(query(ref,where('unitId','==',unitId))):await getDocs(ref);
  return snap.docs.map(d=>({...d.data(),id:d.id}));
}
async function migrateLegacyMemberPatients(uid:string,access:WorkspaceAccessState):Promise<number>{
  if(access.role==='owner'||access.role==='view_only')return 0;
  const unitIds=new Set<string>((Array.isArray((access as any).unitIds)?(access as any).unitIds:[access.unitId]).filter(Boolean).map(String));if(!unitIds.size)return 0;
  const legacyBeds=await collectionData('users/'+uid+'/beds');const legacyPatients=await collectionData('users/'+uid+'/patients');const workspaceBeds=await collectionData(path(access.workspaceId,'beds'));
  const canonicalBeds=new Map<string,{id:string;data:any}>();for(const item of workspaceBeds){const unit=String(item.unitId||'');const number=String(item.bedNumber||'').trim().toLowerCase();if(unit&&number)canonicalBeds.set(unit+'::'+number,{id:String(item.id),data:item});}
  const legacyBedMap=new Map<string,string>();
  for(const item of legacyBeds){const sourceUnit=String(item.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;const bedNumber=String(item.bedNumber||'').trim();if(!bedNumber)continue;const key=targetUnit+'::'+bedNumber.toLowerCase();let canonical=canonicalBeds.get(key);if(!canonical){const canonicalId='bed-'+targetUnit+'-'+bedNumber.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();canonical={id:canonicalId,data:{id:canonicalId,unitId:targetUnit,bedNumber,status:'Empty',schemaVersion:SCHEMA_VERSION}};canonicalBeds.set(key,canonical);}legacyBedMap.set(String(item.id),canonical.id);const legacyPatientId=String(item.patientId||'');const existingPatientId=String(canonical.data?.patientId||'');if((legacyPatientId&&(!existingPatientId||existingPatientId===legacyPatientId))||!existingPatientId){const bed={...canonical.data,...item,id:canonical.id,unitId:targetUnit,bedNumber,migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,status:item.status||canonical.data?.status||'Stable'};await withTimeout(setDoc(webDoc(path(access.workspaceId,'beds')+'/'+canonical.id),bed,{merge:true}));canonical.data=bed;}}
  let migrated=0;for(const item of legacyPatients){const sourceUnit=String(item.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;let targetBedId='';const legacyBedId=String(item.bedId||'');if(legacyBedId)targetBedId=legacyBedMap.get(legacyBedId)||'';if(!targetBedId&&legacyBedId){const lb=legacyBeds.find(b=>String(b.id)===legacyBedId);const bn=String(lb?.bedNumber||'').trim();if(bn)targetBedId=canonicalBeds.get(targetUnit+'::'+bn.toLowerCase())?.id||'';}const existing=await getDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id));const patient={...safe(item),id:String(item.id),unitId:targetUnit,bedId:targetBedId||String(item.bedId||''),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION};if(existing.exists()){const existingUnit=String(existing.data()?.unitId||'');if(existingUnit&&existingUnit!==targetUnit)continue;await withTimeout(setDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id),{unitId:targetUnit,...(targetBedId?{bedId:targetBedId}:{}),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true}));}else{await withTimeout(setDoc(webDoc(path(access.workspaceId,'patients')+'/'+item.id),patient,{merge:false}));migrated++;}if(targetBedId){const bedRef=path(access.workspaceId,'beds')+'/'+targetBedId;const bedSnap=await getDoc(webDoc(bedRef));const bedData=bedSnap.exists()?bedSnap.data():{};const occupiedBy=String(bedData?.patientId||'');if(!occupiedBy||occupiedBy===String(item.id))await withTimeout(setDoc(webDoc(bedRef),{patientId:String(item.id),status:item.status||bedData?.status||'Stable',unitId:targetUnit,bedNumber:bedData?.bedNumber||item.bedNumber||'',schemaVersion:SCHEMA_VERSION},{merge:true}));}}
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
        const [scopedBeds,scopedPatients]=await Promise.all([
          collectionData(path(access.workspaceId,'beds'),unitId),
          collectionData(path(access.workspaceId,'patients'),unitId),
        ]);
        return {
          unit:unit.exists()?{...unit.data(),id:unitId}:null,
          beds:scopedBeds,
          patients:scopedPatients,
        };
      }));
      loaded.forEach(item=>{if(item.unit)units.push(item.unit);beds.push(...item.beds);patients.push(...item.patients);});
    }
    // Never let an incomplete owner cloud snapshot erase a larger local unit registry.
    // If local has more units than cloud, keep the local registry and upload it on the next sync.
    let preservedLocalOwnerUnits=false;
    if (access.role==='owner') {
      const localUnits=StorageService.getUnits();
      if (localUnits.length>units.length && units.length>0) { units=localUnits; preservedLocalOwnerUnits=true; }
    }
    const cleaned = stripLegacyDemoData(units, beds, patients);
    units=cleaned.units; beds=cleaned.beds; patients=cleaned.patients;
    const reconciled=reconcileClinicalRegistry(units,beds,patients);
    units=reconciled.units; beds=reconciled.beds; patients=reconciled.patients;
    const localPatients=StorageService.getPatients();
    const localById=new Map(localPatients.map((patient:any)=>[String(patient?.id||''),patient]));
    patients=patients.map((cloudPatient:any)=>{
      const localPatient=localById.get(String(cloudPatient?.id||''));
      return localPatient ? mergeClinicalMedia(localPatient,cloudPatient) : cloudPatient;
    });
    localStorage.setItem('cardiovault_cloud_restore_in_progress','1');
    try { StorageService.saveUnits(units); StorageService.saveBeds(beds); StorageService.savePatients(patients); }
    finally { localStorage.removeItem('cardiovault_cloud_restore_in_progress'); }
    if (preservedLocalOwnerUnits||reconciled.changed) void webSyncCurrentUserNow();
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
    const allowedUnitIds=new Set((access.unitIds?.length?access.unitIds:[access.unitId]).filter(Boolean).map(String));
    const sync=async(name:string,records:any[],unitScoped:boolean)=>{
      const current=new Set<string>();
      for(const record of records){
        if(!record?.id)continue;
        if(unitScoped&&!allowedUnitIds.has(String(record.unitId||'')))continue;
        current.add(String(record.id));
        await withTimeout(setDoc(webDoc(`${path(access.workspaceId,name)}/${record.id}`),{...safe(record),id:String(record.id),updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},{merge:true}));
      }
      if(access.role==='owner'){
        const remote=await collectionData(path(access.workspaceId,name));
        for(const item of remote)if(!current.has(String(item.id)))await deleteDoc(webDoc(`${path(access.workspaceId,name)}/${item.id}`));
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
      let values:any[] = snap.docs.map((d:any)=>({...d.data(), id:d.id}));
      if (name==='units') values=stripLegacyDemoData(values, [], []).units;
      if (name==='beds') values=stripLegacyDemoData([], values, []).beds;
      if (name==='patients') values=stripLegacyDemoData([], [], values).patients;
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
          const localPatients=StorageService.getPatients();
          const localById=new Map(localPatients.map((patient:any)=>[String(patient?.id||''),patient]));
          const mergedPatients=values.map((cloudPatient:any)=>{
            const localPatient=localById.get(String(cloudPatient?.id||''));
            return localPatient ? mergeClinicalMedia(localPatient,cloudPatient) : cloudPatient;
          });
          StorageService.savePatients(mergedPatients);
        }
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
        const values:Unit[] = snap.exists() ? [{...snap.data(), id:snap.id} as Unit] : [];
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
