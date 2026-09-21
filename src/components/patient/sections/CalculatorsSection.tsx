import React, { useState } from 'react';
import {
  Calculator,
  Heart,
  Activity,
  Droplet,
  Brain,
  Wind,
  Syringe,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { Patient } from '../../../types/clinical';
import { MedicalCalculators } from '../../../services/calculators';
import { useApp } from '../../../context/AppContext';

interface CalculatorsSectionProps {
  patient?: Patient;
}

type CategoryType = 'Cardiology' | 'ICU' | 'ABG' | 'Hemodynamics' | 'Renal' | 'Infusion';

export const CalculatorsSection: React.FC<CalculatorsSectionProps> = ({ patient }) => {
  const { showToast } = useApp();
  const [activeCategory, setActiveCategory] = useState<CategoryType>('Cardiology');

  // --- Cardiology State ---
  const [chaAge, setChaAge] = useState<number>(patient?.age || 58);
  const [chaSex, setChaSex] = useState<'Male' | 'Female'>(patient?.sex === 'Female' ? 'Female' : 'Male');
  const [chaChf, setChaChf] = useState(patient?.cardiovascularHistory?.heartFailure || false);
  const [chaHtn, setChaHtn] = useState(patient?.cardiovascularHistory?.hypertension ?? false);
  const [chaStroke, setChaStroke] = useState(patient?.cardiovascularHistory?.previousStroke || false);
  const [chaVascular, setChaVascular] = useState(patient?.cardiovascularHistory?.cad ?? false);
  const [chaDiabetes, setChaDiabetes] = useState(patient?.cardiovascularHistory?.diabetes ?? false);

  // HAS-BLED State
  const [hasHtn, setHasHtn] = useState(true);
  const [hasRenal, setHasRenal] = useState(false);
  const [hasLiver, setHasLiver] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [hasBleed, setHasBleed] = useState(false);
  const [hasLabileInr, setHasLabileInr] = useState(false);
  const [hasElderly, setHasElderly] = useState((patient?.age || 58) > 65);
  const [hasDrugs, setHasDrugs] = useState(true);
  const [hasAlcohol, setHasAlcohol] = useState(false);

  // HEART Score State
  const [heartHistory, setHeartHistory] = useState(2);
  const [heartEcg, setHeartEcg] = useState(1);
  const [heartAge, setHeartAge] = useState((patient?.age || 58) >= 65 ? 2 : (patient?.age || 58) >= 45 ? 1 : 0);
  const [heartRiskFactors, setHeartRiskFactors] = useState(2);
  const [heartTroponin, setHeartTroponin] = useState(1);

  // QTc State
  const [qtMs, setQtMs] = useState(440);
  const [qtHr, setQtHr] = useState(patient?.vitalsHistory?.[0]?.hr || 75);

  // --- ICU & Critical Care State ---
  const [sofaPao2, setSofaPao2] = useState(96);
  const [sofaFio2, setSofaFio2] = useState(35);
  const [sofaPlt, setSofaPlt] = useState(210);
  const [sofaBili, setSofaBili] = useState(0.8);
  const [sofaMap, setSofaMap] = useState(87);
  const [sofaGcs, setSofaGcs] = useState(15);
  const [sofaCr, setSofaCr] = useState(1.1);

  // qSOFA State
  const [qsofaRr, setQsofaRr] = useState(false);
  const [qsofaMental, setQsofaMental] = useState(false);
  const [qsofaSbp, setQsofaSbp] = useState(false);

  // Ventilator Mechanics State
  const [ventVt, setVentVt] = useState(450);
  const [ventPplat, setVentPplat] = useState(18);
  const [ventPeep, setVentPeep] = useState(5);
  const [ventRr, setVentRr] = useState(14);

  // --- ABG Systematic State ---
  const [abgPh, setAbgPh] = useState(7.39);
  const [abgPco2, setAbgPco2] = useState(38);
  const [abgHco3, setAbgHco3] = useState(24);
  const [abgNa, setAbgNa] = useState(140);
  const [abgCl, setAbgCl] = useState(102);
  const [abgAlbumin, setAbgAlbumin] = useState(4.0);
  const [abgPao2, setAbgPao2] = useState(96);
  const [abgFio2, setAbgFio2] = useState(35);

  // --- Hemodynamics State ---
  const [hemoSbp, setHemoSbp] = useState(patient?.vitalsHistory?.[0]?.sbp || 120);
  const [hemoDbp, setHemoDbp] = useState(patient?.vitalsHistory?.[0]?.dbp || 80);
  const [hemoHr, setHemoHr] = useState(patient?.vitalsHistory?.[0]?.hr || 75);
  const [hemoCvp, setHemoCvp] = useState((patient?.cardiology as any)?.invasiveHemodynamics?.cvp || 8);
  const [hemoCo, setHemoCo] = useState((patient?.cardiology as any)?.invasiveHemodynamics?.cardiacOutput || 4.5);
  const [hemoHt, setHemoHt] = useState(175);
  const [hemoWt, setHemoWt] = useState(78);

  // --- Renal & Electrolytes State ---
  const [renalCr, setRenalCr] = useState(1.1);
  const [renalAge, setRenalAge] = useState(patient?.age || 58);
  const [renalWt, setRenalWt] = useState(78);
  const [renalSex, setRenalSex] = useState<'Male' | 'Female'>(patient?.sex === 'Female' ? 'Female' : 'Male');
  const [naMeasured, setNaMeasured] = useState(132);
  const [glucoseMeasured, setGlucoseMeasured] = useState(280);
  const [caMeasured, setCaMeasured] = useState(8.0);
  const [albMeasured, setAlbMeasured] = useState(2.8);
  const [urineNa, setUrineNa] = useState(14);
  const [urineCr, setUrineCr] = useState(95);

  // --- Drug Infusion State ---
  const [infusionDrug, setInfusionDrug] = useState('Norepinephrine');
  const [infusionWeight, setInfusionWeight] = useState(75);
  const [infusionMg, setInfusionMg] = useState(4);
  const [infusionMl, setInfusionMl] = useState(250);
  const [infusionTargetDose, setInfusionTargetDose] = useState(0.08); // mcg/kg/min

  // Calculations
  const chaResult = MedicalCalculators.calcCHA2DS2VASc({
    chf: chaChf,
    htn: chaHtn,
    age75Plus: chaAge >= 75,
    diabetes: chaDiabetes,
    strokeOrTia: chaStroke,
    vascularDisease: chaVascular,
    age65To74: chaAge >= 65 && chaAge < 75,
    isFemale: chaSex === 'Female',
  });

  const hasResult = MedicalCalculators.calcHASBLED({
    hypertension: hasHtn,
    renalDisease: hasRenal,
    liverDisease: hasLiver,
    strokeHistory: hasStroke,
    priorBleeding: hasBleed,
    labileINR: hasLabileInr,
    elderly: hasElderly,
    drugs: hasDrugs,
    alcohol: hasAlcohol,
  });

  const heartResult = MedicalCalculators.calcHEART({
    history: heartHistory,
    ecg: heartEcg,
    age: heartAge,
    riskFactors: heartRiskFactors,
    troponin: heartTroponin,
  });

  const qtcResult = MedicalCalculators.calcQTc(qtMs, qtHr);

  const sofaResult = MedicalCalculators.calcSOFA({
    pao2: sofaPao2,
    fio2: sofaFio2,
    platelets: sofaPlt,
    bilirubin: sofaBili,
    map: sofaMap,
    gcs: sofaGcs,
    creatinine: sofaCr,
  });

  const qsofaResult = MedicalCalculators.calcQSOFA(qsofaRr, qsofaMental, qsofaSbp);

  const ventResult = MedicalCalculators.calcVentilator(ventVt, ventPplat, ventPeep, ventRr);

  const abgResult = MedicalCalculators.calcABGMetabolic({
    ph: abgPh,
    paco2: abgPco2,
    hco3: abgHco3,
    na: abgNa,
    cl: abgCl,
    albumin: abgAlbumin,
    pao2: abgPao2,
    fio2: abgFio2,
  });

  const hemoResult = MedicalCalculators.calcHemodynamics(
    hemoSbp,
    hemoDbp,
    hemoHr,
    hemoCvp,
    hemoHt,
    hemoWt,
    hemoCo
  );

  const crclResult = MedicalCalculators.calcCockcroftGault(renalAge, renalWt, renalCr, renalSex === 'Female');
  const electrolyteResult = MedicalCalculators.calcElectrolyteCorrections(naMeasured, glucoseMeasured, caMeasured, albMeasured);
  const fenaResult = MedicalCalculators.calcFENa(urineNa, naMeasured, urineCr, renalCr);
  const freeWaterDeficit = MedicalCalculators.calcFreeWaterDeficit(naMeasured, renalWt, renalSex);

  const infusionResult = MedicalCalculators.calcInfusion({
    weightKg: infusionWeight,
    drugAmountMg: infusionMg,
    diluentVolumeMl: infusionMl,
    targetDoseMcgKgMin: infusionTargetDose,
  });

  const handleResetToPatient = () => {
    if (!patient) return;
    setChaAge(patient.age);
    setChaSex(patient.sex === 'Female' ? 'Female' : 'Male');
    setChaChf(patient.cardiovascularHistory?.heartFailure || false);
    setChaHtn(patient.cardiovascularHistory?.hypertension || true);
    setChaStroke(patient.cardiovascularHistory?.previousStroke || false);
    setChaVascular(patient.cardiovascularHistory?.cad || true);
    setChaDiabetes(patient.cardiovascularHistory?.diabetes || true);
    setHemoSbp(patient.vitalsHistory?.[0]?.sbp || 120);
    setHemoDbp(patient.vitalsHistory?.[0]?.dbp || 80);
    setHemoHr(patient.vitalsHistory?.[0]?.hr || 75);
    setQtHr(patient.vitalsHistory?.[0]?.hr || 75);
    showToast('Reset calculations to patient baseline', 'info');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-cyan-500" /> Evidence-Based Clinical Calculators
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cardiology, ICU organ failure, systematic ABG interpreter, invasive hemodynamics & drug infusions
          </p>
        </div>

        <div className="flex items-center gap-2">
          {patient && (
            <button
              onClick={handleResetToPatient}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-500" /> Reset to Baseline
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'Cardiology', label: 'Cardiology & ACS', icon: Heart },
          { id: 'ICU', label: 'Critical Care & Sepsis', icon: Activity },
          { id: 'ABG', label: 'Systematic ABG', icon: Wind },
          { id: 'Hemodynamics', label: 'Hemodynamics & MAP', icon: Activity },
          { id: 'Renal', label: 'Renal & Electrolytes', icon: Droplet },
          { id: 'Infusion', label: 'Vasopressor Drips', icon: Syringe },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id as CategoryType)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 1. CARDIOLOGY TAB */}
      {activeCategory === 'Cardiology' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* CHA2DS2-VASc */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500" /> CHA₂DS₂-VASc Score
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                AF Stroke Risk
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">Patient Age</label>
                  <input
                    type="number"
                    value={chaAge}
                    onChange={(e) => setChaAge(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Biological Sex</label>
                  <select
                    value={chaSex}
                    onChange={(e) => setChaSex(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={chaChf} onChange={(e) => setChaChf(e.target.checked)} />
                  CHF / LV Dysfunction
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={chaHtn} onChange={(e) => setChaHtn(e.target.checked)} />
                  Hypertension
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={chaStroke} onChange={(e) => setChaStroke(e.target.checked)} />
                  Prior Stroke / TIA (+2)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={chaVascular} onChange={(e) => setChaVascular(e.target.checked)} />
                  Vascular Disease / CAD
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={chaDiabetes} onChange={(e) => setChaDiabetes(e.target.checked)} />
                  Diabetes Mellitus
                </label>
              </div>
            </div>

            {/* Results Card */}
            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Score: {chaResult.score} points</span>
                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-cyan-500 text-slate-950">
                  {chaResult.risk} Risk ({chaResult.strokeRisk} annual stroke rate)
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-tight">
                {chaResult.recommendation}
              </p>
            </div>
          </div>

          {/* HAS-BLED */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" /> HAS-BLED Bleeding Risk
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                Anticoagulation Safety
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasHtn} onChange={(e) => setHasHtn(e.target.checked)} />
                Hypertension (SBP &gt; 160)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasRenal} onChange={(e) => setHasRenal(e.target.checked)} />
                Abnormal Renal Function
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasLiver} onChange={(e) => setHasLiver(e.target.checked)} />
                Abnormal Liver Function
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasStroke} onChange={(e) => setHasStroke(e.target.checked)} />
                Prior Stroke History
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasBleed} onChange={(e) => setHasBleed(e.target.checked)} />
                Prior Major Bleeding
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasLabileInr} onChange={(e) => setHasLabileInr(e.target.checked)} />
                Labile INRs
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasElderly} onChange={(e) => setHasElderly(e.target.checked)} />
                Age &gt; 65 years
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasDrugs} onChange={(e) => setHasDrugs(e.target.checked)} />
                Antiplatelets / NSAIDs
              </label>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Score: {hasResult.score} points</span>
                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-500 text-slate-950">
                  {hasResult.riskLevel} ({hasResult.bleedingRate})
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-tight">
                {hasResult.advice}
              </p>
            </div>
          </div>

          {/* HEART Score */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-cyan-500" /> HEART Score for Chest Pain
            </h3>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-400 text-[11px]">History Suspicion</label>
                <select
                  value={heartHistory}
                  onChange={(e) => setHeartHistory(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value={0}>Slightly suspicious (0)</option>
                  <option value={1}>Moderately suspicious (1)</option>
                  <option value={2}>Highly suspicious (2)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px]">ECG Presentation</label>
                <select
                  value={heartEcg}
                  onChange={(e) => setHeartEcg(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value={0}>Normal (0)</option>
                  <option value={1}>Non-specific repol disturbance / BBB (1)</option>
                  <option value={2}>Significant ST depression (2)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px]">Initial Troponin</label>
                <select
                  value={heartTroponin}
                  onChange={(e) => setHeartTroponin(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value={0}>Normal range (≤ 1x normal limit) (0)</option>
                  <option value={1}>1 - 3x normal limit (1)</option>
                  <option value={2}>&gt; 3x normal limit (2)</option>
                </select>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold">HEART Score: {heartResult.score} / 10</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">{heartResult.risk} Risk (MACE: {heartResult.maceRate})</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{heartResult.management}</p>
            </div>
          </div>

          {/* QTc Interval */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-500" /> Corrected QT Interval (QTc)
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 text-[11px]">Raw QT Interval (ms)</label>
                <input
                  type="number"
                  value={qtMs}
                  onChange={(e) => setQtMs(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px]">Heart Rate (bpm)</label>
                <input
                  type="number"
                  value={qtHr}
                  onChange={(e) => setQtHr(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="p-3.5 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-1.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Bazett Formula</span>
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{qtcResult.bazett} ms</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Fridericia Formula</span>
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{qtcResult.fridericia} ms</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                Clinical Status: {qtcResult.status}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. ICU & CRITICAL CARE TAB */}
      {activeCategory === 'ICU' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* SOFA Score */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" /> Sequential Organ Failure Assessment (SOFA)
            </h3>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">PaO₂ (mmHg)</label>
                <input
                  type="number"
                  value={sofaPao2}
                  onChange={(e) => setSofaPao2(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">FiO₂ (%)</label>
                <input
                  type="number"
                  value={sofaFio2}
                  onChange={(e) => setSofaFio2(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Platelets (x10³/µL)</label>
                <input
                  type="number"
                  value={sofaPlt}
                  onChange={(e) => setSofaPlt(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Bilirubin (mg/dL)</label>
                <input
                  type="number"
                  value={sofaBili}
                  onChange={(e) => setSofaBili(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Mean Art Pressure (mmHg)</label>
                <input
                  type="number"
                  value={sofaMap}
                  onChange={(e) => setSofaMap(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Serum Creatinine (mg/dL)</label>
                <input
                  type="number"
                  value={sofaCr}
                  onChange={(e) => setSofaCr(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">SOFA Score: {sofaResult.score} points</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">Est. ICU Mortality: {sofaResult.mortality}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Formula: Sum of PaO2/FiO2, Platelets, Bilirubin, MAP/vasopressors, GCS, and Creatinine.
              </p>
            </div>
          </div>

          {/* Ventilator Mechanics & Driving Pressure */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-sky-500" /> Ventilator Mechanics & Driving Pressure
            </h3>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">Tidal Volume (Vt in mL)</label>
                <input
                  type="number"
                  value={ventVt}
                  onChange={(e) => setVentVt(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Plateau Pressure (cmH₂O)</label>
                <input
                  type="number"
                  value={ventPplat}
                  onChange={(e) => setVentPplat(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">PEEP (cmH₂O)</label>
                <input
                  type="number"
                  value={ventPeep}
                  onChange={(e) => setVentPeep(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Respiratory Rate (bpm)</label>
                <input
                  type="number"
                  value={ventRr}
                  onChange={(e) => setVentRr(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-xl space-y-1.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Driving Pressure</span>
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{ventResult.drivingPressure} cmH₂O</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Static Compliance</span>
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{ventResult.cstat} mL/cmH₂O</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">RSBI (Tobin)</span>
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{ventResult.rsbi}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                {ventResult.dpRisk} • {ventResult.rsbiRisk}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. SYSTEMATIC ABG INTERPRETER */}
      {activeCategory === 'ABG' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-500" /> Systematic Step-by-Step Arterial Blood Gas (ABG) Interpreter
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                pH, Primary Disorder, Anion Gap, Albumin Correction, Winter's Formula, Delta Ratio & P/F Ratio
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-slate-400 font-medium">pH</label>
              <input
                type="number"
                step="0.01"
                value={abgPh}
                onChange={(e) => setAbgPh(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">PaCO₂ (mmHg)</label>
              <input
                type="number"
                value={abgPco2}
                onChange={(e) => setAbgPco2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">HCO₃ (mmol/L)</label>
              <input
                type="number"
                value={abgHco3}
                onChange={(e) => setAbgHco3(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">Serum Sodium (Na⁺)</label>
              <input
                type="number"
                value={abgNa}
                onChange={(e) => setAbgNa(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">Chloride (Cl⁻)</label>
              <input
                type="number"
                value={abgCl}
                onChange={(e) => setAbgCl(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">Albumin (g/dL)</label>
              <input
                type="number"
                step="0.1"
                value={abgAlbumin}
                onChange={(e) => setAbgAlbumin(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">PaO₂ (mmHg)</label>
              <input
                type="number"
                value={abgPao2}
                onChange={(e) => setAbgPao2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-medium">FiO₂ (%)</label>
              <input
                type="number"
                value={abgFio2}
                onChange={(e) => setAbgFio2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          {/* Step-by-Step Interpretation Result Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Step 1 & 2: Primary Disorder</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{abgResult.primaryDisorder}</p>
              <p className="text-[11px] text-slate-500">pH: {abgPh} ({abgPh < 7.35 ? 'Acidemia' : abgPh > 7.45 ? 'Alkalemia' : 'Normal pH'})</p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Step 3 & 4: Anion Gap</span>
              <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                AG: {abgResult.anionGap} mEq/L (Corr: {abgResult.correctedAG})
              </p>
              <p className="text-[11px] text-slate-500">
                Formula: Na - (Cl + HCO3). Normal = 8 - 12 mEq/L
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Step 5: Winter's Compensation</span>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                Expected PaCO₂: {abgResult.expectedPCO2Range}
              </p>
              <p className="text-[11px] text-slate-500">{abgResult.compensation}</p>
            </div>
          </div>

          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-1 text-xs">
            <span className="font-bold text-cyan-800 dark:text-cyan-300 uppercase text-[10px]">
              Complete Diagnostic Conclusion
            </span>
            <p className="text-slate-900 dark:text-white font-medium">
              {abgResult.primaryDisorder}. {abgResult.compensation}. Delta Ratio: {abgResult.deltaRatio} ({abgResult.deltaInterpretation}).
              Oxygenation P/F Ratio: {abgResult.pfRatio}.
            </p>
          </div>
        </div>
      )}

      {/* 4. HEMODYNAMICS TAB */}
      {activeCategory === 'Hemodynamics' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" /> Invasive Hemodynamics & Perfusion Indices
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-slate-400">Systolic BP (mmHg)</label>
              <input
                type="number"
                value={hemoSbp}
                onChange={(e) => setHemoSbp(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Diastolic BP (mmHg)</label>
              <input
                type="number"
                value={hemoDbp}
                onChange={(e) => setHemoDbp(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Heart Rate (bpm)</label>
              <input
                type="number"
                value={hemoHr}
                onChange={(e) => setHemoHr(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">CVP (mmHg)</label>
              <input
                type="number"
                value={hemoCvp}
                onChange={(e) => setHemoCvp(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Cardiac Output (L/min)</label>
              <input
                type="number"
                step="0.1"
                value={hemoCo}
                onChange={(e) => setHemoCo(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Height (cm)</label>
              <input
                type="number"
                value={hemoHt}
                onChange={(e) => setHemoHt(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Weight (kg)</label>
              <input
                type="number"
                value={hemoWt}
                onChange={(e) => setHemoWt(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">MAP</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{hemoResult.map} mmHg</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">Cardiac Index</span>
              <span className="text-base font-bold text-cyan-600 dark:text-cyan-400">{hemoResult.ci} L/min/m²</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">SVR</span>
              <span className="text-base font-bold text-amber-600 dark:text-amber-400">{hemoResult.svr} dynes•s/cm⁵</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">Shock Index (HR/SBP)</span>
              <span className="text-base font-bold text-rose-600 dark:text-rose-400">{hemoResult.shockIndex}</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. RENAL & ELECTROLYTES TAB */}
      {activeCategory === 'Renal' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Cockcroft-Gault CrCl */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Droplet className="w-4 h-4 text-cyan-500" /> Cockcroft-Gault Creatinine Clearance (CrCl)
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">Serum Cr (mg/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={renalCr}
                  onChange={(e) => setRenalCr(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Age (years)</label>
                <input
                  type="number"
                  value={renalAge}
                  onChange={(e) => setRenalAge(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Weight (kg)</label>
                <input
                  type="number"
                  value={renalWt}
                  onChange={(e) => setRenalWt(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Sex</label>
                <select
                  value={renalSex}
                  onChange={(e) => setRenalSex(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">CrCl: {crclResult.crcl} mL/min</span>
                <span className="text-cyan-700 dark:text-cyan-400 font-bold">{crclResult.stage}</span>
              </div>
              <p className="text-[11px] text-slate-500">Formula: ((140 - Age) * Weight) / (72 * Cr) (* 0.85 if female)</p>
            </div>
          </div>

          {/* Corrected Sodium & Calcium */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Droplet className="w-4 h-4 text-amber-500" /> Electrolyte Corrections & FENa
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">Serum Na⁺ (mEq/L)</label>
                <input
                  type="number"
                  value={naMeasured}
                  onChange={(e) => setNaMeasured(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Blood Glucose (mg/dL)</label>
                <input
                  type="number"
                  value={glucoseMeasured}
                  onChange={(e) => setGlucoseMeasured(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold">Corrected Na⁺ (Katz):</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{electrolyteResult.correctedNa} mEq/L</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold">Corrected Na⁺ (Hillier):</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{electrolyteResult.hillierNa} mEq/L</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold">FENa (Prerenal vs ATN):</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">{fenaResult.fena}% ({fenaResult.etiology})</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. VASOPRESSOR & DRIP TITRATION */}
      {activeCategory === 'Infusion' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Syringe className="w-4 h-4 text-cyan-500" /> Continuous Vasopressor & Inotrope Drip Titration
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-slate-400">Medication</label>
              <select
                value={infusionDrug}
                onChange={(e) => setInfusionDrug(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="Norepinephrine">Norepinephrine (Levophed)</option>
                <option value="Epinephrine">Epinephrine</option>
                <option value="Dobutamine">Dobutamine</option>
                <option value="Milrinone">Milrinone (Primacor)</option>
                <option value="Nicardipine">Nicardipine (Cardene)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Patient Weight (kg)</label>
              <input
                type="number"
                value={infusionWeight}
                onChange={(e) => setInfusionWeight(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Drug in Bag (mg)</label>
              <input
                type="number"
                value={infusionMg}
                onChange={(e) => setInfusionMg(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Diluent Volume (mL)</label>
              <input
                type="number"
                value={infusionMl}
                onChange={(e) => setInfusionMl(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold block">
                  Desired Target Dose (mcg/kg/min)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={infusionTargetDose}
                  onChange={(e) => setInfusionTargetDose(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold w-32 mt-1"
                />
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Required Pump Rate</span>
                <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
                  {infusionResult.rateMlHr} mL/hr
                </span>
                <span className="text-[11px] text-slate-500 block">
                  (Concentration: {infusionResult.concentrationMcgMl} mcg/mL)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
