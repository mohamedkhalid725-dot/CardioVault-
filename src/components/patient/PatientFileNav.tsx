import React,{useMemo,useState} from 'react';
import {LayoutDashboard,Clock,Activity,HeartPulse,Stethoscope,Heart,Pill,Wind,Image as ImageIcon,FlaskConical,Syringe,Calculator,FileEdit,FileDown,Search,CheckCircle2,Circle,BarChart3,AlertTriangle} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {Patient,PatientSectionId} from '../../types/clinical';

type SectionDef={id:PatientSectionId;order:number;label:string;icon:React.FC<{className?:string}>;description:string};
type SectionGroup={title:string;subtitle:string;items:PatientSectionId[]};
type AlertState={low:boolean;high:boolean};

export const PATIENT_SECTIONS:SectionDef[]=[
{id:'overview',order:1,label:'Overview',description:'Live clinical snapshot and current status',icon:LayoutDashboard},
{id:'history',order:2,label:'History',description:'Clinical history and admission data',icon:Clock},
{id:'examination',order:3,label:'Examination',description:'Physical examination',icon:Stethoscope},
{id:'vitals',order:4,label:'Vitals & Balance',description:'Vitals, fluids and hemodynamics',icon:HeartPulse},
{id:'ecg',order:5,label:'ECG',description:'Electrocardiography records',icon:Activity},
{id:'labs',order:6,label:'Labs',description:'Laboratory results',icon:FlaskConical},
{id:'imaging',order:7,label:'Imaging',description:'Imaging studies and reports',icon:ImageIcon},
{id:'medication',order:8,label:'Medication',description:'Active and historical medications',icon:Pill},
{id:'procedure',order:9,label:'Procedures / Interventions',description:'Procedures and interventions',icon:Syringe},
{id:'cardiology',order:10,label:'Cardiology',description:'Cardiac assessment and echo',icon:Heart},
{id:'icu',order:11,label:'ICU / Critical Care',description:'Critical care, ventilation and blood gases',icon:Wind},
{id:'progress',order:12,label:'Progress Notes',description:'Dated clinical notes',icon:FileEdit},
{id:'calculators',order:13,label:'Calculators',description:'Clinical scores and calculations',icon:Calculator},
{id:'clinical-tools',order:14,label:'Clinical Tools & Workflow',description:'Decision support, audit and handover',icon:BarChart3},
{id:'pdf',order:15,label:'PDF / Export',description:'Export selected clinical sections',icon:FileDown},
];

const GROUPS:SectionGroup[]=[
{title:'CORE',subtitle:'Patient story',items:['overview','history','examination','vitals']},
{title:'INVESTIGATIONS',subtitle:'ECG, laboratory and imaging data',items:['ecg','labs','imaging']},
{title:'MANAGEMENT',subtitle:'Treatment and interventions',items:['medication','procedure']},
{title:'CARDIOLOGY',subtitle:'Cardiac assessment and management',items:['cardiology']},
{title:'CRITICAL CARE',subtitle:'ICU and organ support',items:['icu']},
{title:'CLINICAL FOLLOW-UP',subtitle:'Ongoing documentation and decision support',items:['progress','calculators','clinical-tools']},
{title:'DOCUMENTATION',subtitle:'Reports and export',items:['pdf']},
];

