import React, { useState } from 'react';
import {
  Pill,
  Plus,
  Activity,
  Clock,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Patient, Medication, Infusion } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface MedicationSectionProps {
  patient: Patient;
}

export const MedicationSection: React.FC<MedicationSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'infusions' | 'scheduled' | 'prn'>('infusions');
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [showAddInfusionModal, setShowAddInfusionModal] = useState(false);

  // New med state
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medRoute, setMedRoute] = useState('Oral');
  const [medFreq, setMedFreq] = useState('Once daily (OD)');
  const [medIndication, setMedIndication] = useState('');

  // New infusion state
  const [infDrug, setInfDrug] = useState('Norepinephrine');
  const [infDose, setInfDose] = useState('0.05');
  const [infUnit, setInfUnit] = useState('mcg/kg/min');
  const [infRate, setInfRate] = useState('3.8');

  const meds = patient.medications || [];
  const infusions = patient.infusions || [];

  const scheduledMeds = meds.filter((m) => m.type === 'Scheduled');
  const prnMeds = meds.filter((m) => m.type === 'PRN');

  const handleAddMed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim()) return;

    const newMed: Medication = {
      id: `med-${Date.now()}`,
      name: medName.trim(),
      dose: medDose.trim(),
      route: medRoute,
      frequency: medFreq,
      indication: medIndication.trim() || 'Therapeutic',
      type: activeTab === 'prn' ? 'PRN' : 'Scheduled',
    };

    updatePatient(patient.id, { medications: [...meds, newMed] });
    setShowAddMedModal(false);
    setMedName('');
    setMedDose('');
    showToast(`Added ${newMed.name}`, 'success');
  };

  const handleAddInfusion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!infDrug.trim()) return;

    const newInf: Infusion = {
      id: `inf-${Date.now()}`,
      drugName: infDrug.trim(),
      dose: infDose.trim(),
      unit: infUnit,
      rateMlHr: parseFloat(infRate) || 1.0,
      concentration: '4 mg / 50 mL D5W',
      carrierFluid: 'D5W',
      lineSite: 'Right Subclavian CVC',
    };

    updatePatient(patient.id, { infusions: [...infusions, newInf] });
    setShowAddInfusionModal(false);
    showToast(`Started infusion ${newInf.drugName}`, 'success');
  };

  const handleDeleteMed = (id: string) => {
    updatePatient(patient.id, { medications: meds.filter((m) => m.id !== id) });
    showToast('Medication removed', 'info');
  };

  const handleDeleteInfusion = (id: string) => {
    updatePatient(patient.id, { infusions: infusions.filter((i) => i.id !== id) });
    showToast('Infusion discontinued', 'info');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-cyan-500" /> Pharmacotherapy & Continuous Infusions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Vasoactive titration, ICU sedatives, scheduled cardiac regimens & PRN medications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddInfusionModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <Activity className="w-4 h-4 text-cyan-500" /> + Infusion
          </button>
          <button
            onClick={() => setShowAddMedModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> + Medication
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('infusions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'infusions'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Continuous Infusions ({infusions.length})
        </button>

        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'scheduled'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Scheduled Medications ({scheduledMeds.length})
        </button>

        <button
          onClick={() => setActiveTab('prn')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'prn'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          PRN / As Needed ({prnMeds.length})
        </button>
      </div>

      {/* Infusions Tab */}
      {activeTab === 'infusions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {infusions.map((inf) => (
              <div
                key={inf.id}
                className="bg-white dark:bg-[#111C2E] border border-cyan-500/30 dark:border-cyan-500/30 rounded-2xl p-4.5 shadow-sm space-y-3 relative group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {inf.drugName}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {inf.concentration} • {inf.lineSite}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteInfusion(inf.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-60 group-hover:opacity-100"
                    title="Discontinue Infusion"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">
                      Target Dose
                    </span>
                    <span className="text-base font-extrabold text-cyan-500">
                      {inf.dose} {inf.unit}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">
                      Pump Rate
                    </span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                      {inf.rateMlHr} mL/hr
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {infusions.length === 0 && (
            <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-[#111C2E] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              No active continuous infusions running.
            </div>
          )}
        </div>
      )}

      {/* Scheduled Tab */}
      {activeTab === 'scheduled' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {scheduledMeds.map((med) => (
              <div
                key={med.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {med.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400">
                      {med.dose}
                    </span>
                    <span className="text-xs text-slate-400">• {med.route}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {med.frequency} • Indication: {med.indication}
                  </p>
                </div>

                <button
                  onClick={() => handleDeleteMed(med.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-60 group-hover:opacity-100"
                  title="Remove Medication"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {scheduledMeds.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">
                No scheduled regular medications recorded.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRN Tab */}
      {activeTab === 'prn' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {prnMeds.map((med) => (
              <div
                key={med.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {med.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500">
                      {med.dose}
                    </span>
                    <span className="text-xs text-slate-400">• {med.route}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    PRN: {med.indication}
                  </p>
                </div>

                <button
                  onClick={() => handleDeleteMed(med.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-60 group-hover:opacity-100"
                  title="Remove Medication"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Scheduled Med Modal */}
      {showAddMedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Add Patient Medication
            </h3>

            <form onSubmit={handleAddMed} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Medication Name *
                </label>
                <input
                  type="text"
                  required
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  placeholder="e.g. Atorvastatin, Metoprolol Succinate"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dose
                  </label>
                  <input
                    type="text"
                    required
                    value={medDose}
                    onChange={(e) => setMedDose(e.target.value)}
                    placeholder="e.g. 40 mg"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Route
                  </label>
                  <select
                    value={medRoute}
                    onChange={(e) => setMedRoute(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    <option value="Oral">Oral (PO)</option>
                    <option value="IV Push">IV Push</option>
                    <option value="Subcutaneous">Subcutaneous (SC)</option>
                    <option value="Nasogastric">Nasogastric (NG)</option>
                    <option value="Inhaled">Inhaled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Frequency
                </label>
                <input
                  type="text"
                  value={medFreq}
                  onChange={(e) => setMedFreq(e.target.value)}
                  placeholder="e.g. Once daily at bedtime"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Clinical Indication
                </label>
                <input
                  type="text"
                  value={medIndication}
                  onChange={(e) => setMedIndication(e.target.value)}
                  placeholder="e.g. Lipid lowering, Secondary stroke prevention"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddMedModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Add Medication
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Infusion Modal */}
      {showAddInfusionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Start Continuous Infusion
            </h3>

            <form onSubmit={handleAddInfusion} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Drug Name
                </label>
                <select
                  value={infDrug}
                  onChange={(e) => setInfDrug(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                >
                  <option value="Norepinephrine">Norepinephrine (Levophed)</option>
                  <option value="Epinephrine">Epinephrine</option>
                  <option value="Vasopressin">Vasopressin</option>
                  <option value="Dobutamine">Dobutamine</option>
                  <option value="Milrinone">Milrinone</option>
                  <option value="Nicardipine">Nicardipine</option>
                  <option value="Nitroglycerin">Nitroglycerin</option>
                  <option value="Propofol">Propofol</option>
                  <option value="Dexmedetomidine">Dexmedetomidine (Precedex)</option>
                  <option value="Fentanyl">Fentanyl</option>
                  <option value="Heparin Infusion">Heparin Infusion</option>
                  <option value="Regular Insulin">Regular Insulin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dose
                  </label>
                  <input
                    type="text"
                    value={infDose}
                    onChange={(e) => setInfDose(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={infUnit}
                    onChange={(e) => setInfUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pump Rate (mL/hr)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={infRate}
                  onChange={(e) => setInfRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddInfusionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Start Infusion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
