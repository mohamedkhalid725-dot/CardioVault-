import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { StorageService, stripLegacyDemoData } from './storage';
import { normalizeBedStatus, normalizePatientStatus } from '../types/clinical';
import { WorkspaceAccessState, ensureOwnerWorkspace, isMasterAccount, getActiveWorkspaceId } from './workspaceAccess';
import { reconcileClinicalRegistry } from './bedReconciliation';
import { clearPendingLocalChanges, hasPendingLocalChanges, markPendingLocalChanges, mergeClinicalCollections, pendingChangesGeneration } from './clinicalMerge';
import { ensureUnitBeds, type CloudBedRecord, type EnsureUnitBedsResult, type UnitBedsIO } from './unitBeds';
import { webCurrentUser } from './webFirebase';
import { ensureWebUnitBeds, webLoadCurrentUserFromCloud, webSyncCurrentUserNow } from './webCloudSyncBridge';
import { isLocalPreview } from '../config/localPreview';

let installed=false;
let syncing=false;
let suppressSync=false;
let syncTimer:ReturnType<typeof setTimeout>|null=null;
let syncRequested=false;
// The promise of the sync that is running right now. A caller that needs the
// cloud to be up to date (creating a unit, for example) has to wait for it
// instead of starting a second sync that would be dropped as "already
// syncing" and report success without having uploaded anything.
let inflightSync:Promise<void>|null=null;
const UID_KEY='cardiovault_google_uid';
const LAST_SYNC_KEY='cardiovault_last_cloud_sync';
const LAST_ERROR_KEY='cardiovault_last_cloud_sync_error';
const LAST_ERROR_DETAIL_KEY='cardiovault_last_cloud_sync_error_detail';
const SCHEMA_VERSION=12;

