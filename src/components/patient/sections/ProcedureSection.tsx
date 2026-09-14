import React, { useState } from 'react';
import {
  Syringe,
  Plus,
  Activity,
  CheckCircle2,
  Calendar,
  User,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Patient, ClinicalProcedure } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ProcedureSectionProps {
  patient: Patient;
}

export const ProcedureSection: React.FC<ProcedureSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);

  // New procedure state
  const [name, setName] = useState('Central Venous Catheter (CVC)');
  const [site, setSite] = useState('Right Internal Jugular Vein');
  const [indication, setIndication] = useState('Vasoactive drug infusion & CVP monitoring');
  const [operator, setOperator] = useState('Dr. Mohamed Khalid');
  const [complications, setComplications] = useState('None. Good flash, catheter placed smoothly.');
  const [details, setDetails] = useState(
    'Ultrasound-guided puncture of RIJ under strict sterile conditions. 7 Fr triple-lumen catheter advanced over guidewire without resistance. Fixed at 15 cm at skin. Blood aspirated and flushed from all 3 lumens. Sterile dressing applied.'
  );

  const procedures = patient.procedures || [];

  const handleAddProcedure = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !site.trim()) return;

    const newProc: ClinicalProcedure = {
      id: `proc-${Date.now()}`,
      name,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      site,
      operator,
      indication,
      complications,
      details,
    };

    updatePatient(patient.id, { procedures: [newProc, ...procedures] });
    setShowAddModal(false);
    showToast('Procedure note recorded', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Syringe className="w-5 h-5 text-cyan-500" /> Bedside Procedures & Invasive Lines
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ultrasound-guided central lines, arterial lines, intubation notes, and chest drains
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Log Procedure
        </button>
      </div>

      {/* Procedures List */}
      <div className="space-y-4">
        {procedures.map((proc) => (
          <div
            key={proc.id}
            className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold">
                  <Syringe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {proc.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {proc.date}, {proc.time} • Site: {proc.site}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Operator:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {proc.operator}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 uppercase text-[10px] font-bold block mb-1">
                  Clinical Indication
                </span>
                <p className="text-slate-800 dark:text-slate-200 font-medium">{proc.indication}</p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 uppercase text-[10px] font-bold block mb-1">
                  Complications & Outcome
                </span>
                <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {proc.complications}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 uppercase text-[10px] font-bold block mb-1">
                Technique & Operative Description
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {proc.details}
              </p>
            </div>
          </div>
        ))}

        {procedures.length === 0 && (
          <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-[#111C2E] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            No invasive procedures documented for this patient.
          </div>
        )}
      </div>

      {/* Add Procedure Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Document Clinical Procedure
            </h3>

            <form onSubmit={handleAddProcedure} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Procedure Type
                  </label>
                  <select
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    <option value="Central Venous Catheter (CVC)">Central Venous Catheter (CVC)</option>
                    <option value="Arterial Line Insertion">Arterial Line Insertion</option>
                    <option value="Endotracheal Intubation">Endotracheal Intubation</option>
                    <option value="Temporary Cardiac Pacemaker">Temporary Cardiac Pacemaker Wire</option>
                    <option value="Thoracentesis / Chest Tube">Thoracentesis / Chest Tube</option>
                    <option value="Pericardiocentesis">Pericardiocentesis</option>
                    <option value="Lumbar Puncture">Lumbar Puncture</option>
                    <option value="Hemodialysis Vas-Cath">Hemodialysis Vas-Cath</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Anatomical Site
                  </label>
                  <input
                    type="text"
                    required
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Operator / Physician
                  </label>
                  <input
                    type="text"
                    required
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Indication
                </label>
                <input
                  type="text"
                  required
                  value={indication}
                  onChange={(e) => setIndication(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Technique & Description
                </label>
                <textarea
                  rows={3}
                  required
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
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
                  Save Procedure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
