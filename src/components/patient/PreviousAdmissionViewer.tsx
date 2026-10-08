import React,{useMemo}from'react';
import type {AppContextType}from'../../context/AppContext';
import {AppContext,useApp}from'../../context/AppContext';
import {emptyCV,emptyCardio,emptyExam,emptyVent}from'../../services/admissionEpisode';
import type {Patient,PastAdmission}from'../../types/clinical';

export const READ_ONLY_PREVIOUS_MESSAGE='Previous admission is read-only. Editing and clinical actions are disabled.';

export const buildPreviousAdmissionPatient=(patient:Patient,admission:PastAdmission):Patient=>{
 if(!admission.episodeSnapshot)throw new Error('This previous admission has no full snapshot.');
 const{episodeId:_,unitName:__,dischargeDate:___,dischargeReason:____,dischargeSummary:_____,...snapshotData}=admission.episodeSnapshot;
 const identity:Patient={
  id:`${patient.id}::${admission.id}`,mrn:patient.mrn,fullName:patient.fullName,name:patient.name,age:patient.age,sex:patient.sex,gender:patient.gender,weight:patient.weight,height:patient.height,photoUrl:patient.photoUrl,
  unitId:'',bedId:'',status:'Not documented',admissionDate:'Not documented',admissionTime:'Not documented',primaryDiagnosis:'',diagnosis:undefined,secondaryDiagnoses:[],allergies:[],codeStatus:'Not documented',isArchived:true,archiveReason:admission.dischargeReason,archiveDate:admission.dischargeDate,currentAdmissionStartedAt:undefined,dischargeSummary:admission.dischargeSummary,pastAdmissions:[],
  clinicalSummary:{chiefComplaint:'',hpi:'',pmh:[],psh:[],drugHistory:'',allergies:[],familyHistory:'',socialHistory:''},cardiovascularHistory:emptyCV(),handover:undefined,vitalsHistory:[],fluidRecords:[],hemodynamicHistory:[],fluidIntakeHistory:[],urineOutputHistory:[],examination:emptyExam(),ecgRecords:[],cardiology:emptyCardio(),medications:[],infusions:[],ventilator:emptyVent(),imaging:[],labs:[],labResults:[],procedures:[],calculatorResults:[],progressNotes:[],auditTrail:[],aiSummary:undefined,problems:[],tasks:[],investigations:[],medicationAdministrations:[],consultations:[],shiftHandovers:[],corrections:[],timelineEvents:[],attendedClinician:undefined,attendedNurse:undefined,additionalConditions:[]
 };
 return {...identity,...snapshotData,id:identity.id,pastAdmissions:[],auditTrail:[],aiSummary:undefined,isArchived:true,archiveDate:admission.dischargeDate,archiveReason:admission.dischargeReason,dischargeSummary:admission.dischargeSummary};
};

const blocked=(showToast:AppContextType['showToast'])=>()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');};
export const createReadOnlyMutationOverrides=(app:AppContextType,showToast:AppContextType['showToast'],safePatient:Patient)=>({
 loginWithGoogle:async()=>blocked(showToast)(),loginWithEmail:async(_email:string,_user?:any)=>blocked(showToast)(),unlockWithPin:(_pin:string)=>{blocked(showToast)();return false;},lockApp:blocked(showToast),logout:blocked(showToast),setCurrentUser:(_user:AppContextType['currentUser'])=>blocked(showToast)(),
 setTheme:(_theme:'dark'|'light')=>blocked(showToast)(),toggleTheme:()=>blocked(showToast)(),
 setCurrentView:(view:AppContextType['currentView'])=>app.setCurrentView(view),setCurrentUnitId:(id:string|null)=>app.setCurrentUnitId(id),setCurrentPatientId:(id:string|null)=>app.setCurrentPatientId(id),setActivePatientSection:(id:AppContextType['activePatientSection'])=>app.setActivePatientSection(id),setIsSearchOpen:(open:boolean)=>app.setIsSearchOpen(open),
 addPatient:(_data:Partial<Patient>,_bedId?:string)=>{blocked(showToast)();return safePatient;},updatePatient:(_id:string,_updates:Partial<Patient>)=>blocked(showToast)(),dischargePatient:(_id:string,_reason:string,_summary:string)=>blocked(showToast)(),transferPatient:(_id:string,_unitId:string,_bedId:string)=>blocked(showToast)(),readmitPatient:(_id:string,_unitId:string,_bedId:string)=>blocked(showToast)(),deletePatientPermanently:(_id:string)=>blocked(showToast)(),
 addUnit:(_name:string,_type:string,_count?:number)=>{blocked(showToast)();return app.units[0]||{id:'readonly-unit',name:'Read-only',type:'Clinical',totalBeds:0};},updateUnit:(_id:string,_name:string,_type:string)=>blocked(showToast)(),deleteUnit:(_id:string)=>{blocked(showToast)();return false;},addBed:(_unitId:string,_bedNumber?:string)=>{blocked(showToast)();return app.beds[0]||{id:'readonly-bed',unitId:'readonly-unit',bedNumber:'Read-only',status:'Empty'};},removeBed:(_id:string)=>{blocked(showToast)();return false;},
 syncNow:async()=>blocked(showToast)(),resetDatabase:()=>blocked(showToast)(),setPrivacySafeMonitor:(_v:boolean)=>blocked(showToast)(),toggleFavoritePatient:(_id:string)=>blocked(showToast)(),dismissToast:(_id:string)=>app.dismissToast(_id),showToast,
 getPatientById:(id:string)=>id===safePatient.id?safePatient:undefined,getBedsByUnit:(id:string)=>app.getBedsByUnit(id),getUnitById:(id:string)=>app.getUnitById(id)
});

export const PreviousAdmissionReadOnlyProvider:React.FC<{patient:Patient;admission:PastAdmission;onClose:()=>void;children:React.ReactNode}>=({patient,admission,onClose,children})=>{
 const app=useApp();const viewerPatient=useMemo(()=>buildPreviousAdmissionPatient(patient,admission),[patient,admission]);const overrides=useMemo(()=>createReadOnlyMutationOverrides(app,app.showToast,viewerPatient),[app,viewerPatient]);
 const value=useMemo<AppContextType>(()=>({...app,currentPatient:viewerPatient,currentPatientId:viewerPatient.id,patients:[viewerPatient],archivedPatients:[viewerPatient],favoritePatientIds:[],...overrides,setCurrentView:(view)=>view==='archive'?onClose():app.setCurrentView(view)}),[app,viewerPatient,onClose,overrides]);
 return <AppContext.Provider value={value}><div data-cardio-previous-admission className="min-h-screen"><div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-3"><div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs font-extrabold text-amber-800 dark:text-amber-200">Previous admission (read-only): {admission.admissionDate} → {admission.dischargeDate}, {admission.unitName}</div></div><style>{`[data-cardio-previous-admission] button[title^="Voice dictation"]{display:none!important}`}</style>{children}</div></AppContext.Provider>;
};