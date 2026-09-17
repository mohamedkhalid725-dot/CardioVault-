import React,{useMemo} from'react';
import {Clock3}from'lucide-react';
import type {Patient}from'../../types/clinical';

type AnyRecord=Record<string,any>;
const r=(v:any):AnyRecord=>v&&typeof v==='object'?v:{};
const arr=(...xs:any[])=>xs.flatMap(x=>Array.isArray(x)?x:[]);
const dateOf=(x:any)=>x?.date||x?.timestamp||x?.createdAt||x?.recordedAt||x?.datetime||'';
const labelOf=(x:any)=>x?.name||x?.label||x?.test||x?.parameter||x?.type||x?.drug||x?.medication||'';
const valueOf=(x:any)=>x?.value??x?.result??x?.reading??x?.measurement??x?.dose??'';
const latest=(items:any[])=>items.filter(Boolean).sort((a,b)=>new Date(dateOf(b)||0).getTime()-new Date(dateOf(a)||0).getTime())[0];

export const PatientSafetySnapshot:React.FC<{patient:Patient}>=({patient})=>{
 const p=r(patient);
 const sources:[string,any[]][]=[
  ['Vitals',arr(p.vitals,p.vitalSigns,p.vitalsHistory,p.vitalHistory)],
  ['Labs',arr(p.labs,p.labResults,p.laboratoryResults,p.labsHistory)],
  ['ECG',arr(p.ecg,p.ecgHistory,p.ecgRecords)],
  ['Echo',arr(p.echo,p.echoHistory)],
  ['Medications',arr(p.medications,p.medicationHistory,p.infusions,p.infusionHistory)],
  ['Procedures',arr(p.procedures,p.procedureHistory)],
  ['Imaging',arr(p.imaging,p.imagingHistory)],
  ['Progress',arr(p.progressNotes,p.progressHistory)]
 ];
 const changed=useMemo(()=>sources.flatMap(([type,items])=>{const x=latest(items);return x?[{type,date:dateOf(x),label:labelOf(x)||type,value:valueOf(x)}]:[]}).sort((a,b)=>new Date(b.date||0).getTime()-new Date(a.date||0).getTime()).slice(0,8),[p]);
 return <div className="space-y-3 mb-4">
  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3.5 shadow-sm">
   <div className="flex items-center gap-2 mb-2.5"><span className="text-cyan-500"><Clock3 className="w-4 h-4"/></span><h3 className="text-xs font-black uppercase tracking-wide">What Changed</h3></div>
   {changed.length?<div className="space-y-1.5">{changed.map((x,i)=><div key={`${x.type}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"><div className="min-w-0"><span className="font-black text-cyan-500 mr-2">{x.type}</span><span className="font-semibold">{x.label}</span>{x.value!==''&&x.value!==undefined?<span className="text-slate-400 ml-2">{String(x.value)}</span>:null}</div><time className="text-[10px] text-slate-400 whitespace-nowrap">{x.date?new Date(x.date).toLocaleString():'No timestamp'}</time></div>)}</div>:<div className="text-xs text-slate-400 py-2">No timestamped clinical changes documented yet.</div>}
  </section>
 </div>;
};