const currentUser=async():Promise<any|null>=>{if(!Capacitor.isNativePlatform())return webCurrentUser();try{return(await FirebaseAuthentication.getCurrentUser()).user||null;}catch{return null;}};
const currentUid=async():Promise<string|null>=>{const user=await currentUser();return user?.uid||null;};
const recoverNativeGoogleSession=async():Promise<string|null>=>{if(!Capacitor.isNativePlatform())return null;try{const pending=await FirebaseAuthentication.getPendingAuthResult();if(pending?.user?.uid)return pending.user.uid;}catch{}try{const result=await FirebaseAuthentication.signInWithGoogle({useCredentialManager:true});if(result?.user?.uid)return result.user.uid;}catch(error){console.warn('Interactive Google session recovery failed:',error);}return currentUid();};
const errorText=(error:unknown):string=>{const v=error as any;const code=String(v?.code||v?.errorCode||'').trim();const message=String(v?.message||v?.errorMessage||error||'').trim();return[code,message].filter(Boolean).join(': ').slice(0,500)||'Unknown cloud error';};
const recordCloudError=(error:unknown)=>{localStorage.setItem(LAST_ERROR_KEY,new Date().toISOString());localStorage.setItem(LAST_ERROR_DETAIL_KEY,errorText(error));};
const clearCloudError=()=>{localStorage.removeItem(LAST_ERROR_KEY);localStorage.removeItem(LAST_ERROR_DETAIL_KEY);};
const ensureFirestoreNetwork=async()=>{if(Capacitor.isNativePlatform())await FirebaseFirestore.enableNetwork();};
const readSnapshotData=(snapshot:any):any=>{try{return typeof snapshot?.data==='function'?snapshot.data():(snapshot?.data||{});}catch{return{};}};
const readSnapshotId=(snapshot:any):string|null=>{const id=snapshot?.id||snapshot?.documentId||snapshot?.reference?.id;return typeof id==='string'&&id?id:null;};
const firestoreSafe=(value:any,seen=new WeakSet<object>()):any=>{if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='bigint')return value.toString();if(value instanceof Date)return value.toISOString();if(typeof value==='undefined'||typeof value==='function'||typeof value==='symbol')return undefined;if(typeof value!=='object')return null;if(seen.has(value))return null;seen.add(value);if(Array.isArray(value))return value.map(item=>{const cleaned=firestoreSafe(item,seen);return cleaned===undefined?null:cleaned;});const out:Record<string,any>={};for(const[key,child]of Object.entries(value)){const cleaned=firestoreSafe(child,seen);if(cleaned!==undefined)out[key]=cleaned;}return out;};
async function getCollectionDocuments(reference:string,unitId?:string):Promise<Array<{id:string;data:any}>>{const options:any={reference};if(unitId)options.compositeFilter={type:'and',queryConstraints:[{type:'where',fieldPath:'unitId',opStr:'==',value:unitId}]};const result:any=await FirebaseFirestore.getCollection(options);const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];return snapshots.map((snapshot:any)=>({id:readSnapshotId(snapshot)||'',data:readSnapshotData(snapshot)})).filter(x=>!!x.id);}
// A clinical file can be shared by more than one unit. The file keeps a single
// document whose unitIds array lists every unit allowed to read it, so a unit
// must ALSO ask for the files that list it - otherwise a shared file would
// disappear from the unit that shares it.
async function getSharedCollectionDocuments(reference:string,unitId:string):Promise<Array<{id:string;data:any}>>{if(!unitId)return[];const options:any={reference,compositeFilter:{type:'and',queryConstraints:[{type:'where',fieldPath:'unitIds',opStr:'array-contains',value:unitId}]}};try{const result:any=await FirebaseFirestore.getCollection(options);const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];return snapshots.map((snapshot:any)=>({id:readSnapshotId(snapshot)||'',data:readSnapshotData(snapshot)})).filter(x=>!!x.id);}catch(error){console.warn('Shared clinical file lookup failed:',error);return[];}}
const withTimeout=<T,>(promise:Promise<T>,timeoutMs=15000):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Cloud sync operation timed out.')),timeoutMs);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
async function withRetry<T>(operation:()=>Promise<T>,attempts=3):Promise<T>{let last:unknown;for(let i=0;i<attempts;i++){try{return await withTimeout(operation(),15000);}catch(error){last=error;if(i<attempts-1)await new Promise(r=>setTimeout(r,500*2**i));}}throw last;}
const workspacePath=(workspaceId:string,collection:string)=>`workspaces/${workspaceId}/${collection}`;
function clearLocalClinicalData(){const previous=suppressSync;suppressSync=true;try{StorageService.saveUnits([]);StorageService.saveBeds([]);StorageService.savePatients([]);}finally{suppressSync=previous;}}
function setLocalData(units:any[],beds:any[],patients:any[]){const previous=suppressSync;suppressSync=true;try{StorageService.saveUnits(units);StorageService.saveBeds(beds);StorageService.savePatients(patients);}finally{suppressSync=previous;}}
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
      return {
        ...cloudRecord,
        imageUrls: [...cloudUrls, ...localUrls.filter((url:any) => !cloudUrls.includes(url))],
        imageStoragePaths: [...cloudPaths, ...localPaths.filter((path:any) => !cloudPaths.includes(path))],
      };
    });
  };
  const merged = { ...cloudPatient };
  merged.ecgRecords = mergeRecords(cloudPatient.ecgRecords, localPatient.ecgRecords);
  const cloudImaging = Array.isArray(cloudPatient.imaging) ? cloudPatient.imaging : [];
  const localImaging = Array.isArray(localPatient.imaging) ? localPatient.imaging : [];
  merged.imaging = mergeRecords(cloudImaging, localImaging);
  if (Array.isArray(cloudPatient.imagingStudies)) {
    merged.imagingStudies = mergeRecords(cloudPatient.imagingStudies, localPatient.imagingStudies);
  }
  return merged;
}

export function restoreLocalDataFromCloud(collection:'units'|'beds'|'patients',values:any[]){
  const previous=suppressSync;
  suppressSync=true;
  try{
    if(collection==='units') StorageService.saveUnits(values);
    else if(collection==='beds') StorageService.saveBeds(values);
    else StorageService.savePatients(values);
  } finally { suppressSync=previous; }
}

