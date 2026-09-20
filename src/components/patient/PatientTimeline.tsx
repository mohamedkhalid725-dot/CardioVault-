import React,{useMemo} from 'react';
import {Activity,Clock3,FileText,FlaskConical,HeartPulse,Image as ImageIcon,Pill,Syringe,Wind,X} from 'lucide-react';
import {Patient} from '../../types/clinical';

interface Props{patient:Patient;onClose:()=>void;}
type Event={time:string;label:string;detail:string;icon:React.FC<{className?:string}>};
const iso=(date?:string,time?:string)=>date?new Date(`${date}T${time||'00:00'}`).getTime():0;
export const PatientTimeline:React.FC<Props>=({patient,onClose})=>{
 const events=useMemo<Event[]>(()=>{
  const audit=Array.isArray(patient.auditTrail)?patient.auditTrail:[];
  if(audit.length){
   return audit.map(e=>({time:e.timestamp,label:e.action,detail:e.fields?.length?`Fields updated: ${e.fields.join(', ')}`:'Patient file activity',icon:FileText})).sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime()).slice(0,200);
  }
  const out:Event[]=[];
  patient.progressNotes?.forEach(n=>out.push({time:`${n.date}T${n.time||'00:00'}`,label:n.type||'Progress Note',detail:n.assessment||n.plan||n.subjective||'',icon:FileText}));
  patient.vitalsHistory?.forEach(v=>out.push({time:v.timestamp,label:'Vitals',detail:`BP ${v.sbp}/${v.dbp} • HR ${v.hr} • SpO₂ ${v.spo2}% • RR ${v.rr} • Temp ${v.temp}°C • GCS ${v.gcsTotal}`,icon:HeartPulse}));
  patient.ecgRecords?.forEach(e=>out.push({time:`${e.date}T${e.time}`,label:'ECG',detail:e.finalImpression||e.rhythm||'ECG recorded',icon:Activity}));
  patient.labResults?.forEach(l=>out.push({time:l.timestamp||'',label:'Lab',detail:`${l.name||l.testName||'Test'}: ${l.value} ${l.unit||''} ${l.flag||l.status||''}`.trim(),icon:FlaskConical}));
  patient.imaging?.forEach(i=>out.push({time:`${i.date}T00:00`,label:'Imaging',detail:i.impression||i.findings||i.type||'Imaging study',icon:ImageIcon}));
  patient.procedures?.forEach(p=>out.push({time:`${p.date}T${p.time||'00:00'}`,label:'Procedure',detail:p.name||p.procedure||p.surgeryName||'Procedure recorded',icon:Syringe}));
  patient.medications?.forEach(m=>out.push({time:m.startDate||m.stopDate||'',label:`Medication • ${m.status||'Active'}`,detail:`${m.name||m.drug||'Medication'} ${m.dose} ${m.route} ${m.frequency}`.trim(),icon:Pill}));
  patient.ventilator?.abgHistory?.forEach(a=>out.push({time:a.timestamp,label:'ABG',detail:`pH ${a.ph} • PaCO₂ ${a.paco2} • PaO₂ ${a.pao2} • HCO₃ ${a.hco3}${a.interpretation?` • ${a.interpretation}`:''}`,icon:Wind}));
  return out.filter(e=>e.detail||e.label).sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime()).slice(0,150);
 },[patient]);
 return <div className="fixed inset-0 z-[115] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"><div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0E1626]/95"><div><h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Clock3 className="w-5 h-5 text-cyan-500"/>Unified Patient Timeline</h2><p className="text-[11px] text-slate-400">Every patient-file activity in true chronological order of addition</p></div><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button></div><div className="p-5">{events.length===0?<div className="py-12 text-center text-sm text-slate-400">No clinical events have been recorded yet.</div>:<div className="relative ml-2 border-l border-slate-200 dark:border-slate-800 pl-6 space-y-4">{events.map((e,i)=>{const Icon=e.icon;return <div key={`${e.time}-${e.label}-${i}`} className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4"><div className="absolute -left-[39px] top-4 w-7 h-7 rounded-full bg-white dark:bg-[#0E1626] border border-cyan-500/40 flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-cyan-500"/></div><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><b className="text-xs text-slate-900 dark:text-white">{e.label}</b><span className="text-[10px] text-slate-400">{e.time?new Date(e.time).toLocaleString():'Date not recorded'}</span></div><p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap">{e.detail||'Recorded event'}</p></div>})}</div>}</div></div></div>;
};
