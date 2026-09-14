import React, { useState } from 'react';
import {
  HeartPulse,
  Plus,
  TrendingUp,
  Droplet,
  Activity,
  Calendar,
  AlertCircle,
  Brain,
  Thermometer,
} from 'lucide-react';
import { Patient, VitalSigns, FluidRecord } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface VitalsSectionProps {
  patient: Patient;
}

export const VitalsSection: React.FC<VitalsSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'vitals' | 'hemodynamics' | 'fluid'>('vitals');
  const [showAddVitalsModal, setShowAddVitalsModal] = useState(false);
  const [showAddFluidModal, setShowAddFluidModal] = useState(false);

  // New vitals state
  const [newSbp, setNewSbp] = useState(120);
  const [newDbp, setNewDbp] = useState(70);
  const [newHr, setNewHr] = useState(85);
  const [newRr, setNewRr] = useState(16);
  const [newSpo2, setNewSpo2] = useState(98);
  const [newTemp, setNewTemp] = useState(36.8);
  const [newGlucose, setNewGlucose] = useState(135);
  const [newGcsE, setNewGcsE] = useState(3);
  const [newGcsV, setNewGcsV] = useState(4);
  const [newGcsM, setNewGcsM] = useState(6);
  const [newRass, setNewRass] = useState(-1);

  // Hemodynamics state
  const [newCvp, setNewCvp] = useState(8);
  const [newArtLine, setNewArtLine] = useState('Radial Arterial Line (Invasive)');
  const [newCo, setNewCo] = useState(4.8);
  const [newCi, setNewCi] = useState(2.6);
  const [newSvr, setNewSvr] = useState(1150);

  // Fluid record state
  const [ivFluids, setIvFluids] = useState(1200);
  const [oralEnteral, setOralEnteral] = useState(600);
  const [medFlushes, setMedFlushes] = useState(250);
  const [bloodProducts, setBloodProducts] = useState(0);
  const [urineOutput, setUrineOutput] = useState(1500);
  const [drains, setDrains] = useState(100);
  const [ngSuction, setNgSuction] = useState(200);

  const vitalsList = patient.vitalsHistory || [];
  const latestVital = vitalsList[0];
  const fluidRecords = patient.fluidRecords || [];
  const latestFluid = fluidRecords[0];

  const handleAddVitals = (e: React.FormEvent) => {
    e.preventDefault();
    const gcsTotal = newGcsE + newGcsV + newGcsM;
    const newEntry: VitalSigns = {
      id: `vital-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sbp: newSbp,
      dbp: newDbp,
      hr: newHr,
      rr: newRr,
      spo2: newSpo2,
      temp: newTemp,
      glucose: newGlucose,
      gcsEye: newGcsE,
      gcsVerbal: newGcsV,
      gcsMotor: newGcsM,
      gcsTotal,
      rass: newRass,
      cvp: newCvp,
      arterialLine: newArtLine,
      cardiacOutput: newCo,
      cardiacIndex: newCi,
      svr: newSvr,
    };

    updatePatient(patient.id, { vitalsHistory: [newEntry, ...vitalsList] });
    setShowAddVitalsModal(false);
    showToast('New clinical vitals logged successfully', 'success');
  };

  const handleAddFluid = (e: React.FormEvent) => {
    e.preventDefault();
    const totalIntake = ivFluids + oralEnteral + medFlushes + bloodProducts;
    const totalOutput = urineOutput + drains + ngSuction;
    const netBalance = totalIntake - totalOutput;
    const hourlyUrineRate = Number((urineOutput / 24 / (patient.weight || 70)).toFixed(2));

    const newRecord: FluidRecord = {
      id: `fluid-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      ivFluids,
      oralEnteral,
      medFlushes,
      bloodProducts,
      totalIntake,
      urineOutput,
      drains,
      ngSuction,
      stool: 0,
      totalOutput,
      netBalance,
      hourlyUrineRate,
      cumulativeBalance: (latestFluid?.cumulativeBalance || 0) + netBalance,
      overloadPercentage: 2.1,
    };

    updatePatient(patient.id, { fluidRecords: [newRecord, ...fluidRecords] });
    setShowAddFluidModal(false);
    showToast('24h Fluid balance logged successfully', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-cyan-500" /> Vitals, Hemodynamics & Fluid Balance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            High-acuity ICU monitoring, invasive pressures, and 24-hour fluid shifts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFluidModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <Droplet className="w-4 h-4 text-cyan-500" /> Log Fluids
          </button>
          <button
            onClick={() => setShowAddVitalsModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record Vitals
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('vitals')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'vitals'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Vital Signs ({vitalsList.length})
        </button>
        <button
          onClick={() => setActiveTab('hemodynamics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'hemodynamics'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Invasive Hemodynamics
        </button>
        <button
          onClick={() => setActiveTab('fluid')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'fluid'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Fluid Intake & Balance
        </button>
      </div>

      {activeTab === 'vitals' && (
        <div className="space-y-6">
          {/* Latest Key Vitals Cards */}
          {latestVital && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-400 block font-semibold">Blood Pressure</span>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {latestVital.sbp}/{latestVital.dbp} <span className="text-xs text-slate-400 font-normal">mmHg</span>
                </div>
                <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                  MAP {Math.round((2 * latestVital.dbp + latestVital.sbp) / 3)} mmHg
                </span>
              </div>

              <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-400 block font-semibold">Heart Rate</span>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {latestVital.hr} <span className="text-xs text-slate-400 font-normal">bpm</span>
                </div>
                <span className="text-xs font-semibold text-emerald-500">RR {latestVital.rr} /min</span>
              </div>

              <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-400 block font-semibold">Oxygen Saturation</span>
                <div className="text-xl font-extrabold text-cyan-500 mt-1">
                  {latestVital.spo2}%
                </div>
                <span className="text-xs text-slate-400">Temp: {latestVital.temp}°C</span>
              </div>

              <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-400 block font-semibold">GCS & RASS</span>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  GCS {latestVital.gcsTotal}/15
                </div>
                <span className="text-xs font-semibold text-purple-500">RASS {latestVital.rass}</span>
              </div>
            </div>
          )}

          {/* Vitals History Log Table */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm text-slate-900 dark:text-white">
              Vitals Trend Timeline
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">BP (MAP)</th>
                    <th className="py-2.5 px-3">HR</th>
                    <th className="py-2.5 px-3">RR</th>
                    <th className="py-2.5 px-3">SpO₂</th>
                    <th className="py-2.5 px-3">Temp</th>
                    <th className="py-2.5 px-3">Glucose</th>
                    <th className="py-2.5 px-3">GCS</th>
                    <th className="py-2.5 px-3">RASS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {vitalsList.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-medium">{v.timestamp}</td>
                      <td className="py-2.5 px-3 font-semibold">
                        {v.sbp}/{v.dbp}{' '}
                        <span className="text-cyan-500">
                          ({Math.round((2 * v.dbp + v.sbp) / 3)})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{v.hr} bpm</td>
                      <td className="py-2.5 px-3">{v.rr}</td>
                      <td className="py-2.5 px-3 font-bold text-cyan-500">{v.spo2}%</td>
                      <td className="py-2.5 px-3">{v.temp}°C</td>
                      <td className="py-2.5 px-3">{v.glucose || '--'} mg/dL</td>
                      <td className="py-2.5 px-3 font-medium">
                        E{v.gcsEye}V{v.gcsVerbal}M{v.gcsMotor} ({v.gcsTotal})
                      </td>
                      <td className="py-2.5 px-3">{v.rass}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hemodynamics' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-500" /> Advanced Hemodynamic Profiling
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">Central Venous Pressure (CVP)</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {latestVital?.cvp || 8} <span className="text-xs font-normal text-slate-400">mmHg</span>
              </div>
              <span className="text-xs text-emerald-500 font-medium">Optimal preload (8-12)</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">Cardiac Output / Index</span>
              <div className="text-2xl font-black text-cyan-500 mt-1">
                {latestVital?.cardiacOutput || 4.8} <span className="text-xs font-normal text-slate-400">L/min</span>
              </div>
              <span className="text-xs text-slate-400">CI: {latestVital?.cardiacIndex || 2.6} L/min/m²</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">Systemic Vascular Resistance (SVR)</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {latestVital?.svr || 1150} <span className="text-xs font-normal text-slate-400">dynes·s/cm⁵</span>
              </div>
              <span className="text-xs text-emerald-500 font-medium">Normal Afterload (800-1200)</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fluid' && (
        <div className="space-y-5">
          {/* Summary Box */}
          {latestFluid && (
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-xl border border-cyan-200 dark:border-cyan-900/40">
                  <span className="text-xs text-cyan-700 dark:text-cyan-400 font-bold block">Total Intake</span>
                  <div className="text-xl font-extrabold text-cyan-800 dark:text-cyan-300 mt-1">
                    {latestFluid.totalIntake} mL
                  </div>
                </div>

                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40">
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-bold block">Total Output</span>
                  <div className="text-xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">
                    {latestFluid.totalOutput} mL
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold block">24h Net Balance</span>
                  <div className="text-xl font-extrabold text-emerald-800 dark:text-emerald-300 mt-1">
                    {latestFluid.netBalance > 0 ? `+${latestFluid.netBalance}` : latestFluid.netBalance} mL
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-bold block">Hourly Urine Rate</span>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {latestFluid.hourlyUrineRate} mL/kg/hr
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record Vitals Modal */}
      {showAddVitalsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Record Patient Vital Signs
            </h3>

            <form onSubmit={handleAddVitals} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Systolic BP (mmHg)
                  </label>
                  <input
                    type="number"
                    value={newSbp}
                    onChange={(e) => setNewSbp(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Diastolic BP (mmHg)
                  </label>
                  <input
                    type="number"
                    value={newDbp}
                    onChange={(e) => setNewDbp(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Heart Rate (bpm)
                  </label>
                  <input
                    type="number"
                    value={newHr}
                    onChange={(e) => setNewHr(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SpO₂ (%)
                  </label>
                  <input
                    type="number"
                    value={newSpo2}
                    onChange={(e) => setNewSpo2(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Respiratory Rate (/min)
                  </label>
                  <input
                    type="number"
                    value={newRr}
                    onChange={(e) => setNewRr(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Temperature (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newTemp}
                    onChange={(e) => setNewTemp(parseFloat(e.target.value) || 37)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              {/* GCS breakdown */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Glasgow Coma Scale: {newGcsE + newGcsV + newGcsM}/15
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block">Eye (1-4)</label>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={newGcsE}
                      onChange={(e) => setNewGcsE(parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Verbal (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={newGcsV}
                      onChange={(e) => setNewGcsV(parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Motor (1-6)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={newGcsM}
                      onChange={(e) => setNewGcsM(parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddVitalsModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Save Vitals
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Fluid Balance Modal */}
      {showAddFluidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Log 24h Fluid Intake & Output
            </h3>

            <form onSubmit={handleAddFluid} className="space-y-4 pt-2">
              <div className="space-y-2">
                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                  Intake Channels (mL)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block">IV Fluids</label>
                    <input
                      type="number"
                      value={ivFluids}
                      onChange={(e) => setIvFluids(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block">Oral / Tube Feeds</label>
                    <input
                      type="number"
                      value={oralEnteral}
                      onChange={(e) => setOralEnteral(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Output Channels (mL)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block">Urine Output (24h)</label>
                    <input
                      type="number"
                      value={urineOutput}
                      onChange={(e) => setUrineOutput(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block">Drains / Chest Tubes</label>
                    <input
                      type="number"
                      value={drains}
                      onChange={(e) => setDrains(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddFluidModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Save Fluid Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
