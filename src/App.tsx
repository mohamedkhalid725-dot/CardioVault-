import React,{useEffect,useRef} from 'react';
import {App as CapacitorApp} from '@capacitor/app';
import {AppProvider,useApp} from './context/AppContext';
import {AppHeader} from './components/navigation/AppHeader';
import {BottomNav} from './components/navigation/BottomNav';
import {LoginScreen} from './components/auth/LoginScreen';
import {UnitsDashboard} from './components/home/UnitsDashboard';
import {DashboardClinicalCenter} from './components/home/DashboardClinicalCenter';
import {UnitCensusView} from './components/census/UnitCensusView';
import {PatientFileView} from './components/patient/PatientFileView';
import {ActivePatientsView} from './components/patients/ActivePatientsView';
import {AddPatientPage} from './components/patient/AddPatientPage';
import {ArchiveView} from './components/archive/ArchiveView';
import {CalculatorsHub} from './components/calculators/CalculatorsHub';
import {SettingsView} from './components/settings/SettingsView';
import {HandoverView} from './components/handover/HandoverView';
import {SearchModal} from './components/search/SearchModal';
import {CheckCircle2,AlertCircle,Info,X} from 'lucide-react';

const AppContent:React.FC=()=>{
 const {auth,currentView,setCurrentView,toasts,dismissToast}=useApp();
 const handlingPop=useRef(false);
 const hasLocalSession=!!localStorage.getItem('cardiovault_auth_v2');
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return;if(!window.history.state?.cardiovault){window.history.replaceState({cardiovault:true,view:currentView},'');}},[auth.isAuthenticated,auth.isLocked,hasLocalSession]);
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return;if(handlingPop.current){handlingPop.current=false;return;}const current=window.history.state?.view;if(current!==currentView)window.history.pushState({cardiovault:true,view:currentView},'');},[currentView,auth.isAuthenticated,auth.isLocked,hasLocalSession]);
 useEffect(()=>{if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return;const onPop=()=>{const view=window.history.state?.view;if(view){handlingPop.current=true;setCurrentView(view);}};const onBack=async()=>{if(currentView==='patient'){const detail={handled:false};window.dispatchEvent(new CustomEvent('cardiovault-patient-back',{detail}));if(detail.handled)return;}if(window.history.length>1)window.history.back();else await CapacitorApp.exitApp();};window.addEventListener('popstate',onPop);let listener:{remove:()=>Promise<void>}|undefined;CapacitorApp.addListener('backButton',onBack).then(x=>{listener=x;}).catch(()=>{});return()=>{window.removeEventListener('popstate',onPop);void listener?.remove();};},[auth.isAuthenticated,auth.isLocked,hasLocalSession,setCurrentView,currentView]);
 if(!auth.isAuthenticated||auth.isLocked||!hasLocalSession)return <LoginScreen/>;
 const render=()=>{switch(currentView){case'home':return <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4"><DashboardClinicalCenter/><UnitsDashboard/></div>;case'census':return <UnitCensusView/>;case'handover':return <HandoverView/>;case'patient':return <PatientFileView/>;case'patients':return <ActivePatientsView/>;case'add-patient':return <AddPatientPage/>;case'archive':return <ArchiveView/>;case'calculators':return <CalculatorsHub/>;case'settings':return <SettingsView/>;default:return <UnitsDashboard/>;}};
 return <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070B13] text-slate-900 dark:text-slate-100 transition-colors duration-200"><AppHeader/><main className="flex-1 w-full safe-bottom-content">{render()}</main><BottomNav/><SearchModal/><div className="fixed bottom-[calc(4.5rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] md:bottom-[calc(1rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">{toasts.map(t=><div key={t.id} className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-xl border text-xs backdrop-blur-md ${t.type==='success'?'bg-emerald-950/90 border-emerald-500/40 text-emerald-100':t.type==='error'?'bg-rose-950/90 border-rose-500/40 text-rose-100':t.type==='warning'?'bg-amber-950/90 border-amber-500/40 text-amber-100':'bg-slate-900/90 border-slate-700 text-slate-100'}`}><div className="flex items-center gap-2.5">{t.type==='success'?<CheckCircle2 className="w-4 h-4 text-emerald-400"/>:t.type==='error'?<AlertCircle className="w-4 h-4 text-rose-400"/>:<Info className="w-4 h-4 text-cyan-400"/>}<span className="font-medium leading-tight">{t.message}</span></div><button onClick={()=>dismissToast(t.id)} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0 ml-2"><X className="w-3.5 h-3.5"/></button></div>)}</div></div>;
};
export default function App(){return <AppProvider><AppContent/></AppProvider>;
}
