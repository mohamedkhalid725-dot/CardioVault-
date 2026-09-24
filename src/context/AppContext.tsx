import React,{createContext,useContext,useEffect,useRef,useState}from'react';
import {Bed,Patient,PatientSectionId,PatientStatus,PastAdmission,Unit,AuditEvent,UserProfile}from'../types/clinical';
import {StorageService}from'../services/storage';
import {AuthorizationService, PRESET_USERS, ACCESS_DENIED_MESSAGE}from'../services/authorizationService';
import {DepartmentService}from'../services/departmentService';
import {AuditTrailService}from'../services/auditTrailService';
import {FirebaseAuthentication}from'@capacitor-firebase/authentication';
import {webCurrentUser,webGoogleSignIn,checkWebRedirectResult,webEmailSignIn,webEmailCreate,webSignOut} from'../services/webFirebase';
import {Capacitor}from'@capacitor/core';
import {clearActiveClinicalWorkspace,installCloudSyncBridge,loadCurrentUserFromCloud,syncCurrentUserNow}from'../services/cloudSyncBridge';
import {isMasterAccount,ensureOwnerWorkspace,validateCurrentWorkspaceAccess,setStoredWorkspaceAccess} from '../services/workspaceAccess';
import {notifyClinicalData} from'../services/clinicalNotifications';

