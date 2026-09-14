import React, { useState } from 'react';
import { Clock, Heart, Save, Check } from 'lucide-react';
import { Patient, CardiovascularHistory, ClinicalSummary } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface Props { patient: Patient; }
export const HistorySection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<ClinicalSummary>({ ...(patient.clinicalSummary || { chiefComplaint:'', hpi:'', pmh:[], psh:[], drugHistory:'', allergies:[], familyHistory:'', socialHistory:'' }) });
  const [cv, setCv] = useState<CardiovascularHistory>({ ...(patient.cardiovascularHistory || {} as CardiovascularHistory) });
  const factors: Array<{ key: keyof CardiovascularHistory; label: string }> = [
    {key:'hypertension',label:'Hypertension'},{key:'diabetes',label:'Diabetes Mellitus'},{key:'dyslipidemia',label:'Dyslipidemia'},{key:'cad',label:'Coronary Artery Disease (CAD)'},{key:'previousMI',label:'Previous Myocardial Infarction'},{key:'heartFailure',label:'Heart Failure'},{key:'arrhythmias',label:'Arrhythmias / AF'},{key:'valvularDisease',label:'Valvular Heart Disease'},{key:'previousPCI',label:'Previous PCI / Stenting'},{key:'previousCABG',label:'Previous CABG Surgery'},{key:'previousStroke',label:'Previous Stroke / TIA'},{key:'pvd',label:'Peripheral Vascular Disease (PVD)'},{key:'smoking',label:'Tobacco / Smoking History'},{key:'alcohol',label:'Alcohol Intake'}
  ];
  const save = () => { updatePatient(patient.id, { clinicalSummary: summary, cardiovascularHistory: cv }); setEditing(false); showToast('Clinical History updated successfully', 'success'); };
  const text = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm';
  return <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Clock className="w-5 h-5 text-cyan-500" /> Patient Medical & Cardiovascular History</h2><p className="text-xs text-slate-500 dark:text-slate-400">Comprehensive anamnesis and cardiovascular risk factors</p></div><button onClick={() => editing ? save() : setEditing(true)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${editing ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-slate-950'}`}>{editing ? <><Check className="w-4 h-4" /> Save Changes</> : <><Save className="w-4 h-4" /> Edit History</>}</button></div>
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> Cardiovascular & Atherosclerotic Risk Profile</h3><div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-2">{factors.map((f) => { const present = Boolean(cv[f.key]); return <button key={f.key} type="button" disabled={!editing} onClick={() => setCv((p) => ({...p, [f.key]: !p[f.key]}))} className={`min-h-11 w-full flex items-start gap-2 p-3 rounded-xl text-[11px] sm:text-xs leading-tight font-semibold text-left border transition-all ${present ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-rose-700 dark:text-rose-300' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}><span className={`mt-0.5 w-4 h-4 shrink-0 rounded-md border flex items-center justify-center ${present ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-400'}`}>{present && <Check className="w-3 h-3" />}</span><span className="min-w-0 break-words">{f.label}</span></button>; })}</div></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[
      ['Chief Complaint','chiefComplaint'],['Home Drug History','drugHistory'],['History of Present Illness (HPI)','hpi'],['Family History','familyHistory'],['Social History & Habitus','socialHistory']
    ].map(([label,key], i) => <div key={key} className={`${key === 'hpi' ? 'md:col-span-2' : ''} bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2`}><label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">{label}</label>{editing ? (key === 'hpi' ? <textarea rows={4} value={(summary as any)[key] || ''} onChange={(e) => setSummary({...summary,[key]:e.target.value})} className={text} /> : <input value={(summary as any)[key] || ''} onChange={(e) => setSummary({...summary,[key]:e.target.value})} className={text} />) : <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{(summary as any)[key] || 'Not documented.'}</p>}</div>)}
    </div>
  </div>;
};
