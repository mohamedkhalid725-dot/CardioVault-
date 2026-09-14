import React, { useState } from 'react';
import {
  Wind,
  Plus,
  Activity,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import { Patient, VentilatorSettings, ABGRecord } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { MedicalCalculators } from '../../../services/calculators';

interface ICUSectionProps {
  patient: Patient;
}

export const ICUSection: React.FC<ICUSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'vent' | 'abg'>('vent');
  const [showAddABGModal, setShowAddABGModal] = useState(false);
  const [isEditingVent, setIsEditingVent] = useState(false);

  const vent = patient.ventilator;
  const abgs = vent.abgHistory || [];
  const latestABG = abgs[0];

  // Vent settings state
  const [mode, setMode] = useState(vent.mode);
  const [tidalVolume, setTidalVolume] = useState(vent.tidalVolume);
  const [rate, setRate] = useState(vent.respiratoryRate);
  const [peep, setPeep] = useState(vent.peep);
  const [fio2, setFio2] = useState(vent.fio2);
  const [ppeak, setPpeak] = useState(vent.peakPressure);
  const [pplat, setPplat] = useState(vent.plateauPressure);

  // New ABG state
  const [newPh, setNewPh] = useState(7.4);
  const [newPaco2, setNewPaco2] = useState(40);
  const [newPao2, setNewPao2] = useState(95);
  const [newHco3, setNewHco3] = useState(24);
  const [newBe, setNewBe] = useState(0);
  const [newLactate, setNewLactate] = useState(1.2);

  // Auto-calculated ventilator mechanics
  const drivingPressure = pplat - peep;
  const staticCompliance = Math.round(tidalVolume / (drivingPressure || 1));
  const rsbi = Math.round(rate / (tidalVolume / 1000));

  const handleSaveVent = () => {
    updatePatient(patient.id, {
      ventilator: {
        ...vent,
        mode,
        tidalVolume,
        respiratoryRate: rate,
        peep,
        fio2,
        peakPressure: ppeak,
        plateauPressure: pplat,
        drivingPressure,
        compliance: staticCompliance,
      },
    });
    setIsEditingVent(false);
    showToast('Ventilator parameters updated', 'success');
  };

  const handleAddABG = (e: React.FormEvent) => {
    e.preventDefault();
    const abgAnalysis = MedicalCalculators.calculateABG(
      newPh,
      newPaco2,
      newHco3,
      newPao2,
      fio2
    );

    const newRecord: ABGRecord = {
      id: `abg-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ph: newPh,
      paco2: newPaco2,
      pao2: newPao2,
      hco3: newHco3,
      be: newBe,
      lactate: newLactate,
      fio2: fio2,
      pfRatio: abgAnalysis.pfRatio,
      interpretation: abgAnalysis.primaryDisorder,
      anionGap: 12,
    };

    updatePatient(patient.id, {
      ventilator: {
        ...vent,
        abgHistory: [newRecord, ...abgs],
      },
    });
    setShowAddABGModal(false);
    showToast('New ABG panel recorded', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wind className="w-5 h-5 text-sky-500" /> Mechanical Ventilation & Arterial Blood Gas (ABG)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Respiratory mechanics, protective lung strategy (ARDSnet) and automated acid-base diagnostics
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'vent' ? (
            <button
              onClick={() => {
                if (isEditingVent) handleSaveVent();
                else setIsEditingVent(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-sm"
            >
              {isEditingVent ? 'Save Ventilator' : 'Adjust Settings'}
            </button>
          ) : (
            <button
              onClick={() => setShowAddABGModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Log New ABG
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('vent')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'vent'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Ventilator Settings & Mechanics
        </button>

        <button
          onClick={() => setActiveTab('abg')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'abg'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Arterial Blood Gas Panels ({abgs.length})
        </button>
      </div>

      {/* Ventilator Settings Tab */}
      {activeTab === 'vent' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Gauge className="w-4 h-4 text-sky-500" /> Active Ventilator Mode & Targets
              </h3>
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30">
                Mode: {vent.mode}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Tidal Volume (Vt)</span>
                {isEditingVent ? (
                  <input
                    type="number"
                    value={tidalVolume}
                    onChange={(e) => setTidalVolume(parseInt(e.target.value) || 400)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {vent.tidalVolume} <span className="text-xs text-slate-400 font-normal">mL</span>
                  </div>
                )}
                <span className="text-[11px] text-slate-400">~6.2 mL/kg PBW</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Set Respiratory Rate</span>
                {isEditingVent ? (
                  <input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(parseInt(e.target.value) || 16)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {vent.respiratoryRate} <span className="text-xs text-slate-400 font-normal">/min</span>
                  </div>
                )}
                <span className="text-[11px] text-slate-400">Total VE: ~7.2 L/min</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">PEEP</span>
                {isEditingVent ? (
                  <input
                    type="number"
                    value={peep}
                    onChange={(e) => setPeep(parseInt(e.target.value) || 5)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {vent.peep} <span className="text-xs text-slate-400 font-normal">cmH₂O</span>
                  </div>
                )}
                <span className="text-[11px] text-slate-400">Alveolar recruitment</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">FiO₂</span>
                {isEditingVent ? (
                  <input
                    type="number"
                    value={fio2}
                    onChange={(e) => setFio2(parseInt(e.target.value) || 40)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-xl font-extrabold text-cyan-500 mt-1">
                    {vent.fio2}%
                  </div>
                )}
                <span className="text-[11px] text-emerald-500">Weaning eligible</span>
              </div>
            </div>
          </div>

          {/* Respiratory Mechanics & Driving Pressure (Critical Care Target) */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" /> Respiratory Mechanics & Lung Protection
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Peak Pressure (Ppeak)</span>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {vent.peakPressure} cmH₂O
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Plateau Pressure (Pplat)</span>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {vent.plateauPressure} cmH₂O
                </div>
                <span className="text-[11px] text-emerald-500">Safe (&lt; 30 cmH₂O)</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Driving Pressure (ΔP)</span>
                <div className="text-lg font-extrabold text-cyan-500 mt-1">
                  {drivingPressure} cmH₂O
                </div>
                <span className="text-[11px] text-emerald-500">Target &lt; 15 cmH₂O</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Static Compliance (Cstat)</span>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {staticCompliance} mL/cmH₂O
                </div>
                <span className="text-[11px] text-slate-400">Moderate elasticity</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABG Panels Tab */}
      {activeTab === 'abg' && (
        <div className="space-y-4">
          {latestABG && (
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Latest ABG Diagnostic Impression ({latestABG.timestamp})
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-500 border border-cyan-500/30">
                  P/F Ratio: {latestABG.pfRatio}
                </span>
              </div>
              <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                {latestABG.interpretation}
              </p>
            </div>
          )}

          {/* Historical ABG Table */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">pH</th>
                    <th className="py-2.5 px-3">PaCO₂</th>
                    <th className="py-2.5 px-3">PaO₂</th>
                    <th className="py-2.5 px-3">HCO₃⁻</th>
                    <th className="py-2.5 px-3">BE</th>
                    <th className="py-2.5 px-3">Lactate</th>
                    <th className="py-2.5 px-3">FiO₂</th>
                    <th className="py-2.5 px-3">P/F Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {abgs.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-medium">{a.timestamp}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {a.ph}
                      </td>
                      <td className="py-2.5 px-3">{a.paco2} mmHg</td>
                      <td className="py-2.5 px-3 font-semibold text-cyan-500">{a.pao2} mmHg</td>
                      <td className="py-2.5 px-3">{a.hco3} mEq/L</td>
                      <td className="py-2.5 px-3">{a.be}</td>
                      <td className="py-2.5 px-3 font-semibold text-rose-500">
                        {a.lactate} mmol/L
                      </td>
                      <td className="py-2.5 px-3">{a.fio2}%</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {a.pfRatio}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add ABG Modal */}
      {showAddABGModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Log Arterial Blood Gas (ABG)
            </h3>

            <form onSubmit={handleAddABG} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    pH (7.35 - 7.45)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPh}
                    onChange={(e) => setNewPh(parseFloat(e.target.value) || 7.4)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PaCO₂ (mmHg)
                  </label>
                  <input
                    type="number"
                    value={newPaco2}
                    onChange={(e) => setNewPaco2(parseInt(e.target.value) || 40)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PaO₂ (mmHg)
                  </label>
                  <input
                    type="number"
                    value={newPao2}
                    onChange={(e) => setNewPao2(parseInt(e.target.value) || 90)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    HCO₃⁻ (mEq/L)
                  </label>
                  <input
                    type="number"
                    value={newHco3}
                    onChange={(e) => setNewHco3(parseInt(e.target.value) || 24)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Base Excess
                  </label>
                  <input
                    type="number"
                    value={newBe}
                    onChange={(e) => setNewBe(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lactate (mmol/L)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newLactate}
                    onChange={(e) => setNewLactate(parseFloat(e.target.value) || 1.0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddABGModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Compute & Save ABG
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
