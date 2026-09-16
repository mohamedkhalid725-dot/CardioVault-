import React from 'react';
import { Activity, AlertTriangle, Clock3, Droplet, FileText, FlaskConical, Heart, Pill, ShieldAlert, Wind } from 'lucide-react';
import { Patient, PatientSectionId } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface OverviewSectionProps { patient: Patient; }
type EventItem={id:string;time:string;label:string;detail:string;section:PatientSectionId;icon:React.ElementType};
const dash=(v:unknown)=>v===undefined||v===null||v===''?'—':String(v);
const latest=(a?:unknown[])=>a&&a.length?(a[0] as any):undefined;
const stamp=(v?:string)=>v?v.replace('T',' '):'—';

export const OverviewSection:React.FC<OverviewSectionProps>=({patient})=>{
 const{setActivePatientSection}=useApp();
 const vital=latest(patient.vitalsHistory as unknown[]);const fluid=latest(patient.fluidRecords as unknown[]);const abg=latest(patient.ventilator?.abgHistory as unknown[]);const ecg=latest(patient.ecgRecords as unknown[]);const procedure=latest(patient.procedures as unknown[]);const progress=latest(patient.progressNotes as unknown[]);const lab=latest(patient.labs as unknown[]);const calculator=latest(patient.calculatorResults as unknown[]);
 const open=(s:PatientSectionId)=>setActivePatientSection(s);
 const map=vital?Math.round((vital.sbp+2*vital.dbp)/3):undefined;
 const urine=fluid?.hourlyUrineRate??fluid?.urineOutput;const balance=fluid?.cumulativeBalance??fluid?.netBalance;const fio2=patient.ventilator?.fio2;
 const events:EventItem[]=[
  vital&&{id:`v-${vital.id}`,time:vital.timestamp,label:'Vitals updated',detail:`BP ${vital.sbp}/${vital.dbp} • HR ${vital.hr} • SpO₂ ${vital.spo2}%`,section:'vitals',icon:Activity},
  lab&&{id:`l-${lab.date}`,time:lab.date,label:'Laboratory panel',detail:`Hb ${dash(lab.hb)} • Cr ${dash(lab.creatinine)} • K ${dash(lab.k)}`,section:'labs',icon:FlaskConical},
  ecg&&{id:`e-${ecg.id}`,time:`${ecg.date} ${ecg.time}`,label:'ECG recorded',detail:`${dash(ecg.heartRate)} bpm • ${dash(ecg.rhythm)}`,section:'ecg',icon:Heart},
  abg&&{id:`a-${abg.id}`,time:abg.timestamp,label:'ABG recorded',detail:`pH ${dash(abg.ph)} • PaCO₂ ${dash(abg.paco2)} • PaO₂ ${dash(abg.pao2)}`,section:'icu',icon:Wind},
  procedure&&{id:`p-${procedure.id}`,time:`${procedure.date} ${procedure.time}`,label:'Procedure recorded',detail:dash(procedure.procedure||procedure.name||procedure.surgeryName),section:'procedure',icon:ShieldAlert},
  progress&&{id:`n-${progress.id}`,time:`${progress.date} ${progress.time}`,label:'Progress note',detail:dash(progress.type||progress.clinicalStatus||progress.plan).slice(0,120),section:'progress',icon:FileText},
  calculator&&{id:`c-${calculator.id}`,time:calculator.timestamp,label:'Calculator result',detail:`${calculator.name}: ${dash(calculator.score)}`,section:'calculators',icon:FlaskConical},
 ].filter(Boolean) as EventItem[];
 const safety=[
  ['Allergies',patient.allergies?.length?patient.allergies.join(', '):'NKDA',patient.allergies?.length?'rose':'slate'],
  ['Code status',dash(patient.codeStatus),'slate'],
  ['Active problems',patient.secondaryDiagnoses?.length?`${patient.secondaryDiagnoses.length} recorded`:'None recorded','slate'],
 ] as const;
 const metrics:[string,string,string,PatientSectionId][]=[
  ['BP',vital?`${vital.sbp}/${vital.dbp}`:'—',map?`MAP ${map}`:'Not documented','vitals'],
  ['HR',vital?`${vital.hr} bpm`:'—',vital?stamp(vital.timestamp):'Not documented','vitals'],
  ['SpO₂',vital?`${vital.spo2}%`:'—',fio2!==undefined?`FiO₂ ${fio2}%`:'FiO₂ —','vitals'],
  ['RR',vital?`${vital.rr}/min`:'—',vital?stamp(vital.timestamp):'Not documented','vitals'],
  ['Temp',vital?`${vital.temp} °C`:'—','Recorded value','vitals'],
  ['GCS',vital?`${vital.gcsTotal}/15`:'—',vital?`E${vital.gcsEye} V${vital.gcsVerbal} M${vital.gcsMotor}`:'Not documented','vitals'],
  ['RASS',vital?String(vital.rass):'—','Recorded value','icu'],
  ['Fluid balance',balance!==undefined?`${balance>0?'+':''}${balance} mL`:'—',urine!==undefined?`Urine ${urine} mL/kg/hr`:'Urine —','vitals'],
 ];
 return <div className="space-y-4 animate-in fade-in duration-150">
  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] shadow-sm overflow-hidden">
   <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">Clinical Snapshot</p><h2 className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">{patient.fullName}</h2><p className="text-xs text-slate-500 mt-1">MRN {dash(patient.mrn)} • {patient.age} y • {patient.sex} • {dash(patient.primaryDiagnosis)}</p></div><button onClick={()=>open('history')} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold hover:border-cyan-500/40">Open history</button></div></div>
   <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-slate-200 dark:bg-slate-800">{metrics.map(([label,main,sub,target])=><button key={label} onClick={()=>open(target)} className="text-left p-3 bg-white dark:bg-[#111C2E] hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 transition-colors"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span><span className="block mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{main}</span><span className="block mt-0.5 text-[10px] text-slate-400 truncate">{sub}</span></button>)}</div>
  </section>
  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4"><div className="flex items-center gap-2 mb-3"><ShieldAlert className="w-4 h-4 text-rose-500"/><h3 className="text-sm font-bold">Patient Safety Bar</h3><span className="text-[10px] text-slate-400">Recorded information</span></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{safety.map(([label,value,tone])=><div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400 font-bold">{label}</span><span className={`block mt-1 text-xs font-bold ${tone==='rose'?'text-rose-500':'text-slate-800 dark:text-slate-200'}`}>{value}</span></div>)}</div></section>
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
   <section className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-cyan-500"/><h3 className="text-sm font-bold">What Changed</h3></div><button onClick={()=>open('progress')} className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400">View notes</button></div>{events.length?<div className="space-y-2">{events.slice(0,6).map(e=>{const Icon=e.icon;return <button key={e.id} onClick={()=>open(e.section)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-cyan-500/30 text-left"><span className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0"><Icon className="w-4 h-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{e.label}</span><span className="block text-[11px] text-slate-500 truncate">{e.detail}</span></span><span className="text-[10px] text-slate-400 shrink-0">{stamp(e.time)}</span></button>})}</div>:<div className="py-8 text-center text-xs text-slate-400">No recent clinical activity recorded.</div>}</section>
   <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4"><div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-cyan-500"/><h3 className="text-sm font-bold">Clinical Summary</h3></div><div className="space-y-3 text-xs"><div><span className="text-[10px] font-bold uppercase text-slate-400">Chief complaint</span><p className="mt-1 font-semibold">{dash(patient.clinicalSummary?.chiefComplaint)}</p></div><div><span className="text-[10px] font-bold uppercase text-slate-400">HPI</span><p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-5">{dash(patient.clinicalSummary?.hpi)}</p></div><button onClick={()=>open('history')} className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold hover:border-cyan-500/40">Open full history</button></div></section>
  </div>
  <section className="grid grid-cols-2 sm:grid-cols-4 gap-3"><button onClick={()=>open('labs')} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-left"><FlaskConical className="w-4 h-4 text-cyan-500"/><span className="block mt-2 text-xs font-bold">Labs</span><span className="text-[11px] text-slate-400">{patient.labs.length} panels recorded</span></button><button onClick={()=>open('cardiology')} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-left"><Heart className="w-4 h-4 text-rose-500"/><span className="block mt-2 text-xs font-bold">Cardiology</span><span className="text-[11px] text-slate-400">EF {dash(patient.cardiology?.echo?.ef)}</span></button><button onClick={()=>open('medication')} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-left"><Pill className="w-4 h-4 text-cyan-500"/><span className="block mt-2 text-xs font-bold">Medications</span><span className="text-[11px] text-slate-400">{patient.medications.length} records</span></button><button onClick={()=>open('icu')} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-left"><Wind className="w-4 h-4 text-cyan-500"/><span className="block mt-2 text-xs font-bold">ICU / ABG</span><span className="text-[11px] text-slate-400">{patient.ventilator?.abgHistory?.length||0} ABG records</span></button></section>
  {patient.allergies?.length>0&&<div className="flex items-start gap-3 p-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 text-xs"><AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"/><div><span className="font-bold text-rose-600 dark:text-rose-400">Allergy information recorded</span><p className="text-slate-600 dark:text-slate-300 mt-0.5">{patient.allergies.join(', ')}</p></div></div>}
  <div className="text-[10px] text-slate-400 flex items-center gap-1"><Droplet className="w-3 h-3"/> Snapshot values come only from recorded patient data. Missing data is shown as —.</div>
 </div>;
};
