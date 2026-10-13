import React, { useState } from 'react';
import { ClipboardPlus, X, Loader2 } from 'lucide-react';
import { Patient, ProgressNote } from '../../types/clinical';
import { useApp } from '../../context/AppContext';

interface Props { patient: Patient; onClose: () => void; }

// Release v2.0.0 (no-AI): text-only quick record. Voice recording and AI
// transcription were removed entirely (deferred to a future version).
export const QuickClinicalRecord: React.FC<Props> = ({ patient, onClose }) => {
  const { updatePatient, showToast, auth } = useApp();
  const [text, setText] = useState('');
  const [type, setType] = useState('Quick Clinical Record');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const value = text.trim();
    if (!value) {
      showToast('Write the note first.', 'error');
      return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const id = `quick-${Date.now()}`;

      const note: ProgressNote = {
        id,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        author: auth.userName || 'Physician',
        type,
        subjective: '',
        objective: '',
        assessment: value,
        plan: value || 'Clinical record',
        updatedAt: now.toISOString(),
      };

      updatePatient(patient.id, {
        progressNotes: [note, ...(patient.progressNotes || [])],
      });

      showToast('Clinical record saved successfully.', 'success');
      onClose();
    } catch (error: any) {
      console.error('Quick clinical record save failed:', error);
      showToast('Clinical record could not be saved. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm p-3 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardPlus className="w-5 h-5 text-cyan-500" /> Quick Clinical Record
            </h2>
            <p className="text-[11px] text-slate-400">Saved as a dated Progress Note and shown in the patient timeline.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
          Record type
          <select value={type} onChange={(event) => setType(event.target.value)} disabled={saving} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm">
            <option>Quick Clinical Record</option><option>Rounding Update</option><option>Clinical Event</option><option>Consultation Update</option><option>Important Observation</option>
          </select>
        </label>

        <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} disabled={saving} placeholder="Document the important clinical event, observation, response, or update…" className="mt-3 w-full min-h-[170px] resize-y rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white" />

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={saving || !text.trim()} onClick={() => void save()} className="px-5 py-2.5 rounded-xl bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  );
};