async function migrateLegacyOwnerData(uid:string,legacyUnits:any[],legacyBeds:any[],legacyPatients:any[]):Promise<WorkspaceAccessState>{if(!(await isMasterAccount()))throw new Error('Legacy data migration is restricted to the Master Account.');const ownerWorkspace=await ensureOwnerWorkspace();if(!ownerWorkspace)throw new Error('The Master workspace could not be opened or created.');const workspaceId=ownerWorkspace.workspaceId;await FirebaseFirestore.setDocument({reference:`workspaces/${workspaceId}`,data:{ownerUid:uid,ownerEmail:'mohamedkhalid725@gmail.com',schemaVersion:SCHEMA_VERSION,createdAt:new Date().toISOString(),migratedFromLegacy:true},merge:true});const copy=async(collection:string,records:any[])=>{for(const record of records){if(!record?.id)continue;const safe=firestoreSafe(record)||{};await FirebaseFirestore.setDocument({reference:`${workspacePath(workspaceId,collection)}/${record.id}`,data:{...safe,id:record.id},merge:true});}};await copy('units',legacyUnits);await copy('beds',legacyBeds);await copy('patients',legacyPatients);const state={workspaceId,role:'owner' as const,unitId:null,unitName:null};localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state));return state;}

async function restoreMemberAccess(uid:string):Promise<WorkspaceAccessState|null>{
  const workspaceId=getActiveWorkspaceId();
  try{
    const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${workspaceId}/members/${uid}`});
    const data=readSnapshotData(result?.snapshot);
    if(!data?.unitId&&!Array.isArray(data?.unitIds)){
      recordCloudError(new Error('This Firebase account is not assigned to a CardioVault Unit. Redeem the Unit Access Code for this account first.'));
      return null;
    }
    if(data?.active===false||data?.forceReauth===true)return null;
    // Membership is the persistent authorization. Access codes are used to enroll
    // an account and are revoked by setting membership.active/forceReauth. Requiring
    // an active code on every login breaks accounts that were assigned directly by
    // the Department Admin and accounts whose original code was later rotated.
    let team:any=null;
    try{team=readSnapshotData((await FirebaseFirestore.getDocument({reference:`workspaces/${workspaceId}/team/${uid}`})).snapshot);}catch{}
    const unitIds:string[]=Array.from(new Set<string>((Array.isArray(team?.assignedUnitIds)&&team.assignedUnitIds.length?team.assignedUnitIds:(Array.isArray(data.unitIds)?data.unitIds:[data.unitId])).map(String)));
    if(!unitIds.length)return null;
    const unitNames:Record<string,string>={};
    for(const unitId of unitIds){try{const unit:any=await FirebaseFirestore.getDocument({reference:`${workspacePath(workspaceId,'units')}/${unitId}`});unitNames[unitId]=String(readSnapshotData(unit?.snapshot)?.name||unitId);}catch{unitNames[unitId]=unitId;}}
    const currentUnitId=String(data.unitId&&unitIds.includes(String(data.unitId))?data.unitId:unitIds[0]);
    const currentUnitName=unitNames[currentUnitId]||currentUnitId;
    const role=(team?.role||data.role)==='view_only'?'view_only':'clinical_editor';
    const state:WorkspaceAccessState={workspaceId,role,unitId:currentUnitId,unitName:currentUnitName,unitIds,unitNames};
    localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state));
    if(team?.userId||team?.uid){try{const profile:any={...team,userId:uid,assignedUnitIds:unitIds};localStorage.setItem('cardiovault_current_user_profile_v2',JSON.stringify(profile));}catch{}}
    return state;
  }catch(error){recordCloudError(error);console.warn('Member workspace restore failed:',error);return null;}
}
async function resolveAccess():Promise<WorkspaceAccessState|null>{
  const id=await currentUid();
  if(!id)return null;
  if(await isMasterAccount())return await ensureOwnerWorkspace();
  // Never reuse a cached workspace membership after the Firebase account changes.
  // Resolve the membership from the currently authenticated UID.
  return await restoreMemberAccess(id);
}

async function syncCollection(workspaceId:string,collection:string,records:any[],filter:(record:any)=>boolean,allowRemoteDelete:boolean):Promise<void>{const reference=workspacePath(workspaceId,collection);const currentIds=new Set<string>();for(const record of records){if(!record?.id||!filter(record))continue;const id=String(record.id);currentIds.add(id);const safe=firestoreSafe(record)||{};await withRetry(()=>FirebaseFirestore.setDocument({reference:`${reference}/${id}`,data:{...safe,id,updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},merge:true}));}if(!allowRemoteDelete)return;const remote=await getCollectionDocuments(reference);for(const item of remote){if(filter(item.data)&&!currentIds.has(item.id))await withRetry(()=>FirebaseFirestore.deleteDocument({reference:`${reference}/${item.id}`}));}}
async function writeMetadata(workspaceId:string,uid:string,access:WorkspaceAccessState){await withRetry(()=>FirebaseFirestore.setDocument({reference:`workspaces/${workspaceId}/metadata/cloud`,data:{workspaceId,ownerUid:uid,lastClientSync:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,role:access.role,unitId:access.unitId||null,platform:Capacitor.getPlatform()},merge:true}));}

async function syncLocalDatabase(uid:string):Promise<void>{
  const verified=await currentUid();
  if(!verified||verified!==uid)throw new Error('Firebase authentication session is missing or changed. Sign in again.');
  const access=await resolveAccess();
  if(!access)throw new Error('No CardioVault Workspace is assigned to this account. Enter a Unit Access Code.');
  if(access.role==='view_only')return;
  if(syncing||suppressSync){syncRequested=true;await waitForIdleSync();return;}
  syncing=true;syncRequested=false;
  const generation=pendingChangesGeneration();
  const run=(async()=>{
    try{
      await ensureFirestoreNetwork();
      const owner=access.role==='owner';
      const myUnitIds=Array.isArray(access.unitIds)?access.unitIds.map(String):[];
      const myUid=String(uid);
      // A unit the caller created is his even before the membership catches up
      // (the rules make the creator its consultant), and its beds belong to him
      // for the same reason. Uploading the unit but not its beds is what made a
      // newly created unit come back with a bed count of zero.
      const myCreatedUnitIds=new Set(StorageService.getUnits().filter(unit=>String((unit as any).createdBy||'')===myUid).map(unit=>String(unit.id)));
      const filterUnit=(record:any)=>owner
        ||myUnitIds.includes(String(record?.unitId||''))
        ||myCreatedUnitIds.has(String(record?.unitId||''))
        ||String(record?.unitId||'')===String(access.unitId||'');
      await syncCollection(access.workspaceId,'units',StorageService.getUnits(),record=>owner||myUnitIds.includes(String(record?.id||''))||String(record?.createdBy||'')===myUid,owner);
      await syncCollection(access.workspaceId,'beds',StorageService.getBeds(),filterUnit,owner);
      await syncCollection(access.workspaceId,'patients',StorageService.getPatients(),filterUnit,owner);
      if(owner)await writeMetadata(access.workspaceId,uid,access);
      // The workspace only counts as clean when nothing was saved while this
      // upload was running; otherwise the local copy is still the newest truth.
      if(pendingChangesGeneration()===generation)clearPendingLocalChanges();
      localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
      clearCloudError();
    }catch(error){
      markPendingLocalChanges();
      recordCloudError(error);
      throw error;
    }
  })();
  inflightSync=run;
  try{await run;}finally{syncing=false;if(inflightSync===run)inflightSync=null;if(syncRequested){syncRequested=false;scheduleSync(100);}}
}
/** Waits until no automatic sync is running, so the next one really uploads. */
async function waitForIdleSync():Promise<void>{for(let attempt=0;attempt<100;attempt+=1){if(!syncing)return;const current=inflightSync;if(current){try{await current;}catch{}}await new Promise(resolve=>setTimeout(resolve,100));}}
function scheduleSync(delay=100){if(suppressSync)return;if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncTimer=null;void(async()=>{const uid=await currentUid();if(!uid)return;localStorage.setItem(UID_KEY,uid);try{await syncLocalDatabase(uid);}catch(error){console.warn('Automatic cloud sync failed; changes will be retried on the next local save or manual sync.',error);}})();},delay);}

async function migrateLegacyMemberPatients(uid:string,access:WorkspaceAccessState):Promise<number>{
  if(access.role==='owner'||access.role==='view_only')return 0;
  const unitIds=new Set<string>((Array.isArray((access as any).unitIds)?(access as any).unitIds:[access.unitId]).filter(Boolean).map(String));
  if(!unitIds.size)return 0;
  const legacyBeds=await getCollectionDocuments('users/'+uid+'/beds');
  const legacyPatients=await getCollectionDocuments('users/'+uid+'/patients');
  const workspaceBeds=await getCollectionDocuments(workspacePath(access.workspaceId,'beds'));
  const canonicalBeds=new Map<string,{id:string;data:any}>();
  for(const item of workspaceBeds){const unit=String(item.data?.unitId||'');const number=String(item.data?.bedNumber||'').trim().toLowerCase();if(unit&&number)canonicalBeds.set(unit+'::'+number,item);}
  const legacyBedMap=new Map<string,string>();
  for(const item of legacyBeds){
    const raw=firestoreSafe({...item.data,id:item.id})||{};const sourceUnit=String(raw.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;
    const bedNumber=String(raw.bedNumber||'').trim();if(!bedNumber)continue;const key=targetUnit+'::'+bedNumber.toLowerCase();let canonical=canonicalBeds.get(key);
    if(!canonical){const canonicalId='bed-'+targetUnit+'-'+bedNumber.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();canonical={id:canonicalId,data:{id:canonicalId,unitId:targetUnit,bedNumber,status:'Empty',schemaVersion:SCHEMA_VERSION}};canonicalBeds.set(key,canonical);}
    legacyBedMap.set(item.id,canonical.id);const legacyPatientId=String(raw.patientId||'');const existingPatientId=String(canonical.data?.patientId||'');
    if(legacyPatientId&&(!existingPatientId||existingPatientId===legacyPatientId)||!existingPatientId){const bed={...canonical.data,...raw,id:canonical.id,unitId:targetUnit,bedNumber,migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,status:normalizeBedStatus(raw.status||canonical.data?.status||'Not documented')};await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'beds')+'/'+canonical.id,data:bed,merge:true}));canonical.data=bed;}
  }
  let migrated=0;
  for(const item of legacyPatients){
    const raw=firestoreSafe({...item.data,id:item.id})||{};const sourceUnit=String(raw.unitId||'');const targetUnit=sourceUnit&&unitIds.has(sourceUnit)?sourceUnit:String(access.unitId||'');if(!targetUnit)continue;
    let targetBedId='';const legacyBedId=String(raw.bedId||'');if(legacyBedId)targetBedId=legacyBedMap.get(legacyBedId)||'';
    if(!targetBedId&&legacyBedId){const lb=legacyBeds.find(b=>String(b.id)===legacyBedId);const bn=String(lb?.data?.bedNumber||'').trim();if(bn)targetBedId=canonicalBeds.get(targetUnit+'::'+bn.toLowerCase())?.id||'';}
    const existing=await FirebaseFirestore.getDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id});const existingData=readSnapshotData(existing?.snapshot);const patient={...raw,id:item.id,unitId:targetUnit,bedId:targetBedId||String(raw.bedId||''),status:normalizePatientStatus(raw.status),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION};
    if(existingData&&Object.keys(existingData).length){const existingUnit=String(existingData.unitId||'');if(existingUnit&&existingUnit!==targetUnit)continue;await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id,data:{unitId:targetUnit,...(targetBedId?{bedId:targetBedId}:{}),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},merge:true}));}else{await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id,data:patient,merge:false}));migrated++;}
    if(targetBedId){const bedRef=workspacePath(access.workspaceId,'beds')+'/'+targetBedId;const bedSnap=await FirebaseFirestore.getDocument({reference:bedRef});const bedData=readSnapshotData(bedSnap?.snapshot);const occupiedBy=String(bedData?.patientId||'');if(!occupiedBy||occupiedBy===item.id)await withRetry(()=>FirebaseFirestore.setDocument({reference:bedRef,data:{patientId:item.id,status:normalizeBedStatus(raw.status||bedData?.status||'Not documented'),unitId:targetUnit,bedNumber:bedData?.bedNumber||raw.bedNumber||'',schemaVersion:SCHEMA_VERSION},merge:true}));}
  }
  return migrated;
}

export async function loadCurrentUserFromCloud():Promise<{uid:string;found:boolean;access?:WorkspaceAccessState|null}|null>{if(!Capacitor.isNativePlatform())return webLoadCurrentUserFromCloud();const uid=await currentUid();if(!uid)return null;localStorage.setItem(UID_KEY,uid);const localUnits=StorageService.getUnits();const localBeds=StorageService.getBeds();const localPatients=StorageService.getPatients();suppressSync=true;try{await ensureFirestoreNetwork();let access=await resolveAccess();if(access&&access.role!=='owner'&&access.role!=='view_only'){try{await migrateLegacyMemberPatients(uid,access);}catch(error){recordCloudError(error);console.warn('Legacy member patient migration failed:',error);}}if(!access&&await isMasterAccount()){const legacyUnits=await getCollectionDocuments(`users/${uid}/units`);const legacyBeds=await getCollectionDocuments(`users/${uid}/beds`);const legacyPatients=await getCollectionDocuments(`users/${uid}/patients`);const hasLegacy=legacyUnits.length||legacyBeds.length||legacyPatients.length;if(hasLegacy)access=await migrateLegacyOwnerData(uid,legacyUnits.map(x=>({...x.data,id:x.id})),legacyBeds.map(x=>({...x.data,id:x.id})),legacyPatients.map(x=>({...x.data,id:x.id})));}if(!access)return{uid,found:false,access:null};let units:any[]=[],beds:any[]=[],patients:any[]=[];if(access.role==='owner'){const [allUnits,allBeds,allPatients]=await Promise.all([getCollectionDocuments(workspacePath(access.workspaceId,'units')),getCollectionDocuments(workspacePath(access.workspaceId,'beds')),getCollectionDocuments(workspacePath(access.workspaceId,'patients'))]);units=allUnits.map(x=>({...x.data,id:x.id}));beds=allBeds.map(x=>({...x.data,id:x.id}));patients=allPatients.map(x=>({...x.data,id:x.id}));}else{
      const unitIds:string[]=Array.isArray(access.unitIds)&&access.unitIds.length?access.unitIds.map(String):(access.unitId?[String(access.unitId)]:[]);
      const loaded=await Promise.all(unitIds.map(async unitId=>{const unit:any=await FirebaseFirestore.getDocument({reference:`${workspacePath(access.workspaceId,'units')}/${unitId}`});const [scopedBeds,scopedPatients,sharedPatients]=await Promise.all([getCollectionDocuments(workspacePath(access.workspaceId,'beds'),unitId||undefined),getCollectionDocuments(workspacePath(access.workspaceId,'patients'),unitId||undefined),getSharedCollectionDocuments(workspacePath(access.workspaceId,'patients'),unitId||'')]);const patientsById=new Map<string,any>();for(const item of scopedPatients)patientsById.set(item.id,{...item.data,id:item.id});for(const item of sharedPatients)if(!patientsById.has(item.id))patientsById.set(item.id,{...item.data,id:item.id});const unitData=readSnapshotData(unit?.snapshot);return{unit:unitData&&Object.keys(unitData).length?{...unitData,id:unitId}:null,beds:scopedBeds.map(x=>({...x.data,id:x.id})),patients:Array.from(patientsById.values())};}));loaded.forEach(x=>{if(x.unit)units.push(x.unit);beds.push(...x.beds);patients.push(...x.patients);});}const found=!!(units.length||beds.length||patients.length);const cleaned = stripLegacyDemoData(units, beds, patients);
    units=cleaned.units; beds=cleaned.beds; patients=cleaned.patients;
    // The cloud snapshot is not allowed to wipe work the doctor has not seen
    // uploaded yet. While local changes are pending the two copies are merged
    // record by record, so a unit whose beds are still on their way to the
    // cloud keeps them instead of coming back with a bed count of zero.
    const merged=mergeClinicalCollections({units,beds,patients},{units:localUnits,beds:localBeds,patients:localPatients},{keepLocalOnly:hasPendingLocalChanges()});
    units=merged.units; beds=merged.beds; patients=merged.patients;
    const reconciled=reconcileClinicalRegistry(units,beds,patients);units=reconciled.units;beds=reconciled.beds;patients=reconciled.patients;setLocalData(units,beds,patients);localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());clearCloudError();return{uid,found,access};}catch(error){recordCloudError(error);console.warn('Cloud database read failed.',error);return{uid,found:false,access:null};}finally{suppressSync=false;}}
export async function saveCurrentUserToCloud():Promise<void>{if(isLocalPreview())return;if(!Capacitor.isNativePlatform()){if(webCurrentUser())void webSyncCurrentUserNow();return;}const uid=await currentUid();if(!uid)return;localStorage.setItem(UID_KEY,uid);scheduleSync(100);}
export async function syncCurrentUserNow():Promise<boolean>{if(!Capacitor.isNativePlatform())return webSyncCurrentUserNow();let uid=await currentUid();if(!uid)uid=await recoverNativeGoogleSession();if(!uid){recordCloudError(new Error('No native Firebase user is signed in.'));return false;}localStorage.setItem(UID_KEY,uid);try{const access=await resolveAccess();if(!access){const message=await isMasterAccount()?'Master workspace could not be opened or created. Check that the current Google account is the Master Account and that the latest Firestore rules are deployed.':'No Workspace is assigned to this account. Enter a Unit Access Code.';recordCloudError(new Error(message));return false;}await waitForIdleSync();await syncLocalDatabase(uid);return true;}catch(error){recordCloudError(error);console.warn('Manual cloud sync failed:',error);return false;}}
/**
 * Creates every bed document a unit is missing and verifies the cloud copy.
 * The unit document and its beds are separate writes, so the creation flow can
 * never assume that "the sync succeeded" also means "the beds are there".
 * Repeating it is safe: existing (possibly occupied) beds are never touched and
 * the deterministic ids make a duplicate impossible.
 */
export async function ensureUnitBedsNow(unitId:string,expected:number):Promise<EnsureUnitBedsResult>{
  if(!Capacitor.isNativePlatform())return ensureWebUnitBeds(unitId,expected);
  const uid=await currentUid();
  if(!uid)throw new Error('A Firebase account must be signed in.');
  const access=await resolveAccess();
  if(!access)throw new Error('No CardioVault Workspace is assigned to this account. Enter a Unit Access Code.');
  const io:UnitBedsIO={
    async listBeds(id:string){
      const records=await withTimeout(getCollectionDocuments(workspacePath(access.workspaceId,'beds'),id));
      return records.map(item=>({id:item.id,data:item.data})) as CloudBedRecord[];
    },
    async createBed(_id:string,bed){
      const reference=`${workspacePath(access.workspaceId,'beds')}/${bed.id}`;
      const snapshot:any=(await withTimeout<any>(FirebaseFirestore.getDocument({reference}))).snapshot;
      const data=readSnapshotData(snapshot);
      if(data&&Object.keys(data).length)return;
      await withTimeout(FirebaseFirestore.setDocument({reference,data:{...firestoreSafe(bed),id:String(bed.id),updatedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},merge:true}));
    },
  };
  return ensureUnitBeds({unitId,expected,io});
}

export function getLastCloudSyncTime(){return localStorage.getItem(LAST_SYNC_KEY)||'';}
export function getLastCloudSyncErrorTime(){return localStorage.getItem(LAST_ERROR_KEY)||'';}
export function getLastCloudSyncErrorDetail(){return localStorage.getItem(LAST_ERROR_DETAIL_KEY)||'';}
export function installCloudSyncBridge(){if(installed)return;installed=true;if(isLocalPreview())return;const originalUnits=StorageService.saveUnits.bind(StorageService);const originalBeds=StorageService.saveBeds.bind(StorageService);const originalPatients=StorageService.savePatients.bind(StorageService);const restoreInProgress=()=>localStorage.getItem('cardiovault_cloud_restore_in_progress')==='1';StorageService.saveUnits=units=>{originalUnits(units);if(!suppressSync&&!restoreInProgress()){markPendingLocalChanges();void saveCurrentUserToCloud();}};StorageService.saveBeds=beds=>{originalBeds(beds);if(!suppressSync&&!restoreInProgress()){markPendingLocalChanges();void saveCurrentUserToCloud();}};StorageService.savePatients=patients=>{originalPatients(patients);if(!suppressSync&&!restoreInProgress()){markPendingLocalChanges();void saveCurrentUserToCloud();}};}
export function clearActiveClinicalWorkspace(){clearLocalClinicalData();localStorage.removeItem('cardiovault_active_workspace_access_v1');}
