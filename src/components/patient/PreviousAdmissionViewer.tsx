import React,{useMemo}from'react';
import type {AppContextType}from'../../context/AppContext';
import {AppContext,useApp}from'../../context/AppContext';
import type {Patient,PastAdmission}from'../../types/clinical';

export const READ_ONLY_PREVIOUS_MESSAGE='Previous admission is read-only. Editing and clinical actions are disabled.';

export const buildPreviousAdmissionPatient=(patient:Patient,admission:PastAdmission):Patient=>{
 if(!admission.episodeSnapshot)throw new Error('This previous admission has no full snapshot.');
 const{episodeId:_,unitName:__,dischargeDate:___,dischargeReason:____,dischargeSummary:_____,...snapshotData}=admission.episodeSnapshot;
 return {...patient,...snapshotData,id:`${patient.id}::${admission.id}`,pastAdmissions:[],isArchived:true,archiveDate:admission.dischargeDate,archiveReason:admission.dischargeReason,dischargeSummary:admission.dischargeSummary};
};

export const createReadOnlyMutationOverrides=(app:AppContextType,showToast:AppContextType['showToast'],safePatient:Patient)=>({
 addPatient:(_data:Partial<Patient>,_bedId?:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');return safePatient;},
 updatePatient:(_id:string,_updates:Partial<Patient>)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 dischargePatient:(_id:string,_reason:string,_summary:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 transferPatient:(_id:string,_unitId:string,_bedId:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 readmitPatient:(_id:string,_unitId:string,_bedId:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 deletePatientPermanently:(_id:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 addUnit:(_name:string,_type:string,_count?:number)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');return app.units[0]||{id:'readonly-unit',name:'Read-only',type:'Clinical',totalBeds:0};},
 updateUnit:(_id:string,_name:string,_type:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 deleteUnit:(_id:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');return false;},
 addBed:(_unitId:string,_bedNumber?:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');return app.beds[0]||{id:'readonly-bed',unitId:'readonly-unit',bedNumber:'Read-only',status:'Empty'};},
 removeBed:(_id:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');return false;},
 setTheme:(_theme:'dark'|'light')=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 toggleTheme:()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 logout:()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 lockApp:()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 setCurrentUser:(_user:AppContextType['currentUser'])=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 syncNow:async()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 resetDatabase:()=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 setPrivacySafeMonitor:(_v:boolean)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
 toggleFavoritePatient:(_id:string)=>{showToast(READ_ONLY_PREVIOUS_MESSAGE,'warning');},
});

export const PreviousAdmissionReadOnlyProvider:React.FC<{patient:Patient;admission:PastAdmission;onClose:()=>void;children:React.ReactNode}>=({patient,admission,onClose,children})=>{
 const app=useApp();const viewerPatient=useMemo(()=>buildPreviousAdmissionPatient(patient,admission),[patient,admission]);const overrides=useMemo(()=>createReadOnlyMutationOverrides(app,app.showToast,viewerPatient),[app,viewerPatient]);const value=useMemo<AppContextType>(()=>({...app,currentPatient:viewerPatient,currentPatientId:viewerPatient.id,setCurrentView:(view)=>view==='archive'?onClose():app.setCurrentView(view),...overrides}),[app,viewerPatient,onClose,overrides]);
 return <AppContext.Provider value={value}><div data-cardio-previous-admission className="min-h-screen"><style>{`[data-cardio-previous-admission] button[title^="Voice dictation"]{display:none!important}`}</style>{children}</div></AppContext.Provider>;
};
