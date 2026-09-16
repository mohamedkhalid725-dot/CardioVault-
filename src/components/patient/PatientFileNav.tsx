import React,{useMemo,useState} from 'react';
import {LayoutDashboard,Clock,Activity,HeartPulse,Stethoscope,Heart,Pill,Wind,Image as ImageIcon,FlaskConical,Syringe,Calculator,FileEdit,FileDown,Search,CheckCircle2,Circle,BarChart3} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {Patient,PatientSectionId} from '../../types/clinical';

type SectionDef={id:PatientSectionId;order:number;label:string;icon:React.FC<{className?:string}>;description:string};
type SectionGroup={title:string;subtitle:string;items:PatientSectionId[]};

export const PATIENT_SECTIONS:SectionDef[]=[
{id:'overview',order:1,label:'Overview',description:'Summary and current status',icon:LayoutDashboard},
{id:'history',order:2,label:'History',description:'Clinical history and admission data',icon:Clock},
{id:'ecg',order:3,label:'ECG',description:'Electrocardiography records',icon:Activity},
{id:'vitals',order:4,label:'Vitals & Balance',description:'Vitals, fluids and hemodynamics',icon:HeartPulse},
{id:'examination',order:5,label:'Examination',description:'Physical examination',icon:Stethoscope},
{id:'cardiology',order:6,label:'Cardiology',description:'Cardiac assessment and echo',icon:Heart},
{id:'medication',order:7,label:'Medication',description:'Active and historical medications',icon:Pill},
{id:'icu',order:8,label:'ICU / Ventilator',description:'Ventilation and blood gases',icon:Wind},
{id:'imaging',order:9,label:'Imaging',description:'Imaging studies and reports',icon:ImageIcon},
{id:'labs',order:10,label:'Labs',description:'Laboratory results',icon:FlaskConical},
{id:'procedure',order:11,label:'Procedures',description:'Procedures and interventions',icon:Syringe},
{id:'calculators',order:12,label:'Calculators',description:'Clinical scores and calculations',icon:Calculator},
{id:'progress',order:13,label:'Progress Notes',description:'Dated clinical notes',icon:FileEdit},
{id:'clinical-tools',order:14,label:'Clinical Dashboard',description:'Trends, therapy, records and handover',icon:BarChart3},
{id:'pdf',order:15,label:'PDF / Export',description:'Export selected clinical sections',icon:FileDown},
];

const GROUPS:SectionGroup[]=[
{title:'CORE',subtitle:'Patient story',items:['overview','history','examination']},
{title:'MONITORING',subtitle:'Current clinical data',items:['vitals','labs','ecg','cardiology']},
{title:'THERAPY & CRITICAL CARE',subtitle:'Treatment and interventions',items:['medication','icu','procedure']},
{title:'CLINICAL WORKFLOW',subtitle:'Decision support and documentation',items:['clinical-tools','calculators','progress']},
{title:'DOCUMENTS',subtitle:'Reports and export',items:['imaging','pdf']},
];

interface Props{onSelect?:(sectionId:PatientSectionId)=>void;patient:Patient;}
const hasData=(patient:Patient,id:PatientSectionId)=>{switch(id){case'overview':return true;case'history':return !!(patient.clinicalSummary?.chiefComplaint||patient.clinicalSummary?.hpi||patient.clinicalSummary?.pmh?.length);case'ecg':return !!patient.ecgRecords?.length;case'vitals':return !!(patient.vitalsHistory?.length||patient.fluidRecords?.length||patient.hemodynamicHistory?.length||patient.fluidIntakeHistory?.length||patient.urineOutputHistory?.length);case'examination':return !!JSON.stringify(patient.examination||{}).replace(/[{}\[\]":,]/g,'').trim();case'cardiology':return !!(patient.cardiology?.echo?.ef||patient.cardiology?.rhythm||patient.cardiology?.biomarkerRecords?.length||patient.cardiology?.cathRecords?.length);case'medication':return !!patient.medications?.length;case'icu':return !!(patient.ventilator?.mode||patient.ventilator?.abgHistory?.length);case'imaging':return !!patient.imaging?.length;case'labs':return !!(patient.labResults?.length||patient.labs?.length);case'procedure':return !!patient.procedures?.length;case'calculators':return !!patient.calculatorResults?.length;case'progress':return !!patient.progressNotes?.length;case'clinical-tools':return true;case'pdf':return true;default:return false;}};

export const PatientFileNav:React.FC<Props>=({onSelect,patient})=>{
 const{setActivePatientSection}=useApp();
 const[query,setQuery]=useState('');
 const normalized=query.trim().toLowerCase();
 const filtered=useMemo(()=>PATIENT_SECTIONS.filter(sec=>`${sec.label} ${sec.description}`.toLowerCase().includes(normalized)),[normalized]);
 const select=(id:PatientSectionId)=>{setActivePatientSection(id);onSelect?.(id);};
 return <nav className="w-full px-3 sm:px-6 py-2 sm:py-3">
  <div className="max-w-7xl mx-auto space-y-3">
   <div className="relative max-w-xl mx-auto">
    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Patient File sections…" className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white shadow-sm"/>
   </div>
   {normalized ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{filtered.map(sec=>{const Icon=sec.icon;const recorded=hasData(patient,sec.id);return <button key={sec.id} onClick={()=>select(sec.id)} className="min-h-[58px] flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border bg-white dark:bg-[#0E1626] border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 hover:shadow-sm transition-all"><Icon className="w-5 h-5 shrink-0 text-cyan-500"/><span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span>{recorded?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}</button>})}{filtered.length===0&&<div className="sm:col-span-2 xl:col-span-3 py-10 text-center text-xs text-slate-400">No matching clinical sections.</div>}</div>
   : <div className="space-y-4">{GROUPS.map(group=><section key={group.title}>
      <div className="flex items-end justify-between gap-3 px-1 mb-2"><div><div className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-400">{group.title}</div><div className="text-[10px] text-slate-400 mt-0.5">{group.subtitle}</div></div><div className="hidden sm:block h-px flex-1 bg-slate-200 dark:bg-slate-800 mb-1.5 ml-3"/></div>
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:overflow-visible">
       {group.items.map(id=>{const sec=PATIENT_SECTIONS.find(s=>s.id===id)!;const Icon=sec.icon;const recorded=hasData(patient,id);return <button key={id} onClick={()=>select(id)} className="snap-start shrink-0 w-[205px] sm:w-auto min-h-[72px] flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border bg-white dark:bg-[#0E1626] border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 hover:shadow-sm active:scale-[.99] transition-all"><div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0"><Icon className="w-4.5 h-4.5"/></div><span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span>{recorded?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}</button>})}
      </div>
    </section>)}</div>}
  </div>
 </nav>;
};
