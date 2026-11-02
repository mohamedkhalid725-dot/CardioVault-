import React,{createContext,useContext,useEffect,useRef,useState}from'react';
import {Bed,BedStatus,Patient,PatientSectionId,Unit,AuditEvent,UserProfile,Hospital}from'../types/clinical';
import {StorageService}from'../services/storage';
import {AuthorizationService, PRESET_USERS, ACCESS_DENIED_MESSAGE}from'../services/authorizationService';
import {DepartmentService}from'../services/departmentService';
import {AuditTrailService}from'../services/auditTrailService';
import {FirebaseAuthentication}from'@capacitor-firebase/authentication';
import {webCurrentUser,webGoogleSignIn,checkWebRedirectResult,webEmailSignIn,webEmailCreate,webSignOut} from'../services/webFirebase';
import {Capacitor}from'@capacitor/core';
import {clearActiveClinicalWorkspace,ensureUnitBedsNow,installCloudSyncBridge,loadCurrentUserFromCloud,syncCurrentUserNow}from'../services/cloudSyncBridge';
import {clearUnitBedsPending,desiredBeds,markUnitBedsPending,normalizeBedCount,UnitBedsIncompleteError,type UnitSetupResult}from'../services/unitBeds';
import {isMasterAccount,ensureOwnerWorkspace,validateCurrentWorkspaceAccess,setStoredWorkspaceAccess,registerCreatedUnit,setUnitCapacityLocked,getActiveWorkspaceId,getStoredWorkspaceAccess,getCurrentUid,updateOwnDisplayName as saveOwnDisplayName } from '../services/workspaceAccess';
import {listIndexedWorkspaces,registerWorkspaceInIndex,readWorkspaceName,type IndexedWorkspace } from '../services/workspaceIndex';
import {notifyClinicalData} from'../services/clinicalNotifications';
import {formatLocalAdmissionDate,formatLocalAdmissionTime,toLocalIsoTimestamp,resolveAdmissionRetry}from'../services/patientAdmission';
import {resetForNewAdmission,AdmissionHistoryTooLargeError,normalizeDischargeReason,prepareDischargedPatient}from'../services/admissionEpisode';
import {isLocalPreview,PREVIEW_USER,PREVIEW_WORKSPACE_ID}from'../config/localPreview';
import {loadPreviewCreatedUnits,savePreviewCreatedUnits,seedPreviewData}from'../config/previewSeed';
import {linkOrCreateForIntake,persistTimelineEvent,loadMasterFiles,saveMasterFiles}from'../services/masterPatientFile';
import type { MasterTimelineEvent } from '../types/clinicArea';
import {appendPatientMasterEvent,ensureMasterFileUnitContext,ensurePatientMasterFile,masterFileIdForPatient} from '../services/masterPatientFileCloud';
import {firestoreMasterPatientFilePersistence} from '../services/firestoreMasterPatientFilePersistence';
import {listUnitLicenses} from '../services/unitLicenseCloud';
import {filterCachedClinicalByLicensedUnits,licensedUnitIds} from '../services/unitLicense';
import {canTransferBetweenUnits,isAvailableLifecycleBed} from '../services/patientLifecycleAccess';
import {autoActivateOwnerCreatedUnit,submitUnitActivationRequest} from '../services/unitActivationRequests';
import {assignUnitHospitalDocument,createHospitalDocument,loadHospitalsForUnits,newHospitalId,type HospitalDocument}from'../services/hospitalPersistence';
import {firestoreHospitalPersistence}from'../services/firestoreHospitalPersistence';
import {firestoreUnitVerificationIO}from'../services/firestoreUnitPersistence';
import {UnitCloudVerificationError,verifyUnitSetupInCloud}from'../services/unitPersistence';
import {withOperationTimeout}from'../services/operationTimeout';

export type AppView='login'|'home'|'census'|'patient'|'patients'|'add-patient'|'archive'|'calculators'|'settings'|'handover'|'my-worklist'|'team'|'protocols'|'statistics'|'audit-trail'|'results-center'|'institution-setup'|'waiting-list'|'clinic'|'payments'|'master-file'|'operation-waiting'|'owner-requests';
interface AuthState{isAuthenticated:boolean;userEmail:string;userName:string;pinCode:string;isLocked:boolean;}
interface ToastInfo{id:string;message:string;type:'success'|'info'|'warning'|'error';}
interface PendingDepartmentLifecycleWrite {
 id:string;workspaceId:string;patient:{id:string;masterFileId?:string;fullName:string;age:number;unitId:string;unitIds?:string[]};unitId:string;title:string;summary:string;detail:string;atMs:number;
}

const PENDING_LIFECYCLE_WRITES_KEY='cardiovault_pending_master_lifecycle_v1';
function readPendingLifecycleWrites():PendingDepartmentLifecycleWrite[]{try{const parsed=JSON.parse(localStorage.getItem(PENDING_LIFECYCLE_WRITES_KEY)||'[]');return Array.isArray(parsed)?parsed.filter(item=>item?.id&&item?.workspaceId&&item?.patient?.id):[];}catch{return[];}}
function savePendingLifecycleWrite(write:PendingDepartmentLifecycleWrite):void{const writes=readPendingLifecycleWrites();localStorage.setItem(PENDING_LIFECYCLE_WRITES_KEY,JSON.stringify([...writes.filter(item=>item.id!==write.id),write]));}
function removePendingLifecycleWrite(id:string):void{localStorage.setItem(PENDING_LIFECYCLE_WRITES_KEY,JSON.stringify(readPendingLifecycleWrites().filter(item=>item.id!==id)));}
interface PatientAuditContext { uid?: string; displayName?: string; action?: string; }
/**
 * Extra shape a caller may hand to `addUnit`. The setup wizard needs the unit id
 * it already put in the subscription request (so an owner-issued code and the
 * real unit agree) and the unit-type capabilities; a manual "add unit" from the
 * dashboard passes none of this.
 */
export interface AddUnitOptions {
  /** Stable id. Supplying it makes the call idempotent: a retry returns the existing unit. */
  id?: string;
  unitTypeId?: Unit['unitTypeId'];
  config?: Unit['config'];
  hospitalId?: string;
}
export interface AppContextType{
  theme:'dark'|'light';
  setTheme:(theme:'dark'|'light')=>void;
  toggleTheme:()=>void;
  auth:AuthState;
  loginWithGoogle:()=>Promise<void>;
  loginWithEmail:(email:string,user?:any)=>Promise<void>;
  unlockWithPin:(pin:string)=>boolean;
  lockApp:()=>void;
  logout:()=>void;
  currentUser:UserProfile;
  setCurrentUser:(user:UserProfile)=>void;
  /** Saves the signed-in physician's display name locally and on the cloud team profile. */
  updateOwnDisplayName:(name:string)=>Promise<void>;
  currentView:AppView;
  setCurrentView:(view:AppView)=>void;
  currentUnitId:string|null;
  setCurrentUnitId:(id:string|null)=>void;
  currentPatientId:string|null;
  setCurrentPatientId:(id:string|null)=>void;
  currentPatient:Patient|undefined;
  activePatientSection:PatientSectionId;
  setActivePatientSection:(id:PatientSectionId)=>void;
  units:Unit[];
  beds:Bed[];
  patients:Patient[];
  archivedPatients:Patient[];
  getPatientById:(id:string)=>Patient|undefined;
  getBedsByUnit:(id:string)=>Bed[];
  getUnitById:(id:string)=>Unit|undefined;
  addPatient:(data:Partial<Patient>,targetBedId?:string)=>Patient;
  updatePatient:(id:string,updates:Partial<Patient>,auditContext?:PatientAuditContext)=>void;
   dischargePatient:(id:string,reason:string,summary:string)=>Promise<boolean>;
   transferPatient:(id:string,unitId:string,bedId:string)=>Promise<boolean>;
   readmitPatient:(id:string,unitId:string,bedId:string)=>Promise<boolean>;
  deletePatientPermanently:(id:string)=>void;
  addUnit:(name:string,type:string,initialBedsCount?:number,options?:AddUnitOptions)=>Unit;
  addPreviewUnits:(units:Unit[])=>number;
  // Uploads a freshly created unit with its beds and then closes its capacity
  // window. It must run after addUnit and before the unit is resized.
  finalizeUnitCreation:(unitId:string)=>Promise<void>;
  // Same work without creating anything: repairs a unit whose bed upload did
  // not finish. Safe to repeat; it never touches a bed that already exists.
  completeUnitSetup:(unitId:string,onStage?:(stage:string)=>void)=>Promise<UnitSetupResult>;
  updateUnit:(id:string,name:string,type:string,extra?:Partial<Unit>)=>void;
  lockUnitCapacity:(id:string)=>void;
  deleteUnit:(id:string)=>boolean;
  // Hospital grouping (owner manages hospitals; units reference them via hospitalId).
  hospitals:Hospital[];
  addHospital:(name:string,id?:string)=>Promise<HospitalDocument|Hospital|undefined>;
  assignUnitToHospital:(unitId:string,hospitalId:string|null)=>Promise<boolean>;
  // Pure write-ability check for a single unit (subscription read-only gate,
  // no toast): mirrors `canWriteTouchedUnits` for one unit.
  canWriteUnit:(unitId:string)=>boolean;
  // Groups units by hospital (null = Unassigned). Caller passes units already
  // filtered to the account's authorized units so members never see hospitals
  // they have no units in.
  groupUnitsByHospital:(inputUnits:Unit[])=>{hospital:Hospital|null;units:Unit[]}[];
  addBed:(unitId:string,bedNumber?:string)=>Bed;
  removeBed:(id:string)=>boolean;
  isSearchOpen:boolean;
  setIsSearchOpen:(open:boolean)=>void;
  isSyncing:boolean;
  lastSyncTime:string;
  syncNow:()=>Promise<void>;
  toasts:ToastInfo[];
  showToast:(message:string,type?:ToastInfo['type'])=>void;
  dismissToast:(id:string)=>void;
  resetDatabase:()=>void;
  privacySafeMonitor:boolean;
  setPrivacySafeMonitor:(v:boolean)=>void;
  favoritePatientIds:string[];
  toggleFavoritePatient:(id:string)=>void;
  // Team picker (one account, several teams)
  myWorkspaces:IndexedWorkspace[];
  isTeamPickerOpen:boolean;
  isSwitchingTeam:boolean;
  openTeamPicker:()=>void;
  closeTeamPicker:()=>void;
  refreshWorkspaceIndex:()=>Promise<IndexedWorkspace[]>;
  switchWorkspace:(workspaceId:string)=>Promise<void>;
}
export const AppContext=createContext<AppContextType|undefined>(undefined);

