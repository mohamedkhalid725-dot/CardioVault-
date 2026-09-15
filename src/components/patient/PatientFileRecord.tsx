import React,{useMemo,useState} from 'react';
import {ClipboardPlus,Clock3,Trash2,X} from 'lucide-react';
import {Patient,PatientRecord,PatientSectionId} from '../../types/clinical';
import {useApp} from '../../context/AppContext';

interface Props{patient:Patient;sectionId:PatientSectionId;sectionLabel:string;readOnly?:boolean;}

export const PatientFileRecord:React.FC<Props>=({patient,sectionId,sectionLabel,readOnly=false})=>{
 const{updatePatient,showToast}=useApp();
 const[open,setOpen]=useState(false);const[text,setText]=useState('');
 const records=useMemo(()=>((patient.records||[]).filter(r=>r.sectionId===sectionId)),[patient.records,sectionId]);
 const save=()=>{const value=text.trim();if(!value)return;const now=new Date();const record:PatientRecord={id:`record-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,sectionId,sectionLabel,note:value,timestamp:now.toISOString()};updatePatient(patient.id,{records:[record,...(patient.records||[])]});setText('');setOpen(false);showToast(`${sectionLabel} record saved.`,'success');};
 const remove=(id:string)=>updatePatient(patient.id,{records:(patient.records||[]).filter(r=>r.id!==id)});
 return <div className="mb-4">
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] dark:bg-cyan-500/[0.08] px-3.5 py-3">
   <div className="flex items-center gap-2.5 min-w-0"><ClipboardPlus className="w-4 h-4 text-cyan-500 shrink-0"/><div className="min-w-0"><div className="text-xs font-extrabold text-slate-900 dark:text-white">Section Record</div><div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{records.length?`${records.length} saved record${records.length===1?'':'s'}`:'No records yet'}</div></div></div>
   {!readOnly&&<button type="button" onClick={()=>setOpen(true)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold shadow-sm hover:bg-cyan-600"><ClipboardPlus className="w-3.5 h-3.5"/>Record</button>}
  </div>
  {records.length>0&&<div className="mt-2 space-y-2">{records.map(r=><div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3"><div className="flex items-center justify-between gap-2 mb-1"><span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Clock3 className="w-3 h-3"/>{new Date(r.timestamp).toLocaleString()}</span>{!readOnly&&<button type="button" onClick={()=>remove(r.id)} aria-label="Delete record" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5"/></button>}</div><p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">{r.note}</p></div>)}</div>}
  {open&&<div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] shadow-2xl p-5"><div className="flex items-center justify-between mb-4"><div><div className="text-base font-extrabold text-slate-900 dark:text-white">Record — {sectionLabel}</div><div className="text-[11px] text-slate-400 mt-0.5">A timestamped note saved to this patient file</div></div><button type="button" onClick={()=>setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4"/></button></div><textarea autoFocus value={text} onChange={e=>setText(e.target.value)} placeholder={`Enter ${sectionLabel} record...`} className="w-full min-h-[150px] resize-y rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white"/><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={()=>setOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">Cancel</button><button type="button" disabled={!text.trim()} onClick={save} className="px-4 py-2.5 rounded-xl bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold">Save Record</button></div></div></div>}
 </div>;
};
