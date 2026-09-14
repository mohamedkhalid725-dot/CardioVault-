import React, { useState } from 'react';
import {
  Heart,
  Activity,
  Zap,
  Gauge,
  Layers,
  Plus,
  Shield,
  FileCheck,
  TrendingUp,
} from 'lucide-react';
import { Patient, CardiologyModule, EchoReport, CathReport } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface CardiologySectionProps {
  patient: Patient;
}

export const CardiologySection: React.FC<CardiologySectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [subTab, setSubTab] = useState<'echo' | 'cath' | 'biomarkers' | 'devices' | 'scores'>('echo');
  const [isEditingEcho, setIsEditingEcho] = useState(false);

  const cardio = patient.cardiology;
  const echo = cardio.echo;
  const cath = cardio.cath;
  const biomarkers = cardio.biomarkers;

  const [ef, setEf] = useState(echo.ef);
  const [tapse, setTapse] = useState(echo.tapse);
  const [pasp, setPasp] = useState(echo.pasp);
  const [rwmaSummary, setRwmaSummary] = useState(echo.rwmaSummary);
  const [pericardium, setPericardium] = useState(echo.pericardialEffusion);

  const handleSaveEcho = () => {
    let lvFunction: EchoReport['lvFunction'] = 'Normal (≥50%)';
    if (ef < 30) lvFunction = 'Severely Reduced (<30%)';
    else if (ef < 40) lvFunction = 'Moderately Reduced (30-39%)';
    else if (ef < 50) lvFunction = 'Mildly Reduced (40-49%)';

    const updatedEcho: EchoReport = {
      ...echo,
      ef,
      tapse,
      pasp,
      rwmaSummary,
      pericardialEffusion: pericardium,
      lvFunction,
    };

    updatePatient(patient.id, {
      cardiology: {
        ...cardio,
        echo: updatedEcho,
      },
    });
    setIsEditingEcho(false);
    showToast('Echocardiography report saved', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500" /> Comprehensive Cardiology Module
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Echocardiography, Coronary Catheterization (PCI), Biomarkers, and Mechanical Support
          </p>
        </div>

        {/* Acuity Status Tag */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#111C2E] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-400">Killip Class:</span>
          <span className="font-bold text-rose-500">{cardio.killipClass}</span>
          <span className="text-slate-400 ml-1">NYHA:</span>
          <span className="font-bold text-cyan-500">{cardio.nyhaClass}</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSubTab('echo')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            subTab === 'echo'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Echocardiography (TTE/TEE)
        </button>

        <button
          onClick={() => setSubTab('cath')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            subTab === 'cath'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Coronary Angiography (PCI)
        </button>

        <button
          onClick={() => setSubTab('biomarkers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            subTab === 'biomarkers'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Cardiac Biomarkers
        </button>

        <button
          onClick={() => setSubTab('devices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            subTab === 'devices'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Devices & Support (IABP / Impella)
        </button>
      </div>

      {/* Echo SubTab */}
      {subTab === 'echo' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" /> Transthoracic Echocardiogram (TTE)
                </h3>
                <span className="text-xs text-slate-400">{echo.date}</span>
              </div>
              <button
                onClick={() => {
                  if (isEditingEcho) handleSaveEcho();
                  else setIsEditingEcho(true);
                }}
                className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                {isEditingEcho ? 'Save Echo Data' : 'Edit Parameters'}
              </button>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">LV Ejection Fraction (LVEF)</span>
                {isEditingEcho ? (
                  <input
                    type="number"
                    value={ef}
                    onChange={(e) => setEf(parseInt(e.target.value) || 50)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold text-cyan-500"
                  />
                ) : (
                  <div className="text-2xl font-black text-cyan-500 mt-1">{echo.ef}%</div>
                )}
                <span className="text-[11px] text-slate-500">{echo.lvFunction}</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">RV TAPSE</span>
                {isEditingEcho ? (
                  <input
                    type="number"
                    value={tapse}
                    onChange={(e) => setTapse(parseInt(e.target.value) || 20)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {echo.tapse} <span className="text-xs font-normal text-slate-400">mm</span>
                  </div>
                )}
                <span className="text-[11px] text-emerald-500">RV function preserved</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">PASP (Estimated RVSP)</span>
                {isEditingEcho ? (
                  <input
                    type="number"
                    value={pasp}
                    onChange={(e) => setPasp(parseInt(e.target.value) || 28)}
                    className="w-full mt-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-sm font-bold"
                  />
                ) : (
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {echo.pasp} <span className="text-xs font-normal text-slate-400">mmHg</span>
                  </div>
                )}
                <span className="text-[11px] text-slate-500">Normal pulmonary pressure</span>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-xs font-semibold">Pericardium</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-2 truncate">
                  {echo.pericardialEffusion}
                </div>
                <span className="text-[11px] text-emerald-500">No tamponade signs</span>
              </div>
            </div>

            {/* Regional Wall Motion Abnormalities (RWMA) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Regional Wall Motion Abnormalities (RWMA)
              </span>
              {isEditingEcho ? (
                <textarea
                  rows={2}
                  value={rwmaSummary}
                  onChange={(e) => setRwmaSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                />
              ) : (
                <p className="text-xs text-slate-700 dark:text-slate-300">{echo.rwmaSummary}</p>
              )}
            </div>

            {/* Valvular Findings */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Valvular Morphology & Doppler
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300">{echo.valvesSummary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cath / PCI SubTab */}
      {subTab === 'cath' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-500" /> Coronary Angiogram & PCI Details
              </h3>
              <p className="text-xs text-slate-400">
                {cath.date} • {cath.indication} • Access: {cath.accessSite}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
              {cath.finalResult}
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Coronary Anatomy & Lesion Assessment
            </span>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {cath.findings}
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Stenting & Intervention Performed
            </span>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">
              {cath.intervention}
            </p>
          </div>
        </div>
      )}

      {/* Biomarkers SubTab */}
      {subTab === 'biomarkers' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-rose-500" /> Serial Cardiac Biomarkers
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">High-Sensitivity Troponin</span>
              <div className="text-xl font-bold text-rose-500 mt-1">{biomarkers.troponin}</div>
              <span className="text-[11px] text-slate-400">Delta negative / resolving</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">NT-proBNP / BNP</span>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {biomarkers.bnp}
              </div>
              <span className="text-[11px] text-slate-400">Post-stabilization target</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-xs font-semibold">CK-MB & D-Dimer</span>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                CK-MB: {biomarkers.ckmb}
              </div>
              <span className="text-[11px] text-slate-400">D-Dimer: {biomarkers.dDimer}</span>
            </div>
          </div>
        </div>
      )}

      {/* Devices & Support */}
      {subTab === 'devices' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-500" /> Pacemaker, ICD & Mechanical Circulatory Support
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Pacemaker / ICD
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                {cardio.pacemaker || 'None implanted'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Mechanical Support (IABP / Impella / ECMO)
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                {cardio.mechanicalSupport || 'None / Not currently indicated'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
