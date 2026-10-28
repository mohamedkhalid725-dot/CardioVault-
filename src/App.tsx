import React,{lazy,Suspense,useEffect,useRef,useState}from'react';
import {App as CapacitorApp}from'@capacitor/app';
import {AppProvider,useApp}from'./context/AppContext';
import {AppHeader}from'./components/navigation/AppHeader';
import {BottomNav}from'./components/navigation/BottomNav';
import {LoginScreen}from'./components/auth/LoginScreen';
import {UnitAccessGate}from'./components/auth/UnitAccessGate';
import {DashboardClinicalCenter}from'./components/home/DashboardClinicalCenter';
import { SearchModal } from './components/search/SearchModal';

// ---------------------------------------------------------------------------
// Route-level code splitting
// ---------------------------------------------------------------------------
// Home stays eagerly imported so first paint never waits on a chunk. Every other
// view is fetched on first navigation. The .then() shims preserve each component's
// named export and therefore its exact props contract (the AppView union and the
// navigation code are untouched).
const UnitCensusView=lazy(()=>import('./components/census/UnitCensusView').then(m=>({default:m.UnitCensusView})));
const PatientFileView=lazy(()=>import('./components/patient/PatientFileView').then(m=>({default:m.PatientFileView})));
const ActivePatientsView=lazy(()=>import('./components/patients/ActivePatientsView').then(m=>({default:m.ActivePatientsView})));
const AddPatientPage=lazy(()=>import('./components/patient/AddPatientPage').then(m=>({default:m.AddPatientPage})));
const ArchiveView=lazy(()=>import('./components/archive/ArchiveView').then(m=>({default:m.ArchiveView})));
const CalculatorsHub=lazy(()=>import('./components/calculators/CalculatorsHub').then(m=>({default:m.CalculatorsHub})));
const SettingsView=lazy(()=>import('./components/settings/SettingsView').then(m=>({default:m.SettingsView})));
const HandoverView=lazy(()=>import('./components/handover/HandoverView').then(m=>({default:m.HandoverView})));
const TeamDirectoryView=lazy(()=>import('./components/team/TeamDirectoryView').then(m=>({default:m.TeamDirectoryView})));
const ProtocolLibraryView=lazy(()=>import('./components/protocols/ProtocolLibraryView').then(m=>({default:m.ProtocolLibraryView})));
const DepartmentStatisticsView=lazy(()=>import('./components/statistics/DepartmentStatisticsView').then(m=>({default:m.DepartmentStatisticsView})));
const AuditTrailView=lazy(()=>import('./components/audit/AuditTrailView').then(m=>({default:m.AuditTrailView})));
const TasksCenterView=lazy(()=>import('./components/worklist/TasksCenterView').then(m=>({default:m.TasksCenterView})));
const ResultsCenterView=lazy(()=>import('./components/results/ResultsCenterView').then(m=>({default:m.ResultsCenterView})));
const InstitutionSetupView=lazy(()=>import('./components/setup/InstitutionSetupView').then(m=>({default:m.InstitutionSetupView})));
const UnifiedWaitingView=lazy(()=>import('./components/waiting/UnifiedWaitingView').then(m=>({default:m.UnifiedWaitingView})));
const ClinicModeView=lazy(()=>import('./components/clinic/ClinicModeView').then(m=>({default:m.ClinicModeView})));
const PaymentPanel=lazy(()=>import('./components/settings/PaymentPanel').then(m=>({default:m.PaymentPanel})));
const MasterPatientFileView=lazy(()=>import('./components/patients/MasterPatientFileView').then(m=>({default:m.MasterPatientFileView})));
const OwnerRequestsPanel=lazy(()=>import('./components/settings/OwnerRequestsPanel').then(m=>({default:m.OwnerRequestsPanel})));
const EntitlementNotice=lazy(()=>import('./components/settings/EntitlementNotice').then(m=>({default:m.EntitlementNotice})));

// Inline loading state for a deferred view: deliberately identical in tone to
// BootSplash (dark canvas, cyan accent) so a slow chunk looks like the app
// breathing rather than a broken screen.
const ViewLoadingFallback:React.FC=()=>(
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
    <div className="w-10 h-10 rounded-full border-2 border-cyan-500/25 border-t-cyan-400 animate-spin"/>
    <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">Loading…</p>
  </div>
);
import {CheckCircle2,AlertCircle,Info,X,WifiOff}from'lucide-react';
import {Capacitor}from'@capacitor/core';
import {installWebRealtimeCloudSync} from'./services/webCloudSyncBridge';
import {ensureOwnerWorkspace,getStoredWorkspaceAccess,MASTER_ACCOUNT_EMAIL,MASTER_WORKSPACE_ID}from'./services/workspaceAccess';import {loadCurrentUserFromCloud,restoreLocalDataFromCloud}from'./services/cloudSyncBridge';
import {StorageService}from'./services/storage';
import './services/pdfArabicSupport';
import {installPdfDownloadBridge}from'./services/pdfDownloadBridge';
import {initializeClinicalNotifications,installClinicalNotificationActionHandler}from'./services/clinicalNotifications';
import {AppErrorBoundary} from './components/system/AppErrorBoundary';import {BootSplash}from'./components/system/BootSplash';
import {UpdateBanner}from'./components/common/UpdateBanner';
import {WorkspacePicker}from'./components/team/WorkspacePicker';
import {isLocalPreview}from'./config/localPreview';

