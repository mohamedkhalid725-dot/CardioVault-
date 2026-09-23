import React,{useMemo,useState}from'react';
import{ChevronDown,ChevronRight,Search,CheckCircle2,Circle,LayoutDashboard,Clock,Activity,HeartPulse,Stethoscope,Heart,Pill,Wind,Image as ImageIcon,FlaskConical,Syringe,Calculator,FileEdit,FileDown,ClipboardList}from'lucide-react';
import{useApp}from'../../context/AppContext';
import{Patient,PatientSectionId}from'../../types/clinical';

type SectionDef={id:PatientSectionId;order:number;label:string;icon:React.FC<{className?:string}>;description:string};
export const PATIENT_SECTIONS:SectionDef[]=[
{id:'overview',order:1,label:'Patient Info',description:'Demographics, admission and current status',icon:LayoutDashboard},
{id:'history',order:2,label:'History',description:'Chief complaint, HPI and medical history',icon:Clock},
{id:'examination',order:3,label:'Examination',description:'Physical examination',icon:Stethoscope},
{id:'vitals',order:4,label:'Vitals & Balance',description:'Vitals, fluids and hemodynamics',icon:HeartPulse},
{id:'ecg',order:5,label:'ECG',description:'Electrocardiography records',icon:Activity},
{id:'labs',order:6,label:'Labs',description:'Laboratory results',icon:FlaskConical},
{id:'imaging',order:7,label:'Imaging',description:'Imaging studies and reports',icon:ImageIcon},
{id:'medication',order:8,label:'Medication',description:'Active and historical medications',icon:Pill},
{id:'procedure',order:9,label:'Procedures / Interventions',description:'Procedures and interventions',icon:Syringe},
{id:'orders',order:10,label:'Orders & Consultations',description:'Investigations, consultations and status',icon:ClipboardList},
{id:'cardiology',order:11,label:'Cardiology',description:'Cardiac assessment and echo',icon:Heart},
{id:'icu',order:12,label:'ICU / Critical Care',description:'Ventilation, ABG and organ support',icon:Wind},
{id:'progress',order:13,label:'Progress Notes',description:'Dated clinical documentation',icon:FileEdit},
{id:'calculators',order:14,label:'Calculators',description:'Clinical scores and calculations',icon:Calculator},
{id:'clinical-tools',order:15,label:'Clinical Tools & Workflow',description:'Clinical decision and workflow tools',icon:LayoutDashboard},
{id:'pdf',order:16,label:'PDF / Export',description:'Select, review and save patient PDF',icon:FileDown},
];

type Group={title:string;subtitle:string;items:PatientSectionId[]};
const GROUPS:Group[]=[
{title:'CORE',subtitle:'Patient story, examination and monitoring',items:['overview','history','examination','vitals']},
{title:'INVESTIGATIONS',subtitle:'ECG, laboratory and imaging data',items:['ecg','labs','imaging']},
{title:'MANAGEMENT',subtitle:'Treatment and interventions',items:['medication','procedure','orders']},
{title:'CARDIOLOGY',subtitle:'Cardiac assessment and management',items:['cardiology']},
{title:'ICU',subtitle:'Critical care and organ support',items:['icu']},
];

interface Props{onSelect?:(id:PatientSectionId)=>void;patient:Patient;}

const hasData=(p:Patient,id:PatientSectionId)=>{
switch(id){
case'overview':return true;
case'history':return !!(p.clinicalSummary?.chiefComplaint||p.clinicalSummary?.hpi||p.clinicalSummary?.pmh?.length);
case'examination':return !!JSON.stringify(p.examination||{}).replace(/[{}\\[\\]":,]/g,'').trim();
case'vitals':return !!(p.vitalsHistory?.length||p.fluidRecords?.length||p.hemodynamicHistory?.length);
case'ecg':return !!p.ecgRecords?.length;
case'labs':return !!(p.labResults?.length||p.labs?.length);
case'imaging':return !!p.imaging?.length;
case'medication':return !!p.medications?.length;
case'procedure':return !!p.procedures?.length;
case'orders':return !!(p.investigations?.length||p.consultations?.length||p.tasks?.length);
case'cardiology':return !!(p.cardiology?.echo?.ef||p.cardiology?.rhythm||p.cardiology?.biomarkerRecords?.length||p.cardiology?.cathRecords?.length);
case'icu':return !!(p.ventilator?.mode||p.ventilator?.abgHistory?.length);
default:return false;
}
};

export const PatientFileNav:React.FC<Props>=({onSelect,patient})=>{
const{setActivePatientSection}=useApp();
const[query,setQuery]=useState('');
const[open,setOpen]=useState<string>('CORE');
const normalized=query.trim().toLowerCase();
const find=(id:PatientSectionId)=>PATIENT_SECTIONS.find(s=>s.id===id)!;
const filtered=useMemo(()=>PATIENT_SECTIONS.filter(s=>`${s.label} ${s.description}`.toLowerCase().includes(normalized)),[normalized]);
const select=(id:PatientSectionId)=>{setActivePatientSection(id);onSelect?.(id);};
return <nav className="w-full px-3 sm:px-6 py-2 sm:py-3">
<div className="max-w-7xl mx-auto space-y-3">
<div className="relative max-w-3xl mx-auto">
<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Patient File sections…" className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white shadow-sm"/>
</div>
{normalized?<div className="space-y-2">{filtered.map(sec=>{const Icon=sec.icon;return <button key={sec.id} onClick={()=>select(sec.id)} className="w-full min-h-[58px] flex items-center gap-3 px-4 py-3 rounded-2xl text-left border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] hover:border-cyan-500/60 transition-all"><div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0"><Icon className="w-4.5 h-4.5 text-cyan-500"/></div><span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span>{hasData(patient,sec.id)?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}</button>})}{!filtered.length&&<div className="py-8 text-center text-xs text-slate-400">No matching clinical sections.</div>}</div>
:
<div className="space-y-2">
{GROUPS.map(group=>{
const expanded=open===group.title;
return <section key={group.title} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] overflow-hidden">
<button type="button" onClick={()=>setOpen(expanded?'':group.title)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
<div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center"><span className="text-cyan-500 text-xs font-black">{group.title==='CORE'?'1':group.title==='INVESTIGATIONS'?'2':group.title==='MANAGEMENT'?'3':group.title==='CARDIOLOGY'?'4':'5'}</span></div>
<div className="min-w-0 flex-1"><div className="text-[11px] font-black tracking-[0.14em] text-cyan-500">{group.title}</div><div className="text-[10px] text-slate-400 mt-0.5 truncate">{group.subtitle}</div></div>
{expanded?<ChevronDown className="w-5 h-5 text-cyan-500"/>:<ChevronRight className="w-5 h-5 text-slate-400"/>}
</button>
{expanded&&<div className="px-2 pb-2 space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-2">
{group.items.map(id=>{const sec=find(id);const Icon=sec.icon;return <button key={id} type="button" onClick={()=>select(id)} className="w-full min-h-[58px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-cyan-500/5 active:scale-[.995] transition-all">
<div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0"><Icon className="w-4.5 h-4.5 text-cyan-500"/></div>
<span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{sec.label}</span><span className="block text-[10px] text-slate-400 truncate">{sec.description}</span></span>
{hasData(patient,id)?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500"/>:<Circle className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-700"/>}
</button>})}
</div>}
</section>
})}
</div>}
</div></nav>;
};