interface Props{onSelect?:(sectionId:PatientSectionId)=>void;patient:Patient;}
const hasData=(patient:Patient,id:PatientSectionId)=>{switch(id){case'overview':return true;case'history':return !!(patient.clinicalSummary?.chiefComplaint||patient.clinicalSummary?.hpi||patient.clinicalSummary?.pmh?.length);case'ecg':return !!patient.ecgRecords?.length;case'vitals':return !!(patient.vitalsHistory?.length||patient.fluidRecords?.length||patient.hemodynamicHistory?.length||patient.fluidIntakeHistory?.length||patient.urineOutputHistory?.length);case'examination':return !!JSON.stringify(patient.examination||{}).replace(/[{}\[\]":,]/g,'').trim();case'cardiology':return !!(patient.cardiology?.echo?.ef||patient.cardiology?.rhythm||patient.cardiology?.biomarkerRecords?.length||patient.cardiology?.cathRecords?.length);case'medication':return !!patient.medications?.length;case'icu':return !!(patient.ventilator?.mode||patient.ventilator?.abgHistory?.length);case'imaging':return !!patient.imaging?.length;case'labs':return !!(patient.labResults?.length||patient.labs?.length);case'procedure':return !!patient.procedures?.length;case'calculators':return !!patient.calculatorResults?.length;case'progress':return !!patient.progressNotes?.length;case'clinical-tools':return true;case'pdf':return true;default:return false;}};

const numeric=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const classify=(value:unknown,low:number,high:number):'low'|'high'|null=>{const n=numeric(value);if(n===null)return null;return n<low?'low':n>high?'high':null;};
const addAlert=(state:AlertState,flag:'low'|'high'|null)=>{if(flag==='low')state.low=true;if(flag==='high')state.high=true;};
const latestAlert=(patient:Patient,id:PatientSectionId):AlertState=>{
 const state:AlertState={low:false,high:false};
 if(id==='labs'){
  const results=Array.isArray(patient.labResults)?patient.labResults:[];
  const byTest=new Map<string,any>();
  results.forEach(r=>{const key=String(r.testName||r.name||'').trim().toLowerCase();if(!key)return;const prev=byTest.get(key);if(!prev||String(r.timestamp||'').localeCompare(String(prev.timestamp||''))>0)byTest.set(key,r);});
  byTest.forEach(r=>{const n=numeric(r.value);if(n===null)return;if(r.flag==='Low'||String(r.status).toLowerCase()==='low')state.low=true;else if(r.flag==='High'||String(r.status).toLowerCase()==='high')state.high=true;else if(r.referenceRange){const m=String(r.referenceRange).match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/);if(m)addAlert(state,classify(n,Number(m[1]),Number(m[2])));}});
  const legacy=Array.isArray(patient.labs)?patient.labs[0]:undefined;
  if(legacy){const checks:[string,number,number][]=[['hb',13,17.5],['wbc',4,11],['platelets',150,400],['hct',40,52],['na',135,145],['k',3.5,5.1],['cl',98,107],['ca',8.5,10.5],['mg',1.7,2.2],['phosphate',2.5,4.5],['ast',10,40],['alt',7,56],['alp',44,147],['bilirubin',.1,1.2],['albumin',3.5,5],['totalProtein',6,8.3],['pt',11,14],['inr',.8,1.2],['aptt',25,35],['fibrinogen',200,400],['glucose',70,99],['lactate',.5,2.2],['dDimer',0,.5]];checks.forEach(([key,lo,hi])=>addAlert(state,classify((legacy as any)[key],lo,hi)));legacy.customLabs?.forEach(x=>{const n=numeric(x.value);const m=String(x.referenceRange||'').match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/);if(n!==null&&m)addAlert(state,classify(n,Number(m[1]),Number(m[2])));});}
 }
 if(id==='vitals'){
  const v=Array.isArray(patient.vitalsHistory)&&patient.vitalsHistory.length?[...patient.vitalsHistory].sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')))[0]:undefined;
  if(v){addAlert(state,classify(v.sbp,90,180));addAlert(state,classify(v.dbp,60,120));addAlert(state,classify(v.hr,50,120));addAlert(state,classify(v.rr,10,24));addAlert(state,classify(v.spo2,92,100));addAlert(state,classify(v.temp,36,38));addAlert(state,classify(v.gcsTotal,8,15));}
  const fluid=Array.isArray(patient.fluidRecords)&&patient.fluidRecords.length?[...patient.fluidRecords].sort((a,b)=>String(b.timestamp||b.date||'').localeCompare(String(a.timestamp||a.date||'')))[0]:undefined;const u=fluid?numeric(fluid.urineOutput??fluid.urine):null;if(u!==null&&u<0.5)state.low=true;
 }
 return state;
};
const alertClasses=(a:AlertState)=>a.low&&a.high?'border-l-4 border-l-amber-400 border-r-4 border-r-rose-500 bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-500/10 dark:to-rose-500/10':a.low?'border-l-4 border-l-amber-400 bg-amber-50/80 dark:bg-amber-500/10':a.high?'border-r-4 border-r-rose-500 bg-rose-50/80 dark:bg-rose-500/10':'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626]';

export const PatientFileNav:React.FC<Props>=({onSelect,patient})=>{
 const{setActivePatientSection}=useApp();const[query,setQuery]=useState('');const normalized=query.trim().toLowerCase();const filtered=useMemo(()=>PATIENT_SECTIONS.filter(sec=>`${sec.label} ${sec.description}`.toLowerCase().includes(normalized)),[normalized]);const select=(id:PatientSectionId)=>{setActivePatientSection(id);onSelect?.(id)};
 return <nav className="w-full px-3 sm:px-6 py-2 sm:py-3"><div className="max-w-7xl mx-auto space-y-3"><div className="relative max-w-xl mx-auto"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Patient File sections…" className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white shadow-sm"/></div>{normalized?<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{filtered.map(sec=>{const Icon=sec.icon;const recorded=hasData(patient,sec.id);const alert=latestAlert(patient,sec.id);return <button key={sec.id} onClick={()=>select(sec.id)} className={`min-h-[58px] flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border hover:border-cyan-500/60 hover:shadow-sm transition-all ${alertClasses(alert)}`}><Icon className={`w-5 h-5 shrink-0 ${alert.low||alert.high?'text-slate-700 dark:text-slate-200':'text-cyan-500'}`}/><span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span>{(alert.low||alert.high)?<AlertTriangle className="w-4 h-4 shrink-0 text-amber-500"/>:recorded?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}</button>})}{filtered.length===0&&<div className="sm:col-span-2 xl:col-span-3 py-10 text-center text-xs text-slate-400">No matching clinical sections.</div>}</div>:<div className="space-y-4">{GROUPS.map(group=><section key={group.title}><div className="flex items-end justify-between gap-3 px-1 mb-2"><div><div className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-400">{group.title}</div><div className="text-[10px] text-slate-400 mt-0.5">{group.subtitle}</div></div><div className="hidden sm:block h-px flex-1 bg-slate-200 dark:bg-slate-800 mb-1.5 ml-3"/></div><div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:overflow-visible">{group.items.map(id=>{const sec=PATIENT_SECTIONS.find(s=>s.id===id)!;const Icon=sec.icon;const recorded=hasData(patient,id);const alert=latestAlert(patient,id);return <button key={id} onClick={()=>select(id)} className={`snap-start shrink-0 w-[205px] sm:w-auto min-h-[72px] flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border hover:border-cyan-500/60 hover:shadow-sm active:scale-[.99] transition-all ${alertClasses(alert)}`}><div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${alert.low&&alert.high?'bg-gradient-to-r from-amber-400/25 to-rose-500/25':alert.low?'bg-amber-400/20':alert.high?'bg-rose-500/20':'bg-cyan-500/10'}`}><Icon className={`w-4.5 h-4.5 ${alert.low?'text-amber-600 dark:text-amber-300':alert.high?'text-rose-600 dark:text-rose-300':'text-cyan-600 dark:text-cyan-400'}`}/></div><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block font-semibold text-sm truncate">{sec.label}</span>{(alert.low||alert.high)&&<AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500"/>}</span><span className="block text-[10px] text-slate-400 truncate">{alert.low&&alert.high?'Low + High alerts':alert.low?'Low alert':alert.high?'High alert':sec.description}</span></span>{alert.low&&alert.high?<span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 ring-2 ring-white dark:ring-[#0E1626]"/>:alert.low?<span className="shrink-0 w-3.5 h-3.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0E1626]"/>:alert.high?<span className="shrink-0 w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0E1626]"/>:recorded?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}</button>})}</div></section>)}</div>}</div></nav>;
};