let refreshTimer:ReturnType<typeof setTimeout>|null=null;
const scheduleClinicalRefresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshTimer=null;window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));},120);};
const snapshotData=(s:any):any=>{try{return typeof s?.data==='function'?s.data():(s?.data||{});}catch{return{};}};
const snapshotId=(s:any)=>String(s?.id||s?.documentId||s?.reference?.id||'');
const stripCloudMeta=(v:any)=>{if(!v||typeof v!=='object')return v;const{updatedAt,schemaVersion,...clinical}=v;return clinical;};
const replaceCollection=(collection:'units'|'beds'|'patients',event:any)=>{const snapshots=Array.isArray(event?.snapshots)?event.snapshots:[];const values=snapshots.map((s:any)=>({...stripCloudMeta(snapshotData(s)),id:snapshotId(s)})).filter((x:any)=>x.id);const previous=(StorageService as any)[collection==='units'?'getUnits':collection==='beds'?'getBeds':'getPatients']?.()||[];restoreLocalDataFromCloud(collection,values);if(previous.length!==values.length||JSON.stringify(previous)!==JSON.stringify(values)){localStorage.setItem('cardiovault_last_cloud_sync',new Date().toISOString());scheduleClinicalRefresh();}};

const AppContent:React.FC=()=>{const{auth,currentView,setCurrentView,setCurrentPatientId,setActivePatientSection,toasts,dismissToast,syncNow,myWorkspaces,isTeamPickerOpen,isSwitchingTeam,closeTeamPicker,switchWorkspace}=useApp();const[accessReady,setAccessReady]=useState(false);const[online,setOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine);const handlingPop=useRef(false);const[booted,setBooted]=useState(false);const[fading,setFading]=useState(false);
// Boot splash readiness (replaces the old unconditional 5s timer):
//   ready  = the session state is known AND the first data-load attempt has
//            finished (or the data wait expired), with a short floor
//   floor  = ~500ms so the branded splash never flickers for one frame
//   data   = ~2s max wait for the first cloud read after the session is known
//   ceiling= ~8s absolute safety net, so a dead network can never trap the user
// The session state is NEVER forced by the ceiling while it is still unknown:
// that is what used to flash the Login screen at a returning doctor.
const SPLASH_MIN_VISIBLE_MS=500, SPLASH_DATA_WAIT_MS=2000, SPLASH_MAX_VISIBLE_MS=8000, SPLASH_FADE_MS=280;
const persistedSessionAtBoot=useState(()=>!!StorageService.getAuth()?.isAuthenticated)[0];
const[authResolved,setAuthResolved]=useState(()=>!persistedSessionAtBoot);
const[firstDataAttemptDone,setFirstDataAttemptDone]=useState(()=>!persistedSessionAtBoot);
const[dataWaitExpired,setDataWaitExpired]=useState(()=>!persistedSessionAtBoot);
const[minVisibleElapsed,setMinVisibleElapsed]=useState(false);
useEffect(()=>{const floorTimer=setTimeout(()=>setMinVisibleElapsed(true),SPLASH_MIN_VISIBLE_MS);return()=>clearTimeout(floorTimer);},[]);
useEffect(()=>{if(auth.isAuthenticated||auth.isLocked)setAuthResolved(true);},[auth.isAuthenticated,auth.isLocked]);
// The data wait only starts once the session state is known, so the splash
// never ends into a half-restored session.
useEffect(()=>{if(!authResolved||firstDataAttemptDone||dataWaitExpired)return;const dataTimer=setTimeout(()=>setDataWaitExpired(true),SPLASH_DATA_WAIT_MS);return()=>clearTimeout(dataTimer);},[authResolved,firstDataAttemptDone,dataWaitExpired]);
useEffect(()=>{if(booted)return;const ceilingTimer=setTimeout(()=>{setAuthResolved(true);setFirstDataAttemptDone(true);setDataWaitExpired(true);setMinVisibleElapsed(true);},SPLASH_MAX_VISIBLE_MS);return()=>clearTimeout(ceilingTimer);},[booted]);
useEffect(()=>{if(booted||!authResolved||!minVisibleElapsed||(!firstDataAttemptDone&&!dataWaitExpired))return;setFading(true);const fadeTimer=setTimeout(()=>setBooted(true),SPLASH_FADE_MS);return()=>clearTimeout(fadeTimer);},[booted,authResolved,firstDataAttemptDone,dataWaitExpired,minVisibleElapsed]);
 // Firebase Authentication is the session source of truth. The old cardiovault_auth_v2
 // localStorage flag was removed with local clinical persistence, so relying on it
 // keeps successfully authenticated users trapped on the Login screen.
 const hasLocalSession=auth.isAuthenticated;
 useEffect(()=>{installPdfDownloadBridge();},[]); useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return;void initializeClinicalNotifications();void installClinicalNotificationActionHandler((extra:any)=>{if(extra?.patientId){setCurrentPatientId(String(extra.patientId));if(extra?.section)setActivePatientSection(String(extra.section) as any);setCurrentView('patient');}else if(extra?.type==='task')setCurrentView('my-worklist');});},[auth.isAuthenticated,auth.isLocked,hasLocalSession,setCurrentPatientId,setActivePatientSection,setCurrentView]);
 useEffect(()=>{const onOnline=()=>{setOnline(true);void syncNow();};const onOffline=()=>setOnline(false);window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};},[syncNow]);
 useEffect(()=>{let active=true;setAccessReady(false);if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return;const verify=async()=>{try{const valid=await (await import('./services/workspaceAccess')).validateCurrentWorkspaceAccess();if(active&&valid===true)setAccessReady(true);}catch(error){console.warn('Workspace access bootstrap failed:',error);}finally{if(active)setFirstDataAttemptDone(true);}};void verify();return()=>{active=false;};},[auth.isAuthenticated,auth.isLocked,hasLocalSession,auth.userEmail]);
 useEffect(()=>{const granted=()=>setAccessReady(true);const revoked=()=>setAccessReady(false);window.addEventListener('cardiovault-workspace-access-granted',granted);window.addEventListener('cardiovault-workspace-access-revoked',revoked);return()=>{window.removeEventListener('cardiovault-workspace-access-granted',granted);window.removeEventListener('cardiovault-workspace-access-revoked',revoked);};},[]);
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession||!accessReady)return;let active=true;if(isLocalPreview())return;const restore=async()=>{try{const result=await loadCurrentUserFromCloud();if(active&&result?.access)window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));}catch(error){console.warn('Authorized cloud restore failed:',error);}finally{if(active)setFirstDataAttemptDone(true);}};void restore();return()=>{active=false;};},[auth.isAuthenticated,auth.isLocked,hasLocalSession,accessReady,auth.userEmail]); useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession||!accessReady||Capacitor.isNativePlatform())return;if(isLocalPreview())return;let active=true;const start=async()=>{try{const stop=await installWebRealtimeCloudSync(()=>{if(active)window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));});return stop;}catch(error){console.warn('Web realtime cloud sync setup failed:',error);return ()=>{};}};let stop:(()=>void)|null=null;void start().then(fn=>{if(active)stop=fn;else fn();});return()=>{active=false;stop?.();};},[auth.isAuthenticated,auth.isLocked,hasLocalSession,accessReady,auth.userEmail]); useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession||!accessReady)return;if(!window.history.state?.cardiovault)window.history.replaceState({cardiovault:true,view:currentView},'');},[auth.isAuthenticated,auth.isLocked,hasLocalSession,accessReady,currentView]);
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession||!accessReady)return;if(handlingPop.current){handlingPop.current=false;return;}const current=window.history.state?.view;if(current!==currentView)window.history.pushState({cardiovault:true,view:currentView},'');},[currentView,auth.isAuthenticated,auth.isLocked,hasLocalSession,accessReady]);
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession||!accessReady)return;const onPop=()=>{const view=window.history.state?.view;if(view){handlingPop.current=true;setCurrentView(view);}};const onBack=async()=>{const overlays={handled:false};window.dispatchEvent(new CustomEvent('cardiovault-close-overlays',{detail:overlays}));if(overlays.handled)return;if(currentView==='patient'){const detail={handled:false};window.dispatchEvent(new CustomEvent('cardiovault-patient-back',{detail}));if(detail.handled)return;}if(window.history.length>1)window.history.back();else await CapacitorApp.exitApp();};window.addEventListener('popstate',onPop);let listener:{remove:()=>Promise<void>}|undefined;CapacitorApp.addListener('backButton',onBack).then(x=>{listener=x;}).catch(()=>{});return()=>{window.removeEventListener('popstate',onPop);void listener?.remove();};},[auth.isAuthenticated,auth.isLocked,hasLocalSession,accessReady,setCurrentView,currentView]);
 if(!booted)return <BootSplash fading={fading} onDismiss={()=>setBooted(true)}/>;if(!online&&!isLocalPreview())return <div className="min-h-screen bg-[#070B13] text-white flex items-center justify-center p-6"><div className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#0F172A] p-7 text-center shadow-2xl"><div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-4"><WifiOff className="w-7 h-7"/></div><h1 className="text-xl font-extrabold">Internet connection required</h1><p className="text-sm text-slate-400 mt-2">CardioVault is cloud-only. Clinical data is not available in Offline Mode. Reconnect to the internet to continue.</p><div className="mt-4 text-[11px] text-slate-500">Waiting for a secure cloud connection…</div></div></div>;
 if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession){if(isLocalPreview())return <div className="min-h-screen bg-[#070B13] text-white flex items-center justify-center p-6"><div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-[#0F172A] p-7 text-center"><h1 className="text-lg font-extrabold text-amber-300">Local preview did not start</h1><p className="text-sm text-slate-300 mt-2">The preview seed runs without Firebase. Reload the page; if this persists, open the browser console for the exact error.</p></div></div>;return <LoginScreen/>;}if(!accessReady)return <UnitAccessGate/>;const render=()=>{switch(currentView){case'home':return <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4"><DashboardClinicalCenter/></div>;case'census':return <UnitCensusView/>;case'handover':return <HandoverView/>;case'patient':return <PatientFileView/>;case'patients':return <ActivePatientsView/>;case'add-patient':return <AddPatientPage/>;case'archive':case'master-file':return <MasterPatientFileView/>;case'calculators':return <CalculatorsHub/>;case'my-worklist':return <TasksCenterView/>;case'team':return <TeamDirectoryView/>;case'protocols':return <ProtocolLibraryView/>;case'statistics':return <DepartmentStatisticsView/>;case'audit-trail':return <AuditTrailView/>;case'settings':return <SettingsView/>;case'results-center':return <ResultsCenterView/>;case'institution-setup':return <InstitutionSetupView/>;case'waiting-list':case'operation-waiting':return <UnifiedWaitingView/>;case'clinic':return <ClinicModeView/>;case'payments':return <div className="max-w-3xl mx-auto w-full px-3 sm:px-6 py-4"><PaymentPanel/></div>;case'owner-requests':return <div className="max-w-3xl mx-auto w-full px-3 sm:px-6 py-4"><OwnerRequestsPanel/></div>;default:return <DashboardClinicalCenter/>;}};return <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070B13] text-slate-900 dark:text-slate-100 transition-colors duration-200"><UpdateBanner/><WorkspacePicker open={isTeamPickerOpen} workspaces={myWorkspaces} activeWorkspaceId={getStoredWorkspaceAccess()?.workspaceId} busy={isSwitchingTeam} onSelect={(workspaceId:string)=>void switchWorkspace(workspaceId)} onClose={closeTeamPicker}/><AppHeader/><main className="flex-1 w-full safe-bottom-content">{isLocalPreview()&&<div className="bg-amber-500 text-slate-950 text-[11px] font-bold text-center py-1 px-2">LOCAL PREVIEW — mock data only. No Firebase, no live writes.</div>}{isLocalPreview()&&<Suspense fallback={null}><EntitlementNotice/></Suspense>}<Suspense fallback={<ViewLoadingFallback/>}>{render()}</Suspense></main><BottomNav/><SearchModal/><div className="fixed bottom-[calc(4.5rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] md:bottom-[calc(1rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">{toasts.map(t=><div key={t.id} className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-xl border text-xs backdrop-blur-md ${t.type==='success'?'bg-emerald-950/90 border-emerald-500/40 text-emerald-100':t.type==='error'?'bg-rose-950/90 border-rose-500/40 text-rose-100':t.type==='warning'?'bg-amber-950/90 border-amber-500/40 text-amber-100':'bg-slate-900/90 border-slate-700 text-slate-100'}`}><div className="flex items-center gap-2.5">{t.type==='success'?<CheckCircle2 className="w-4 h-4 text-emerald-400"/>:t.type==='error'?<AlertCircle className="w-4 h-4 text-rose-400"/>:<Info className="w-4 h-4 text-cyan-400"/>}<span className="font-medium leading-tight">{t.message}</span></div><button onClick={()=>dismissToast(t.id)} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0 ml-2"><X className="w-3.5 h-3.5"/></button></div>)}</div></div>};
export default function App(){return <AppErrorBoundary><AppProvider><AppContent/></AppProvider></AppErrorBoundary>;}