export type AppView='login'|'home'|'census'|'patient'|'patients'|'add-patient'|'archive'|'calculators'|'settings'|'handover'|'my-worklist'|'team'|'protocols'|'statistics'|'audit-trail'|'ai-assistant'|'results-center';
interface AuthState{isAuthenticated:boolean;userEmail:string;userName:string;pinCode:string;isLocked:boolean;}
interface ToastInfo{id:string;message:string;type:'success'|'info'|'warning'|'error';}
interface AppContextType{
  theme:'dark'|'light';
  setTheme:(theme:'dark'|'light')=>void;
  toggleTheme:()=>void;
  auth:AuthState;
  loginWithGoogle:()=>Promise<void>;
  loginWithEmail:(email:string)=>void;
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
  updatePatient:(id:string,updates:Partial<Patient>)=>void;
  dischargePatient:(id:string,reason:string,summary:string)=>void;
  transferPatient:(id:string,unitId:string,bedId:string)=>void;
  readmitPatient:(id:string,unitId:string,bedId:string)=>void;
  deletePatientPermanently:(id:string)=>void;
  addUnit:(name:string,type:string,initialBedsCount?:number)=>Unit;
  updateUnit:(id:string,name:string,type:string)=>void;
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
}
const AppContext=createContext<AppContextType|undefined>(undefined);

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
   const b=DepartmentService.reconcileBedsWithPatients(StorageService.getBeds(), StorageService.getPatients());
   const p=StorageService.getPatients();
   setUnits(u);setBeds(b);setPatients(p);
   setCurrentUnitId(prev=>prev&&u.some(x=>x.id===prev)?prev:(u[0]?.id||null));
   setCurrentPatientId(prev=>prev&&p.some(x=>x.id===prev&&!x.isArchived)?prev:(p.find(x=>!x.isArchived)?.id||null));
 };
 useEffect(()=>{const onRestore=()=>hydrateClinicalState();window.addEventListener('cardiovault-data-restored',onRestore);window.addEventListener('cardiovault-workspace-access-granted',onRestore);return()=>{window.removeEventListener('cardiovault-data-restored',onRestore);window.removeEventListener('cardiovault-workspace-access-granted',onRestore);};},[]);
 useEffect(()=>{if(!Capacitor.isNativePlatform())return;let handle:{remove:()=>Promise<void>}|null=null;const attach=async()=>{try{handle=await FirebaseAuthentication.addListener('authStateChange',async({user}:any)=>{if(!user?.uid){if(Date.now()<authNullGraceUntil.current)return;const saved=StorageService.getAuth();if(!saved.isAuthenticated)return;let recovered:any=null;try{recovered=await waitForNativeFirebaseUser();}catch{}if(recovered?.uid){authNullGraceUntil.current=0;const profile=AuthorizationService.resolveUserForFirebaseAuth(recovered);setCurrentUserState(profile);const session={...saved,isAuthenticated:true,isLocked:false,userEmail:recovered.email||saved.userEmail,userName:StorageService.getProfileName()||saved.userName||recovered.displayName||recovered.email?.split('@')[0],pinCode:''};StorageService.saveAuth(session);setAuth(session);return;}const signedOut={...saved,isAuthenticated:false,isLocked:false,pinCode:''};clearActiveClinicalWorkspace();StorageService.saveAuth(signedOut);setAuth(signedOut);setCurrentView('login');return;}authNullGraceUntil.current=0;const profile=AuthorizationService.resolveUserForFirebaseAuth(user);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...StorageService.getAuth(),isAuthenticated:true,isLocked:false,userEmail:user.email||'',userName:StorageService.getProfileName()||user.displayName||user.email?.split('@')[0]||'Physician',pinCode:''};StorageService.saveAuth(session);setAuth(session);setCurrentView('home');localStorage.setItem('cardiovault_google_uid',user.uid);void (async()=>{try{if(await isMasterAccount()){await ensureOwnerWorkspace();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}const cloud=await loadCurrentUserFromCloud();if(cloud?.found||cloud?.access)hydrateClinicalState();if(cloud?.access)window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));}catch(error){console.warn('Native auth state cloud restore failed:',error);}})();});}catch(error){console.warn('Native Firebase auth listener failed:',error);}};void attach();return()=>{if(handle)void handle.remove();};},[]);
 useEffect(()=>{let active=true;installCloudSyncBridge();const boot=async()=>{const savedAuth=StorageService.getAuth();setThemeState(StorageService.getTheme());if(!Capacitor.isNativePlatform()){const redirectedUser=await checkWebRedirectResult();const webUser=redirectedUser||webCurrentUser();if(webUser){const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:webUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||webUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);localStorage.setItem('cardiovault_google_uid',webUser.uid);setCurrentUserState(AuthorizationService.resolveUserForFirebaseAuth(webUser));hydrateClinicalState();setCurrentView('home');void loadCurrentUserFromCloud();}else{setAuth({...savedAuth,isAuthenticated:false,isLocked:false});setCurrentView('login');}return;}const firebaseUser=await waitForNativeFirebaseUser();if(!firebaseUser?.uid){clearActiveClinicalWorkspace();const signedOut={...savedAuth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(signedOut);StorageService.saveAuth(signedOut);setCurrentView('login');return;}const profile=AuthorizationService.resolveUserForFirebaseAuth(firebaseUser);setCurrentUserState(profile);setStoredWorkspaceAccess(null);const session={...savedAuth,isAuthenticated:true,isLocked:false,userEmail:firebaseUser.email||savedAuth.userEmail,userName:StorageService.getProfileName()||savedAuth.userName||firebaseUser.displayName,pinCode:''};setAuth(session);StorageService.saveAuth(session);hydrateClinicalState();setCurrentView('home');try{const cloud=await loadCurrentUserFromCloud();if(!active)return;if(cloud?.found)hydrateClinicalState();setLastSyncTime(cloud?.found?new Date().toLocaleTimeString():'');}catch(error){console.warn('Cloud session restore failed:',error);}};void boot();return()=>{active=false;};},[]);
 useEffect(()=>{if(!auth.isAuthenticated)return;let active=true;const check=async()=>{try{if(await isMasterAccount())return;const valid=await validateCurrentWorkspaceAccess();if(valid===false&&active){logout();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-revoked'));showToast('Your Unit Access Code has been changed or revoked. Please sign in again with the new code.','warning');}}catch(error){console.warn('Workspace access monitor failed:',error);}};const initial=window.setTimeout(()=>void check(),3000);const timer=window.setInterval(()=>void check(),15000);return()=>{active=false;window.clearTimeout(initial);window.clearInterval(timer);};},[auth.isAuthenticated]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.classList.toggle('light',theme==='light');},[theme]);

 const showToast=(message:string,type:ToastInfo['type']='info')=>{const id=`toast-${Date.now()}-${Math.random()}`;setToasts(p=>[...p,{id,message,type}]);window.setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);};
 const dismissToast=(id:string)=>setToasts(p=>p.filter(t=>t.id!==id));
 const setTheme=(t:'dark'|'light')=>{setThemeState(t);StorageService.saveTheme(t);};const toggleTheme=()=>setTheme(theme==='dark'?'light':'dark');
 const loginWithGoogle=async()=>{
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
     const profile=AuthorizationService.resolveUserForFirebaseAuth(user);setCurrentUserState(profile);const a={...auth,isAuthenticated:true,isLocked:false,pinCode:'',userEmail:user.email||auth.userEmail,userName:StorageService.getProfileName()||auth.userName||user.displayName};
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
 const loginWithEmail=(email:string)=>{const clean=email.trim().toLowerCase();if(!clean)return;setStoredWorkspaceAccess(null);const a={...auth,isAuthenticated:true,isLocked:false,pinCode:'',userEmail:clean,userName:auth.userName||clean.split('@')[0]};setAuth(a);StorageService.saveAuth(a);setCurrentView('home');};
 const unlockWithPin=(_pin:string)=>{showToast('PIN / Offline access has been disabled. Sign in with your Firebase account.','warning');return false;};const lockApp=()=>{showToast('Offline lock screen is disabled. Use Sign Out to end the session.','info');};
 const logout=()=>{authNullGraceUntil.current=0;void (Capacitor.isNativePlatform()?FirebaseAuthentication.signOut():webSignOut()).catch(error=>console.warn('Firebase sign-out failed:',error));localStorage.removeItem('cardiovault_google_uid');clearActiveClinicalWorkspace();setUnits([]);setBeds([]);setPatients([]);setCurrentUnitId(null);setCurrentPatientId(null);const a={...auth,isAuthenticated:false,isLocked:false,pinCode:''};setAuth(a);StorageService.saveAuth(a);setCurrentView('login');};
 const getPatientById=(id:string)=>patients.find(p=>p.id===id);const getBedsByUnit=(id:string)=>beds.filter(b=>b.unitId===id);const getUnitById=(id:string)=>units.find(u=>u.id===id);const archivedPatients=patients.filter(p=>p.isArchived);
 const commitPatients=(next:Patient[])=>{setPatients(next);StorageService.savePatients(next);};const commitBeds=(next:Bed[])=>{setBeds(next);StorageService.saveBeds(next);};const commitUnits=(next:Unit[])=>{setUnits(next);StorageService.saveUnits(next);};
 const clinicalLabel=(updates:Partial<Patient>)=>{const labels:Record<string,string>={clinicalSummary:'History / Clinical Summary',examination:'Physical Examination',vitalsHistory:'Vitals',fluidRecords:'Fluid Balance',hemodynamicHistory:'Hemodynamics',fluidIntakeHistory:'Fluid Intake',urineOutputHistory:'Urine Output',ecgRecords:'ECG',labs:'Laboratory Results',imaging:'Imaging',imagingStudies:'Imaging',medications:'Medications',procedures:'Procedures / Interventions',cardiology:'Cardiology Data',ventilator:'ICU / Ventilator Data',calculatorResults:'Calculator Result',progressNotes:'Progress Note'};const key=Object.keys(updates).find(k=>labels[k]);return key?labels[key]:'Patient Data';};
 const bedIsOccupied=(bed:Bed)=>{if(!bed.patientId)return false;const owner=patients.find(p=>p.id===bed.patientId);return !!owner&&!owner.isArchived;};
 const addPatient=(data:Partial<Patient>,targetBedId?:string):Patient=>{const unitId=data.unitId||'';const bedId=targetBedId||data.bedId||'';if(!unitId||!bedId)throw new Error('Patient admission requires an explicit unit and bed.');const bed=beds.find(b=>b.id===bedId&&b.unitId===unitId);if(!bed)throw new Error('Selected bed does not belong to the selected unit.');if(bedIsOccupied(bed))throw new Error('Selected bed is already occupied.');const stamp=new Date();const date=stamp.toISOString().split('T')[0];const time=stamp.toTimeString().slice(0,5);const id=`patient-${Date.now()}`;const allergies=data.allergies||['NKDA'];const p:Patient={id,mrn:data.mrn||`MRN-${Math.floor(100000+Math.random()*900000)}`,fullName:data.fullName||'New Patient',age:data.age??0,sex:data.sex||'Other',weight:data.weight??0,height:data.height??0,photoUrl:data.photoUrl,unitId,bedId,status:data.status||'Stable',admissionDate:data.admissionDate||date,admissionTime:data.admissionTime||time,primaryDiagnosis:data.primaryDiagnosis||'Clinical Admission',secondaryDiagnoses:data.secondaryDiagnoses||[],allergies,codeStatus:data.codeStatus||'Full Code',isArchived:false,pastAdmissions:[],clinicalSummary:data.clinicalSummary||{chiefComplaint:'',hpi:'',pmh:[],psh:[],drugHistory:'',allergies,familyHistory:'',socialHistory:''},cardiovascularHistory:data.cardiovascularHistory||{hypertension:false,diabetes:false,dyslipidemia:false,cad:false,previousMI:false,heartFailure:false,arrhythmias:false,valvularDisease:false,previousPCI:false,previousCABG:false,previousStroke:false,pvd:false,smoking:false,alcohol:false,previousAdmissions:'',previousICU:'',other:''},vitalsHistory:data.vitalsHistory||[],fluidRecords:data.fluidRecords||[],hemodynamicHistory:data.hemodynamicHistory||[],fluidIntakeHistory:data.fluidIntakeHistory||[],urineOutputHistory:data.urineOutputHistory||[],examination:data.examination||{general:{appearance:'',consciousness:'',distress:'',hydration:'',pallor:false,cyanosis:false,jaundice:false,edema:''},cardiovascular:{jvp:'',heartSounds:'',murmurs:'',peripheralPulses:'',edema:'',perfusion:''},respiratory:{chestExam:'',airEntry:'',addedSounds:'',workOfBreathing:''},abdomen:{inspection:'',palpation:'',tenderness:'',organomegaly:'',ascites:''},neurological:{consciousness:'',gcs:'',pupils:'',motor:'',sensory:'',reflexes:''},extremities:{pulses:'',edema:'',temp:'',perfusion:''},customFields:[]},ecgRecords:data.ecgRecords||[],cardiology:data.cardiology||{rhythm:'',heartRate:0,bp:'',heartFailureStatus:'',nyha:'',killip:'',congestion:'',perfusion:'',echoBriefSummary:'',echo:{ef:0,lvDimensions:'',lvFunction:'',rvFunction:'',rwma:'',la:'',ra:'',mr:'',ar:'',as:'',ms:'',tr:'',pr:'',pasp:0,ivc:'',pericardium:'',otherFindings:''},biomarkers:{troponin:'',ckmb:'',bnp:'',ntProBnp:''},coronary:{cath:'',coronaryFindings:'',pci:'',stent:'',cabg:''},antithrombotic:{antiplatelet:'',anticoagulation:'',thrombolysis:''},cathRecords:[],biomarkerRecords:[],devicesList:[],hemodynamicsList:[]},medications:data.medications||[],ventilator:data.ventilator||{mode:'',fio2:21,peep:0,tidalVolume:0,rr:0,pressureSupport:0,inspiratoryPressure:0,ieRatio:'',peakPressure:0,plateauPressure:0,meanAirwayPressure:0,spo2:0,etco2:0,compliance:0,resistance:0,abgHistory:[]},imaging:data.imaging||[],labs:data.labs||[],procedures:data.procedures||[],calculatorResults:data.calculatorResults||[],progressNotes:data.progressNotes||[],auditTrail:[{id:`audit-${Date.now()}-admission`,timestamp:new Date().toISOString(),action:'Patient admitted',fields:['patient'],actor:auth.userName||'Physician'}]};commitPatients([p,...patients]);commitBeds(beds.map(b=>b.id===bedId?{...b,patientId:id,status:p.status}:b));setCurrentPatientId(id);showToast(`${p.fullName} admitted successfully.`,'success');void notifyClinicalData(`تم إضافة مريض جديد: ${p.fullName}`,'تمت إضافة بيانات جديدة',{patientId:p.id,unitId:p.unitId,section:'overview',type:'new-patient'});return p;};
 const updatePatient=(id:string,updates:Partial<Patient>)=>{const target=patients.find(p=>p.id===id);if(!target)return;const timestamp=new Date().toISOString();const fields=Object.keys(updates).filter(k=>k!=='auditTrail');const audit:AuditEvent={id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,timestamp,action:clinicalLabel(updates),fields,actor:auth.userName||'Physician'};const next=patients.map(p=>p.id===id?{...p,...updates,auditTrail:[audit,...(p.auditTrail||[])]}:p);commitPatients(next);if(updates.status&&target.bedId)commitBeds(beds.map(b=>b.id===target.bedId?{...b,status:updates.status as PatientStatus}:b));void notifyClinicalData(`تم إضافة/تحديث ${clinicalLabel(updates)} للمريض ${target.fullName}.`,'تم تحديث بيانات المريض',{patientId:target.id,unitId:target.unitId,section:Object.keys(updates).includes('vitalsHistory')?'vitals':Object.keys(updates).includes('investigations')||Object.keys(updates).includes('consultations')?'orders':Object.keys(updates).includes('medications')?'medication':Object.keys(updates).includes('ventilator')?'icu':'overview',type:'patient-update'});};
 const dischargePatient=(id:string,reason:string,summary:string)=>{const p=patients.find(x=>x.id===id);if(!p)return;const unit=units.find(u=>u.id===p.unitId);const past:PastAdmission={id:`adm-${Date.now()}`,admissionDate:p.admissionDate,dischargeDate:new Date().toISOString().split('T')[0],unitName:unit?.name||'Unit',dischargeReason:reason as PastAdmission['dischargeReason'],dischargeSummary:summary||'',primaryDiagnosis:p.primaryDiagnosis};commitPatients(patients.map(x=>x.id===id?{...x,isArchived:true,archiveReason:reason,archiveDate:past.dischargeDate,pastAdmissions:[past,...(x.pastAdmissions||[])],dischargeSummary:summary}:x));commitBeds(beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));setCurrentView('archive');};
 const transferPatient=(id:string,unitId:string,bedId:string)=>{const p=patients.find(x=>x.id===id);const target=beds.find(b=>b.id===bedId&&b.unitId===unitId);if(!p||!target||bedIsOccupied(target)){showToast('Target bed is not available.','error');return;}commitBeds(beds.map(b=>b.id===p.bedId?{...b,patientId:undefined,status:'Empty'}:b.id===bedId?{...b,patientId:id,status:p.status}:b));commitPatients(patients.map(x=>x.id===id?{...x,unitId,bedId}:x));};
 const readmitPatient=(id:string,unitId:string,bedId:string)=>{const p=patients.find(x=>x.id===id);const target=beds.find(b=>b.id===bedId&&b.unitId===unitId);if(!p||!target||bedIsOccupied(target)){showToast('Target bed is not available.','error');return;}commitBeds(beds.map(b=>b.id===bedId?{...b,patientId:id,status:p.status}:b));commitPatients(patients.map(x=>x.id===id?{...x,isArchived:false,archiveReason:undefined,archiveDate:undefined,unitId,bedId,admissionDate:new Date().toISOString().split('T')[0],admissionTime:new Date().toTimeString().slice(0,5)}:x));};
 const deletePatientPermanently=(id:string)=>{commitPatients(patients.filter(p=>p.id!==id));commitBeds(beds.map(b=>b.patientId===id?{...b,patientId:undefined,status:'Empty'}:b));};
 const addUnit=(name:string,type:string,initialBedsCount=3):Unit=>{const id=`unit-${Date.now()}`;const unit={id,name:name.trim(),type,totalBeds:initialBedsCount};const newBeds=Array.from({length:initialBedsCount},(_,i)=>({id:`bed-${id}-${i+1}`,unitId:id,bedNumber:`Bed ${i+1}`,status:'Empty' as PatientStatus}));commitUnits([...units,unit]);commitBeds([...beds,...newBeds]);void notifyClinicalData(`تم إضافة وحدة جديدة: ${unit.name}.`,'تمت إضافة بيانات جديدة',{unitId:unit.id,type:'unit-update'});return unit;};
 const updateUnit=(id:string,name:string,type:string)=>commitUnits(units.map(u=>u.id===id?{...u,name,type}:u));
 const deleteUnit=(id:string)=>{if(units.length<=1){showToast('Cannot delete the last clinical unit.','error');return false;}const activeIds=new Set(patients.filter(p=>!p.isArchived&&p.unitId===id).map(p=>p.id));if(activeIds.size>0||beds.some(b=>b.unitId===id&&b.patientId&&activeIds.has(b.patientId))){showToast('Transfer or discharge active patients before deleting this unit.','error');return false;}commitUnits(units.filter(u=>u.id!==id));commitBeds(beds.filter(b=>b.unitId!==id));if(currentUnitId===id)setCurrentUnitId(units.find(u=>u.id!==id)?.id||null);return true;};
 const addBed=(unitId:string,bedNumber?:string)=>{const n=beds.filter(b=>b.unitId===unitId).length+1;const bed={id:`bed-${unitId}-${Date.now()}`,unitId,bedNumber:bedNumber||`Bed ${n}`,status:'Empty' as PatientStatus};commitBeds([...beds,bed]);commitUnits(units.map(u=>u.id===unitId?{...u,totalBeds:u.totalBeds+1}:u));void notifyClinicalData(`تم إضافة سرير جديد: ${bed.bedNumber}.`,'تمت إضافة بيانات جديدة',{unitId:bed.unitId,type:'bed-update'});return bed;};
 const removeBed=(id:string)=>{const bed=beds.find(b=>b.id===id);if(!bed||bedIsOccupied(bed))return false;const count=beds.filter(b=>b.unitId===bed.unitId).length;if(count<=1)return false;commitBeds(beds.filter(b=>b.id!==id));commitUnits(units.map(u=>u.id===bed.unitId?{...u,totalBeds:Math.max(1,u.totalBeds-1)}:u));return true;};
 const syncNow=async()=>{setIsSyncing(true);try{const ok=await syncCurrentUserNow();if(!ok){const detail=localStorage.getItem('cardiovault_last_cloud_sync_error_detail')||'No authenticated Firebase user or sync failed.';throw new Error(detail);}setLastSyncTime(new Date().toLocaleTimeString());showToast('Cloud sync completed successfully.','success');}catch(error){console.warn(error);const message=String((error as any)?.message||error||'Cloud sync failed').slice(0,300);showToast(`Cloud sync failed: ${message}`,'error');}finally{setIsSyncing(false);}};
 const resetDatabase=()=>{StorageService.resetToDefaultSeed();hydrateClinicalState();showToast('Database reset to clinical sample.','warning');};
 const currentPatient=patients.find(p=>p.id===currentPatientId);
 return <AppContext.Provider value={{theme,setTheme,toggleTheme,auth,loginWithGoogle,loginWithEmail,unlockWithPin,lockApp,logout,currentUser,setCurrentUser,currentView,setCurrentView,currentUnitId,setCurrentUnitId,currentPatientId,setCurrentPatientId,currentPatient,activePatientSection,setActivePatientSection,units,beds,patients,archivedPatients,getPatientById,getBedsByUnit,getUnitById,addPatient,updatePatient,dischargePatient,transferPatient,readmitPatient,deletePatientPermanently,addUnit,updateUnit,deleteUnit,addBed,removeBed,isSearchOpen,setIsSearchOpen,isSyncing,lastSyncTime,syncNow,toasts,showToast,dismissToast,resetDatabase,privacySafeMonitor,setPrivacySafeMonitor,favoritePatientIds,toggleFavoritePatient}}>{children}</AppContext.Provider>;
};
export const useApp=()=>{const c=useContext(AppContext);if(!c)throw new Error('useApp must be used inside AppProvider');return c;};
