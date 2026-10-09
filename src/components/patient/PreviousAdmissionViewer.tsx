import React,{createContext,useContext,useMemo}from'react';
import type {AppContextType}from'../../context/AppContext';
import {AppContext,useApp}from'../../context/AppContext';
import {buildPreviousAdmissionPatient,createReadOnlyMutationOverrides,READ_ONLY_PREVIOUS_MESSAGE}from'../../services/previousAdmissionPatient';
import type {Patient,PastAdmission}from'../../types/clinical';

const PreviousViewerContext=createContext(false);
export const useIsPreviousViewer=()=>useContext(PreviousViewerContext);

export const PreviousAdmissionReadOnlyProvider:React.FC<{patient:Patient;admission:PastAdmission;onClose:()=>void;children:React.ReactNode}>=({patient,admission,onClose,children})=>{
 const app=useApp();const viewerPatient=useMemo(()=>buildPreviousAdmissionPatient(patient,admission),[patient,admission]);const overrides=useMemo(()=>createReadOnlyMutationOverrides(app,app.showToast,viewerPatient),[app,viewerPatient]);
 const value=useMemo<AppContextType>(()=>({...app,currentPatient:viewerPatient,currentPatientId:viewerPatient.id,patients:[viewerPatient],archivedPatients:[viewerPatient],favoritePatientIds:[],...overrides,setCurrentView:(view)=>view==='archive'?onClose():app.setCurrentView(view)}),[app,viewerPatient,onClose,overrides]);
 return <AppContext.Provider value={value}><PreviousViewerContext.Provider value={true}><div data-cardio-previous-admission className="min-h-screen"><div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-3"><div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs font-extrabold text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3"><span>Previous admission (read-only) - {admission.admissionDate} -&gt; {admission.dischargeDate}</span><button type="button" onClick={onClose} className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold">Back to current admission</button></div></div><style>{`[data-cardio-previous-admission] button[title^="Voice dictation"]{display:none!important}`}</style>{children}</div></PreviousViewerContext.Provider></AppContext.Provider>;
};