import React, { useMemo, useState } from 'react';
import { Search, Calculator, Heart, Activity, Wind, Gauge, Droplets, Syringe, ChevronRight } from 'lucide-react';
import { Patient } from '../../types/clinical';
import { CARDIOVAULT_CALCULATORS } from '../../services/calculatorCatalog';
import { FocusedCalculator } from './FocusedCalculator';

interface Props { patient?: Patient; embedded?: boolean; }
type Filter = 'All' | 'Cardiology' | 'Critical Care' | 'ABG' | 'Hemodynamics' | 'Renal & Electrolytes' | 'Drug Infusion';
const iconFor=(category:string)=>category==='Cardiology'?Heart:category==='Critical Care'?Activity:category==='ABG'?Wind:category==='Hemodynamics'?Gauge:category==='Renal & Electrolytes'?Droplets:category==='Drug Infusion'?Syringe:Calculator;
const colorFor=(category:string)=>category==='Cardiology'?'bg-rose-500/15 text-rose-500':category==='Critical Care'?'bg-blue-500/15 text-blue-500':category==='ABG'?'bg-cyan-500/15 text-cyan-500':category==='Hemodynamics'?'bg-violet-500/15 text-violet-500':category==='Renal & Electrolytes'?'bg-emerald-500/15 text-emerald-500':category==='Drug Infusion'?'bg-amber-500/15 text-amber-500':'bg-slate-500/15 text-slate-500';

export const CalculatorsHub:React.FC<Props>=({patient,embedded=false})=>{
 const [filter,setFilter]=useState<Filter>('All'); const [query,setQuery]=useState(''); const [selectedId,setSelectedId]=useState<string|null>(null);
 const filters:Filter[]=['All','Cardiology','Critical Care','ABG','Hemodynamics','Renal & Electrolytes','Drug Infusion'];
 const list=useMemo(()=>CARDIOVAULT_CALCULATORS.filter(c=>(filter==='All'||c.category===filter)&&`${c.name} ${c.subtitle} ${c.description}`.toLowerCase().includes(query.toLowerCase())),[filter,query]);
 const selected=CARDIOVAULT_CALCULATORS.find(c=>c.id===selectedId);
 if(selected) return <div className={`${embedded?'':'max-w-5xl mx-auto px-4 py-6'}`}><FocusedCalculator definition={selected} patient={patient} onBack={()=>setSelectedId(null)}/></div>;
 return <div className={`${embedded?'':'max-w-5xl mx-auto px-4 py-6'} space-y-4 animate-in fade-in duration-150`}>
  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center"><Calculator className="w-5 h-5"/></div><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Calculators</h1><p className="text-xs text-slate-500 dark:text-slate-400">All clinical calculators are interactive and calculate from your entered inputs — no demo scores.</p></div></div>
  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search calculators..." className="w-full pl-9 pr-4 py-3 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/></div>
  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{filters.map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${filter===f?'bg-cyan-500 text-slate-950':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{f}</button>)}</div>
  <div className="space-y-1.5">{list.map(c=>{const Icon=iconFor(c.category);return <button key={c.id} onClick={()=>setSelectedId(c.id)} className="w-full text-left flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 transition-all"><div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorFor(c.category)}`}><Icon className="w-5 h-5"/></div><div className="min-w-0 flex-1"><div className="font-bold text-sm text-slate-900 dark:text-white">{c.name}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.subtitle}</div></div><ChevronRight className="w-5 h-5 text-slate-400"/></button>})}</div>
  {list.length===0&&<div className="p-10 text-center border border-dashed rounded-2xl text-slate-400">No calculators match your search.</div>}
 </div>;
};