// Native Firebase can take a short moment to restore the persisted session after the
// Android activity/WebView starts. Do not treat that short window as a real sign-out.
async function waitForNativeFirebaseUser():Promise<any|null>{
  for(let attempt=0;attempt<20;attempt+=1){
    try{const current=await FirebaseAuthentication.getCurrentUser();if(current?.user?.uid)return current.user;}catch{}
    try{const pending=await FirebaseAuthentication.getPendingAuthResult();if(pending?.user?.uid)return pending.user;}catch{}
    await new Promise(resolve=>window.setTimeout(resolve,250));
  }
  return null;
}

// The Firestore rules require a new unit to carry the caller's own uid in
// createdBy/consultantUid. The signed-in Firebase profile uid is preferred, then
// the uid persisted at sign-in; a preset or offline profile id is never accepted
// in its place, because a wrong uid would mis-claim the consultant slot.
// Returning '' makes the cloud write fail loudly instead.
function currentFirebaseUid(profileUid?:string):string{
  const looksLikeFirebaseUid=(value?:string)=>!!value&&/^[A-Za-z0-9]{16,}$/.test(value);
  if(looksLikeFirebaseUid(profileUid))return String(profileUid);
  try{const stored=localStorage.getItem('cardiovault_google_uid')||'';if(looksLikeFirebaseUid(stored))return stored;}catch{}
  return '';
}

// Ownership is the /platformOwners document. The local clinical profile must agree
// with it, otherwise the unit/patient scope filters treat the owner as a unit-less
// 'pending' account and his dashboard loads empty.
const resolveProfileFor=async(user:any)=>{
  const profile=(await isMasterAccount())
    ? AuthorizationService.applyPlatformOwner(user)
    : AuthorizationService.resolveUserForFirebaseAuth(user);
  // The name saved by the physician is the session name everywhere (header, audit
  // trail, team roster). The Google account name is only a fallback for a new profile.
  if(profile?.name)StorageService.saveProfileName(profile.name);
  return profile;
};

