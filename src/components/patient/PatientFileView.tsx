import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ChevronRight,LayoutDashboard,LockKeyhole} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {PatientFileHeader} from './PatientFileHeader';
import {PatientEditModal} from './PatientEditModal';
import {PatientFileNav,PATIENT_SECTIONS} from './PatientFileNav';
import {PatientFileRecord} from './PatientFileRecord';
import {CalculatorsHub} from '../calculators/CalculatorsHub';
import {OverviewSection} from './sections/OverviewSection';
import {HistorySection} from './sections/HistorySection';
import {ECGSection} from './sections/ECGSection';
import {VitalsSection} from './sections/VitalsSection';
import {ExaminationSection} from './sections/ExaminationSection';
import {CardiologySectionV2} from './sections/CardiologySectionV2';
import {MedicationSection} from './sections/MedicationSection';
import {ICUSection} from './sections/ICUSection';
import {ImagingSection} from './sections/ImagingSection';
import {LabsSection} from './sections/LabsSection';
import {ProcedureSection} from './sections/ProcedureSection';
import {ProgressNoteSection} from './sections/ProgressNoteSection';
import {ExportSummarySection} from './sections/ExportSummarySection';
import {PatientSectionId} from '../../types/clinical';

export const PatientFileView:React.FC=()=>{
 const{currentPatient,activePatientSection,setActivePatientSection,setCurrentView}=useApp();
 const[editing,setEditing]=useState(false);const[sectionOpen,setSectionOpen]=useState(false);const[sectionHistory,setSectionHistory]=useState([activePatientSection]);
 const[touchStart,setTouchStart]=useState<{x:number;y:number}|null>(null);const swipeHandled=useRef(false);
 useEffect(()=>{setSectionHistory([activePatientSection]);setSectionOpen(false);},[currentPatient?.id]);
 useEffect(()=>{
   const onBack=(event:Event)=>{const custom=event as CustomEvent<{handled:boolean}>;if(sectionOpen&&sectionHistory.length>1){const next=sectionHistory[sectionHistory.length-2];setSectionHistory(history=>history.slice(0,-1));setActivePatientSection(next);custom.detail.handled=true;}else if(sectionOpen){setSectionOpen(false);setSectionHistory([activePatientSection]);custom.detail.handled=true;}};
   window.addEventListener('cardiovault-patient-back',onBack);return()=>window.removeEventListener('cardiovault-patient-back',onBack);
 },[sectionOpen,sectionHistory,activePatientSection,setActivePatientSection]);
 if(!currentPatient)return <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">No patient selected. Return to the active patient list.</div>;
 const readOnly=!!currentPatient.isArchived;
 const openSection=(id:PatientSectionId)=>{setActivePatientSection(id);setSectionHistory(history=>history[history.length-1]===id?history:[...history,id]);setSectionOpen(true);window.scrollTo({top:0,behavior:'smooth'});};
 const backToSections=()=>{setSectionOpen(false);setSectionHistory([activePatientSection]);};
 const sectionIndex=PATIENT_SECTIONS.findIndex(section=>section.id===activePatientSection);
 const navigateSwipe=(direction:'next'|'previous')=>{const nextIndex=direction==='next'?sectionIndex+1:sectionIndex-1;if(nextIndex<0||nextIndex>=PATIENT_SECTIONS.length)return;openSection(PATIENT_SECTIONS[nextIndex].id);};
 const handleTouchStart=(event:React.TouchEvent<HTMLElement>)=>{const target=event.target as HTMLElement;if(target.closest('input,textarea,select,button,[contenteditable="true"]')){setTouchStart(null);return;}const touch=event.changedTouches[0];setTouchStart({x:touch.clientX,y:touch.clientY});swipeHandled.current=false;};
 const handleTouchEnd=(event:React.TouchEvent<HTMLElement>)=>{if(!touchStart||swipeHandled.current)return;const target=event.target as HTMLElement;if(target.closest('input,textarea,select,button,[contenteditable="true"]')){setTouchStart(null);return;}const touch=event.changedTouches[0];const dx=touch.clientX-touchStart.x;const dy=touch.clientY-touchStart.y;setTouchStart(null);if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.25)return;swipeHandled.current=true;navigateSwipe(dx<0?'next':'previous');};
 const renderSection=()=>{switch(activePatientSection){case'overview':return <OverviewSection patient={currentPatient}/>;case'history':return <HistorySection patient={currentPatient}/>;case'ecg':return <ECGSection patient={currentPatient}/>;case'vitals':return <VitalsSection patient={currentPatient}/>;case'examination':return <ExaminationSection patient={currentPatient}/>;case'cardiology':return <CardiologySectionV2 patient={currentPatient}/>;case'medication':return <MedicationSection patient={currentPatient}/>;case'icu':return <ICUSection patient={currentPatient}/>;case'imaging':return <ImagingSection patient={currentPatient}/>;case'labs':return <LabsSection patient={currentPatient}/>;case'procedure':return <ProcedureSection patient={currentPatient}/>;case'calculators':return <CalculatorsHub patient={currentPatient} embedded/>;case'progress':return <ProgressNoteSection patient={currentPatient}/>;case'pdf':return <ExportSummarySection patient={currentPatient}/>;default:return <OverviewSection patient={currentPatient}/>;}};
 const activeMeta=PATIENT_SECTIONS.find(section=>section.id===activePatientSection)||PATIENT_SECTIONS[0];const ActiveIcon=activeMeta?.icon||LayoutDashboard;
 return <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-[#0A0F1D] text-slate-900 dark:text-slate-100">
  <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3">{readOnly&&<button onClick={()=>setCurrentView('archive')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm"><ArrowLeft className="w-4 h-4"/>Back to Archive</button>}</div>
  <PatientFileHeader patient={currentPatient} readOnly={readOnly} onEditClick={()=>{if(!readOnly)setEditing(true)}}/>
  {!sectionOpen?<><div className="px-3 sm:px-6 pt-3 max-w-7xl mx-auto w-full"><div className={`mb-2 flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-[#111C2E] border ${readOnly?'border-amber-500/40':'border-slate-200 dark:border-slate-800'} shadow-sm`}><div className={`w-9 h-9 rounded-xl ${readOnly?'bg-amber-500/15 text-amber-500':'bg-cyan-500/15 text-cyan-500'} flex items-center justify-center shrink-0`}>{readOnly?<LockKeyhole className="w-5 h-5"/>:<LayoutDashboard className="w-5 h-5"/>}</div><div className="min-w-0"><div className={`text-[10px] font-bold uppercase tracking-wider ${readOnly?'text-amber-500':'text-cyan-500'}`}>{readOnly?'Archived Patient File':'Patient File'}</div><div className="text-base font-extrabold text-slate-900 dark:text-white">Select a clinical section</div></div></div></div><PatientFileNav onSelect={openSection}/></>:<><div className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3"><button onClick={backToSections} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm"><ArrowLeft className="w-4 h-4"/>Back to Sections</button></div><main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pb-24 md:pb-12" style={{touchAction:'pan-y'}} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}><div className={`mb-4 mt-3 flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-[#111C2E] border ${readOnly?'border-amber-500/40':'border-slate-200 dark:border-slate-800'} shadow-sm`}><div className={`w-9 h-9 rounded-xl ${readOnly?'bg-amber-500/15 text-amber-500':'bg-cyan-500/15 text-cyan-500'} flex items-center justify-center shrink-0`}>{readOnly?<LockKeyhole className="w-5 h-5"/>:<ActiveIcon className="w-5 h-5"/>}</div><div className="min-w-0 flex-1"><div className={`text-[10px] font-bold uppercase tracking-wider ${readOnly?'text-amber-500':'text-cyan-500'}`}>{readOnly?'Archived Patient File':'Patient File'}</div><div className="text-base font-extrabold text-slate-900 dark:text-white truncate">{readOnly?'Read-only • ':''}{activeMeta.label}</div></div><ChevronRight className="w-4 h-4 text-slate-400 shrink-0"/></div><PatientFileRecord patient={currentPatient} sectionId={activePatientSection} sectionLabel={activeMeta.label} readOnly={readOnly}/>{readOnly?<div className="relative"><div className="pointer-events-none select-text">{renderSection()}</div></div>:renderSection()}</main></>}
  {!readOnly&&<PatientEditModal patient={currentPatient} isOpen={editing} onClose={()=>setEditing(false)}/>} 
 </div>;
};
