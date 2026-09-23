import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { StorageService, stripLegacyDemoData } from './storage';
import { WorkspaceAccessState, MASTER_WORKSPACE_ID, ensureOwnerWorkspace, isMasterAccount } from './workspaceAccess';
import { reconcileClinicalRegistry } from './bedReconciliation';
import { webCurrentUser } from './webFirebase';
import { webLoadCurrentUserFromCloud, webSyncCurrentUserNow } from './webCloudSyncBridge';

let installed=false;
let syncing=false;
let suppressSync=false;
let syncTimer:ReturnType<typeof setTimeout>|null=null;
let syncRequested=false;
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
const firestoreSafe=(value:any,seen=new WeakSet<object>()):any=>{if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='bigint')return value.toString();if(value instanceof Date)return value.toISOString();if(typeof value==='undefined'||typeof value==='function'||typeof value==='symbol')return null;if(typeof value!=='object')return null;if(seen.has(value))return null;seen.add(value);if(Array.isArray(value))return value.map(item=>firestoreSafe(item,seen));const out:Record<string,any>={};for(const[key,child]of Object.entries(value)){out[key]=firestoreSafe(child,seen);}return out;};
async function getCollectionDocuments(reference:string,unitId?:string):Promise<Array<{id:string;data:any}>>{const options:any={reference};if(unitId)options.compositeFilter={type:'and',queryConstraints:[{type:'where',fieldPath:'unitId',opStr:'==',value:unitId}]};const result:any=await FirebaseFirestore.getCollection(options);const snapshots=Array.isArray(result?.snapshots)?result.snapshots:[];return snapshots.map((snapshot:any)=>({id:readSnapshotId(snapshot)||'',data:readSnapshotData(snapshot)})).filter(x=>!!x.id);}
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
    else {
      const localPatients=StorageService.getPatients();
      const localById=new Map(localPatients.map((patient:any)=>[String(patient?.id||''),patient]));
      const mergedPatients=values.map((cloudPatient:any)=>{
        const localPatient=localById.get(String(cloudPatient?.id||''));
        return localPatient ? mergeClinicalMedia(localPatient,cloudPatient) : cloudPatient;
      });
      StorageService.savePatients(mergedPatients);
    }
  } finally { suppressSync=previous; }
}

