import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Clock,
  Sparkles,
  Calendar,
  CheckCircle2,
  Trash2,
  Share2,
} from 'lucide-react';
import { Patient, ProgressNote } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ProgressNoteSectionProps {
  patient: Patient;
}

export const ProgressNoteSection: React.FC<ProgressNoteSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ProgressNote | null>(
    patient.progressNotes?.[0] || null
  );

  // New Note state
  const [noteType, setNoteType] = useState<ProgressNote['type']>('SOAP Note');
  const [author, setAuthor] = useState('Dr. Mohamed Khalid, MD (CCU Fellow)');
  const [subjective, setSubjective] = useState(
    'Patient rested well overnight. Denies recurrent chest tightness, orthopnea, or palpitations. Mild residual dyspnea upon ambulation.'
  );
  const [objective, setObjective] = useState(
    `Vitals: BP ${patient.vitals.bpSystolic}/${patient.vitals.bpDiastolic} mmHg, HR ${patient.vitals.heartRate} bpm, SpO2 ${patient.vitals.spo2}%, RR ${patient.vitals.respiratoryRate}/min.\nCVS: S1+S2 present, no murmurs. JVP flat.\nRespiratory: Clear bibasilar breath sounds.\nLabs: Peak Troponin resolving, Creatinine ${patient.labResults?.[0]?.value || 'stable'}.`
  );
  const [assessment, setAssessment] = useState(
    `Post-PCI Anterior STEMI (Day 2). Killip Class I. Preserved renal function. Patient hemodynamically stable, inotropes weaned.`
  );
  const [plan, setPlan] = useState(
    `1. CV: Continue Dual Antiplatelet Therapy (Aspirin 81mg + Ticagrelor 90mg BID). Titrate Bisoprolol to target HR 60-70.\n2. Renal: Maintain positive fluid balance tracking, repeat BMP tomorrow.\n3. Mobilization: Cardiac rehab phase 1, transfer to telemetry step-down floor.`
  );

  const notes = patient.progressNotes || [];

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const newNote: ProgressNote = {
      id: `note-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      author,
      type: noteType,
      subjective,
      objective,
      assessment,
      plan,
    };

    const updatedNotes = [newNote, ...notes];
    updatePatient(patient.id, { progressNotes: updatedNotes });
    setSelectedNote(newNote);
    setShowAddModal(false);
    showToast('Progress note signed and saved', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-500" /> Daily Clinical Documentation & SOAP Notes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            SOAP rounding notes, systems-based critical care summaries, and SBAR handover
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Progress Note
        </button>
      </div>

      {/* Main Grid: History column + Active note view */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Note History */}
        <div className="space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Note Archive ({notes.length})
          </span>

          <div className="space-y-2">
            {notes.map((n) => {
              const isSelected = selectedNote?.id === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() => setSelectedNote(n)}
                  className={`p-3.5 rounded-2xl cursor-pointer border transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 dark:bg-cyan-500/15 border-cyan-500/40 shadow-sm'
                      : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-slate-800 hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {n.type}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {n.date} {n.time}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {n.author}
                  </p>
                </div>
              );
            })}

            {notes.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800">
                No progress notes recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Selected Note View */}
        <div className="md:col-span-2">
          {selectedNote ? (
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {selectedNote.type}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Signed by {selectedNote.author} • {selectedNote.date} at {selectedNote.time}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 self-start sm:self-auto">
                  Signed in EHR
                </span>
              </div>

              {/* SOAP Body */}
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                    [S] Subjective & Overnight Events
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedNote.subjective}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                    [O] Objective Exam, Vitals & Diagnostics
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {selectedNote.objective}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                    [A] Clinical Assessment & Trajectory
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {selectedNote.assessment}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                    [P] Plan by Systems & Interventions
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {selectedNote.plan}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800">
              Select a note on the left or create a new one.
            </div>
          )}
        </div>
      </div>

      {/* Add Progress Note Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Compose Daily SOAP Clinical Note
            </h3>

            <form onSubmit={handleAddNote} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Note Type
                  </label>
                  <select
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    <option value="SOAP Note">Daily SOAP Rounding Note</option>
                    <option value="ICU Rounding">Systems-Based ICU Rounding</option>
                    <option value="Consultation">Cardiology Consultation Note</option>
                    <option value="Transfer Note">Transfer Note (SBAR)</option>
                    <option value="Discharge Summary">Discharge Summary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Attending / Fellow Signature
                  </label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  [S] Subjective (Symptoms, overnight complaints, pain)
                </label>
                <textarea
                  rows={2}
                  required
                  value={subjective}
                  onChange={(e) => setSubjective(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  [O] Objective (Physical exam, vitals, labs, hemodynamics)
                </label>
                <textarea
                  rows={3}
                  required
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  [A] Assessment (Clinical trajectory & differential)
                </label>
                <textarea
                  rows={2}
                  required
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  [P] Plan (By systems: CV, Resp, Renal, Meds, Lines, Disposition)
                </label>
                <textarea
                  rows={3}
                  required
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Sign & Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
