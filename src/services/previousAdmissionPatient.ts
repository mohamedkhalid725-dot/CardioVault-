import type {AppContextType} from '../context/AppContext';
import type {Patient,PastAdmission} from '../types/clinical';
import {createEmptyPatientShape,pickIdentityFields} from './admissionEpisode.ts';

export const READ_ONLY_PREVIOUS_MESSAGE='Previous admission is read-only. Editing and clinical actions are disabled.';

export const buildPreviousAdmissionPatient=(patient:Patient,admission:PastAdmission):Patient=>{
 const snapshotData=admission.episodeSnapshot?(({episodeId:_,unitName:__,dischargeDate:___,dischargeReason:____,dischargeSummary:_____,...rest})=>rest)(admission.episodeSnapshot):{};
 return {
  ...createEmptyPatientShape(),
  ...snapshotData,
  ...pickIdentityFields(patient),
  id:`${patient.id}::${admission.id}`,
  pastAdmissions:[],
  auditTrail:[],
  aiSummary:undefined,
  isArchived:true,
  archiveDate:admission.dischargeDate,
  archiveReason:admission.dischargeReason,
  dischargeSummary:admission.dischargeSummary
 };
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
