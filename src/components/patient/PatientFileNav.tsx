import React,{useMemo,useState} from 'react';
import { LayoutDashboard, Clock, Activity, HeartPulse, Stethoscope, Heart, Pill, Wind, Image as ImageIcon, FlaskConical, Syringe, Calculator, FileEdit, FileDown,Search,CheckCircle2,Circle,BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient,PatientSectionId } from '../../types/clinical';

export const PATIENT_SECTIONS: Array<{ id: PatientSectionId; order: number; label: string; icon: React.FC<{ className?: string }>; description:string }> = [
  { id:'overview',order:1,label:'Overview',description:'Summary and current status',icon:LayoutDashboard },
  { id:'history',order:2,label:'History',description:'Clinical history and admission data',icon:Clock },
  { id:'ecg',order:3,label:'ECG',description:'Electrocardiography records',icon:Activity },
  { id:'vitals',order:4,label:'Vitals & Balance & Hemodynamics',description:'Vitals, fluids and hemodynamics',icon:HeartPulse },
  { id:'examination',order:5,label:'Examination',description:'Physical examination',icon:Stethoscope },
  { id:'cardiology',order:6,label:'Cardiology',description:'Cardiac assessment and echo',icon:Heart },
  { id:'medication',order:7,label:'Medication',description:'Active and historical medications',icon:Pill },
  { id:'icu',order:8,label:'ICU - Ventilator & ABG',description:'Ventilation and blood gases',icon:Wind },
  { id:'imaging',order:9,label:'Imaging',description:'Imaging studies and reports',icon:ImageIcon },
  { id:'labs',order:10,label:'Labs',description:'Laboratory results',icon:FlaskConical },
  { id:'procedure',order:11,label:'Procedure',description:'Procedures and interventions',icon:Syringe },
  { id:'calculators',order:12,label:'Calculators',description:'Clinical scores and calculations',icon:Calculator },
  { id:'progress',order:13,label:'Progress Note',description:'Dated clinical notes',icon:FileEdit },
  { id:'clinical-tools',order:14,label:'Clinical Dashboard & Tools',description:'Trends, therapy, records, audit and handover',icon:BarChart3 },
  { id:'pdf',order:15,label:'PDF',description:'Export selected clinical sections',icon:FileDown },
];

interface Props { onSelect?: (sectionId: PatientSectionId) => void; patient:Patient; }
const hasData=(patient:Patient,id:PatientSectionId)=>{switch(id){case'overview':return true;case'history':return !!(patient.clinicalSummary?.chiefComplaint||patient.clinicalSummary?.hpi||patient.clinicalSummary?.pmh?.length);case'ecg':return !!patient.ecgRecords?.length;case'vitals':return !!(patient.vitalsHistory?.length||patient.fluidRecords?.length||patient.hemodynamicHistory?.length||patient.fluidIntakeHistory?.length||patient.urineOutputHistory?.length);case'examination':return !!JSON.stringify(patient.examination||{}).replace(/[{}\[\]":,]/g,'').trim();case'cardiology':return !!(patient.cardiology?.echo?.ef||patient.cardiology?.rhythm||patient.cardiology?.biomarkerRecords?.length||patient.cardiology?.cathRecords?.length);case'medication':return !!patient.medications?.length;case'icu':return !!(patient.ventilator?.mode||patient.ventilator?.abgHistory?.length);case'imaging':return !!patient.imaging?.length;case'labs':return !!(patient.labResults?.length||patient.labs?.length);case'procedure':return !!patient.procedures?.length;case'calculators':return !!patient.calculatorResults?.length;case'progress':return !!patient.progressNotes?.length;case'clinical-tools':return true;case'pdf':return true;default:return false;}};
export const PatientFileNav: React.FC<Props> = ({ onSelect,patient }) => {
  const { setActivePatientSection } = useApp();const[query,setQuery]=useState('');
  const filtered=useMemo(()=>PATIENT_SECTIONS.filter(sec=>`${sec.label} ${sec.description}`.toLowerCase().includes(query.trim().toLowerCase())),[query]);
  return <nav className="w-full px-3 sm:px-4 py-2 bg-transparent"><div className="max-w-3xl mx-auto space-y-2"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search inside Patient File…" className="w-full pl-9 pr-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0E1626]/90 text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white"/></div>{filtered.map(sec=>{const Icon=sec.icon;const recorded=hasData(patient,sec.id);return <button key={sec.id} onClick={()=>{setActivePatientSection(sec.id);onSelect?.(sec.id);}} className="w-full min-h-[60px] flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border bg-white/90 dark:bg-[#0E1626]/90 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-sm"><Icon className="w-5 h-5 shrink-0 text-cyan-500 dark:text-cyan-400"/><span className="min-w-0 flex-1"><span className="block font-semibold text-sm sm:text-[15px] truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span><span title={recorded?'Recorded':'No data yet'}>{recorded?<CheckCircle2 className="w-4 h-4 text-emerald-500"/>:<Circle className="w-4 h-4 text-slate-300 dark:text-slate-700"/>}</span><span className="text-lg leading-none text-slate-400">›</span></button>})}{filtered.length===0&&<div className="py-10 text-center text-xs text-slate-400">No matching clinical sections.</div>}</div></nav>;
};