async function migrateLegacyOwnerData(uid:string,legacyUnits:any[],legacyBeds:any[],legacyPatients:any[]):Promise<WorkspaceAccessState>{if(!(await isMasterAccount()))throw new Error('Legacy data migration is restricted to the Master Account.');await FirebaseFirestore.setDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}`,data:{ownerUid:uid,ownerEmail:'mohamedkhalid725@gmail.com',schemaVersion:SCHEMA_VERSION,createdAt:new Date().toISOString(),migratedFromLegacy:true},merge:true});const copy=async(collection:string,records:any[])=>{for(const record of records){if(!record?.id)continue;const safe=firestoreSafe(record)||{};await FirebaseFirestore.setDocument({reference:`${workspacePath(MASTER_WORKSPACE_ID,collection)}/${record.id}`,data:{...safe,id:record.id},merge:true});}};await copy('units',legacyUnits);await copy('beds',legacyBeds);await copy('patients',legacyPatients);const state={workspaceId:MASTER_WORKSPACE_ID,role:'owner' as const,unitId:null,unitName:null};localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state));return state;}

async function restoreMemberAccess(uid:string):Promise<WorkspaceAccessState|null>{
  try{
    const result:any=await FirebaseFirestore.getDocument({reference:`workspaces/${MASTER_WORKSPACE_ID}/members/${uid}`});
    const data=readSnapshotData(result?.snapshot);
    if(!data?.unitId||!data?.accessCodeHash){
      recordCloudError(new Error('This Firebase account is not assigned to a CardioVault Unit. Redeem the Unit Access Code for this account first.'));
      return null;
    }
    const code:any=await FirebaseFirestore.getDocument({reference:`accessCodes/${data.accessCodeHash}`});
    const codeData=readSnapshotData(code?.snapshot);
    if(!codeData?.active||codeData.workspaceId!==MASTER_WORKSPACE_ID){
      recordCloudError(new Error('The Unit Access Code assigned to this Firebase account is inactive or invalid.'));
      return null;
    }
    let unitName=String(codeData.unitName||'');
    try{
      const unit:any=await FirebaseFirestore.getDocument({reference:`${workspacePath(MASTER_WORKSPACE_ID,'units')}/${data.unitId}`});
      unitName=String(readSnapshotData(unit?.snapshot)?.name||unitName);
    }catch{}
    const state:WorkspaceAccessState={workspaceId:MASTER_WORKSPACE_ID,role:(data.role==='view_only'?'view_only':'clinical_editor') as WorkspaceAccessState['role'],unitId:String(data.unitId),unitName};
    localStorage.setItem('cardiovault_active_workspace_access_v1',JSON.stringify(state));
    return state;
  }catch(error){
    recordCloudError(error);
    console.warn('Member workspace restore failed:',error);
    return null;
  }
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

async function syncLocalDatabase(uid:string):Promise<void>{const verified=await currentUid();if(!verified||verified!==uid)throw new Error('Firebase authentication session is missing or changed. Sign in again.');const access=await resolveAccess();if(!access)throw new Error('No CardioVault Workspace is assigned to this account. Enter a Unit Access Code.');if(access.role==='view_only')return;if(syncing||suppressSync){syncRequested=true;return;}syncing=true;syncRequested=false;try{await ensureFirestoreNetwork();const filterUnit=(record:any)=>access.role==='owner'||String(record?.unitId||'')===String(access.unitId||'');const owner=access.role==='owner';if(owner)await syncCollection(access.workspaceId,'units',StorageService.getUnits(),record=>true,true);await syncCollection(access.workspaceId,'beds',StorageService.getBeds(),filterUnit,owner);await syncCollection(access.workspaceId,'patients',StorageService.getPatients(),filterUnit,owner);if(owner)await writeMetadata(access.workspaceId,uid,access);localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());clearCloudError();}catch(error){recordCloudError(error);throw error;}finally{syncing=false;if(syncRequested){syncRequested=false;scheduleSync(100);}}}
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
    const raw=firestoreSafe({...item.data,id:item.id})||{};const sourceUnit=String(raw.unitId||'');const targetUnit=String(access.unitId||'');if(!targetUnit)continue;
    const bedNumber=String(raw.bedNumber||'').trim();if(!bedNumber)continue;const key=targetUnit+'::'+bedNumber.toLowerCase();let canonical=canonicalBeds.get(key);
    if(!canonical){const canonicalId='bed-'+targetUnit+'-'+bedNumber.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();canonical={id:canonicalId,data:{id:canonicalId,unitId:targetUnit,bedNumber,status:'Empty',schemaVersion:SCHEMA_VERSION}};canonicalBeds.set(key,canonical);}
    legacyBedMap.set(item.id,canonical.id);const legacyPatientId=String(raw.patientId||'');const existingPatientId=String(canonical.data?.patientId||'');
    if(legacyPatientId&&(!existingPatientId||existingPatientId===legacyPatientId)||!existingPatientId){const bed={...canonical.data,...raw,id:canonical.id,unitId:targetUnit,bedNumber,migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,status:raw.status||canonical.data?.status||'Stable'};await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'beds')+'/'+canonical.id,data:bed,merge:true}));canonical.data=bed;}
  }
  let migrated=0;
  for(const item of legacyPatients){
    const raw=firestoreSafe({...item.data,id:item.id})||{};const sourceUnit=String(raw.unitId||'');const targetUnit=String(access.unitId||'');if(!targetUnit)continue;
    let targetBedId='';const legacyBedId=String(raw.bedId||'');if(legacyBedId)targetBedId=legacyBedMap.get(legacyBedId)||'';
    if(!targetBedId&&legacyBedId){const lb=legacyBeds.find(b=>String(b.id)===legacyBedId);const bn=String(lb?.data?.bedNumber||'').trim();if(bn)targetBedId=canonicalBeds.get(targetUnit+'::'+bn.toLowerCase())?.id||'';}
    const existing=await FirebaseFirestore.getDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id});const existingData=readSnapshotData(existing?.snapshot);const patient={...raw,id:item.id,unitId:targetUnit,bedId:targetBedId||String(raw.bedId||''),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION};
    if(existingData&&Object.keys(existingData).length){const existingUnit=String(existingData.unitId||'');if(existingUnit&&existingUnit!==targetUnit)continue;await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id,data:{unitId:targetUnit,...(targetBedId?{bedId:targetBedId}:{}),migratedFromLegacyUserId:uid,migratedAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION},merge:true}));}else{await withRetry(()=>FirebaseFirestore.setDocument({reference:workspacePath(access.workspaceId,'patients')+'/'+item.id,data:patient,merge:false}));migrated++;}
    if(targetBedId){const bedRef=workspacePath(access.workspaceId,'beds')+'/'+targetBedId;const bedSnap=await FirebaseFirestore.getDocument({reference:bedRef});const bedData=readSnapshotData(bedSnap?.snapshot);const occupiedBy=String(bedData?.patientId||'');if(!occupiedBy||occupiedBy===item.id)await withRetry(()=>FirebaseFirestore.setDocument({reference:bedRef,data:{patientId:item.id,status:raw.status||bedData?.status||'Stable',unitId:targetUnit,bedNumber:bedData?.bedNumber||raw.bedNumber||'',schemaVersion:SCHEMA_VERSION},merge:true}));}
  }
  return migrated;
}

export async function loadCurrentUserFromCloud():Promise<{uid:string;found:boolean;access?:WorkspaceAccessState|null}|null>{if(!Capacitor.isNativePlatform())return webLoadCurrentUserFromCloud();const uid=await currentUid();if(!uid)return null;localStorage.setItem(UID_KEY,uid);const localUnits=StorageService.getUnits();const localBeds=StorageService.getBeds();const localPatients=StorageService.getPatients();suppressSync=true;try{await ensureFirestoreNetwork();let access=await resolveAccess();if(access&&access.role!=='owner'&&access.role!=='view_only'){try{await migrateLegacyMemberPatients(uid,access);}catch(error){recordCloudError(error);console.warn('Legacy member patient migration failed:',error);}}if(!access&&await isMasterAccount()){const legacyUnits=await getCollectionDocuments(`users/${uid}/units`);const legacyBeds=await getCollectionDocuments(`users/${uid}/beds`);const legacyPatients=await getCollectionDocuments(`users/${uid}/patients`);const hasLegacy=legacyUnits.length||legacyBeds.length||legacyPatients.length;if(hasLegacy)access=await migrateLegacyOwnerData(uid,legacyUnits.map(x=>({...x.data,id:x.id})),legacyBeds.map(x=>({...x.data,id:x.id})),legacyPatients.map(x=>({...x.data,id:x.id})));}if(!access)return{uid,found:false,access:null};let units:any[]=[],beds:any[]=[],patients:any[]=[];if(access.role==='owner'){const [allUnits,allBeds,allPatients]=await Promise.all([getCollectionDocuments(workspacePath(access.workspaceId,'units')),getCollectionDocuments(workspacePath(access.workspaceId,'beds')),getCollectionDocuments(workspacePath(access.workspaceId,'patients'))]);units=allUnits.map(x=>({...x.data,id:x.id}));beds=allBeds.map(x=>({...x.data,id:x.id}));patients=allPatients.map(x=>({...x.data,id:x.id}));}else{const unit:any=await FirebaseFirestore.getDocument({reference:`${workspacePath(access.workspaceId,'units')}/${access.unitId}`});const [scopedBeds,scopedPatients]=await Promise.all([getCollectionDocuments(workspacePath(access.workspaceId,'beds'),access.unitId||undefined),getCollectionDocuments(workspacePath(access.workspaceId,'patients'),access.unitId||undefined)]);const unitData=readSnapshotData(unit?.snapshot);if(unitData&&Object.keys(unitData).length)units=[{...unitData,id:access.unitId}];beds=scopedBeds.map(x=>({...x.data,id:x.id}));patients=scopedPatients.map(x=>({...x.data,id:x.id}));}const found=!!(units.length||beds.length||patients.length);let preservedLocalOwnerUnits=false;if(access.role==='owner'){if(localUnits.length>units.length&&units.length>0){units=localUnits;preservedLocalOwnerUnits=true;}}const cleaned = stripLegacyDemoData(units, beds, patients);
    units=cleaned.units; beds=cleaned.beds; patients=cleaned.patients;
    const reconciled=reconcileClinicalRegistry(units,beds,patients);units=reconciled.units;beds=reconciled.beds;patients=reconciled.patients;if(found||access.role!=='owner')setLocalData(units,beds,patients);else localStorage.removeItem(LAST_ERROR_DETAIL_KEY);if(preservedLocalOwnerUnits||reconciled.changed)void syncLocalDatabase(uid);localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());clearCloudError();return{uid,found,access};}catch(error){recordCloudError(error);console.warn('Cloud database read failed.',error);return{uid,found:false,access:null};}finally{suppressSync=false;}}
export async function saveCurrentUserToCloud():Promise<void>{if(!Capacitor.isNativePlatform()){if(webCurrentUser())void webSyncCurrentUserNow();return;}const uid=await currentUid();if(!uid)return;localStorage.setItem(UID_KEY,uid);scheduleSync(100);}
export async function syncCurrentUserNow():Promise<boolean>{if(!Capacitor.isNativePlatform())return webSyncCurrentUserNow();let uid=await currentUid();if(!uid)uid=await recoverNativeGoogleSession();if(!uid){recordCloudError(new Error('No native Firebase user is signed in.'));return false;}localStorage.setItem(UID_KEY,uid);try{const access=await resolveAccess();if(!access){const message=await isMasterAccount()?'Master workspace could not be opened or created. Check that the current Google account is the Master Account and that the latest Firestore rules are deployed.':'No Workspace is assigned to this account. Enter a Unit Access Code.';recordCloudError(new Error(message));return false;}await syncLocalDatabase(uid);return true;}catch(error){recordCloudError(error);console.warn('Manual cloud sync failed:',error);return false;}}
export function getLastCloudSyncTime(){return localStorage.getItem(LAST_SYNC_KEY)||'';}
export function getLastCloudSyncErrorTime(){return localStorage.getItem(LAST_ERROR_KEY)||'';}
export function getLastCloudSyncErrorDetail(){return localStorage.getItem(LAST_ERROR_DETAIL_KEY)||'';}
export function installCloudSyncBridge(){if(installed)return;installed=true;const originalUnits=StorageService.saveUnits.bind(StorageService);const originalBeds=StorageService.saveBeds.bind(StorageService);const originalPatients=StorageService.savePatients.bind(StorageService);const restoreInProgress=()=>localStorage.getItem('cardiovault_cloud_restore_in_progress')==='1';StorageService.saveUnits=units=>{originalUnits(units);if(!suppressSync&&!restoreInProgress())void saveCurrentUserToCloud();};StorageService.saveBeds=beds=>{originalBeds(beds);if(!suppressSync&&!restoreInProgress())void saveCurrentUserToCloud();};StorageService.savePatients=patients=>{originalPatients(patients);if(!suppressSync&&!restoreInProgress())void saveCurrentUserToCloud();};}
export function clearActiveClinicalWorkspace(){clearLocalClinicalData();localStorage.removeItem('cardiovault_active_workspace_access_v1');}
