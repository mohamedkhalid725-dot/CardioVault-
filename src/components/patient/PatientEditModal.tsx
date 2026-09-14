import React, { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import { Patient } from '../../types/clinical';
import { useApp } from '../../context/AppContext';

interface Props { patient: Patient; isOpen: boolean; onClose: () => void; }

export const PatientEditModal: React.FC<Props> = ({ patient, isOpen, onClose }) => {
  const { updatePatient, showToast } = useApp();
  const [draft, setDraft] = useState<Partial<Patient>>({});

  useEffect(() => {
    if (isOpen) setDraft({
      fullName: patient.fullName,
      mrn: patient.mrn,
      age: patient.age,
      sex: patient.sex,
      weight: patient.weight,
      height: patient.height,
      primaryDiagnosis: patient.primaryDiagnosis,
      secondaryDiagnoses: [...(patient.secondaryDiagnoses || [])],
      allergies: [...(patient.allergies || [])],
      codeStatus: patient.codeStatus,
      admissionDate: patient.admissionDate,
      admissionTime: patient.admissionTime,
    });
  }, [isOpen, patient]);

  if (!isOpen) return null;

  const input = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white';
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(draft.fullName || '').trim()) { showToast('Patient name is required.', 'error'); return; }
    updatePatient(patient.id, {
      ...draft,
      fullName: String(draft.fullName).trim(),
      mrn: String(draft.mrn || patient.mrn).trim(),
      age: Number(draft.age) || 0,
      weight: Number(draft.weight) || 0,
      height: Number(draft.height) || 0,
      primaryDiagnosis: String(draft.primaryDiagnosis || '').trim(),
      secondaryDiagnoses: Array.isArray(draft.secondaryDiagnoses) ? draft.secondaryDiagnoses : [],
      allergies: Array.isArray(draft.allergies) ? draft.allergies : [],
    });
    showToast('Patient information updated.', 'success');
    onClose();
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-white/95 dark:bg-[#111C2E]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit Patient</h2><p className="text-xs text-slate-500 dark:text-slate-400">Update demographic and admission information for this patient.</p></div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-5 h-5"/></button>
      </div>
      <form onSubmit={save} className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">Full Name<input className={input+' mt-1'} value={String(draft.fullName || '')} onChange={e=>setDraft({...draft,fullName:e.target.value})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">MRN<input className={input+' mt-1'} value={String(draft.mrn || '')} onChange={e=>setDraft({...draft,mrn:e.target.value})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Age<input type="number" min="0" className={input+' mt-1'} value={Number(draft.age ?? 0)} onChange={e=>setDraft({...draft,age:Number(e.target.value)})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Sex<select className={input+' mt-1'} value={String(draft.sex || 'Other')} onChange={e=>setDraft({...draft,sex:e.target.value as Patient['sex']})}><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Weight (kg)<input type="number" min="0" step="0.1" className={input+' mt-1'} value={Number(draft.weight ?? 0)} onChange={e=>setDraft({...draft,weight:Number(e.target.value)})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Height (cm)<input type="number" min="0" step="0.1" className={input+' mt-1'} value={Number(draft.height ?? 0)} onChange={e=>setDraft({...draft,height:Number(e.target.value)})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">Primary Diagnosis<input className={input+' mt-1'} value={String(draft.primaryDiagnosis || '')} onChange={e=>setDraft({...draft,primaryDiagnosis:e.target.value})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">Secondary Diagnoses (comma separated)<input className={input+' mt-1'} value={(draft.secondaryDiagnoses || []).join(', ')} onChange={e=>setDraft({...draft,secondaryDiagnoses:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">Allergies (comma separated)<input className={input+' mt-1'} value={(draft.allergies || []).join(', ')} onChange={e=>setDraft({...draft,allergies:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Code Status<select className={input+' mt-1'} value={String(draft.codeStatus || 'Full Code')} onChange={e=>setDraft({...draft,codeStatus:e.target.value as Patient['codeStatus']})}><option>Full Code</option><option>DNR</option><option>DNI</option><option>Comfort Measures Only</option></select></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Admission Date<input type="date" className={input+' mt-1'} value={String(draft.admissionDate || '')} onChange={e=>setDraft({...draft,admissionDate:e.target.value})}/></label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Admission Time<input type="time" className={input+' mt-1'} value={String(draft.admissionTime || '')} onChange={e=>setDraft({...draft,admissionTime:e.target.value})}/></label>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500">Cancel</button><button type="submit" className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Save className="inline w-3.5 h-3.5 mr-1"/>Save Changes</button></div>
      </form>
    </div>
  </div>;
};
