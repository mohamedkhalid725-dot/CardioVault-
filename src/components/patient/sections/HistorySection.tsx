import React, { useState } from 'react';
import { Clock, Heart, Save, Check, Plus, X } from 'lucide-react';
import { Patient, ClinicalSummary } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { VoiceDictationButton } from '../VoiceDictationButton';
import { useIsPreviousViewer } from '../PreviousAdmissionViewer';
import {
  HISTORY_CONDITION_CHIPS,
  buildSelectedConditions,
  dedupeConditionLabels,
  isPredefinedConditionLabel,
  latestHistoryUpdate,
  syncLegacyConditionFlags,
} from '../../../services/historyConditions';

interface Props { patient: Patient; }

const formatHistoryStamp = (value: string | null): string | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : null;
};

export const HistorySection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const isPreviousViewer = useIsPreviousViewer();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<ClinicalSummary>({ ...(patient.clinicalSummary || { chiefComplaint:'', hpi:'', pmh:[], psh:[], drugHistory:'', allergies:[], familyHistory:'', socialHistory:'' }) });
  const [selected, setSelected] = useState<string[]>(() => buildSelectedConditions(patient.cardiovascularHistory, patient.additionalConditions));
  const [customInput, setCustomInput] = useState('');
  const historyStamp = formatHistoryStamp(latestHistoryUpdate(patient.auditTrail));
  const toggle = (label: string) => {
    if (isPreviousViewer) return;
    const key = label.trim().toLowerCase();
    setSelected((prev) => prev.some((v) => v.trim().toLowerCase() === key)
      ? prev.filter((v) => v.trim().toLowerCase() !== key)
      : [...prev, label]);
  };
  const addCustom = () => {
    if (isPreviousViewer) return;
    const value = customInput.trim();
    if (!value) return;
    setSelected((prev) => dedupeConditionLabels([...prev, value]));
    setCustomInput('');
  };
  const removeCustom = (label: string) => {
    if (isPreviousViewer) return;
    const key = label.trim().toLowerCase();
    setSelected((prev) => prev.filter((v) => v.trim().toLowerCase() !== key));
  };
  const save = () => {
    if (isPreviousViewer) return;
    const conditions = dedupeConditionLabels(selected);
    updatePatient(patient.id, {
      clinicalSummary: summary,
      cardiovascularHistory: { ...(patient.cardiovascularHistory || {} as Patient['cardiovascularHistory']), ...syncLegacyConditionFlags(conditions) },
      additionalConditions: conditions,
    });
    setEditing(false);
    showToast('Clinical History updated successfully', 'success');
  };
  const text = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm';
  const customChips = selected.filter((v) => !isPredefinedConditionLabel(v));
  return <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Clock className="w-5 h-5 text-cyan-500" /> Patient Medical & Cardiovascular History</h2><p className="text-xs text-slate-500 dark:text-slate-400">Comprehensive anamnesis and cardiovascular risk factors</p></div>{!isPreviousViewer && <button onClick={() => editing ? save() : setEditing(true)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${editing ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-slate-950'}`}>{editing ? <><Check className="w-4 h-4" /> Save Changes</> : <><Save className="w-4 h-4" /> Edit History</>}</button>}</div>
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> Cardiovascular & Atherosclerotic Risk Profile</h3><div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-2">{HISTORY_CONDITION_CHIPS.map((c) => { const present = selected.some((v) => v.trim().toLowerCase() === c.label.toLowerCase()); return <button key={c.key} type="button" disabled={!editing} onClick={() => toggle(c.label)} className={`min-h-11 w-full flex items-start gap-2 p-3 rounded-xl text-[11px] sm:text-xs leading-tight font-semibold text-left border transition-all ${present ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-rose-700 dark:text-rose-300' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}><span className={`mt-0.5 w-4 h-4 shrink-0 rounded-md border flex items-center justify-center ${present ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-400'}`}>{present && <Check className="w-3 h-3" />}</span><span className="min-w-0 break-words">{c.label}</span></button>; })}</div>{customChips.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{customChips.map((v) => <span key={v.toLowerCase()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-violet-500/10 border border-violet-500/40 text-violet-700 dark:text-violet-300">{v}{editing && <button type="button" onClick={() => removeCustom(v)} aria-label={`Remove ${v}`} className="p-0.5 rounded-full hover:bg-violet-500/20"><X className="w-3 h-3" /></button>}</span>)}</div>}{editing && <div className="flex items-center gap-2 pt-1"><input value={customInput} onChange={(e) => setCustomInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="+ Add condition (e.g. Epilepsy)" className={text + ' flex-1'} /><button type="button" onClick={addCustom} disabled={!customInput.trim()} className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-violet-500 text-white text-xs font-bold disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add</button></div>}</div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[
      ['Chief Complaint','chiefComplaint'],['Home Drug History','drugHistory'],['History of Present Illness (HPI)','hpi'],['Family History','familyHistory'],['Social History & Habitus','socialHistory']
    ].map(([label,key], i) => <div key={key} className={`${key === 'hpi' ? 'md:col-span-2' : ''} bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2`}><label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">{label}</label>{key === 'hpi' && <div className="text-[10px] text-slate-400">HPI last updated: {historyStamp || 'Not documented yet'}</div>}{editing ? <div className="flex items-start gap-2">{key === 'hpi' ? <textarea rows={4} value={(summary as any)[key] || ''} onChange={(e) => setSummary({...summary,[key]:e.target.value})} className={text+' flex-1'} /> : <input value={(summary as any)[key] || ''} onChange={(e) => setSummary({...summary,[key]:e.target.value})} className={text+' flex-1'} />}<VoiceDictationButton value={(summary as any)[key] || ''} onApply={(draft)=>setSummary({...summary,[key]:draft})} fieldLabel={String(label)} /></div> : <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{(summary as any)[key] || 'Not documented.'}</p>}</div>)}
    </div>
  </div>;
};
