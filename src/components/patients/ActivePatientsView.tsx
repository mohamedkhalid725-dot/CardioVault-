import React, { useMemo, useState } from 'react';
import { Search, Users, ChevronRight, BedDouble, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredWorkspaceAccess } from '../../services/workspaceAccess';

// The unit roster can hold hundreds of beds; render the list in pages so the
// first paint of this screen stays cheap on a phone.
const PAGE_SIZE = 50;

export const ActivePatientsView: React.FC = () => {
  const { patients, units, beds, setCurrentPatientId, setCurrentView } = useApp();
  const access = getStoredWorkspaceAccess();
  const allowedUnitIds = access?.role === 'owner' ? null : new Set((access?.unitIds?.length ? access.unitIds : access?.unitId ? [access.unitId] : []).map(String));
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const active = useMemo(() => patients.filter(p => !p.isArchived && !!p.bedId && beds.some(b => b.id === p.bedId && b.unitId === p.unitId && b.patientId === p.id) && (!allowedUnitIds || allowedUnitIds.has(String(p.unitId)))), [patients, beds, allowedUnitIds]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return active;
    return active.filter(p => {
      const unit = units.find(u => u.id === p.unitId)?.name || '';
      return [p.fullName, p.mrn, p.primaryDiagnosis, unit].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [active, query, units]);
  // Render a page of 50 at a time. Search always runs against the full list
  // above, so filtering is never limited to the rows already on screen.
  const visible = filtered.slice(0, visibleCount);
  const open = (id: string) => { setCurrentPatientId(id); setCurrentView('patient'); };
  const onSearch = (value: string) => { setQuery(value); setVisibleCount(PAGE_SIZE); };
  return <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-150">
    <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Users className="w-6 h-6 text-cyan-500"/> Active Patients</h1><p className="text-xs text-slate-500 dark:text-slate-400">All currently admitted patients across your clinical units.</p></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>onSearch(e.target.value)} placeholder="Search patient, MRN, diagnosis or unit..." className="w-full pl-9 pr-4 py-3 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"/></div>
    <div className="space-y-2">{visible.map(p=>{const unit=units.find(u=>u.id===p.unitId);const bed=beds.find(b=>b.id===p.bedId);const statusClass=p.status==='Critical'?'bg-rose-500/15 text-rose-500':p.status==='Unstable'?'bg-amber-500/15 text-amber-500':p.status==='Stable'?'bg-emerald-500/15 text-emerald-500':'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';return <button key={p.id} onClick={()=>open(p.id)} className="w-full text-left p-4 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 transition-all flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">{p.photoUrl?<img src={p.photoUrl} className="w-full h-full rounded-xl object-cover"/>:<Activity className="w-5 h-5"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-sm text-slate-900 dark:text-white">{p.fullName}</h3><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass}`}>{p.status}</span></div><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">MRN: {p.mrn} • {unit?.name || 'Unit'} • {bed?.bedNumber || 'Bed'}</p><p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">{p.primaryDiagnosis || 'No primary diagnosis documented'}</p></div><ChevronRight className="w-5 h-5 text-slate-400 shrink-0"/></button>})}</div>
    {filtered.length===0&&<div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400"><BedDouble className="w-8 h-8 mx-auto mb-2 opacity-50"/><p className="text-sm font-semibold">No active patients found.</p></div>}
    {filtered.length>visibleCount&&<div className="flex flex-col items-center gap-2 pt-1"><p className="text-[11px] text-slate-500 dark:text-slate-400">Showing {visible.length} of {filtered.length} patients</p><button onClick={()=>setVisibleCount(c=>c+PAGE_SIZE)} className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:border-cyan-500/50 transition-colors">Load more</button></div>}
  </div>;
};
