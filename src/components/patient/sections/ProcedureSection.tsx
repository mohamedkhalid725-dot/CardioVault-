import React, { useState } from 'react';
import { Syringe, Plus, Trash2 } from 'lucide-react';
import { ClinicalProcedure, Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface Props { patient: Patient; }
const procedureTypes = ['Central Venous Catheter (CVC)','Arterial Line Insertion','Endotracheal Intubation','Temporary Cardiac Pacemaker','Thoracentesis / Chest Tube','Pericardiocentesis','Lumbar Puncture','Hemodialysis Vas-Cath','Surgery'];

export const ProcedureSection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const procedures = Array.isArray(patient.procedures) ? patient.procedures : [];
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('Central Venous Catheter (CVC)');
  const [surgeryName, setSurgeryName] = useState('');
  const [site, setSite] = useState('');
  const [indication, setIndication] = useState('');
  const [operator, setOperator] = useState('');
  const [details, setDetails] = useState('');
  const [complications, setComplications] = useState('None');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const exactName = type === 'Surgery' ? surgeryName.trim() : type;
    if (!exactName) { showToast('Enter the exact surgery/procedure name.', 'error'); return; }
    const d = new Date();
    const record: ClinicalProcedure = { id: `proc-${Date.now()}`, name: exactName, procedure: type, surgeryName: type === 'Surgery' ? exactName : undefined, date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0,5), site, indication, operator, details, complications };
    updatePatient(patient.id, { procedures: [record, ...procedures] });
    setOpen(false); setSurgeryName(''); setSite(''); setIndication(''); setDetails(''); showToast('Procedure recorded.', 'success');
  };

  const remove = (id: string) => { if (!window.confirm('Delete this procedure record?')) return; updatePatient(patient.id, { procedures: procedures.filter((p) => p.id !== id) }); showToast('Procedure deleted.', 'info'); };
  const input = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm';

  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Syringe className="w-5 h-5 text-cyan-500" /> Procedures</h2><p className="text-xs text-slate-500 dark:text-slate-400">Document bedside procedures and operative interventions.</p></div><button onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Plus className="w-4 h-4 inline mr-1" /> Log Procedure</button></div>
    {procedures.length === 0 ? <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">No procedures documented for this patient.</div> : <div className="space-y-3">{procedures.map((p) => <div key={p.id} className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">{p.procedure === 'Surgery' ? `Surgery — ${p.surgeryName || p.name}` : (p.name || p.procedure || 'Procedure')}</h3><p className="text-xs text-slate-400">{p.date} {p.time}{p.site ? ` • ${p.site}` : ''}{p.operator ? ` • ${p.operator}` : ''}</p></div><button onClick={() => remove(p.id)} className="p-2 text-rose-500"><Trash2 className="w-4 h-4" /></button></div><div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60">Indication: {p.indication || '—'}</div><div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60">Complications: {p.complications || '—'}</div></div>{p.details && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{p.details}</p>}</div>)}</div>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-2xl p-5 border border-slate-200 dark:border-slate-800"><h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Document Procedure</h3><form onSubmit={save} className="space-y-3"><label className="block text-xs font-semibold">Procedure Type<select value={type} onChange={(e) => setType(e.target.value)} className={input + ' mt-1'}>{procedureTypes.map((t) => <option key={t}>{t}</option>)}</select></label>{type === 'Surgery' && <label className="block text-xs font-semibold">Exact Surgery / Procedure Name<input required value={surgeryName} onChange={(e) => setSurgeryName(e.target.value)} placeholder="e.g. CABG, Emergency Laparotomy, Valve Replacement" className={input + ' mt-1'} /></label>}<div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs font-semibold">Site<input value={site} onChange={(e) => setSite(e.target.value)} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">Operator<input value={operator} onChange={(e) => setOperator(e.target.value)} className={input + ' mt-1'} /></label></div><label className="block text-xs font-semibold">Indication<input value={indication} onChange={(e) => setIndication(e.target.value)} className={input + ' mt-1'} /></label><label className="block text-xs font-semibold">Technique / Details<textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} className={input + ' mt-1'} /></label><label className="block text-xs font-semibold">Complications / Outcome<input value={complications} onChange={(e) => setComplications(e.target.value)} className={input + ' mt-1'} /></label><div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-xs text-slate-500">Cancel</button><button type="submit" className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save Procedure</button></div></form></div></div>}
  </div>;
};
