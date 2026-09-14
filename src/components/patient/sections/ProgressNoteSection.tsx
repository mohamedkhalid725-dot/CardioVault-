import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Patient, ProgressNote } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface Props { patient: Patient; }

const now = () => ({ date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5) });

export const ProgressNoteSection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast, auth } = useApp();
  const notes = Array.isArray(patient.progressNotes) ? patient.progressNotes : [];
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id || null);
  const [editing, setEditing] = useState<ProgressNote | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (selectedId && notes.some((n) => n.id === selectedId)) return;
    setSelectedId(notes[0]?.id || null);
  }, [patient.id, notes.length, selectedId]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);
  const latestVital = patient.vitalsHistory?.[0];

  const openNew = () => {
    const t = now();
    setEditing({
      id: '', date: t.date, time: t.time, author: auth.userName || 'Physician', type: 'SOAP Note',
      subjective: '', objective: latestVital ? `BP ${latestVital.sbp}/${latestVital.dbp} mmHg, HR ${latestVital.hr} bpm, SpO₂ ${latestVital.spo2}%, RR ${latestVital.rr}/min.` : '',
      assessment: '', plan: '',
    });
    setShowModal(true);
  };

  const save = () => {
    if (!editing) return;
    if (!editing.author.trim() || !editing.plan.trim()) {
      showToast('Author and plan are required.', 'error');
      return;
    }
    const record: ProgressNote = { ...editing, id: editing.id || `note-${Date.now()}` };
    const next = editing.id ? notes.map((n) => n.id === editing.id ? record : n) : [record, ...notes];
    updatePatient(patient.id, { progressNotes: next });
    setSelectedId(record.id);
    setEditing(null);
    setShowModal(false);
    showToast(editing.id ? 'Progress note updated.' : 'Progress note saved.', 'success');
  };

  const remove = (id: string) => {
    if (!window.confirm('Delete this progress note permanently?')) return;
    const next = notes.filter((n) => n.id !== id);
    updatePatient(patient.id, { progressNotes: next });
    setSelectedId(next[0]?.id || null);
    showToast('Progress note deleted.', 'info');
  };

  return <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-500" /> Progress Notes</h2><p className="text-xs text-slate-500 dark:text-slate-400">Independent dated clinical notes with persistent history.</p></div><button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Plus className="w-4 h-4" /> New Progress Note</button></div>

    {notes.length === 0 ? <div className="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E]"><FileText className="w-8 h-8 mx-auto text-slate-400 mb-3" /><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Progress Notes recorded yet.</p><p className="text-xs text-slate-400 mt-1">Create the first clinical note for this patient.</p></div> : <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="space-y-2">{notes.map((n) => <button key={n.id} onClick={() => setSelectedId(n.id)} className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${selectedId === n.id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-slate-800'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-900 dark:text-white">{n.type || 'Clinical Note'}</span><span className="text-[10px] text-slate-400">{n.date} {n.time}</span></div><div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">{n.author || 'Physician'}</div></button>)}</div>
      <div className="md:col-span-2">{selected ? <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800"><div><h3 className="text-lg font-bold text-slate-900 dark:text-white">{selected.type || 'Clinical Note'}</h3><p className="text-xs text-slate-400">{selected.date} at {selected.time} • {selected.author || 'Physician'}</p></div><div className="flex gap-2"><button onClick={() => { setEditing({ ...selected }); setShowModal(true); }} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-cyan-500" title="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => remove(selected.id)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-rose-500" title="Delete"><Trash2 className="w-4 h-4" /></button></div></div>
        <div className="space-y-3 text-xs">{([['S','Subjective',selected.subjective],['O','Objective',selected.objective],['A','Assessment',selected.assessment],['P','Plan',selected.plan]] as const).map(([key,label,value]) => <div key={key} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><div className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase mb-1">[{key}] {label}</div><p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">{value || 'Not documented.'}</p></div>)}</div>
      </div> : <div className="p-8 text-center text-xs text-slate-400">Select a note.</div>}</div>
    </div>}

    {showModal && editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl"><div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800"><h3 className="text-lg font-bold text-slate-900 dark:text-white">{editing.id ? 'Edit Progress Note' : 'New Progress Note'}</h3><button onClick={() => { setShowModal(false); setEditing(null); }}><X className="w-5 h-5 text-slate-400" /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4"><label className="text-xs font-semibold">Date<input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2" /></label><label className="text-xs font-semibold">Time<input type="time" value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2" /></label><label className="text-xs font-semibold">Author<input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2" /></label><label className="text-xs font-semibold">Note Type<select value={editing.type || 'SOAP Note'} onChange={(e) => setEditing({ ...editing, type: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2"><option>SOAP Note</option><option>ICU Rounding</option><option>Consultation</option><option>Transfer Note</option><option>Discharge Summary</option></select></label></div>{([['subjective','Subjective'],['objective','Objective'],['assessment','Assessment'],['plan','Plan']] as const).map(([field,label]) => <label key={field} className="block text-xs font-semibold mb-3">{label}<textarea rows={field === 'plan' || field === 'objective' ? 4 : 3} value={editing[field] || ''} onChange={(e) => setEditing({ ...editing, [field]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2" /></label>)}<div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"><button onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 text-xs text-slate-500">Cancel</button><button onClick={save} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save Note</button></div></div></div>}
  </div>;
};
