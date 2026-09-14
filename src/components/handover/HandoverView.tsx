import React, { useState } from 'react';
import { Users, Copy, Printer, CheckCircle2, BedDouble, Filter, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient } from '../../types/clinical';

export const HandoverView: React.FC = () => {
  const { patients, units, beds, showToast, setCurrentPatientId, setCurrentView } = useApp();
  const [unitFilter, setUnitFilter] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const activePatients = patients.filter((p) => !p.isArchived);
  const filtered = unitFilter === 'all' ? activePatients : activePatients.filter((p) => p.unitId === unitFilter);

  const sbar = (p: Patient) => {
    const unit = units.find((u) => u.id === p.unitId);
    const bed = beds.find((b) => b.id === p.bedId);
    const v = p.vitalsHistory?.[0];
    const note = p.progressNotes?.[0];
    return `[SBAR HANDOVER]\n${unit?.name || 'Unit'} — ${bed?.bedNumber || '--'}\nPATIENT: ${p.fullName}, ${p.age}y ${p.sex} | MRN: ${p.mrn} | Status: ${p.status} | Code: ${p.codeStatus}\nSITUATION: ${p.primaryDiagnosis} | Admitted ${p.admissionDate} ${p.admissionTime || ''}\nBACKGROUND: PMH ${p.clinicalSummary?.pmh?.join(', ') || 'Not documented'} | Allergies ${p.allergies?.join(', ') || 'NKDA'}\nASSESSMENT: BP ${v?.sbp ?? '--'}/${v?.dbp ?? '--'} mmHg, HR ${v?.hr ?? '--'} bpm, SpO2 ${v?.spo2 ?? '--'}%, Temp ${v?.temp ?? '--'}°C | LVEF ${p.cardiology?.echo?.ef ?? '--'}%\nRECOMMENDATION: ${note?.plan || 'Continue current monitoring and clinical plan.'}`;
  };

  const copy = async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) setCopiedId(id);
      showToast('Handover copied to clipboard.', 'success');
      if (id) window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      showToast('Clipboard access is unavailable on this device.', 'error');
    }
  };

  const openPatient = (id: string) => {
    setCurrentPatientId(id);
    setCurrentView('patient');
  };

  return <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
      <div><h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-500" /> Clinical Shift Handover & SBAR</h1><p className="text-xs text-slate-500 dark:text-slate-400">Structured physician-to-physician handover across {units.length} clinical divisions.</p></div>
      <div className="flex gap-2"><button onClick={() => copy(filtered.map(sbar).join('\n\n--------------------\n\n'))} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"><Copy className="w-4 h-4 text-cyan-500" /> Copy Census SBAR</button><button onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Printer className="w-4 h-4" /> Print Handover</button></div>
    </div>

    <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#111C2E] p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><Filter className="w-4 h-4 text-slate-400" /><button onClick={() => setUnitFilter('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${unitFilter === 'all' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>All Units ({activePatients.length})</button>{units.map((u) => <button key={u.id} onClick={() => setUnitFilter(u.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${unitFilter === u.id ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{u.name} ({activePatients.filter((p) => p.unitId === u.id).length})</button>)}</div>

    <div className="space-y-4">{filtered.map((p) => { const unit = units.find((u) => u.id === p.unitId); const bed = beds.find((b) => b.id === p.bedId); const v = p.vitalsHistory?.[0]; return <div key={p.id} className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 print:break-inside-avoid print:bg-white print:text-black">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center"><BedDouble className="w-5 h-5" /></div><div><h3 className="font-bold text-slate-900 dark:text-white">{p.fullName}</h3><p className="text-xs text-cyan-600 dark:text-cyan-400">{unit?.name || 'Unit'} — {bed?.bedNumber || '--'} • MRN {p.mrn}</p></div></div><div className="flex gap-2"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800">{p.status}</span><button onClick={() => copy(sbar(p), p.id)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">{copiedId === p.id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</button><button onClick={() => openPatient(p.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Open File <ArrowRight className="w-3.5 h-3.5" /></button></div></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><b className="text-rose-500 block mb-1">Situation</b>{p.primaryDiagnosis}</div><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><b className="text-amber-500 block mb-1">Background</b>PMH: {p.clinicalSummary?.pmh?.join(', ') || 'Not documented'}<br />Allergies: {p.allergies?.join(', ') || 'NKDA'}</div><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><b className="text-cyan-500 block mb-1">Assessment</b>BP {v?.sbp ?? '--'}/{v?.dbp ?? '--'} • HR {v?.hr ?? '--'} • SpO₂ {v?.spo2 ?? '--'}%<br />LVEF {p.cardiology?.echo?.ef ?? '--'}%</div><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><b className="text-emerald-500 block mb-1">Plan</b>{p.progressNotes?.[0]?.plan || 'Continue current monitoring and plan.'}</div></div>
    </div>; })}</div>
    {filtered.length === 0 && <div className="p-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">No active patients in this unit for shift handover.</div>}
  </div>;
};
