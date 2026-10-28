import React,{createContext,useContext,useEffect,useRef,useState}from'react';
import {Bed,BedStatus,Patient,PatientSectionId,Unit,AuditEvent,UserProfile}from'../types/clinical';
import {StorageService}from'../services/storage';
import {AuthorizationService, PRESET_USERS, ACCESS_DENIED_MESSAGE}from'../services/authorizationService';
import {DepartmentService}from'../services/departmentService';
import {AuditTrailService}from'../services/auditTrailService';
import {FirebaseAuthentication}from'@capacitor-firebase/authentication';
import {webCurrentUser,webGoogleSignIn,checkWebRedirectResult,webEmailSignIn,webEmailCreate,webSignOut} from'../services/webFirebase';
import {Capacitor}from'@capacitor/core';
import {clearActiveClinicalWorkspace,ensureUnitBedsNow,installCloudSyncBridge,loadCurrentUserFromCloud,syncCurrentUserNow}from'../services/cloudSyncBridge';
import {clearUnitBedsPending,desiredBeds,markUnitBedsPending,normalizeBedCount,UnitBedsIncompleteError,type UnitSetupResult}from'../services/unitBeds';
import {isMasterAccount,ensureOwnerWorkspace,validateCurrentWorkspaceAccess,setStoredWorkspaceAccess,registerCreatedUnit,setUnitCapacityLocked,getActiveWorkspaceId,getStoredWorkspaceAccess,getCurrentUid } from '../services/workspaceAccess';
import {listIndexedWorkspaces,registerWorkspaceInIndex,readWorkspaceName,type IndexedWorkspace } from '../services/workspaceIndex';
import {getSubscription} from '../services/workspaceSubscription';
import {notifyClinicalData} from'../services/clinicalNotifications';
import {formatLocalAdmissionDate,formatLocalAdmissionTime,toLocalIsoTimestamp}from'../services/patientAdmission';
import {resetForNewAdmission,AdmissionHistoryTooLargeError,normalizeDischargeReason,prepareDischargedPatient}from'../services/admissionEpisode';
import {isLocalPreview,PREVIEW_USER,PREVIEW_WORKSPACE_ID}from'../config/localPreview';
import {loadPreviewCreatedUnits,savePreviewCreatedUnits,seedPreviewData}from'../config/previewSeed';
import {computeUnitEntitlementState,subscriptionHistoryExists}from'../services/subscriptionRequests';
import {linkOrCreateForIntake,persistTimelineEvent}from'../services/masterPatientFile';

export type AppView='login'|'home'|'census'|'patient'|'patients'|'add-patient'|'archive'|'calculators'|'settings'|'handover'|'my-worklist'|'team'|'protocols'|'statistics'|'audit-trail'|'results-center'|'institution-setup'|'waiting-list'|'clinic'|'payments'|'master-file'|'operation-waiting'|'owner-requests';
interface AuthState{isAuthenticated:boolean;userEmail:string;userName:string;pinCode:string;isLocked:boolean;}
interface ToastInfo{id:string;message:string;type:'success'|'info'|'warning'|'error';}
interface PatientAuditContext { uid?: string; displayName?: string; action?: string; }
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
  dischargePatient:(id:string,reason:string,summary:string)=>void;
  transferPatient:(id:string,unitId:string,bedId:string)=>void;
  readmitPatient:(id:string,unitId:string,bedId:string)=>void;
  deletePatientPermanently:(id:string)=>void;
  addUnit:(name:string,type:string,initialBedsCount?:number)=>Unit;
  addPreviewUnits:(units:Unit[])=>number;
  // Uploads a freshly created unit with its beds and then closes its capacity
  // window. It must run after addUnit and before the unit is resized.
  finalizeUnitCreation:(unitId:string)=>Promise<void>;
  // Same work without creating anything: repairs a unit whose bed upload did
  // not finish. Safe to repeat; it never touches a bed that already exists.
  completeUnitSetup:(unitId:string)=>Promise<UnitSetupResult>;
  updateUnit:(id:string,name:string,type:string,extra?:Partial<Unit>)=>void;
  lockUnitCapacity:(id:string)=>void;
  deleteUnit:(id:string)=>boolean;
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
const resolveProfileFor=async(user:any)=> (await isMasterAccount())
  ? AuthorizationService.applyPlatformOwner(user)
  : AuthorizationService.resolveUserForFirebaseAuth(user);