export const AppProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const[theme,setThemeState]=useState<'dark'|'light'>('dark');
  const authNullGraceUntil=useRef(0);
  const[auth,setAuth]=useState<AuthState>({isAuthenticated:false,userEmail:'',userName:'',pinCode:'',isLocked:false});
  const authStateRef=useRef(auth);
  authStateRef.current=auth;
 const[currentUser,setCurrentUserState]=useState<UserProfile>(()=>AuthorizationService.getCurrentUser());
 const[currentView,setCurrentView]=useState<AppView>('login');
 const[currentUnitId,setCurrentUnitId]=useState<string|null>(null);
 const[currentPatientId,setCurrentPatientId]=useState<string|null>(null);
 const[activePatientSection,setActivePatientSection]=useState<PatientSectionId>('overview');
 const[units,setUnits]=useState<Unit[]>([]);const[beds,setBeds]=useState<Bed[]>([]);const[patients,setPatients]=useState<Patient[]>([]);
 const[isSearchOpen,setIsSearchOpen]=useState(false);const[isSyncing,setIsSyncing]=useState(false);const[lastSyncTime,setLastSyncTime]=useState('');const[toasts,setToasts]=useState<ToastInfo[]>([]);
 const[privacySafeMonitor,setPrivacySafeMonitor]=useState<boolean>(false);
 // Team picker (B3): the teams this account belongs to.
 const[myWorkspaces,setMyWorkspaces]=useState<IndexedWorkspace[]>([]);
 // Hospitals are read from the active workspace in Firestore; only the isolated
 // preview uses its local-only registry.
 const[hospitals,setHospitals]=useState<Hospital[]>([]);
 const[isTeamPickerOpen,setIsTeamPickerOpen]=useState(false);
 const[isSwitchingTeam,setIsSwitchingTeam]=useState(false);
  const teamPickerShown=useRef(false);
   const masterBackfillAttempted=useRef(new Set<string>());
   const unitSetupInFlight=useRef(new Set<string>());
   const unitSetupTimedOut=useRef(new Set<string>());
  const[favoritePatientIds,setFavoritePatientIds]=useState<string[]>(()=>{
   try { const raw = localStorage.getItem('cardiovault_fav_patients'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const hydrationRun=useRef(0);

 const toggleFavoritePatient=(id:string)=>{
   setFavoritePatientIds(prev=>{
     const next = prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id];
     try { localStorage.setItem('cardiovault_fav_patients', JSON.stringify(next)); } catch {}
     return next;
   });
 };
 // ─── Team picker (B3) ─────────────────────────────────────────────────────
 // The index only says which teams exist for this account. Opening a team still
 // goes through its membership document, so the picker can never reach a team
 // the doctor does not belong to.
  const refreshWorkspaceIndex=async():Promise<IndexedWorkspace[]>=>{
  if(isLocalPreview()){
   const localList:IndexedWorkspace[]=[{workspaceId:PREVIEW_WORKSPACE_ID,name:'Local Preview',unitNames:units.map(unit=>unit.name)}];
   setMyWorkspaces(localList);
   return localList;
  }
  const accountUid=await getCurrentUid();
  if(!accountUid){setMyWorkspaces([]);return[];}
  const entries=await listIndexedWorkspaces(accountUid);
  const activeId=getActiveWorkspaceId();
  let list=entries;
  if(activeId&&!entries.some(entry=>entry.workspaceId===activeId)){
   // The team in use must always be listed, even when it was joined before the
   // index existed. If the rules refuse the write, this account is not really a
   // member of that team, so it must not be listed either.
   const access=getStoredWorkspaceAccess();
   const name=await readWorkspaceName(activeId);
   const unitNames=access?.unitNames?Object.values(access.unitNames).map(String):[];
   const registered=await registerWorkspaceInIndex(accountUid,{workspaceId:activeId,name:name||activeId,unitNames});
   if(registered)list=[...entries,{workspaceId:activeId,name:name||activeId,unitNames}];
  }
   setMyWorkspaces(list);
   return list;
  };
  const refreshHospitals=async():Promise<Hospital[]>=>{
   if(isLocalPreview()){
    try{const raw=localStorage.getItem('cardiovault_hospitals_v1');const saved:Hospital[]=raw?JSON.parse(raw):[];const safe=Array.isArray(saved)?saved:[];setHospitals(safe);return safe;}catch{setHospitals([]);return[];}
   }
   const ownerAccount=await isMasterAccount();
   // The persisted access object can belong to a previously selected workspace.
   // Resolve the owner's canonical workspace on every refresh instead of using it.
   let access=ownerAccount?await ensureOwnerWorkspace():getStoredWorkspaceAccess();
   if(!access){setHospitals([]);return[];}
   const owner=ownerAccount&&access.role==='owner';
   const allowedIds=new Set((access.unitIds?.length?access.unitIds:access.unitId?[access.unitId]:[]).map(String));
   const scoped=StorageService.getUnits().filter(unit=>owner||allowedIds.has(String(unit.id)));
   const authorized=owner?scoped:AuthorizationService.filterAuthorizedUnits(scoped,currentUser);
   try{
    const loaded=await loadHospitalsForUnits(firestoreHospitalPersistence,access.workspaceId,authorized,owner);
    setHospitals(loaded);
    return loaded;
   }catch(error){console.warn('Hospital metadata could not be loaded from Firestore:',error);setHospitals([]);return[];}
  };
  const openTeamPicker=()=>{if(isLocalPreview()){showToast('Workspace switching is disabled in the isolated local preview.','info');return;}teamPickerShown.current=true;setIsTeamPickerOpen(true);};
 const closeTeamPicker=()=>{setIsTeamPickerOpen(false);};
 const switchWorkspace=async(workspaceId:string)=>{
  if(isLocalPreview()){showToast('Workspace switching is disabled in the isolated local preview.','info');return;}
  if(!workspaceId||isSwitchingTeam)return;
  setIsSwitchingTeam(true);
  try{
    // The other team's clinical data must never stay on the screen.
    clearActiveClinicalWorkspace();
    setHospitals([]);
    setStoredWorkspaceAccess({workspaceId,role:'clinical_editor',unitId:null,unitName:null});
    const cloud=await loadCurrentUserFromCloud();
    if(cloud?.access)setStoredWorkspaceAccess(cloud.access);
    hydrateClinicalState();
    await refreshHospitals();
   await refreshWorkspaceIndex();
   setIsTeamPickerOpen(false);
   setCurrentView('home');
   showToast('Team switched.','success');
  }catch(error){console.warn('Team switch failed:',error);showToast('Could not switch team. Please try again.','error');}
  finally{setIsSwitchingTeam(false);}
 };
 useEffect(()=>{
  if(!auth.isAuthenticated||auth.isLocked)return;
  let active=true;
  void (async()=>{
   const list=await refreshWorkspaceIndex();
   if(!active)return;
   if(list.length>1&&!teamPickerShown.current){teamPickerShown.current=true;setIsTeamPickerOpen(true);}
  })();
  return()=>{active=false;};
 },[auth.isAuthenticated,auth.isLocked]);

 const setCurrentUser=(user:UserProfile)=>{
   setCurrentUserState(user);
   AuthorizationService.setCurrentUser(user);
   // Check if currentUnitId is still permitted
   if (currentUnitId && !AuthorizationService.canPerformAction(user, 'view_unit', { unitId: currentUnitId })) {
     const allowedUnits = AuthorizationService.filterAuthorizedUnits(units, user);
     setCurrentUnitId(allowedUnits[0]?.id || null);
   }
   showToast(`Switched active user to ${user.name} (${user.role.toUpperCase()})`, 'info');
 };

  // Saves the physician's display name on the cloud team profile and in the live
  // session, so the header, roster and audit trail agree immediately. A failure is
  // thrown to the caller: the UI must never report a save that did not happen.
  const updateOwnDisplayName=async(name:string)=>{
   const savedName=await saveOwnDisplayName(name);
   setCurrentUserState(prev=>prev?.userId?{...prev,name:savedName,updatedAt:new Date().toISOString()}:prev);
   StorageService.saveAuth({...StorageService.getAuth(),userName:savedName});
   setAuth(prev=>({...prev,userName:savedName}));
  };

  const hydrateClinicalState=async()=>{
   const run=++hydrationRun.current;
   const cachedUnits=StorageService.getUnits();
   const cachedPatients=StorageService.getPatients();
   const cachedBeds=StorageService.getBeds();
   let visibleUnitIds=new Set(cachedUnits.map(unit=>String(unit.id)));
   let clinicallyActiveUnitIds=new Set(cachedUnits.map(unit=>String(unit.id)));
   if(!isLocalPreview()&&authStateRef.current.isAuthenticated){
    try{
     if(!(await isMasterAccount())){
      const access=getStoredWorkspaceAccess();
      const memberIds=access?.unitIds?.length?access.unitIds.map(String):(access?.unitId?[String(access.unitId)]:[]);
      const licenses=await listUnitLicenses(getActiveWorkspaceId(),memberIds);
      clinicallyActiveUnitIds=licensedUnitIds(memberIds,licenses,Date.now());
       const ownUid=currentFirebaseUid();
      const ownPendingIds=cachedUnits.filter(unit=>unit.activationStatus==='pending'&&String(unit.createdBy||'')===ownUid).map(unit=>String(unit.id));
      visibleUnitIds=new Set([...clinicallyActiveUnitIds,...ownPendingIds]);
     }
    }catch(error){
      console.warn('Could not verify unit licenses; hiding cached unit data until verification succeeds:',error);
      visibleUnitIds=new Set();
      clinicallyActiveUnitIds=new Set();
    }
   }
   if(run!==hydrationRun.current)return;
   const filtered=filterCachedClinicalByLicensedUnits(cachedUnits,cachedPatients,cachedBeds,visibleUnitIds);
   const visibleUnits=filtered.units;
   const visiblePatients=filterCachedClinicalByLicensedUnits(cachedUnits,cachedPatients,cachedBeds,clinicallyActiveUnitIds).patients;
   const visibleBeds=filtered.beds;
   const reconciled=DepartmentService.reconcileBedsWithPatients(visibleBeds,visiblePatients);
   const repaired=reconciled.map(bed=>{if(bed.patientId)return bed;const owner=visiblePatients.find(patient=>!patient.isArchived&&patient.bedId===bed.id);return owner?{...bed,patientId:owner.id,status:owner.status}:bed;});
   setUnits(visibleUnits);setBeds(repaired);setPatients(visiblePatients);
   setCurrentUnitId(prev=>prev&&visibleUnits.some(x=>x.id===prev)?prev:(visibleUnits[0]?.id||null));
   setCurrentPatientId(prev=>prev&&visiblePatients.some(x=>x.id===prev&&!x.isArchived)?prev:(visiblePatients.find(x=>!x.isArchived)?.id||null));
   void refreshHospitals();
  };
  useEffect(()=>{const onRestore=()=>void hydrateClinicalState();window.addEventListener('cardiovault-data-restored',onRestore);window.addEventListener('cardiovault-workspace-access-granted',onRestore);return()=>{window.removeEventListener('cardiovault-data-restored',onRestore);window.removeEventListener('cardiovault-workspace-access-granted',onRestore);};},[]);
  useEffect(()=>{if(!auth.isAuthenticated||isLocalPreview())return;void hydrateClinicalState();const timer=window.setInterval(()=>void hydrateClinicalState(),60000);return()=>window.clearInterval(timer);},[auth.isAuthenticated,getActiveWorkspaceId()]);
 // The cloud team profile is the authority for the display name: when the owner
 // workspace is opened it can restore a name that this device did not have yet.
 useEffect(()=>{const onName=(event:Event)=>{const name=String((event as CustomEvent<{name?:string}>).detail?.name||'').trim();if(!name)return;StorageService.saveAuth({...StorageService.getAuth(),userName:name});setAuth(prev=>({...prev,userName:name}));setCurrentUserState(prev=>prev?.userId?{...prev,name}:prev);};window.addEventListener('cardiovault-profile-name-updated',onName);return()=>window.removeEventListener('cardiovault-profile-name-updated',onName);},[]);
 useEffect(()=>{if(isLocalPreview()||!Capacitor.isNativePlatform())return;let handle:{remove:()=>Promise<void>}|null=null;const attach=async()=>{try{handle=await FirebaseAuthentication.addListener('authStateChange',async({user}:any)=>{if(!user?.uid){if(Date.now()<authNullGraceUntil.current)return;const saved=StorageService.getAuth();if(!saved.isAuthenticated)return;let recovered:any=null;try{recovered=await waitForNativeFirebaseUser();}catch{}if(recovered?.uid){authNullGraceUntil.current=0;const profile=await resolveProfileFor(recovered);setCurrentUserState(profile);const session={...saved,isAuthenticated:true,isLocked:false,userEmail:recovered.email||saved.userEmail,userName:StorageService.getProfileName()||saved.userName||recovered.displayName||recovered.email?.split('@')[0],pinCode:''};StorageService.saveAuth(session);setAuth(session);return;}const signedOut={...saved,isAuthenticated:false,isLocked:false,pinCode:''};clearActiveClinicalWorkspace();StorageService.saveAuth(signedOut);setAuth(signedOut);setCurrentView('login');return;}authNullGraceUntil.current=0;const profile=await resolveProfileFor(user);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...StorageService.getAuth(),isAuthenticated:true,isLocked:false,userEmail:user.email||'',userName:StorageService.getProfileName()||user.displayName||user.email?.split('@')[0]||'Physician',pinCode:''};StorageService.saveAuth(session);setAuth(session);setCurrentView('home');localStorage.setItem('cardiovault_google_uid',user.uid);void (async()=>{try{if(await isMasterAccount()){await ensureOwnerWorkspace();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const cloud=await loadCurrentUserFromCloud();if(cloud?.found||cloud?.access)hydrateClinicalState();if(cloud?.access)window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));}catch(error){console.warn('Native auth state cloud restore failed:',error);}})();});}catch(error){console.warn('Native Firebase auth listener failed:',error);}};void attach();return()=>{if(handle)void handle.remove();};},[]);
 useEffect(()=>{let active=true;installCloudSyncBridge();const boot=async()=>{if(isLocalPreview()){const saved=StorageService.getAuth();seedPreviewData();const demo={...saved,isAuthenticated:true,isLocked:false,userEmail:PREVIEW_USER.email,userName:PREVIEW_USER.name,pinCode:''};StorageService.saveAuth(demo);setAuth(demo);setCurrentUserState({userId:PREVIEW_USER.uid,name:PREVIEW_USER.name,email:PREVIEW_USER.email,role:'department_admin',clinicRole:'doctor',departmentId:'dept-cardiology',assignedUnitIds:['unit-preview-cardiology','unit-preview-ccu'],status:'active',updatedAt:new Date().toISOString()});localStorage.setItem('cardiovault_google_uid',PREVIEW_USER.uid);setStoredWorkspaceAccess({workspaceId:PREVIEW_WORKSPACE_ID,role:'owner',unitId:null,unitName:null});hydrateClinicalState();setCurrentView('home');window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const savedAuth=StorageService.getAuth();setThemeState(StorageService.getTheme());if(!Capacitor.isNativePlatform()){const redirectedUser=await checkWebRedirectResult();const webUser=redirectedUser||webCurrentUser();if(webUser){const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:webUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||webUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);localStorage.setItem('cardiovault_google_uid',webUser.uid);setCurrentUserState(await resolveProfileFor(webUser));hydrateClinicalState();setCurrentView('home');void loadCurrentUserFromCloud().then(cloud=>{if(active&&(cloud?.found||cloud?.access))hydrateClinicalState();});}else{setAuth({...savedAuth,isAuthenticated:false,isLocked:false});setCurrentView('login');}return;}const firebaseUser=await waitForNativeFirebaseUser();if(!firebaseUser?.uid){clearActiveClinicalWorkspace();const signedOut={...savedAuth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(signedOut);StorageService.saveAuth(signedOut);setCurrentView('login');return;}const profile=await resolveProfileFor(firebaseUser);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:firebaseUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||firebaseUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);hydrateClinicalState();setCurrentView('home');try{const cloud=await loadCurrentUserFromCloud();if(!active)return;if(cloud?.found)hydrateClinicalState();setLastSyncTime(cloud?.found?new Date().toLocaleTimeString():'');}catch(error){console.warn('Cloud session restore failed:',error);}};void boot();return()=>{active=false;};},[]);
 useEffect(()=>{if(isLocalPreview()||!auth.isAuthenticated)return;let active=true;const check=async()=>{try{if(await isMasterAccount())return;const valid=await validateCurrentWorkspaceAccess();if(valid===false&&active){logout();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-revoked'));showToast('Your Unit Access Code has been changed or revoked. Please sign in again with the new code.','warning');}}catch(error){console.warn('Workspace access monitor failed:',error);}};const initial=window.setTimeout(()=>void check(),3000);const timer=window.setInterval(()=>void check(),15000);return()=>{active=false;window.clearTimeout(initial);window.clearInterval(timer);};},[auth.isAuthenticated]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.classList.toggle('light',theme==='light');},[theme]);

 const showToast=(message:string,type:ToastInfo['type']='info')=>{const id=`toast-${Date.now()}-${Math.random()}`;setToasts(p=>[...p,{id,message,type}]);window.setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);};
 const dismissToast=(id:string)=>setToasts(p=>p.filter(t=>t.id!==id));
  // Licensing is enforced per unit by Firestore rules; there is no client-side
  // workspace-wide subscription lock or logout on expiry.
  const guardWrite=():boolean=>false;
 const setTheme=(t:'dark'|'light')=>{setThemeState(t);StorageService.saveTheme(t);};const toggleTheme=()=>setTheme(theme==='dark'?'light':'dark');
 const loginWithGoogle=async()=>{if(isLocalPreview()){showToast('Sign-in is disabled in the local preview.','info');return;}
   authNullGraceUntil.current=Date.now()+30000;
   try{
     let user:any=null;
     if(Capacitor.isNativePlatform()){
       // Native Google Sign-In can resolve the account picker before the Firebase
       // session has propagated back to the Capacitor bridge. Accept either the
       // direct result or the restored/pending Firebase user.
       const nativeSignIn=FirebaseAuthentication.signInWithGoogle({useCredentialManager:false});
       const restoredUser=new Promise<any|null>(resolve=>{
         const started=Date.now();
         const poll=async()=>{
           try{const pending=await FirebaseAuthentication.getPendingAuthResult();if(pending?.user?.uid){resolve(pending.user);return;}}catch{}
           try{const current=await FirebaseAuthentication.getCurrentUser();if(current?.user?.uid){resolve(current.user);return;}}catch{}
           if(Date.now()-started>=15000){resolve(null);return;}
           window.setTimeout(()=>void poll(),300);
         };
         void poll();
       });
       const result:any=await Promise.race([nativeSignIn,restoredUser.then(u=>u?{user:u}:null)]);
       user=result?.user||result||null;
       if(!user?.uid){
         // One final bridge read after the native sign-in promise settles.
         try{const current=await FirebaseAuthentication.getCurrentUser();user=current?.user||null;}catch{}
       }
     }else{
       const result:any=await webGoogleSignIn();
       user=result;
     }
     if(!user?.uid)throw new Error('Google sign-in completed without a Firebase user.');
     const profile=await resolveProfileFor(user);setCurrentUserState(profile);const a={...auth,isAuthenticated:true,isLocked:false,pinCode:'',userEmail:user.email||auth.userEmail,userName:StorageService.getProfileName()||auth.userName||user.displayName};
     setAuth(a);
     StorageService.saveAuth(a);
     localStorage.setItem('cardiovault_google_uid',user.uid);
     setCurrentView('home');
     // Never block the post-login route on Firestore/cloud restoration.
     void (async()=>{
       try{
         const cloud=await Promise.race([loadCurrentUserFromCloud(),new Promise<'timeout'>(resolve=>window.setTimeout(()=>resolve('timeout'),8000))]);
         if(cloud==='timeout'){showToast('Signed in. Cloud restore is still pending.','info');return;}
         if(cloud?.found){hydrateClinicalState();setLastSyncTime(new Date().toLocaleTimeString());showToast('Signed in and cloud data restored.','success');}
         else if(cloud?.access){window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));showToast('Signed in. Cloud workspace is ready.','success');}
         else{showToast('Signed in. Cloud workspace needs attention.','warning');}
       }catch(error){console.warn('Post-login cloud restore failed:',error);showToast('Signed in. Cloud sync will retry automatically.','warning');}
     })();
   }catch(error:any){
     console.error('Native Google/Firebase sign-in failed:',error);
     showToast(`Google Sign-In failed: ${String(error?.message||error?.code||'Google sign-in failed').slice(0,240)}`,'error');
   }
 };
 const loginWithEmail=async(email:string,user?:any)=>{if(isLocalPreview()){showToast('Sign-in is disabled in the local preview.','info');return;}const clean=email.trim().toLowerCase();if(!clean)return;const firebaseUser=user|| (Capacitor.isNativePlatform() ? (await FirebaseAuthentication.getCurrentUser()).user : webCurrentUser());if(!firebaseUser?.uid)throw new Error('Email authentication completed without a Firebase user.');setStoredWorkspaceAccess(null);const profile=await resolveProfileFor(firebaseUser);setCurrentUserState(profile);const a={...auth,isAuthenticated:true,isLocked:false,pinCode:'',userEmail:firebaseUser.email||clean,userName:StorageService.getProfileName()||auth.userName||firebaseUser.displayName||clean.split('@')[0]};setAuth(a);StorageService.saveAuth(a);localStorage.setItem('cardiovault_google_uid',firebaseUser.uid);setCurrentView('home');void (async()=>{try{if(await isMasterAccount()){await ensureOwnerWorkspace();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const cloud=await Promise.race([loadCurrentUserFromCloud(),new Promise<'timeout'>(resolve=>window.setTimeout(()=>resolve('timeout'),8000))]);if(cloud==='timeout'){showToast('Signed in. Cloud restore is still pending.','info');return;}if(cloud?.found){hydrateClinicalState();setLastSyncTime(new Date().toLocaleTimeString());showToast('Signed in and cloud data restored.','success');}else if(cloud?.access){hydrateClinicalState();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));showToast('Signed in and workspace access restored.','success');}else{showToast('Signed in. Cloud workspace needs attention.','warning');}}catch(error){console.warn('Post-email-login cloud restore failed:',error);showToast('Signed in. Cloud sync will retry automatically.','warning');}})();};
 const unlockWithPin=(_pin:string)=>{showToast('PIN / Offline access has been disabled. Sign in with your Firebase account.','warning');return false;};const lockApp=()=>{showToast('Offline lock screen is disabled. Use Sign Out to end the session.','info');};
 const logout=()=>{if(isLocalPreview()){showToast('Sign-out is disabled in the isolated local preview. Reload the page to restart the demo.','info');return;}authNullGraceUntil.current=0;void (Capacitor.isNativePlatform()?FirebaseAuthentication.signOut():webSignOut()).catch(error=>console.warn('Firebase sign-out failed:',error));localStorage.removeItem('cardiovault_google_uid');clearActiveClinicalWorkspace();setUnits([]);setBeds([]);setPatients([]);setHospitals([]);setCurrentUnitId(null);setCurrentPatientId(null);const a={...auth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(a);StorageService.saveAuth(a);setCurrentView('login');};
 const getPatientById=(id:string)=>patients.find(p=>p.id===id);const getBedsByUnit=(id:string)=>beds.filter(b=>b.unitId===id);const getUnitById=(id:string)=>units.find(u=>u.id===id);const archivedPatients=patients.filter(p=>p.isArchived);
  const canWriteTouchedUnits=(_unitIds:string[])=>true;
  // Single-unit role check used by transfer/re-admit UIs. License enforcement is
  // authoritative in Firestore rules and is never inferred from a local cache.
  const canWriteUnit=(unitId:string)=>{
    if(!unitId||getStoredWorkspaceAccess()?.role==='view_only'||getUnitById(unitId)?.activationStatus==='pending')return false;
   return true;
 };
 const addHospital=async(name:string,id?:string):Promise<Hospital|undefined>=>{
  if(guardWrite())return undefined;
  const trimmed=String(name||'').trim();if(!trimmed)throw new Error('Enter a hospital name.');
  const stableId=String(id||newHospitalId()).trim();
  if(isLocalPreview()){
   const nowMs=Date.now();
   const previous=(()=>{try{const raw=localStorage.getItem('cardiovault_hospitals_v1');const value=raw?JSON.parse(raw):[];return Array.isArray(value)?value as Hospital[]:[];}catch{return[];}})();
   const existing=previous.find(item=>item.id===stableId);
   if(existing){if(existing.name!==trimmed)throw new Error('This hospital ID is already in use. Retry with the same name.');return existing;}
   const hospital:Hospital={id:stableId,name:trimmed,createdBy:currentUser.userId||PREVIEW_USER.uid,createdAtMs:nowMs,updatedAtMs:nowMs,unitIds:[],schemaVersion:1};
   const next=[...previous,hospital];localStorage.setItem('cardiovault_hospitals_v1',JSON.stringify(next));setHospitals(next);return hospital;
  }
  if(!(await isMasterAccount()))throw new Error('Only the workspace owner can create a hospital.');
  // Never create into a stale workspace left in local storage by a prior session.
  const access=await ensureOwnerWorkspace();
  if(!access||access.role!=='owner')throw new Error('The owner workspace is not ready. Reopen the workspace and retry.');
  const uid=await getCurrentUid();if(!uid)throw new Error('A Firebase account must be signed in.');
  const saved=await createHospitalDocument(firestoreHospitalPersistence,access.workspaceId,uid,trimmed,stableId);
  setHospitals(previous=>[...previous.filter(item=>item.id!==saved.id),saved]);
  return saved;
 };
 const assignUnitToHospital=async(unitId:string,hospitalId:string|null):Promise<boolean>=>{
  if(guardWrite())return false;
  if(isLocalPreview()){
   const stableId=String(unitId||'').trim();const targetId=String(hospitalId||'').trim()||null;
   const localUnits=StorageService.getUnits();const unit=localUnits.find(item=>item.id===stableId);
   if(!unit)throw new Error('This unit is not available on this device.');
   if(targetId&&!hospitals.some(item=>item.id===targetId))throw new Error('The selected hospital is not available in this workspace.');
   const nextHospitals=hospitals.map(item=>({...item,unitIds:Array.from(new Set([...(item.unitIds||[]).map(String).filter(id=>id!==stableId),...(item.id===targetId?[stableId]:[])]))}));
   const nextUnits=localUnits.map(item=>item.id===stableId?{...item,hospitalId:targetId}:item);
   localStorage.setItem('cardiovault_hospitals_v1',JSON.stringify(nextHospitals));StorageService.saveUnits(nextUnits);setUnits(nextUnits);setHospitals(nextHospitals);return true;
  }
  if(!(await isMasterAccount()))throw new Error('Only the workspace owner can assign units to hospitals.');
  const access=getStoredWorkspaceAccess();
  if(!access||access.role!=='owner')throw new Error('The owner workspace is not ready. Reopen the workspace and retry.');
  const savedUnit=await assignUnitHospitalDocument(firestoreHospitalPersistence,access.workspaceId,unitId,hospitalId);
  const localUnits=StorageService.getUnits();
  const nextUnits=localUnits.some(item=>item.id===savedUnit.id)
   ?localUnits.map(item=>item.id===savedUnit.id?{...item,hospitalId:savedUnit.hospitalId||undefined}:item)
   :[...localUnits,savedUnit];
  StorageService.saveUnits(nextUnits);setUnits(nextUnits);await refreshHospitals();return true;
 };
 // Groups use persisted hospital metadata only after the caller has filtered units by access.
 // Unknown or inaccessible hospital references stay Unassigned rather than guessing.
 const groupUnitsByHospital=(inputUnits:Unit[]):{hospital:Hospital|null;units:Unit[]}[]=>{
  const byHospital=new Map<string|null,Unit[]>();
  for(const unit of inputUnits){const known=hospitals.find(hospital=>hospital.id===unit.hospitalId);const key=known?known.id:null;const group=byHospital.get(key)||[];group.push(unit);byHospital.set(key,group);}
  const named=Array.from(byHospital.entries()).filter(([id])=>id!==null).sort((a,b)=>(hospitals.find(h=>h.id===a[0])?.name||'').localeCompare(hospitals.find(h=>h.id===b[0])?.name||''));
  const groups=named.map(([id,group])=>({hospital:hospitals.find(h=>h.id===id)||null,units:group}));
  const unassigned=byHospital.get(null);if(unassigned?.length)groups.push({hospital:null,units:unassigned});
  return groups;
 };
 const touchedUnitsForChanges=<T extends {id:string;unitId?:string},>(before:T[],after:T[]):string[]=>{const oldById=new Map(before.map(item=>[item.id,item]));const newById=new Map(after.map(item=>[item.id,item]));const ids:string[]=[];for(const id of new Set([...oldById.keys(),...newById.keys()])){const oldItem=oldById.get(id);const newItem=newById.get(id);if(oldItem!==newItem){if(oldItem?.unitId)ids.push(oldItem.unitId);if(newItem?.unitId)ids.push(newItem.unitId);}}return ids;};
 const changedEntityIds=<T extends {id:string},>(before:T[],after:T[]):string[]=>{const oldById=new Map(before.map(item=>[item.id,item]));const newById=new Map(after.map(item=>[item.id,item]));return [...new Set([...oldById.keys(),...newById.keys()])].filter(id=>oldById.get(id)!==newById.get(id));};
 const commitPatients=(next:Patient[])=>{if(guardWrite()||!canWriteTouchedUnits(touchedUnitsForChanges(patients,next)))return;setPatients(next);StorageService.savePatients(next);};const commitBeds=(next:Bed[])=>{if(guardWrite()||!canWriteTouchedUnits(touchedUnitsForChanges(beds,next)))return;setBeds(next);StorageService.saveBeds(next);};const commitClinicalState=(nextPatients:Patient[],nextBeds:Bed[])=>{const touched=[...touchedUnitsForChanges(patients,nextPatients),...touchedUnitsForChanges(beds,nextBeds)];if(guardWrite()||!canWriteTouchedUnits(touched))return;setPatients(nextPatients);StorageService.savePatients(nextPatients);setBeds(nextBeds);StorageService.saveBeds(nextBeds);};const commitUnits=(next:Unit[])=>{if(guardWrite()||!canWriteTouchedUnits(changedEntityIds(units,next)))return;setUnits(next);StorageService.saveUnits(next);};
 const clinicalLabel=(updates:Partial<Patient>)=>{const labels:Record<string,string>={clinicalSummary:'History / Clinical Summary',examination:'Physical Examination',vitalsHistory:'Vitals',fluidRecords:'Fluid Balance',hemodynamicHistory:'Hemodynamics',fluidIntakeHistory:'Fluid Intake',urineOutputHistory:'Urine Output',ecgRecords:'ECG',labs:'Laboratory Results',imaging:'Imaging',imagingStudies:'Imaging',medications:'Medications',procedures:'Procedures / Interventions',cardiology:'Cardiology Data',ventilator:'ICU / Ventilator Data',calculatorResults:'Calculator Result',progressNotes:'Progress Note'};const key=Object.keys(updates).find(k=>labels[k]);return key?labels[key]:'Patient Data';};
   const recordCloudDepartmentLifecycle=async(patient:Patient,unitId:string,title:string,summary:string,detail:string,atMs:number,workspaceIdOverride?:string):Promise<void>=>{
    const workspaceId=workspaceIdOverride||getActiveWorkspaceId();
   const uid=await getCurrentUid();
   if(!workspaceId||!uid)throw new Error('An authenticated workspace session is required.');
   const ownerUnitId=String(title.toLowerCase().includes('transfer')?(patient.unitIds?.[0]||unitId):(patient.unitId||unitId));
   const file=await ensurePatientMasterFile(firestoreMasterPatientFilePersistence,workspaceId,{
    patientId:patient.id,masterFileId:patient.masterFileId,name:patient.fullName||patient.name||patient.id,ageYears:Number(patient.age)||0,
    unitId:ownerUnitId,createdBy:uid,atMs,
   });
   const scoped=await ensureMasterFileUnitContext(firestoreMasterPatientFilePersistence,workspaceId,file.id,unitId,atMs);
   const kind:MasterTimelineEvent['kind']=title.toLowerCase().includes('readmit')?'patient-readmission':title.toLowerCase().includes('transfer')?'patient-transfer':title.toLowerCase().includes('discharg')?'patient-discharge':'patient-admission';
   const eventId=kind==='patient-admission'?`patient-admission-${encodeURIComponent(patient.id)}`:`${kind}-${atMs}-${encodeURIComponent(patient.id).slice(0,56)}`;
   const event:MasterTimelineEvent={id:eventId,kind,atMs,title,summary,detail,createdBy:uid,context:{unitId},refId:scoped.id,schemaVersion:1};
   await appendPatientMasterEvent(firestoreMasterPatientFilePersistence,workspaceId,scoped.id,event);
  };
   const flushPendingDepartmentLifecycleWrites=async(workspaceId:string):Promise<boolean>=>{
    let complete=true;
    for(const write of readPendingLifecycleWrites().filter(item=>item.workspaceId===workspaceId)){
     try{await recordCloudDepartmentLifecycle(write.patient as Patient,write.unitId,write.title,write.summary,write.detail,write.atMs,write.workspaceId);removePendingLifecycleWrite(write.id);}
     catch(error){complete=false;console.warn('Pending master patient file event retry failed:',error);}
    }
    return complete;
   };
   const recordDepartmentLifecycle=async(patient:Patient,unitId:string,title:string,summary:string,detail:string,atMs=Date.now()):Promise<boolean>=>{
    if(!isLocalPreview()){
     const workspaceId=getActiveWorkspaceId();
     try{
      if(!(await syncCurrentUserNow()))throw new Error('Patient and bed changes were not confirmed by cloud sync.');
      if(getActiveWorkspaceId()!==workspaceId)throw new Error('Workspace changed before the lifecycle event was confirmed.');
      await recordCloudDepartmentLifecycle(patient,unitId,title,summary,detail,atMs,workspaceId);
      return true;
     }catch(error){
      if(workspaceId)savePendingLifecycleWrite({id:`${workspaceId}/${atMs}/${patient.id}/${unitId}`,workspaceId,patient:{id:patient.id,masterFileId:patient.masterFileId,fullName:String(patient.fullName||patient.name||patient.id),age:Number(patient.age)||0,unitId:String(patient.unitId||unitId),unitIds:patient.unitIds},unitId,title,summary,detail,atMs});
      console.warn('Cloud master patient file lifecycle write failed:',error);
      showToast('The lifecycle action is not cloud-complete: patient, bed, or master-file event confirmation failed. Retry cloud sync before continuing.','error');
      return false;
     }
    }
   try{
    const clinical=patient.clinicalSummary;
    const history=[clinical?.chiefComplaint,clinical?.hpi,...(Array.isArray(clinical?.pmh)?clinical.pmh:[]),clinical?.drugHistory?`Medication history: ${clinical.drugHistory}`:''].map(value=>String(value||'').trim()).filter(Boolean).join('\n');
    const cardio=patient.cardiovascularHistory;
    const riskFactors=[cardio?.hypertension?'Hypertension':'',cardio?.diabetes?'Diabetes':'',cardio?.dyslipidemia?'Dyslipidemia':'',cardio?.smoking?'Smoking':''].filter(Boolean);
    const procedures=Array.isArray(patient.procedures)?patient.procedures.map((item:any)=>String(item?.name||item?.procedureName||item?.type||'').trim()).filter(Boolean):[];
    const priorOperations=[...(Array.isArray(clinical?.psh)?clinical.psh:[]),...procedures];
    const imaging=Array.isArray(patient.imaging)?patient.imaging.map((item:any)=>String(item?.studyName||item?.name||item?.type||'').trim()).filter(Boolean):[];
    const scope=[unitId,...(patient.unitIds||[])].filter(Boolean);
    const uid=String(currentUser?.userId||PREVIEW_USER.uid);
    let fileId=patient.masterFileId||'';
    if(fileId){
     const files=loadMasterFiles();
     let file=files.find(item=>item.id===fileId);
     if(file&&!file.contextIds.includes(unitId)){throw new Error('The selected master file is not available in this unit.');}
     if(!file){
      file={id:fileId,name:String(patient.fullName||patient.name||patient.id),ageYears:Math.max(0,Math.trunc(Number(patient.age)||0)),sourcePatientIds:[patient.id],riskFactors,history,pastOperations:priorOperations,pastImaging:imaging,contextIds:[unitId],timeline:[],createdAtMs:atMs,createdBy:uid,updatedAtMs:atMs,schemaVersion:1};
      if(!saveMasterFiles([...files,file]))throw new Error('The new master file could not be saved locally.');
     }
    }else{
     const linkage=linkOrCreateForIntake({identity:{name:patient.fullName||patient.name||patient.id,ageYears:Math.trunc(Number(patient.age)||0),sourcePatientId:patient.id,riskFactors,history,pastOperations:priorOperations,pastImaging:imaging},authorizedContextIds:scope,defaultContextId:unitId,createdBy:uid,nowMs:atMs});
     if('error'in linkage){showToast('The patient was saved, but the master file needs a doctor to resolve a duplicate match.','warning');return false;}
     fileId=linkage.file.id;
    }
    const kind:MasterTimelineEvent['kind']=title.toLowerCase().includes('readmit')?'patient-readmission':title.toLowerCase().includes('transfer')?'patient-transfer':title.toLowerCase().includes('discharg')?'patient-discharge':'patient-admission';
    const event=persistTimelineEvent(fileId,{kind,title,summary,detail,createdBy:uid,context:{unitId},atMs,refId:patient.id});
    if(!event.saved){showToast('The patient was saved, but the master-file timeline could not be persisted on this device.','warning');return false;}
    return true;
   }catch(error){console.warn('Local master patient file linkage failed:',error);showToast('The patient was saved, but the master-file timeline could not be updated.','warning');return false;}
  };
  useEffect(()=>{
   if(isLocalPreview()||!auth.isAuthenticated||!currentUser?.userId)return;
   let active=true;
   const backfill=async()=>{
    for(const patient of patients){
     const ownerUnitId=String(patient.unitId||'');
     const key=`${getActiveWorkspaceId()}/${patient.id}`;
     if(!ownerUnitId||masterBackfillAttempted.current.has(key)||!canWriteUnit(ownerUnitId))continue;
     masterBackfillAttempted.current.add(key);
     try{
      await ensurePatientMasterFile(firestoreMasterPatientFilePersistence,getActiveWorkspaceId(),{
       patientId:patient.id,masterFileId:patient.masterFileId,name:patient.fullName||patient.name||patient.id,ageYears:Number(patient.age)||0,
       unitId:ownerUnitId,createdBy:String(currentUser.userId),atMs:Date.now(),
      });
     }catch(error){
      masterBackfillAttempted.current.delete(key);
      if(active)console.warn('Archived/active patient master-file backfill failed:',error);
     }
    }
   };
   void backfill();
   return()=>{active=false;};
  },[auth.isAuthenticated,currentUser?.userId,patients]);
  const bedIsOccupied=(bed:Bed)=>{return !isAvailableLifecycleBed(bed,patients);};
 const addPatient=(data:Partial<Patient>,targetBedId?:string):Patient=>{const unitId=data.unitId||'';const bedId=targetBedId||data.bedId||'';const retried=resolveAdmissionRetry(patients,data.id,unitId,bedId,data.masterFileId);if(retried)return retried;if(!unitId||!bedId)throw new Error('Patient admission requires an explicit unit and bed.');const bed=beds.find(b=>b.id===bedId&&b.unitId===unitId);if(!bed)throw new Error('Selected bed does not belong to the selected unit.');if(!isAvailableLifecycleBed(bed,patients))throw new Error('Selected bed is already occupied or unavailable.');if(guardWrite()||!canWriteTouchedUnits([unitId]))throw new Error('This unit is read-only. Renew or ask the owner to activate it.');const stamp=new Date();const date=stamp.toISOString().split('T')[0];const time=stamp.toTimeString().slice(0,5);const id=data.id||`patient-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;const allergies=data.allergies||['NKDA'];const p:Patient={id,masterFileId:data.masterFileId||masterFileIdForPatient(id),mrn:data.mrn||`MRN-${Math.floor(100000+Math.random()*900000)}`,fullName:data.fullName||'New Patient',age:data.age??0,sex:data.sex||'Other',weight:data.weight??0,height:data.height??0,photoUrl:data.photoUrl,unitId,unitIds:(data.unitIds&&data.unitIds.length?Array.from(new Set([...data.unitIds,unitId])):[unitId]),bedId,status:data.status||'Stable',admissionDate:data.admissionDate||date,admissionTime:data.admissionTime||time,primaryDiagnosis:data.primaryDiagnosis||'Clinical Admission',secondaryDiagnoses:data.secondaryDiagnoses||[],allergies,codeStatus:data.codeStatus||'Full Code',isArchived:false,pastAdmissions:[],clinicalSummary:data.clinicalSummary||{chiefComplaint:'',hpi:'',pmh:[],psh:[],drugHistory:'',allergies,familyHistory:'',socialHistory:''},cardiovascularHistory:data.cardiovascularHistory||{hypertension:false,diabetes:false,dyslipidemia:false,cad:false,previousMI:false,heartFailure:false,arrhythmias:false,valvularDisease:false,previousPCI:false,previousCABG:false,previousStroke:false,pvd:false,smoking:false,alcohol:false,previousAdmissions:'',previousICU:'',other:''},vitalsHistory:data.vitalsHistory||[],fluidRecords:data.fluidRecords||[],hemodynamicHistory:data.hemodynamicHistory||[],fluidIntakeHistory:data.fluidIntakeHistory||[],urineOutputHistory:data.urineOutputHistory||[],examination:data.examination||{general:{appearance:'',consciousness:'',distress:'',hydration:'',pallor:false,cyanosis:false,jaundice:false,edema:''},cardiovascular:{jvp:'',heartSounds:'',murmurs:'',peripheralPulses:'',edema:'',perfusion:''},respiratory:{chestExam:'',airEntry:'',addedSounds:'',workOfBreathing:''},abdomen:{inspection:'',palpation:'',tenderness:'',organomegaly:'',ascites:''},neurological:{consciousness:'',gcs:'',pupils:'',motor:'',sensory:'',reflexes:''},extremities:{pulses:'',edema:'',temp:'',perfusion:''},customFields:[]},ecgRecords:data.ecgRecords||[],cardiology:data.cardiology||{rhythm:'',heartRate:0,bp:'',heartFailureStatus:'',nyha:'',killip:'',congestion:'',perfusion:'',echoBriefSummary:'',echo:{ef:0,lvDimensions:'',lvFunction:'',rvFunction:'',rwma:'',la:'',ra:'',mr:'',ar:'',as:'',ms:'',tr:'',pr:'',ivc:'',pericardium:'',otherFindings:''},biomarkers:{troponin:'',ckmb:'',bnp:'',ntProBnp:''},coronary:{cath:'',coronaryFindings:'',pci:'',stent:'',cabg:''},antithrombotic:{antiplatelet:'',anticoagulation:'',thrombolysis:''},cathRecords:[],biomarkerRecords:[],devicesList:[],hemodynamicsList:[]},medications:data.medications||[],ventilator:data.ventilator||{abgHistory:[]},imaging:data.imaging||[],labs:data.labs||[],procedures:data.procedures||[],calculatorResults:data.calculatorResults||[],progressNotes:data.progressNotes||[],auditTrail:[{id:`audit-${Date.now()}-admission`,timestamp:new Date().toISOString(),action:'Patient admitted',fields:['patient'],actor:auth.userName||'Physician'}]};commitClinicalState([p,...patients],beds.map(b=>b.id===bedId?{...b,patientId:id,status:p.status}:b));recordDepartmentLifecycle(p,unitId,'Patient admitted to unit',`${p.fullName} was admitted to ${units.find(u=>u.id===unitId)?.name||'Unit'} in bed ${bed.bedNumber||bed.id}.`,`Admission date/time: ${p.admissionDate} ${p.admissionTime}. Diagnosis: ${p.primaryDiagnosis||'Not recorded'}. History: ${p.clinicalSummary?.hpi||p.clinicalSummary?.chiefComplaint||'Not recorded'}.`,stamp.getTime());setCurrentPatientId(id);showToast(`${p.fullName} admitted successfully.`,'success');void notifyClinicalData(`تم إضافة مريض جديد: ${p.fullName}`,'تمت إضافة بيانات جديدة',{patientId:p.id,unitId:p.unitId,section:'overview',type:'new-patient'});return p;};
 const updatePatient=(id:string,updates:Partial<Patient>,auditContext?:PatientAuditContext)=>{const target=patients.find(p=>p.id===id);if(!target)return;const timestamp=new Date().toISOString();const fields=Object.keys(updates).filter(k=>k!=='auditTrail');const actorUid=auditContext?.uid?.trim()||'';const actorName=auditContext?.displayName?.trim()||undefined;const audit:AuditEvent={id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,timestamp,action:auditContext?.action||clinicalLabel(updates),fields,actor:auditContext?actorUid||'Unknown user':auth.userName||'Physician',...(auditContext?{actorUid:actorUid||'Unknown user',...(actorName?{actorName}: {})}: {})};const next=patients.map(p=>p.id===id?{...p,...updates,auditTrail:[audit,...(p.auditTrail||[])]}:p);const nextBeds=updates.status&&target.bedId?beds.map(b=>b.id===target.bedId?{...b,status:updates.status}:b):beds;commitClinicalState(next,nextBeds);void notifyClinicalData(`تم إضافة/تحديث ${clinicalLabel(updates)} للمريض ${target.fullName}.`,'تم تحديث بيانات المريض',{patientId:target.id,unitId:target.unitId,section:Object.keys(updates).includes('vitalsHistory')?'vitals':Object.keys(updates).includes('investigations')||Object.keys(updates).includes('consultations')?'orders':Object.keys(updates).includes('medications')?'medication':Object.keys(updates).includes('ventilator')?'icu':'overview',type:'patient-update'});};
 const dischargePatient=async(id:string,reason:string,summary:string):Promise<boolean>=>{
   const p=patients.find(x=>x.id===id);if(!p)return false;
   if(guardWrite()||!canWriteTouchedUnits([p.unitId]))return false;
  const unit=units.find(u=>u.id===p.unitId);const stamp=new Date();const dischargeDate=formatLocalAdmissionDate(stamp);const dischargeReason=normalizeDischargeReason(reason);
  const next=prepareDischargedPatient(p,unit?.name||'Unit',`adm-${Date.now()}`,dischargeDate,reason,summary);
  commitClinicalState(patients.map(x=>x.id===id?next:x),beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));
   const saved=await recordDepartmentLifecycle(next,p.unitId,'Patient discharged',`${p.fullName} was discharged from ${unit?.name||'Unit'}.`,`Reason: ${dischargeReason}. Summary: ${summary||'Not recorded'}.`,stamp.getTime());
   if(!saved)return false;
   setCurrentView('archive');
   return true;
  };
 const transferPatient=async(id:string,unitId:string,bedId:string):Promise<boolean>=>{
 const freshPatients=StorageService.getPatients();const freshBeds=StorageService.getBeds();const freshUnits=StorageService.getUnits();
 const p=freshPatients.find(patient=>patient.id===id);const target=freshBeds.find(bed=>bed.id===bedId&&bed.unitId===unitId);
 if(!p||p.isArchived){showToast('This patient is no longer active and cannot be transferred.','error');return false;}
 if(!target||!freshUnits.some(unit=>unit.id===unitId)){showToast('Target bed is not available.','error');return false;}
 if(guardWrite()||!canWriteTouchedUnits([p.unitId,unitId]))return false;
 if(!canTransferBetweenUnits(currentUser,p.unitId,unitId,canWriteUnit,(user,unit)=>AuthorizationService.canPerformAction(user,'transfer_patient',{unitId:unit}))){showToast('You need write access to both the source and destination units.','error');return false;}
 if(!isAvailableLifecycleBed(target,freshPatients)){showToast('Target bed is no longer available. Refresh the census and choose another bed.','error');return false;}
 const sourceBedId=p.bedId||freshBeds.find(bed=>bed.patientId===id)?.id||'';
 if(sourceBedId===target.id){showToast('Choose a different bed for the transfer.','error');return false;}
 const atMs=Date.now();const oldUnitName=freshUnits.find(unit=>unit.id===p.unitId)?.name||p.unitId;const newUnitName=freshUnits.find(unit=>unit.id===unitId)?.name||unitId;
 const moved:Patient={...p,unitId,bedId:target.id,unitIds:Array.from(new Set([...(p.unitIds||[]),p.unitId,unitId])),timelineEvents:p.timelineEvents};
 const nextBeds=freshBeds.map(bed=>bed.id===target.id?{...bed,patientId:id,status:p.status}:bed.patientId===id?{...bed,patientId:undefined,status:'Empty' as BedStatus}:bed);
 const nextPatients=freshPatients.map(patient=>patient.id===id?moved:patient);
 setPatients(nextPatients);StorageService.savePatients(nextPatients);setBeds(nextBeds);StorageService.saveBeds(nextBeds);
  return await recordDepartmentLifecycle(moved,unitId,'Patient transferred between units',`${p.fullName} moved from ${oldUnitName} to ${newUnitName}.`,`From unit ${p.unitId}, bed ${sourceBedId||'Not recorded'}. To unit ${unitId}, bed ${target.id}. Transfer time: ${new Date(atMs).toISOString()}.`,atMs);
 };
 const readmitPatient=async(id:string,unitId:string,bedId:string):Promise<boolean>=>{
 const freshPatients=StorageService.getPatients();const freshBeds=StorageService.getBeds();const freshUnits=StorageService.getUnits();
 const p=freshPatients.find(patient=>patient.id===id);const target=freshBeds.find(bed=>bed.id===bedId&&bed.unitId===unitId);
 if(!p||!p.isArchived){showToast('This patient is not currently archived. Refresh the archive before retrying.','error');return false;}
 if(!target||!freshUnits.some(unit=>unit.id===unitId)){showToast('Target bed is not available.','error');return false;}
  const touchedUnitIds=[p.unitId,unitId];
  if(guardWrite()||!canWriteTouchedUnits(touchedUnitIds))return false;
  if(touchedUnitIds.some(id=>!canWriteUnit(id))||!AuthorizationService.canPerformAction(currentUser,'admit_patient',{unitId})){showToast('Readmitting into this unit requires write access to the source and destination units.','error');return false;}
  if(!isAvailableLifecycleBed(target,freshPatients)){showToast('Target bed is no longer available. Refresh the archive and choose another bed.','error');return false;}
 const started=new Date();const date=formatLocalAdmissionDate(started);const time=formatLocalAdmissionTime(started);const oldUnitName=freshUnits.find(unit=>unit.id===p.unitId)?.name||'Unit';
 try{
  const next=resetForNewAdmission(p,unitId,target.id,oldUnitName,date,time,toLocalIsoTimestamp(started),DepartmentService.getDepartmentForUnit(unitId)?.id);
  const nextWithUnits={...next,unitIds:Array.from(new Set([...(p.unitIds||[]),p.unitId,unitId]))};
  const nextBeds=freshBeds.map(bed=>bed.id===target.id?{...bed,patientId:id,status:nextWithUnits.status}:bed.patientId===id?{...bed,patientId:undefined,status:'Empty' as BedStatus}:bed);
  const nextPatients=freshPatients.map(patient=>patient.id===id?nextWithUnits:patient);
  setPatients(nextPatients);StorageService.savePatients(nextPatients);setBeds(nextBeds);StorageService.saveBeds(nextBeds);
   return await recordDepartmentLifecycle(nextWithUnits,unitId,'Patient readmitted',`${p.fullName} was readmitted to ${freshUnits.find(unit=>unit.id===unitId)?.name||unitId}.`,`Admission date/time: ${date} ${time}. Bed: ${target.bedNumber||target.id}. Diagnosis: ${nextWithUnits.primaryDiagnosis||'Not recorded'}.`,started.getTime());
 }catch(error){showToast(`Re-admission blocked. Nothing was changed. ${String((error as any)?.message||'')}`,'error');return false;}
}; const deletePatientPermanently=(id:string)=>{commitPatients(patients.filter(p=>p.id!==id));commitBeds(beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));};
  const addUnit=(name:string,type:string,initialBedsCount=3,options?:AddUnitOptions):Unit=>{
   if(!isLocalPreview()&&currentUser?.role!=='department_admin')throw new Error('Only the platform owner or a department administrator can create a unit.');
  const requestedId=String(options?.id||'').trim();
  // Always work from what is actually saved, not from the render's copy: the
  // setup wizard may add two units in one pass, and a retry must never append a
  // second copy of a unit that already exists.
  const current=StorageService.getUnits();
  if(requestedId){
   const existing=current.find(item=>String(item.id)===requestedId);
   if(existing)return existing;
  }
  const id=requestedId||`unit-${Date.now()}`;
  const ownerUid=currentFirebaseUid(currentUser?.userId);
  const totalBeds=normalizeBedCount(initialBedsCount);
  // The rules make the creator the unit's consultant and require these fields.
    const unit:Unit={id,name:name.trim(),type,totalBeds,createdBy:ownerUid,consultantUid:ownerUid,createdAtMs:Date.now(),capacityLocked:false,activationStatus:'pending',...(options?.unitTypeId?{unitTypeId:options.unitTypeId}:{}),...(options?.config?{config:options.config}:{}),...(options?.hospitalId?{hospitalId:options.hospitalId}:{})};
  // The bed documents are provisioned by completeUnitSetup after this returns.
  // Registering the unit as pending here is what stops the realtime listeners
  // from replacing these beds with a cloud snapshot taken before they existed,
  // and it is what makes the retry reachable from the Units screen.
  if(!isLocalPreview())markUnitBedsPending(id,totalBeds);
  commitUnits([...current,unit]);
  // Rebuilding this unit's beds from scratch keeps a retry from duplicating
  // them: `desiredBeds` is deterministic per unit id and index.
  commitBeds([...StorageService.getBeds().filter(bed=>bed.unitId!==id),...desiredBeds(id,totalBeds)]);
  if(isLocalPreview()){
   const saved=loadPreviewCreatedUnits();
   savePreviewCreatedUnits([...saved.filter(item=>item.id!==unit.id),unit]);
  }else{
   void notifyClinicalData(`تم إضافة وحدة جديدة: ${unit.name}.`,'تمت إضافة بيانات جديدة',{unitId:unit.id,type:'unit-update'});
  }
  return unit;
 };
 const addPreviewUnits=(requested:Unit[]):number=>{
  if(!isLocalPreview())throw new Error('Preview unit creation is available only in the isolated local preview.');
  const current=StorageService.getUnits();
  const knownIds=new Set(current.map(unit=>String(unit.id)));
  const additions=(Array.isArray(requested)?requested:[]).filter(unit=>unit?.id&&!knownIds.has(String(unit.id)));
  if(!additions.length)return 0;
  const nextUnits=[...current,...additions];
  const currentBeds=StorageService.getBeds();
  const knownBedIds=new Set(currentBeds.map(bed=>String(bed.id)));
  const newBeds=additions.flatMap(unit=>desiredBeds(String(unit.id),normalizeBedCount(unit.totalBeds)).filter(bed=>!knownBedIds.has(String(bed.id))));
  StorageService.saveUnits(nextUnits);
  StorageService.saveBeds([...currentBeds,...newBeds]);
  const savedPreviewUnits=loadPreviewCreatedUnits();
  const savedIds=new Set(savedPreviewUnits.map(unit=>String(unit.id)));
  savePreviewCreatedUnits([...savedPreviewUnits,...additions.filter(unit=>!savedIds.has(String(unit.id)))]);
  setUnits(nextUnits);
  setBeds(StorageService.getBeds());
  return additions.length;
 };
 // Makes the cloud copy of a unit match the capacity it declares.
 //
 // The unit document and its bed documents are two different writes, and the
 // rules only allow a bed inside a unit that is not capacity-locked yet
 // (firestore.rules, match /beds). Locking the capacity before every bed
 // document existed therefore left units that declared 20 beds and held none.
 // The order below is the only one that both uploads and verifies:
 //   1. push the unit document (best effort: the bed step decides success)
 //   2. register the unit on the creator's membership, so the read-back and the
 //      lock are legal for a member
 //   3. create only the missing bed documents and verify them in the cloud
 //   4. close the capacity window locally, then in the cloud
 // Every step is repeatable, so a failure is repaired by running it again.
 const applyCloudBeds=(cloudBeds:Bed[])=>{
  if(!cloudBeds.length)return;
  const byId=new Map<string,Bed>(StorageService.getBeds().map(bed=>[String(bed.id),bed]));
  let changed=false;
  for(const bed of cloudBeds){
   if(!bed?.id||byId.has(String(bed.id)))continue;
   byId.set(String(bed.id),bed);
   changed=true;
  }
  if(changed)commitBeds(Array.from(byId.values()));
 };
   const runCompleteUnitSetup=async(unitId:string,onStage?:(stage:string)=>void):Promise<UnitSetupResult>=>{
 const unit=StorageService.getUnits().find(item=>item.id===unitId);
 const expected=normalizeBedCount(unit?.totalBeds);
 if(!unit)return{ok:false,unitId,expected:0,present:0,created:0,missing:[],message:'This unit is no longer on this device.'};
  if(isLocalPreview()){
  const existing=StorageService.getBeds();const expectedBeds=desiredBeds(unitId,expected);
  const known=new Set(existing.filter(bed=>bed.unitId===unitId).map(bed=>String(bed.id)));const missing=expectedBeds.filter(bed=>!known.has(String(bed.id)));
  if(missing.length)commitBeds([...existing,...missing]);
  const savedIds=new Set(StorageService.getBeds().map(bed=>String(bed.id)));const present=expectedBeds.filter(bed=>savedIds.has(String(bed.id))).length;
  if(present<expected)return{ok:false,unitId,expected,present,created:missing.length,missing:expectedBeds.flatMap((bed,index)=>savedIds.has(String(bed.id))?[]:[index+1]),message:'Some beds could not be saved locally.'};
  lockUnitCapacity(unitId);clearUnitBedsPending(unitId);
  return{ok:true,unitId,expected,present,created:missing.length,missing:[],message:'Saved only in the isolated local preview.'};
 }
   let confirmedPresent=0;let currentStage='starting setup';const deadlineAtMs=Date.now()+60000;
   const stage=async <T,>(promise:Promise<T>,name:string):Promise<T>=>{
    currentStage=name;onStage?.(name);
    try{return await withOperationTimeout(promise,Math.max(1,deadlineAtMs-Date.now()),`Unit setup timed out while ${name}. Check the connection and retry; no later setup steps were started.`,()=>unitSetupTimedOut.current.add(unitId),()=>unitSetupTimedOut.current.delete(unitId));}
    catch(error:any){const message=String(error?.message||error);if(message.toLowerCase().includes(name.toLowerCase()))throw error;throw new Error(`Unit setup failed while ${name}: ${message}`);}
   };
  try{
   const uploaded=await stage(syncCurrentUserNow(),'syncing the unit');
   const cloudUnit=await stage(firestoreUnitVerificationIO.getUnit(unitId),'verifying the unit');
  if(!cloudUnit){const detail=localStorage.getItem('cardiovault_last_cloud_sync_error_detail')||'';throw new Error(`The unit document is not confirmed in Firestore.${uploaded?'':detail?` Cloud sync: ${detail}`:''}`);}
  if(Number(cloudUnit.totalBeds)!==expected)throw new Error(`The unit is in Firestore, but declares ${Number(cloudUnit.totalBeds)||0} beds instead of ${expected}.`);
   const owner=await stage(isMasterAccount(),'checking owner permissions');
  if(!owner){
    try{await stage(registerCreatedUnit(unitId),'registering unit membership');}
   catch(error){throw new Error(`The unit could not be added to your team membership: ${String((error as any)?.message||error)}`);}
  }
   if(owner&&unit.hospitalId){await stage(assignUnitHospitalDocument(firestoreHospitalPersistence,getActiveWorkspaceId(),unitId,unit.hospitalId),'linking the hospital');}
    const ensured=await stage(ensureUnitBedsNow(unitId,expected),'saving beds');
   const verified=await stage(verifyUnitSetupInCloud(firestoreUnitVerificationIO,unitId,expected),'verifying saved beds');
  confirmedPresent=verified.beds.length;applyCloudBeds(verified.beds);
  // Close the local window first so an overlapping sync cannot reopen capacity.
  lockUnitCapacity(unitId);
   await stage(setUnitCapacityLocked(unitId,true),'locking unit capacity');
    const finalVerification=await stage(verifyUnitSetupInCloud(firestoreUnitVerificationIO,unitId,expected,true),'confirming capacity lock');
   confirmedPresent=finalVerification.beds.length;applyCloudBeds(finalVerification.beds);
    if(await stage(isMasterAccount(),'checking activation permissions')){
     await stage(autoActivateOwnerCreatedUnit(getActiveWorkspaceId(),unitId),'activating the owner-created unit');
    const activeUnits=StorageService.getUnits().map(item=>item.id===unitId?{...item,activationStatus:'active' as const,activatedAtMs:Date.now()}:item);
    commitUnits(activeUnits);
   }else{
     await stage(submitUnitActivationRequest(unit,StorageService.getProfileName()||authStateRef.current.userName||'Workspace administrator'),'submitting the activation request');
   }
   clearUnitBedsPending(unitId);
   const active=StorageService.getUnits().find(item=>item.id===unitId)?.activationStatus==='active';
   return{...ensured,ok:true,present:confirmedPresent,message:active?`The unit and all ${confirmedPresent} beds are verified in Firestore and licensed for 30 days.`:`The unit and all ${confirmedPresent} beds are verified in Firestore. The unit is pending platform-owner activation.`};
   }catch(error:any){
   const message=String(error?.message||error);
   onStage?.(`Failed while ${currentStage}`);
  console.warn('Unit setup incomplete:',error);markUnitBedsPending(unitId,expected);
  let cloudPresent=error instanceof UnitCloudVerificationError?error.confirmedPresent:confirmedPresent;
  if(!cloudPresent&&confirmedPresent===0){
    try{const partial=await withOperationTimeout(verifyUnitSetupInCloud(firestoreUnitVerificationIO,unitId,expected),5000,'Unit setup could not check partial bed progress before timing out.');cloudPresent=partial.beds.length;}
   catch(verificationError){if(verificationError instanceof UnitCloudVerificationError)cloudPresent=verificationError.confirmedPresent;}
  }
  return{ok:false,unitId,expected,present:cloudPresent,created:0,missing:[],message};
 }
};
 // Finishes a unit creation in the cloud, in the only order the rules accept.
 const finalizeUnitCreation=async(unitId:string):Promise<void>=>{
  const result=await completeUnitSetup(unitId);
   if(result.ok){
     showToast(isLocalPreview()?`Local preview only: unit and ${result.present} ${result.present===1?'bed':'beds'} saved on this device.`:result.message,'success');
    return;
   }
   if(!isLocalPreview()&&result.expected>0&&result.present===result.expected){
    showToast(`The unit and all ${result.present} beds are verified in Firestore, but setup is incomplete: ${result.message} Capacity lock is not confirmed. Open Manage Units and tap "Finish setup" to retry.`,'error');
    return;
   }
   showToast(isLocalPreview()?`Local preview only: setup is incomplete; ${result.present} of ${result.expected} beds are saved on this device. ${result.message}`:`Cloud setup is incomplete; ${result.present} of ${result.expected} beds are confirmed in Firestore. ${result.message} Open Manage Units and tap "Finish setup" to retry.`,'error');
 };
  const completeUnitSetup=async(unitId:string,onStage?:(stage:string)=>void):Promise<UnitSetupResult>=>{
   if(unitSetupInFlight.current.has(unitId)||unitSetupTimedOut.current.has(unitId))return{ok:false,unitId,expected:0,present:0,created:0,missing:[],message:'A setup operation is still finishing in the background. Wait for it to settle before retrying.'};
   unitSetupInFlight.current.add(unitId);
   try{return await runCompleteUnitSetup(unitId,onStage);}
   finally{unitSetupInFlight.current.delete(unitId);}
  };
 // Freezes capacity in the local record as soon as the creation wizard finishes, so
 // the UI stops offering bed-count changes even before the cloud copy is locked. It
 // uses the functional updater because it is called in the same tick as addUnit,
 // where the render's `units` array still does not contain the new unit.
 const lockUnitCapacity=(unitId:string)=>setUnits(prev=>{
   const next=prev.map(u=>u.id===unitId?{...u,capacityLocked:true}:u);
   StorageService.saveUnits(next);
   if(isLocalPreview()){
    const savedIds=new Set(loadPreviewCreatedUnits().map(unit=>String(unit.id)));
    if(savedIds.has(unitId))savePreviewCreatedUnits(next.filter(unit=>savedIds.has(String(unit.id))));
   }
   return next;
 });

  const updateUnit=(id:string,name:string,type:string,extra:Partial<Unit>={})=>{const current=StorageService.getUnits();commitUnits(current.map(u=>u.id===id?{...u,name,type,...extra}:u));};
 const deleteUnit=(id:string)=>{if(units.length<=1){showToast('Cannot delete the last clinical unit.','error');return false;}const activeIds=new Set(patients.filter(p=>!p.isArchived&&p.unitId===id).map(p=>p.id));if(activeIds.size>0||beds.some(b=>b.unitId===id&&b.patientId&&activeIds.has(b.patientId))){showToast('Transfer or discharge active patients before deleting this unit.','error');return false;}commitUnits(units.filter(u=>u.id!==id));commitBeds(beds.filter(b=>b.unitId!==id));clearUnitBedsPending(id);if(currentUnitId===id)setCurrentUnitId(units.find(u=>u.id!==id)?.id||null);return true;};
 const addBed=(unitId:string,bedNumber?:string)=>{const n=beds.filter(b=>b.unitId===unitId).length+1;const bed={id:`bed-${unitId}-${Date.now()}`,unitId,bedNumber:bedNumber||`Bed ${n}`,status:'Empty' as BedStatus};commitBeds([...beds,bed]);commitUnits(units.map(u=>u.id===unitId?{...u,totalBeds:u.totalBeds+1}:u));void notifyClinicalData(`تم إضافة سرير جديد: ${bed.bedNumber}.`,'تمت إضافة بيانات جديدة',{unitId:bed.unitId,type:'bed-update'});return bed;};
 const removeBed=(id:string)=>{const bed=beds.find(b=>b.id===id);if(!bed||bedIsOccupied(bed))return false;const count=beds.filter(b=>b.unitId===bed.unitId).length;if(count<=1)return false;commitBeds(beds.filter(b=>b.id!==id));commitUnits(units.map(u=>u.id===bed.unitId?{...u,totalBeds:Math.max(1,u.totalBeds-1)}:u));return true;};
 const syncNow=async()=>{if(isLocalPreview()){showToast('Cloud sync is disabled in the isolated local preview.','info');return;}setIsSyncing(true);try{const ok=await syncCurrentUserNow();if(!ok){const detail=localStorage.getItem('cardiovault_last_cloud_sync_error_detail')||'No authenticated Firebase user or sync failed.';throw new Error(detail);}const pendingEventsSaved=await flushPendingDepartmentLifecycleWrites(getActiveWorkspaceId());setLastSyncTime(new Date().toLocaleTimeString());showToast(pendingEventsSaved?'Cloud sync and pending lifecycle events completed successfully.':'Clinical data synced, but a master-file event still needs confirmation. Retry cloud sync.',pendingEventsSaved?'success':'warning');}catch(error){console.warn(error);showToast('Cloud sync failed. Your data is saved on this device and will retry.','error');}finally{setIsSyncing(false);}};
 const resetDatabase=()=>{if(patients.length>0||units.length>0){const answer=window.prompt('This ERASES all units, beds and patients. Type RESET to confirm.');if(String(answer||'').trim().toUpperCase()!=='RESET'){showToast('Reset cancelled.','info');return;}}StorageService.resetToDefaultSeed();hydrateClinicalState();showToast('Database reset.','warning');};
 const currentPatient=patients.find(p=>p.id===currentPatientId);
  return <AppContext.Provider value={{theme,setTheme,toggleTheme,auth,loginWithGoogle,loginWithEmail,unlockWithPin,lockApp,logout,currentUser,setCurrentUser,updateOwnDisplayName,currentView,setCurrentView,currentUnitId,setCurrentUnitId,currentPatientId,setCurrentPatientId,currentPatient,activePatientSection,setActivePatientSection,units,beds,patients,archivedPatients,getPatientById,getBedsByUnit,getUnitById,addPatient,updatePatient,dischargePatient,transferPatient,readmitPatient,deletePatientPermanently,addUnit,addPreviewUnits,finalizeUnitCreation,completeUnitSetup,updateUnit,lockUnitCapacity,deleteUnit,hospitals,addHospital,assignUnitToHospital,canWriteUnit,groupUnitsByHospital,addBed,removeBed,isSearchOpen,setIsSearchOpen,isSyncing,lastSyncTime,syncNow,toasts,showToast,dismissToast,resetDatabase,privacySafeMonitor,setPrivacySafeMonitor,favoritePatientIds,toggleFavoritePatient,myWorkspaces,isTeamPickerOpen,isSwitchingTeam,openTeamPicker,closeTeamPicker,refreshWorkspaceIndex,switchWorkspace}}>{children}</AppContext.Provider>;
};
export const useApp=()=>{const c=useContext(AppContext);if(!c)throw new Error('useApp must be used inside AppProvider');return c;};
