import React,{useMemo} from 'react';
import {Clock3} from 'lucide-react';
import type {Patient} from '../../types/clinical';

type AnyRecord=Record<string,any>;
const r=(v:any):AnyRecord=>v&&typeof v==='object'?v:{};
const arr=(...xs:any[])=>xs.flatMap(x=>Array.isArray(x)?x:[]);
const dateOf=(x:any)=>x?.date||x?.timestamp||x?.createdAt||x?.recordedAt||x?.datetime||'';
const labelOf=(x:any)=>x?.name||x?.label||x?.test||x?.parameter||x?.type||x?.drug||x?.medication||'';
const valueOf=(x:any)=>x?.value??x?.result??x?.reading??x?.measurement??x?.dose??'';
const latest=(items:any[])=>items.filter(Boolean).sort((a,b)=>new Date(dateOf(b)||0).getTime()-new Date(dateOf(a)||0).getTime())[0];
const find=(items:any[],pattern:RegExp)=>latest(items.filter(x=>pattern.test(String(labelOf(x)))));
const val=(v:any)=>v===undefined||v===null||v===''?'—':String(v);

const Box:React.FC<{title:string;icon:React.ReactNode;children:React.ReactNode;className?:string}>=({title,icon,children,className=''})=><section className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3.5 shadow-sm ${className}`}><div className="flex items-center gap-2 mb-2.5"><span className="text-cyan-500">{icon}</span><h3 className="text-xs font-black uppercase tracking-wide">{title}</h3></div>{children}</section>;
const Metric:React.FC<{label:string;value:any;unit?:string}>=({label,value,unit})=><div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5 min-w-0"><div className="text-[9px] uppercase tracking-wide font-bold text-slate-400">{label}</div><div className="text-sm sm:text-base font-black mt-0.5 truncate">{val(value)}{unit&&value!==undefined&&value!==null&&value!==''?<span className="text-[10px] font-bold text-slate-400 ml-1">{unit}</span>:null}</div></div>;

export const PatientSafetySnapshot:React.FC<{patient:Patient}>=({patient})=>{
 const p=r(patient);const vitals=arr(p.vitals,p.vitalSigns,p.vitalsHistory,p.vitalHistory);const labs=arr(p.labs,p.labResults,p.laboratoryResults,p.labsHistory);const echo=arr(p.echo,p.echoHistory);const meds=arr(p.medications,p.medicationHistory);const procedures=arr(p.procedures,p.procedureHistory);const ecg=arr(p.ecg,p.ecgHistory,p.ecgRecords);const imaging=arr(p.imaging,p.imagingHistory);
 const latestVital=(pattern:RegExp)=>valueOf(find(vitals,pattern));
 const bp=p.bloodPressure||p.bp||(p.systolicBP&&p.diastolicBP?`${p.systolicBP}/${p.diastolicBP}`:'');
 const hr=p.heartRate||p.hr||latestVital(/heart rate|^hr$/i);const spo2=p.spo2||p.oxygenSaturation||latestVital(/spo2|oxygen saturation/i);const rr=p.respiratoryRate||p.rr||latestVital(/respiratory rate|^rr$/i);const temp=p.temperature||p.temp||latestVital(/temperature|^temp$/i);
 const gcs=p.gcs||r(p.examination).neurological?.gcs;const rass=p.rass||p.rassScore;const fio2=p.fio2||r(p.ventilator).fio2;const urine=p.urineOutput||p.urineOutput24h||latestVital(/urine output/i);const fluid=p.fluidBalance||p.netFluidBalance;
 const map=p.map||((Number(p.systolicBP)&&Number(p.diastolicBP))?Math.round((Number(p.systolicBP)+2*Number(p.diastolicBP))/3):'');
 const hb=valueOf(find(labs,/hemoglobin|^hb$/i));const cr=valueOf(find(labs,/creatinine/i));const k=valueOf(find(labs,/^k$|potassium/i));const lact=valueOf(find(labs,/lactate/i));const trop=valueOf(find(labs,/troponin/i));const ef=p.ef||p.ejectionFraction||valueOf(find(echo,/ef|ejection fraction/i));
 const changed=useMemo(()=>{const source:[string,any[]][]=[['Vitals',vitals],['Labs',labs],['ECG',ecg],['Echo',echo],['Medications',meds],['Procedures',procedures],['Imaging',imaging],['Progress',arr(p.progressNotes,p.progressHistory)]];return source.flatMap(([type,items])=>{const x=latest(items);return x?[{type,date:dateOf(x),label:labelOf(x)||type,value:valueOf(x)}]:[]}).sort((a,b)=>new Date(b.date||0).getTime()-new Date(a.date||0).getTime()).slice(0,8)},[vitals,labs,ecg,echo,meds,procedures,imaging,p.progressNotes,p.progressHistory]);
 return <div className="space-y-3 mb-4">
   <Box title="Patient Safety Bar" icon={<ShieldAlert className="w-4 h-4"/>}><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{safety.map(([k,v])=><div key={k} className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50/70 dark:bg-slate-900/40"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{k}</div><div className="text-xs font-bold mt-1 break-words">{v}</div></div>)}</div></Box>
   <Box title="Clinical Snapshot" icon={<HeartPulse className="w-4 h-4"/>}><div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2"><Metric label="BP" value={bp} unit={bp?'mmHg':''}/><Metric label="MAP" value={map} unit={map?'mmHg':''}/><Metric label="HR" value={hr} unit={hr?'bpm':''}/><Metric label="SpO₂" value={spo2} unit={spo2?'%':''}/><Metric label="RR" value={rr} unit={rr?'/min':''}/><Metric label="Temp" value={temp} unit={temp?'°C':''}/><Metric label="GCS" value={gcs}/><Metric label="RASS" value={rass}/><Metric label="Urine" value={urine} unit={urine?'mL/24h':''}/><Metric label="Fluid balance" value={fluid}/><Metric label="FiO₂" value={fio2} unit={fio2?'%':''}/><Metric label="Ventilator" value={r(p.ventilator).mode||p.ventilatorStatus||'—'}/></div></Box>
   <Box title="Key Data" icon={<Activity className="w-4 h-4"/>}><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"><Metric label="Hb" value={hb} unit={hb?'g/dL':''}/><Metric label="Creatinine" value={cr} unit={cr?'mg/dL':''}/><Metric label="K" value={k} unit={k?'mmol/L':''}/><Metric label="Troponin" value={trop}/><Metric label="Lactate" value={lact} unit={lact?'mmol/L':''}/><Metric label="EF" value={ef} unit={ef?'%':''}/></div></Box>
   <Box title="What Changed" icon={<Clock3 className="w-4 h-4"/>}>{changed.length?<div className="space-y-1.5">{changed.map((x,i)=><div key={`${x.type}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"><div className="min-w-0"><span className="font-black text-cyan-500 mr-2">{x.type}</span><span className="font-semibold">{x.label}</span>{x.value!==''&&x.value!==undefined?<span className="text-slate-400 ml-2">{String(x.value)}</span>:null}</div><time className="text-[10px] text-slate-400 whitespace-nowrap">{x.date?new Date(x.date).toLocaleString():'No timestamp'}</time></div>)}</div>:<div className="text-xs text-slate-400 py-2">No timestamped clinical changes documented yet.</div>}</Box>
 </div>;
};