export const AppProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const[theme,setThemeState]=useState<'dark'|'light'>('dark');
 const authNullGraceUntil=useRef(0);
 const[auth,setAuth]=useState<AuthState>({isAuthenticated:false,userEmail:'',userName:'',pinCode:'',isLocked:false});
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
 const[isTeamPickerOpen,setIsTeamPickerOpen]=useState(false);
 const[isSwitchingTeam,setIsSwitchingTeam]=useState(false);
 const teamPickerShown=useRef(false);
 const[favoritePatientIds,setFavoritePatientIds]=useState<string[]>(()=>{
   try { const raw = localStorage.getItem('cardiovault_fav_patients'); return raw ? JSON.parse(raw) : []; } catch { return []; }
 });

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
 const openTeamPicker=()=>{if(isLocalPreview()){showToast('Workspace switching is disabled in the isolated local preview.','info');return;}teamPickerShown.current=true;setIsTeamPickerOpen(true);};
 const closeTeamPicker=()=>{setIsTeamPickerOpen(false);};
 const switchWorkspace=async(workspaceId:string)=>{
  if(isLocalPreview()){showToast('Workspace switching is disabled in the isolated local preview.','info');return;}
  if(!workspaceId||isSwitchingTeam)return;
  setIsSwitchingTeam(true);
  try{
   // The other team's clinical data must never stay on the screen.
   clearActiveClinicalWorkspace();
   setStoredWorkspaceAccess({workspaceId,role:'clinical_editor',unitId:null,unitName:null});
   const cloud=await loadCurrentUserFromCloud();
   if(cloud?.access)setStoredWorkspaceAccess(cloud.access);
   hydrateClinicalState();
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

 const hydrateClinicalState=()=>{
   const u=StorageService.getUnits();
   const p=StorageService.getPatients();
   const b=DepartmentService.reconcileBedsWithPatients(StorageService.getBeds(),p);
   const repaired=b.map(bed=>{if(bed.patientId)return bed;const owner=p.find(patient=>!patient.isArchived&&patient.bedId===bed.id);return owner?{...bed,patientId:owner.id,status:owner.status}:bed;});
   if(repaired.some((bed,index)=>bed.patientId!==b[index].patientId))StorageService.saveBeds(repaired);
   setUnits(u);setBeds(repaired);setPatients(p);
   setCurrentUnitId(prev=>prev&&u.some(x=>x.id===prev)?prev:(u[0]?.id||null));
   setCurrentPatientId(prev=>prev&&p.some(x=>x.id===prev&&!x.isArchived)?prev:(p.find(x=>!x.isArchived)?.id||null));
 };
 useEffect(()=>{const onRestore=()=>hydrateClinicalState();window.addEventListener('cardiovault-data-restored',onRestore);window.addEventListener('cardiovault-workspace-access-granted',onRestore);return()=>{window.removeEventListener('cardiovault-data-restored',onRestore);window.removeEventListener('cardiovault-workspace-access-granted',onRestore);};},[]);
 useEffect(()=>{if(isLocalPreview()||!Capacitor.isNativePlatform())return;let handle:{remove:()=>Promise<void>}|null=null;const attach=async()=>{try{handle=await FirebaseAuthentication.addListener('authStateChange',async({user}:any)=>{if(!user?.uid){if(Date.now()<authNullGraceUntil.current)return;const saved=StorageService.getAuth();if(!saved.isAuthenticated)return;let recovered:any=null;try{recovered=await waitForNativeFirebaseUser();}catch{}if(recovered?.uid){authNullGraceUntil.current=0;const profile=await resolveProfileFor(recovered);setCurrentUserState(profile);const session={...saved,isAuthenticated:true,isLocked:false,userEmail:recovered.email||saved.userEmail,userName:StorageService.getProfileName()||saved.userName||recovered.displayName||recovered.email?.split('@')[0],pinCode:''};StorageService.saveAuth(session);setAuth(session);return;}const signedOut={...saved,isAuthenticated:false,isLocked:false,pinCode:''};clearActiveClinicalWorkspace();StorageService.saveAuth(signedOut);setAuth(signedOut);setCurrentView('login');return;}authNullGraceUntil.current=0;const profile=await resolveProfileFor(user);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...StorageService.getAuth(),isAuthenticated:true,isLocked:false,userEmail:user.email||'',userName:StorageService.getProfileName()||user.displayName||user.email?.split('@')[0]||'Physician',pinCode:''};StorageService.saveAuth(session);setAuth(session);setCurrentView('home');localStorage.setItem('cardiovault_google_uid',user.uid);void (async()=>{try{if(await isMasterAccount()){await ensureOwnerWorkspace();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const cloud=await loadCurrentUserFromCloud();if(cloud?.found||cloud?.access)hydrateClinicalState();if(cloud?.access)window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));}catch(error){console.warn('Native auth state cloud restore failed:',error);}})();});}catch(error){console.warn('Native Firebase auth listener failed:',error);}};void attach();return()=>{if(handle)void handle.remove();};},[]);
 useEffect(()=>{let active=true;installCloudSyncBridge();const boot=async()=>{if(isLocalPreview()){const saved=StorageService.getAuth();seedPreviewData();const demo={...saved,isAuthenticated:true,isLocked:false,userEmail:PREVIEW_USER.email,userName:PREVIEW_USER.name,pinCode:''};StorageService.saveAuth(demo);setAuth(demo);setCurrentUserState({userId:PREVIEW_USER.uid,name:PREVIEW_USER.name,email:PREVIEW_USER.email,role:'department_admin',clinicRole:'doctor',departmentId:'dept-cardiology',assignedUnitIds:['unit-preview-cardiology','unit-preview-ccu'],status:'active',updatedAt:new Date().toISOString()});localStorage.setItem('cardiovault_google_uid',PREVIEW_USER.uid);setStoredWorkspaceAccess({workspaceId:PREVIEW_WORKSPACE_ID,role:'owner',unitId:null,unitName:null});hydrateClinicalState();setCurrentView('home');window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const savedAuth=StorageService.getAuth();setThemeState(StorageService.getTheme());if(!Capacitor.isNativePlatform()){const redirectedUser=await checkWebRedirectResult();const webUser=redirectedUser||webCurrentUser();if(webUser){const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:webUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||webUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);localStorage.setItem('cardiovault_google_uid',webUser.uid);setCurrentUserState(await resolveProfileFor(webUser));hydrateClinicalState();setCurrentView('home');void loadCurrentUserFromCloud();}else{setAuth({...savedAuth,isAuthenticated:false,isLocked:false});setCurrentView('login');}return;}const firebaseUser=await waitForNativeFirebaseUser();if(!firebaseUser?.uid){clearActiveClinicalWorkspace();const signedOut={...savedAuth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(signedOut);StorageService.saveAuth(signedOut);setCurrentView('login');return;}const profile=await resolveProfileFor(firebaseUser);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:firebaseUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||firebaseUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);hydrateClinicalState();setCurrentView('home');try{const cloud=await loadCurrentUserFromCloud();if(!active)return;if(cloud?.found)hydrateClinicalState();setLastSyncTime(cloud?.found?new Date().toLocaleTimeString():'');}catch(error){console.warn('Cloud session restore failed:',error);}};void boot();return()=>{active=false;};},[]);
 useEffect(()=>{if(isLocalPreview()||!auth.isAuthenticated)return;let active=true;const check=async()=>{try{if(await isMasterAccount())return;const valid=await validateCurrentWorkspaceAccess();if(valid===false&&active){logout();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-revoked'));showToast('Your Unit Access Code has been changed or revoked. Please sign in again with the new code.','warning');}}catch(error){console.warn('Workspace access monitor failed:',error);}};const initial=window.setTimeout(()=>void check(),3000);const timer=window.setInterval(()=>void check(),15000);return()=>{active=false;window.clearTimeout(initial);window.clearInterval(timer);};},[auth.isAuthenticated]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.classList.toggle('light',theme==='light');},[theme]);

 const showToast=(message:string,type:ToastInfo['type']='info')=>{const id=`toast-${Date.now()}-${Math.random()}`;setToasts(p=>[...p,{id,message,type}]);window.setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);};
 const dismissToast=(id:string)=>setToasts(p=>p.filter(t=>t.id!==id));
 // The subscription clock is the only thing that can make this app read-only.
 // A workspace with no clock is grandfathered, so an unreadable clock must never
 // lock the UI. The platform owner is exempt, exactly like in firestore.rules.
 const [subscriptionLocked,setSubscriptionLocked]=useState(false);
 const lastLockToastRef=useRef(0);
 useEffect(()=>{
  // The isolated local preview has no cloud session at all: asking Firebase for a
  // subscription clock here would connect to the emulator (or fail) for nothing.
  if(isLocalPreview()){setSubscriptionLocked(false);return;}
  let active=true;
  const check=async()=>{
   try{
    const [sub,owner]=await Promise.all([getSubscription(),isMasterAccount()]);
    if(active)setSubscriptionLocked(sub.status==='locked'&&!owner);
   }catch(error){console.warn('Subscription lock check failed:',error);}
  };
  void check();
  const timer=window.setInterval(()=>void check(),60000);
  return()=>{active=false;window.clearInterval(timer);};
 },[]);
 // The rules already refuse every write in a locked workspace; this stops the UI
 // from offering actions that are guaranteed to be denied.
 const guardWrite=():boolean=>{
  if(!subscriptionLocked)return false;
  const now=Date.now();
  if(now-lastLockToastRef.current>5000){
   lastLockToastRef.current=now;
   showToast('This workspace is read-only because the subscription has ended. Renew it to keep editing.','error');
  }
  return true;
 };
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
 const logout=()=>{if(isLocalPreview()){showToast('Sign-out is disabled in the local preview. Reload the page to restart the demo.','info');return;}authNullGraceUntil.current=0;void (Capacitor.isNativePlatform()?FirebaseAuthentication.signOut():webSignOut()).catch(error=>console.warn('Firebase sign-out failed:',error));localStorage.removeItem('cardiovault_google_uid');clearActiveClinicalWorkspace();setUnits([]);setBeds([]);setPatients([]);setCurrentUnitId(null);setCurrentPatientId(null);const a={...auth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(a);StorageService.saveAuth(a);setCurrentView('login');};
 const getPatientById=(id:string)=>patients.find(p=>p.id===id);const getBedsByUnit=(id:string)=>beds.filter(b=>b.unitId===id);const getUnitById=(id:string)=>units.find(u=>u.id===id);const archivedPatients=patients.filter(p=>p.isArchived);
 const canWriteTouchedUnits=(unitIds:string[])=>{const subscriberId=String(currentUser?.userId||'').trim()||undefined;if(!isLocalPreview()||!subscriptionHistoryExists(undefined,subscriberId))return true;const blockedId=Array.from(new Set(unitIds.filter(Boolean))).find(id=>computeUnitEntitlementState(id,undefined,undefined,subscriberId)==='read-only');if(!blockedId)return true;const name=units.find(unit=>unit.id===blockedId)?.name||blockedId;showToast(`${name} is read-only until its own trial or subscription is active.`,'error');return false;};
 const touchedUnitsForChanges=<T extends {id:string;unitId?:string},>(before:T[],after:T[]):string[]=>{const oldById=new Map(before.map(item=>[item.id,item]));const newById=new Map(after.map(item=>[item.id,item]));const ids:string[]=[];for(const id of new Set([...oldById.keys(),...newById.keys()])){const oldItem=oldById.get(id);const newItem=newById.get(id);if(oldItem!==newItem){if(oldItem?.unitId)ids.push(oldItem.unitId);if(newItem?.unitId)ids.push(newItem.unitId);}}return ids;};
 const changedEntityIds=<T extends {id:string},>(before:T[],after:T[]):string[]=>{const oldById=new Map(before.map(item=>[item.id,item]));const newById=new Map(after.map(item=>[item.id,item]));return [...new Set([...oldById.keys(),...newById.keys()])].filter(id=>oldById.get(id)!==newById.get(id));};
 const commitPatients=(next:Patient[])=>{if(guardWrite()||!canWriteTouchedUnits(touchedUnitsForChanges(patients,next)))return;setPatients(next);StorageService.savePatients(next);};const commitBeds=(next:Bed[])=>{if(guardWrite()||!canWriteTouchedUnits(touchedUnitsForChanges(beds,next)))return;setBeds(next);StorageService.saveBeds(next);};const commitClinicalState=(nextPatients:Patient[],nextBeds:Bed[])=>{const touched=[...touchedUnitsForChanges(patients,nextPatients),...touchedUnitsForChanges(beds,nextBeds)];if(guardWrite()||!canWriteTouchedUnits(touched))return;setPatients(nextPatients);StorageService.savePatients(nextPatients);setBeds(nextBeds);StorageService.saveBeds(nextBeds);};const commitUnits=(next:Unit[])=>{if(guardWrite()||!canWriteTouchedUnits(changedEntityIds(units,next)))return;setUnits(next);StorageService.saveUnits(next);};
 const clinicalLabel=(updates:Partial<Patient>)=>{const labels:Record<string,string>={clinicalSummary:'History / Clinical Summary',examination:'Physical Examination',vitalsHistory:'Vitals',fluidRecords:'Fluid Balance',hemodynamicHistory:'Hemodynamics',fluidIntakeHistory:'Fluid Intake',urineOutputHistory:'Urine Output',ecgRecords:'ECG',labs:'Laboratory Results',imaging:'Imaging',imagingStudies:'Imaging',medications:'Medications',procedures:'Procedures / Interventions',cardiology:'Cardiology Data',ventilator:'ICU / Ventilator Data',calculatorResults:'Calculator Result',progressNotes:'Progress Note'};const key=Object.keys(updates).find(k=>labels[k]);return key?labels[key]:'Patient Data';};
 const recordDepartmentLifecycle=(patient:Patient,unitId:string,title:string,summary:string,detail:string,atMs=Date.now()):boolean=>{
  if(!isLocalPreview())return true;
  try{
   const clinical=patient.clinicalSummary;
   const history=[clinical?.chiefComplaint,clinical?.hpi,...(Array.isArray(clinical?.pmh)?clinical.pmh:[]),clinical?.drugHistory?`Medication history: ${clinical.drugHistory}`:''].map(value=>String(value||'').trim()).filter(Boolean).join('\n');
   const cardio=patient.cardiovascularHistory;
   const riskFactors=[cardio?.hypertension?'Hypertension':'',cardio?.diabetes?'Diabetes':'',cardio?.dyslipidemia?'Dyslipidemia':'',cardio?.smoking?'Smoking':''].filter(Boolean);
   const procedures=Array.isArray(patient.procedures)?patient.procedures.map((item:any)=>String(item?.name||item?.procedureName||item?.type||'').trim()).filter(Boolean):[];
   const priorOperations=[...(Array.isArray(clinical?.psh)?clinical.psh:[]),...procedures];
   const imaging=Array.isArray(patient.imaging)?patient.imaging.map((item:any)=>String(item?.studyName||item?.name||item?.type||'').trim()).filter(Boolean):[];
   const scope=[unitId,...(patient.unitIds||[])].filter(Boolean);
   const linkage=linkOrCreateForIntake({identity:{name:patient.fullName||patient.name||patient.id,ageYears:Math.trunc(Number(patient.age)||0),sourcePatientId:patient.id,riskFactors,history,pastOperations:priorOperations,pastImaging:imaging},authorizedContextIds:scope,defaultContextId:unitId,createdBy:String(currentUser?.userId||PREVIEW_USER.uid),nowMs:atMs});
   if('error'in linkage){showToast('The patient was saved, but the master file needs a doctor to resolve a duplicate match.','warning');return false;}
   const event=persistTimelineEvent(linkage.file.id,{kind:'encounter',title,summary,detail,createdBy:String(currentUser?.userId||PREVIEW_USER.uid),context:{unitId},atMs,refId:patient.id});
   if(!event.saved){showToast('The patient was saved, but the master-file timeline could not be persisted on this device.','warning');return false;}
   return true;
  }catch(error){console.warn('Local master patient file linkage failed:',error);showToast('The patient was saved, but the master-file timeline could not be updated.','warning');return false;}
 };
 const bedIsOccupied=(bed:Bed)=>{if(!bed.patientId)return false;const owner=patients.find(p=>p.id===bed.patientId);return !!owner&&!owner.isArchived;};
 const addPatient=(data:Partial<Patient>,targetBedId?:string):Patient=>{const unitId=data.unitId||'';const bedId=targetBedId||data.bedId||'';if(!unitId||!bedId)throw new Error('Patient admission requires an explicit unit and bed.');const bed=beds.find(b=>b.id===bedId&&b.unitId===unitId);if(!bed)throw new Error('Selected bed does not belong to the selected unit.');if(bedIsOccupied(bed))throw new Error('Selected bed is already occupied.');if(guardWrite()||!canWriteTouchedUnits([unitId]))throw new Error('This unit is read-only. Renew or ask the owner to activate it.');const stamp=new Date();const date=stamp.toISOString().split('T')[0];const time=stamp.toTimeString().slice(0,5);const id=`patient-${Date.now()}`;const allergies=data.allergies||['NKDA'];const p:Patient={id,mrn:data.mrn||`MRN-${Math.floor(100000+Math.random()*900000)}`,fullName:data.fullName||'New Patient',age:data.age??0,sex:data.sex||'Other',weight:data.weight??0,height:data.height??0,photoUrl:data.photoUrl,unitId,unitIds:(data.unitIds&&data.unitIds.length?Array.from(new Set([...data.unitIds,unitId])):[unitId]),bedId,status:data.status||'Stable',admissionDate:data.admissionDate||date,admissionTime:data.admissionTime||time,primaryDiagnosis:data.primaryDiagnosis||'Clinical Admission',secondaryDiagnoses:data.secondaryDiagnoses||[],allergies,codeStatus:data.codeStatus||'Full Code',isArchived:false,pastAdmissions:[],clinicalSummary:data.clinicalSummary||{chiefComplaint:'',hpi:'',pmh:[],psh:[],drugHistory:'',allergies,familyHistory:'',socialHistory:''},cardiovascularHistory:data.cardiovascularHistory||{hypertension:false,diabetes:false,dyslipidemia:false,cad:false,previousMI:false,heartFailure:false,arrhythmias:false,valvularDisease:false,previousPCI:false,previousCABG:false,previousStroke:false,pvd:false,smoking:false,alcohol:false,previousAdmissions:'',previousICU:'',other:''},vitalsHistory:data.vitalsHistory||[],fluidRecords:data.fluidRecords||[],hemodynamicHistory:data.hemodynamicHistory||[],fluidIntakeHistory:data.fluidIntakeHistory||[],urineOutputHistory:data.urineOutputHistory||[],examination:data.examination||{general:{appearance:'',consciousness:'',distress:'',hydration:'',pallor:false,cyanosis:false,jaundice:false,edema:''},cardiovascular:{jvp:'',heartSounds:'',murmurs:'',peripheralPulses:'',edema:'',perfusion:''},respiratory:{chestExam:'',airEntry:'',addedSounds:'',workOfBreathing:''},abdomen:{inspection:'',palpation:'',tenderness:'',organomegaly:'',ascites:''},neurological:{consciousness:'',gcs:'',pupils:'',motor:'',sensory:'',reflexes:''},extremities:{pulses:'',edema:'',temp:'',perfusion:''},customFields:[]},ecgRecords:data.ecgRecords||[],cardiology:data.cardiology||{rhythm:'',heartRate:0,bp:'',heartFailureStatus:'',nyha:'',killip:'',congestion:'',perfusion:'',echoBriefSummary:'',echo:{ef:0,lvDimensions:'',lvFunction:'',rvFunction:'',rwma:'',la:'',ra:'',mr:'',ar:'',as:'',ms:'',tr:'',pr:'',ivc:'',pericardium:'',otherFindings:''},biomarkers:{troponin:'',ckmb:'',bnp:'',ntProBnp:''},coronary:{cath:'',coronaryFindings:'',pci:'',stent:'',cabg:''},antithrombotic:{antiplatelet:'',anticoagulation:'',thrombolysis:''},cathRecords:[],biomarkerRecords:[],devicesList:[],hemodynamicsList:[]},medications:data.medications||[],ventilator:data.ventilator||{abgHistory:[]},imaging:data.imaging||[],labs:data.labs||[],procedures:data.procedures||[],calculatorResults:data.calculatorResults||[],progressNotes:data.progressNotes||[],auditTrail:[{id:`audit-${Date.now()}-admission`,timestamp:new Date().toISOString(),action:'Patient admitted',fields:['patient'],actor:auth.userName||'Physician'}]};commitClinicalState([p,...patients],beds.map(b=>b.id===bedId?{...b,patientId:id,status:p.status}:b));recordDepartmentLifecycle(p,unitId,'Patient admitted to unit',`${p.fullName} was admitted to ${units.find(u=>u.id===unitId)?.name||'Unit'} in bed ${bed.bedNumber||bed.id}.`,`Admission date/time: ${p.admissionDate} ${p.admissionTime}. Diagnosis: ${p.primaryDiagnosis||'Not recorded'}. History: ${p.clinicalSummary?.hpi||p.clinicalSummary?.chiefComplaint||'Not recorded'}.`,stamp.getTime());setCurrentPatientId(id);showToast(`${p.fullName} admitted successfully.`,'success');void notifyClinicalData(`تم إضافة مريض جديد: ${p.fullName}`,'تمت إضافة بيانات جديدة',{patientId:p.id,unitId:p.unitId,section:'overview',type:'new-patient'});return p;};
 const updatePatient=(id:string,updates:Partial<Patient>,auditContext?:PatientAuditContext)=>{const target=patients.find(p=>p.id===id);if(!target)return;const timestamp=new Date().toISOString();const fields=Object.keys(updates).filter(k=>k!=='auditTrail');const actorUid=auditContext?.uid?.trim()||'';const actorName=auditContext?.displayName?.trim()||undefined;const audit:AuditEvent={id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,timestamp,action:auditContext?.action||clinicalLabel(updates),fields,actor:auditContext?actorUid||'Unknown user':auth.userName||'Physician',...(auditContext?{actorUid:actorUid||'Unknown user',...(actorName?{actorName}: {})}: {})};const next=patients.map(p=>p.id===id?{...p,...updates,auditTrail:[audit,...(p.auditTrail||[])]}:p);const nextBeds=updates.status&&target.bedId?beds.map(b=>b.id===target.bedId?{...b,status:updates.status}:b):beds;commitClinicalState(next,nextBeds);void notifyClinicalData(`تم إضافة/تحديث ${clinicalLabel(updates)} للمريض ${target.fullName}.`,'تم تحديث بيانات المريض',{patientId:target.id,unitId:target.unitId,section:Object.keys(updates).includes('vitalsHistory')?'vitals':Object.keys(updates).includes('investigations')||Object.keys(updates).includes('consultations')?'orders':Object.keys(updates).includes('medications')?'medication':Object.keys(updates).includes('ventilator')?'icu':'overview',type:'patient-update'});};
const dischargePatient=(id:string,reason:string,summary:string)=>{
  const p=patients.find(x=>x.id===id);if(!p)return;
  if(guardWrite()||!canWriteTouchedUnits([p.unitId]))return;
  const unit=units.find(u=>u.id===p.unitId);const stamp=new Date();const dischargeDate=formatLocalAdmissionDate(stamp);const dischargeReason=normalizeDischargeReason(reason);
  const next=prepareDischargedPatient(p,unit?.name||'Unit',`adm-${Date.now()}`,dischargeDate,reason,summary);
  commitClinicalState(patients.map(x=>x.id===id?next:x),beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));
  recordDepartmentLifecycle(next,p.unitId,'Patient discharged',`${p.fullName} was discharged from ${unit?.name||'Unit'}.`,`Reason: ${dischargeReason}. Summary: ${summary||'Not recorded'}.`,stamp.getTime());
  setCurrentView('archive');
 };
const transferPatient=(id:string,unitId:string,bedId:string)=>{
  const p=patients.find(x=>x.id===id);const target=beds.find(b=>b.id===bedId&&b.unitId===unitId);
  if(!p||!target||bedIsOccupied(target)){showToast('Target bed is not available.','error');return;}
  if(guardWrite()||!canWriteTouchedUnits([p.unitId,unitId]))return;
  const oldUnitName=units.find(unit=>unit.id===p.unitId)?.name||p.unitId;
  const newUnitName=units.find(unit=>unit.id===unitId)?.name||unitId;
  const moved:Patient={...p,unitId,bedId,unitIds:Array.from(new Set([...(p.unitIds||[]),p.unitId,unitId]))};
  const nextBeds:Bed[]=beds.map(b=>b.id===p.bedId?{...b,patientId:undefined,status:'Empty'}:b.id===bedId?{...b,patientId:id,status:p.status}:b);
  commitClinicalState(patients.map(patient=>patient.id===id?moved:patient),nextBeds);
  recordDepartmentLifecycle(moved,unitId,'Patient transferred between units',`${p.fullName} moved from ${oldUnitName} to ${newUnitName}.`,`From: ${oldUnitName}, bed ${p.bedNumber||p.bedId||'Not recorded'}. To: ${newUnitName}, bed ${target.bedNumber||target.id}.`,Date.now());
 };
const readmitPatient=(id:string,unitId:string,bedId:string)=>{
  const p=patients.find(x=>x.id===id);const target=beds.find(b=>b.id===bedId&&b.unitId===unitId);
  if(!p||!target||bedIsOccupied(target)){showToast('Target bed is not available.','error');return;}
  if(guardWrite()||!canWriteTouchedUnits([unitId]))return;
  const started=new Date();const date=formatLocalAdmissionDate(started);const time=formatLocalAdmissionTime(started);const oldUnitName=units.find(u=>u.id===p.unitId)?.name||'Unit';
  try{
   const next=resetForNewAdmission(p,unitId,bedId,oldUnitName,date,time,toLocalIsoTimestamp(started),DepartmentService.getDepartmentForUnit(unitId)?.id);
   const nextWithUnits={...next,unitIds:Array.from(new Set([...(p.unitIds||[]),p.unitId,unitId]))};
   commitClinicalState(patients.map(x=>x.id===id?nextWithUnits:x),beds.map(b=>b.id===bedId?{...b,patientId:id,status:nextWithUnits.status}:b));
   recordDepartmentLifecycle(nextWithUnits,unitId,'Patient readmitted',`${p.fullName} was readmitted to ${units.find(u=>u.id===unitId)?.name||unitId}.`,`Admission date/time: ${date} ${time}. Bed: ${target.bedNumber||target.id}. Diagnosis: ${nextWithUnits.primaryDiagnosis||'Not recorded'}.`,started.getTime());
  }catch(error){showToast('Re-admission blocked. Nothing was changed.','error');}
 };
 const deletePatientPermanently=(id:string)=>{commitPatients(patients.filter(p=>p.id!==id));commitBeds(beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));};
 const addUnit=(name:string,type:string,initialBedsCount=3):Unit=>{
  const id=`unit-${Date.now()}`;
  const ownerUid=currentFirebaseUid(currentUser?.userId);
  const totalBeds=normalizeBedCount(initialBedsCount);
  // The rules make the creator the unit's consultant and require these fields.
  const unit:Unit={id,name:name.trim(),type,totalBeds,createdBy:ownerUid,consultantUid:ownerUid,createdAtMs:Date.now(),capacityLocked:false};
  // The bed documents are provisioned by completeUnitSetup after this returns.
  // Registering the unit as pending here is what stops the realtime listeners
  // from replacing these beds with a cloud snapshot taken before they existed,
  // and it is what makes the retry reachable from the Units screen.
  if(!isLocalPreview())markUnitBedsPending(id,totalBeds);
  commitUnits([...units,unit]);commitBeds([...beds,...desiredBeds(id,totalBeds)]);
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
 const completeUnitSetup=async(unitId:string):Promise<UnitSetupResult>=>{
  const unit=StorageService.getUnits().find(item=>item.id===unitId);
  const expected=normalizeBedCount(unit?.totalBeds);
  const presentNow=()=>StorageService.getBeds().filter(bed=>bed.unitId===unitId).length;
  if(!unit)return{ok:false,unitId,expected:0,present:0,created:0,missing:[],message:'This unit is no longer on this device.'};
  if(subscriptionLocked)return{ok:false,unitId,expected,present:presentNow(),created:0,missing:[],message:'This workspace is read-only until the subscription is renewed.'};
  if(isLocalPreview()){
   if(!canWriteTouchedUnits([unitId]))return{ok:false,unitId,expected,present:presentNow(),created:0,missing:[],message:'This unit is read-only until its own trial or subscription is active.'};
   const existing=StorageService.getBeds();
   const expectedBeds=desiredBeds(unitId,expected);
   const known=new Set(existing.filter(bed=>bed.unitId===unitId).map(bed=>String(bed.id)));
   const missing=expectedBeds.filter(bed=>!known.has(String(bed.id)));
   if(missing.length)commitBeds([...existing,...missing]);
   const savedIds=new Set(StorageService.getBeds().map(bed=>String(bed.id)));
   const present=expectedBeds.filter(bed=>savedIds.has(String(bed.id))).length;
   if(present<expected)return{ok:false,unitId,expected,present,created:missing.length,missing:expectedBeds.flatMap((bed,index)=>savedIds.has(String(bed.id))?[]:[index+1]),message:'Some beds could not be saved locally.'};
   lockUnitCapacity(unitId);
   clearUnitBedsPending(unitId);
   return{ok:true,unitId,expected,present,created:missing.length,missing:[],message:'Saved in the isolated local preview.'};
  }
  try{
   // A failure here is not fatal: the bed step reports its own failure, and a
   // member cannot even register a unit the cloud has not received yet.
   const uploaded=await syncCurrentUserNow();
   if(!uploaded)console.warn('Unit setup: the workspace upload did not complete. Verifying the beds anyway.');
   if(!await isMasterAccount()){
    try{await registerCreatedUnit(unitId);}
    catch(error){throw new Error(`The unit could not be added to your team membership: ${String((error as any)?.message||error)}`);}
   }
   const ensured=await ensureUnitBedsNow(unitId,expected);
   applyCloudBeds(ensured.beds);
   // The local flag moves first: a sync that is already running may still hold
   // the pre-lock unit record, and uploading that copy after the cloud write
   // would silently re-open a capacity that was just closed.
   lockUnitCapacity(unitId);
   await setUnitCapacityLocked(unitId,true);
   clearUnitBedsPending(unitId);
   return{...ensured,ok:true};
  }catch(error:any){
   const raw=String(error?.message||error);
   // The rules let the platform owner add a bed to a locked unit, but not the
   // unit's consultant: he may resize it only while the provisioning window is
   // open. Saying so is the difference between a dead end and a phone call.
   const message=/permission|insufficient/i.test(raw)
    ? 'Only the workspace owner can add beds to this unit now. Ask the workspace owner to finish the setup.'
    : raw;
   console.warn('Unit setup incomplete:',error);
   markUnitBedsPending(unitId,expected);
   // Report the cloud count when the verification reached the cloud; the local
   // count would say "20 of 20 saved" about a unit whose beds never landed.
   const cloudPresent=error instanceof UnitBedsIncompleteError?error.present:presentNow();
   return{ok:false,unitId,expected,present:cloudPresent,created:0,missing:[],message};
  }
 };
 // Finishes a unit creation in the cloud, in the only order the rules accept.
 const finalizeUnitCreation=async(unitId:string):Promise<void>=>{
  const result=await completeUnitSetup(unitId);
  if(result.ok){
   showToast(isLocalPreview()?`Unit saved locally with ${result.present} ${result.present===1?'bed':'beds'}.`:`Unit created with ${result.present} ${result.present===1?'bed':'beds'}. Only the owner can change its number of beds now.`,'success');
   return;
  }
  showToast(isLocalPreview()?`Unit saved locally, but only ${result.present} of ${result.expected} beds were created. ${result.message}`:`Unit created, but only ${result.present} of ${result.expected} beds are in the cloud. ${result.message} Open Manage Units and tap "Finish setup" to retry.`,'error');
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

 const updateUnit=(id:string,name:string,type:string,extra:Partial<Unit>={})=>commitUnits(units.map(u=>u.id===id?{...u,name,type,...extra}:u));
 const deleteUnit=(id:string)=>{if(units.length<=1){showToast('Cannot delete the last clinical unit.','error');return false;}const activeIds=new Set(patients.filter(p=>!p.isArchived&&p.unitId===id).map(p=>p.id));if(activeIds.size>0||beds.some(b=>b.unitId===id&&b.patientId&&activeIds.has(b.patientId))){showToast('Transfer or discharge active patients before deleting this unit.','error');return false;}commitUnits(units.filter(u=>u.id!==id));commitBeds(beds.filter(b=>b.unitId!==id));clearUnitBedsPending(id);if(currentUnitId===id)setCurrentUnitId(units.find(u=>u.id!==id)?.id||null);return true;};
 const addBed=(unitId:string,bedNumber?:string)=>{const n=beds.filter(b=>b.unitId===unitId).length+1;const bed={id:`bed-${unitId}-${Date.now()}`,unitId,bedNumber:bedNumber||`Bed ${n}`,status:'Empty' as BedStatus};commitBeds([...beds,bed]);commitUnits(units.map(u=>u.id===unitId?{...u,totalBeds:u.totalBeds+1}:u));void notifyClinicalData(`تم إضافة سرير جديد: ${bed.bedNumber}.`,'تمت إضافة بيانات جديدة',{unitId:bed.unitId,type:'bed-update'});return bed;};
 const removeBed=(id:string)=>{const bed=beds.find(b=>b.id===id);if(!bed||bedIsOccupied(bed))return false;const count=beds.filter(b=>b.unitId===bed.unitId).length;if(count<=1)return false;commitBeds(beds.filter(b=>b.id!==id));commitUnits(units.map(u=>u.id===bed.unitId?{...u,totalBeds:Math.max(1,u.totalBeds-1)}:u));return true;};
 const syncNow=async()=>{if(isLocalPreview()){showToast('Cloud sync is disabled in the isolated local preview.','info');return;}setIsSyncing(true);try{const ok=await syncCurrentUserNow();if(!ok){const detail=localStorage.getItem('cardiovault_last_cloud_sync_error_detail')||'No authenticated Firebase user or sync failed.';throw new Error(detail);}setLastSyncTime(new Date().toLocaleTimeString());showToast('Cloud sync completed successfully.','success');}catch(error){console.warn(error);showToast('Cloud sync failed. Your data is saved on this device and will retry.','error');}finally{setIsSyncing(false);}};
 const resetDatabase=()=>{if(patients.length>0||units.length>0){const answer=window.prompt('This ERASES all units, beds and patients. Type RESET to confirm.');if(String(answer||'').trim().toUpperCase()!=='RESET'){showToast('Reset cancelled.','info');return;}}StorageService.resetToDefaultSeed();hydrateClinicalState();showToast('Database reset.','warning');};
 const currentPatient=patients.find(p=>p.id===currentPatientId);
  return <AppContext.Provider value={{theme,setTheme,toggleTheme,auth,loginWithGoogle,loginWithEmail,unlockWithPin,lockApp,logout,currentUser,setCurrentUser,currentView,setCurrentView,currentUnitId,setCurrentUnitId,currentPatientId,setCurrentPatientId,currentPatient,activePatientSection,setActivePatientSection,units,beds,patients,archivedPatients,getPatientById,getBedsByUnit,getUnitById,addPatient,updatePatient,dischargePatient,transferPatient,readmitPatient,deletePatientPermanently,addUnit,addPreviewUnits,finalizeUnitCreation,completeUnitSetup,updateUnit,lockUnitCapacity,deleteUnit,addBed,removeBed,isSearchOpen,setIsSearchOpen,isSyncing,lastSyncTime,syncNow,toasts,showToast,dismissToast,resetDatabase,privacySafeMonitor,setPrivacySafeMonitor,favoritePatientIds,toggleFavoritePatient,myWorkspaces,isTeamPickerOpen,isSwitchingTeam,openTeamPicker,closeTeamPicker,refreshWorkspaceIndex,switchWorkspace}}>{children}</AppContext.Provider>;
};
export const useApp=()=>{const c=useContext(AppContext);if(!c)throw new Error('useApp must be used inside AppProvider');return c;};
