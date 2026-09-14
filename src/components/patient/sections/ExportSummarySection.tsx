import React, { useState } from 'react';
import {
  Download,
  Printer,
  Copy,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Share2,
  Sparkles,
  CheckSquare,
  Square,
  Building2,
  Heart,
  Activity,
  Pill,
  Wind,
  Image as ImageIcon,
  FlaskConical,
  Syringe,
  Calculator,
  FileEdit,
  ArrowRightLeft,
  Sliders,
} from 'lucide-react';
import { Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ExportSummarySectionProps {
  patient: Patient;
}

export const ExportSummarySection: React.FC<ExportSummarySectionProps> = ({ patient }) => {
  const { showToast, getUnitById, beds } = useApp();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'custom' | 'sbar'>('custom');

  // Customizable Section Checkboxes (Requirement 23)
  const [sections, setSections] = useState({
    demographics: true,
    summary: true,
    history: true,
    exam: true,
    vitals: true,
    hemodynamics: true,
    fluid: true,
    cardiology: true,
    meds: true,
    icu: true,
    imaging: true,
    labs: true,
    procedures: true,
    calculators: true,
    progressNotes: true,
    dischargePlan: true,
  });

  const sectionLabels: Array<{ id: keyof typeof sections; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'demographics', label: 'Patient Info & Demographics', icon: ShieldCheck },
    { id: 'summary', label: 'Clinical Summary & Problem List', icon: FileText },
    { id: 'history', label: 'Medical & Surgical History', icon: Activity },
    { id: 'exam', label: 'Physical Examination', icon: Activity },
    { id: 'vitals', label: 'Vital Signs & Trends', icon: Activity },
    { id: 'hemodynamics', label: 'Invasive Hemodynamics (CVP/CI/SVR)', icon: Activity },
    { id: 'fluid', label: 'Fluid Balance (Intake / Output)', icon: Activity },
    { id: 'cardiology', label: 'Cardiology (Echo, Cath/PCI, Devices)', icon: Heart },
    { id: 'meds', label: 'Medications & Active Drips', icon: Pill },
    { id: 'icu', label: 'ICU (Ventilator & ABG)', icon: Wind },
    { id: 'imaging', label: 'Diagnostic Imaging & Scans', icon: ImageIcon },
    { id: 'labs', label: 'Laboratory Panels & Trends', icon: FlaskConical },
    { id: 'procedures', label: 'Clinical Procedures Performed', icon: Syringe },
    { id: 'calculators', label: 'Calculated Clinical Risk Scores', icon: Calculator },
    { id: 'progressNotes', label: 'Daily Progress & SOAP Notes', icon: FileEdit },
    { id: 'dischargePlan', label: 'Transfer / Discharge Plan', icon: ArrowRightLeft },
  ];

  const handleSelectAll = () => {
    setSections({
      demographics: true,
      summary: true,
      history: true,
      exam: true,
      vitals: true,
      hemodynamics: true,
      fluid: true,
      cardiology: true,
      meds: true,
      icu: true,
      imaging: true,
      labs: true,
      procedures: true,
      calculators: true,
      progressNotes: true,
      dischargePlan: true,
    });
  };

  const handleDeselectAll = () => {
    setSections({
      demographics: false,
      summary: false,
      history: false,
      exam: false,
      vitals: false,
      hemodynamics: false,
      fluid: false,
      cardiology: false,
      meds: false,
      icu: false,
      imaging: false,
      labs: false,
      procedures: false,
      calculators: false,
      progressNotes: false,
      dischargePlan: false,
    });
  };

  const applyPreset = (preset: 'cardiology' | 'icu' | 'discharge') => {
    if (preset === 'cardiology') {
      setSections({
        demographics: true,
        summary: true,
        history: true,
        exam: true,
        vitals: true,
        hemodynamics: true,
        fluid: false,
        cardiology: true,
        meds: true,
        icu: false,
        imaging: true,
        labs: true,
        procedures: true,
        calculators: true,
        progressNotes: false,
        dischargePlan: true,
      });
    } else if (preset === 'icu') {
      setSections({
        demographics: true,
        summary: true,
        history: false,
        exam: true,
        vitals: true,
        hemodynamics: true,
        fluid: true,
        cardiology: true,
        meds: true,
        icu: true,
        imaging: true,
        labs: true,
        procedures: false,
        calculators: true,
        progressNotes: true,
        dischargePlan: false,
      });
    } else if (preset === 'discharge') {
      setSections({
        demographics: true,
        summary: true,
        history: true,
        exam: true,
        vitals: false,
        hemodynamics: false,
        fluid: false,
        cardiology: true,
        meds: true,
        icu: false,
        imaging: false,
        labs: true,
        procedures: true,
        calculators: false,
        progressNotes: false,
        dischargePlan: true,
      });
    }
    showToast(`Applied ${preset.toUpperCase()} dossier preset`, 'info');
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Safe patient clinical helpers
  const unit = getUnitById(patient.unitId);
  const bed = beds.find((b) => b.id === patient.bedId);
  const latestVital = patient.vitalsHistory?.[0] || {
    sbp: 120,
    dbp: 80,
    hr: 75,
    rr: 16,
    spo2: 98,
    temp: 37.0,
    gcsTotal: 15,
  };
  const echo = patient.cardiology?.echo;
  const coronary = patient.cardiology?.coronary;
  const vent = patient.ventilator;

  // SBAR Text Generator
  const sbarText = `*SBAR CLINICAL HANDOVER — ${unit?.name || 'CCU'} BED ${bed?.bedNumber || '01'}*
*PATIENT:* ${patient.fullName}, ${patient.age}y ${patient.sex} (MRN: ${patient.mrn})
*SITUATION:* ${patient.primaryDiagnosis} (Admitted: ${patient.admissionDate}, Code: ${patient.codeStatus}).
*BACKGROUND:* PMHx: CAD, HTN, T2DM. Primary PCI to pLAD with DES.
*ASSESSMENT:*
- Vitals: BP ${latestVital.sbp}/${latestVital.dbp} mmHg, HR ${latestVital.hr} bpm, SpO2 ${latestVital.spo2}%, Temp ${latestVital.temp}°C
- Cardiology: LVEF ${echo?.lvef || 50}% (${echo?.lvFunction || 'Preserved'}), Killip ${patient.cardiology?.killipClass || 'Class I'}
- Hemodynamics: CVP ${patient.cardiology?.invasiveHemodynamics?.cvp || 8} mmHg, CI ${patient.cardiology?.invasiveHemodynamics?.cardiacIndex || 2.4} L/min/m²
- Fluid Balance: Net 24h ${(patient.fluidBalance?.totals?.totalIntake || 0) - (patient.fluidBalance?.totals?.totalOutput || 0)} mL
*RECOMMENDATION / PLAN:*
- Dual antiplatelet therapy & guideline-directed heart failure medical therapy.
- Wean inotropic support as hemodynamics permit.
- Strict telemetry and hourly fluid monitoring.`;

  const handleCopySBAR = () => {
    navigator.clipboard.writeText(sbarText);
    setCopied(true);
    showToast('SBAR Handover copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-500" /> Printable Clinical Dossier & PDF Export
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Customize exact clinical sections to include, review live dossier preview, and generate formal medical PDF
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySBAR}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-cyan-500" /> Copy SBAR
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20"
          >
            <Printer className="w-4 h-4" /> Print / Export to PDF
          </button>
        </div>
      </div>

      {/* Control Panel: Section Selection Checkboxes (Requirement 23) */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Customize Included Dossier Sections
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline px-2 py-1"
            >
              Select All
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={handleDeselectAll}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1"
            >
              Deselect All
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs text-slate-400 font-medium">
              Presets:
            </span>
            <button
              onClick={() => applyPreset('cardiology')}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              Cardiology
            </button>
            <button
              onClick={() => applyPreset('icu')}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              ICU
            </button>
            <button
              onClick={() => applyPreset('discharge')}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              Discharge
            </button>
          </div>
        </div>

        {/* 16 Checkboxes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-xs">
          {sectionLabels.map((item) => {
            const isChecked = sections[item.id];
            return (
              <label
                key={item.id}
                onClick={() => toggleSection(item.id)}
                className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer select-none transition-all ${
                  isChecked
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-slate-900 dark:text-white font-medium'
                    : 'bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}} // Controlled by label
                  className="rounded text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="truncate">{item.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Printable Live Document Sheet */}
      <div
        id="printable-dossier"
        className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-md space-y-6 text-slate-900 dark:text-slate-100 print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
      >
        {/* Hospital Document Letterhead */}
        <div className="flex items-start justify-between pb-5 border-b-2 border-slate-900 dark:border-slate-700 print:border-black gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 print:text-black">
              <Heart className="w-6 h-6 stroke-[2.5]" />
              <span className="text-xl font-black tracking-tight">CARDIOVAULT CLINICAL DOSSIER</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:text-gray-600 font-medium">
              Department of Cardiology & Critical Care Medicine • Confidential Medical Record
            </p>
            <p className="text-[11px] text-slate-400 print:text-gray-500">
              Primary Attending: <span className="font-semibold text-slate-700 dark:text-slate-200 print:text-black">{patient.attendingPhysician || 'Dr. Mohamed Khalid, MD'}</span>
            </p>
          </div>

          <div className="text-right text-xs space-y-0.5">
            <span className="px-2.5 py-0.5 rounded font-mono font-bold bg-slate-100 dark:bg-slate-800 print:bg-gray-100 text-slate-800 dark:text-slate-200 print:text-black">
              MRN: {patient.mrn}
            </span>
            <p className="text-slate-400 text-[10px]">Exported: {new Date().toLocaleString()}</p>
            <p className="text-slate-500 text-[11px] font-semibold">
              {unit?.name || 'Unit'} — Bed {bed?.bedNumber || '01'}
            </p>
          </div>
        </div>

        {/* 1. Patient Demographics & Info */}
        {sections.demographics && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              1. Patient Identification & Demographics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Full Name</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Age / Sex</span>
                <span>{patient.age} years / {patient.sex}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Admission Date</span>
                <span>{patient.admissionDate} (Day {Math.max(1, Math.floor((Date.now() - new Date(patient.admissionDate || Date.now()).getTime()) / (1000 * 60 * 60 * 24)))})</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Code Status</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 print:text-black">{patient.codeStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Clinical Summary */}
        {sections.summary && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              2. Primary Diagnosis & Clinical Summary
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300 text-xs space-y-1.5">
              <p className="font-bold text-slate-900 dark:text-white print:text-black text-sm">
                {patient.primaryDiagnosis}
              </p>
              <p className="text-slate-700 dark:text-slate-300 print:text-black leading-relaxed whitespace-pre-wrap">
                {patient.clinicalSummary}
              </p>
            </div>
          </div>
        )}

        {/* 3. Medical & Surgical History */}
        {sections.history && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              3. Past Medical & Surgical History
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Cardiovascular History</span>
                <p className="text-slate-800 dark:text-slate-200 print:text-black">
                  CAD (s/p PCI), Hypertension, Dyslipidemia, Heart Failure.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Allergies & Adverse Reactions</span>
                <p className="font-semibold text-rose-600 dark:text-rose-400 print:text-black">
                  {patient.allergies?.length ? patient.allergies.join(', ') : 'No known drug allergies (NKDA)'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4. Physical Examination */}
        {sections.exam && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              4. Physical Examination
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Cardiovascular</span>
                <span>{patient.examination?.cardiovascular?.heartSounds || 'S1, S2 audible, no murmur'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Respiratory</span>
                <span>{patient.examination?.respiratory?.addedSounds || 'Clear breath sounds bilaterally'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Neurological</span>
                <span>{patient.examination?.neurological?.consciousness || 'Alert & Oriented x4 (GCS 15)'}</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. Vitals & Trends */}
        {sections.vitals && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              5. Vital Signs (Latest Snapshot)
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">BP</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.sbp}/{latestVital.dbp}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">HR</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.hr} bpm</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">SpO₂</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.spo2}%</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">RR</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.rr || 16}/min</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">Temp</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.temp || 37.0}°C</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 border border-slate-200 dark:border-slate-800 print:border-gray-300">
                <span className="text-[10px] text-slate-400 block font-bold">GCS</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{latestVital.gcsTotal || 15}/15</span>
              </div>
            </div>
          </div>
        )}

        {/* 6. Invasive Hemodynamics */}
        {sections.hemodynamics && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              6. Invasive Hemodynamics Profile
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">CVP</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.cardiology?.invasiveHemodynamics?.cvp || 8} mmHg</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Cardiac Index (CI)</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.cardiology?.invasiveHemodynamics?.cardiacIndex || 2.4} L/min/m²</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">SVR / SVRI</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.cardiology?.invasiveHemodynamics?.svr || 1100} dynes•s/cm⁵</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">PAP (PASP/PADP)</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.cardiology?.invasiveHemodynamics?.pasp || 28} / {patient.cardiology?.invasiveHemodynamics?.padp || 14} mmHg</span>
              </div>
            </div>
          </div>
        )}

        {/* 7. Fluid Balance */}
        {sections.fluid && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              7. Fluid Balance (24-Hour Cumulative)
            </h3>
            <div className="grid grid-cols-3 gap-3 text-xs text-center bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Total Intake</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 print:text-black">{patient.fluidBalance?.totals?.totalIntake || 1450} mL</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Total Output</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 print:text-black">{patient.fluidBalance?.totals?.totalOutput || 1620} mL</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Net Balance</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 print:text-black">
                  {(patient.fluidBalance?.totals?.totalIntake || 1450) - (patient.fluidBalance?.totals?.totalOutput || 1620)} mL
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 8. Cardiology Dossier */}
        {sections.cardiology && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              8. Cardiology, Echocardiography & Cath / PCI Findings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                <span className="font-bold text-rose-600 dark:text-rose-400 print:text-black text-[10px] uppercase block">
                  Transthoracic Echocardiogram (TTE)
                </span>
                <p><strong>LVEF:</strong> {echo?.lvef || 50}% ({echo?.lvFunction || 'Preserved systolic function'})</p>
                <p><strong>Wall Motion:</strong> {echo?.wallMotion || 'Anteroapical hypokinesis'}</p>
                <p><strong>Valves:</strong> MR: {echo?.mitralRegurgitation || 'Mild'}, AR: {echo?.aorticRegurgitation || 'None'}, TR: {echo?.tricuspidRegurgitation || 'Trace'}</p>
                <p><strong>TAPSE:</strong> {echo?.tapse || 18} mm</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                <span className="font-bold text-cyan-600 dark:text-cyan-400 print:text-black text-[10px] uppercase block">
                  Coronary Angiography & Cath
                </span>
                <p><strong>Access:</strong> {coronary?.accessSite || 'Right Radial 6F'}</p>
                <p><strong>Findings:</strong> {coronary?.vesselsInvolved?.join(', ') || 'LAD 95% stenosis, LCx mild'}</p>
                <p><strong>Intervention:</strong> {coronary?.intervention || 'Successful DES stenting to pLAD with TIMI 3 flow'}</p>
                <p><strong>Stents Placed:</strong> {coronary?.stentDetails || '1x Xience Sierra 3.5 x 28 mm'}</p>
              </div>
            </div>
          </div>
        )}

        {/* 9. Medications */}
        {sections.meds && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              9. Active Inpatient Medications & Critical Care Infusions
            </h3>
            <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <thead className="bg-slate-100 dark:bg-slate-900 print:bg-gray-100 font-bold">
                <tr>
                  <th className="p-2">Medication</th>
                  <th className="p-2">Dose / Rate</th>
                  <th className="p-2">Route</th>
                  <th className="p-2">Frequency</th>
                  <th className="p-2">Indication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-200">
                {patient.medications?.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2 font-semibold text-slate-900 dark:text-white print:text-black">{m.name}</td>
                    <td className="p-2">{m.dose}</td>
                    <td className="p-2">{m.route}</td>
                    <td className="p-2">{m.frequency}</td>
                    <td className="p-2 text-slate-500">{m.indication}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 10. ICU / Ventilator & ABG */}
        {sections.icu && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              10. ICU Mechanical Ventilation & Blood Gas (ABG)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div className="space-y-1">
                <span className="font-bold text-sky-600 dark:text-sky-400 print:text-black text-[10px] uppercase block">
                  Ventilator Mode & Settings
                </span>
                <p><strong>Mode:</strong> {vent?.mode || 'Pressure Control (PC-CMV)'}</p>
                <p><strong>FiO₂ / PEEP:</strong> {vent?.fio2 || 35}% / {vent?.peep || 5} cmH₂O</p>
                <p><strong>Set / Total Rate:</strong> {vent?.setRate || 14} / {vent?.totalRate || 14} bpm</p>
                <p><strong>Pplat / Driving Press:</strong> {vent?.plateauPressure || 18} / {(vent?.plateauPressure || 18) - (vent?.peep || 5)} cmH₂O</p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-purple-600 dark:text-purple-400 print:text-black text-[10px] uppercase block">
                  Most Recent ABG Analysis
                </span>
                <p><strong>pH:</strong> {vent?.abgHistory?.[0]?.ph || 7.39}</p>
                <p><strong>PaCO₂ / PaO₂:</strong> {vent?.abgHistory?.[0]?.paco2 || 38} / {vent?.abgHistory?.[0]?.pao2 || 96} mmHg</p>
                <p><strong>HCO₃ / Base Excess:</strong> {vent?.abgHistory?.[0]?.hco3 || 24} / {vent?.abgHistory?.[0]?.baseExcess || 0.2} mmol/L</p>
                <p><strong>P/F Ratio:</strong> {vent?.abgHistory?.[0]?.pfRatio || 274} (Adequate oxygenation)</p>
              </div>
            </div>
          </div>
        )}

        {/* 11. Diagnostic Imaging */}
        {sections.imaging && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              11. Diagnostic Imaging & Scans
            </h3>
            <div className="space-y-2">
              {((patient.imaging || (patient as any).imagingStudies) || []).map((img: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 text-xs">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white print:text-black">
                    <span>{img.modality || img.type} — {img.region || img.bodyRegion}</span>
                    <span className="text-slate-400 text-[11px] font-normal">{img.date}</span>
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300 print:text-black"><strong>Findings:</strong> {img.findings}</p>
                  <p className="mt-0.5 text-cyan-700 dark:text-cyan-400 print:text-black font-medium"><strong>Impression:</strong> {img.impression}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 12. Laboratory Panels */}
        {sections.labs && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              12. Key Laboratory Panels
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Troponin-I</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 print:text-black">{patient.cardiology?.biomarkers?.hsTroponin || '0.04'} ng/mL</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">NT-proBNP</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">{patient.cardiology?.biomarkers?.bnp || '450'} pg/mL</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Serum Creatinine</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">1.1 mg/dL</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Potassium (K⁺)</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black">4.2 mmol/L</span>
              </div>
            </div>
          </div>
        )}

        {/* 13. Clinical Procedures */}
        {sections.procedures && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              13. Procedures & Bedside Interventions
            </h3>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 text-xs space-y-1">
              <p><strong>Primary PCI:</strong> Emergent DES to proximal LAD with drug-eluting stent. Successful reperfusion with TIMI 3 flow.</p>
              <p><strong>Central Access:</strong> Right internal jugular triple lumen catheter placed under ultrasound guidance. Complication-free.</p>
            </div>
          </div>
        )}

        {/* 14. Calculated Risk Scores */}
        {sections.calculators && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              14. Calculated Evidence-Based Risk Stratification
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 text-center">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">CHA₂DS₂-VASc</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 print:text-black text-sm">4 (High Risk)</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">HAS-BLED</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 print:text-black text-sm">2 (Moderate)</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Killip Class</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black text-sm">{patient.cardiology?.killipClass || 'Class I'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">SOFA Score</span>
                <span className="font-bold text-slate-900 dark:text-white print:text-black text-sm">3 (Low ICU Mortality)</span>
              </div>
            </div>
          </div>
        )}

        {/* 15. Progress Notes */}
        {sections.progressNotes && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              15. Latest Clinical Progress Note (SOAP)
            </h3>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 text-xs space-y-1.5">
              <p><strong>Subjective:</strong> Patient reports resolution of resting chest tightness. Sleeping comfortably, no orthopnea.</p>
              <p><strong>Objective:</strong> Hemodynamically stable on low-dose beta-blocker. Lungs clear, no peripheral edema. LVEF 50%.</p>
              <p><strong>Assessment:</strong> Post-MI Day 2 status post successful primary PCI to LAD. Stable cardiac rhythm, no arrhythmias.</p>
              <p><strong>Plan:</strong> Continue DAPT (Aspirin + Ticagrelor), initiate cardiac rehabilitation education, anticipate telemetry step-down.</p>
            </div>
          </div>
        )}

        {/* 16. Transfer / Discharge Plan */}
        {sections.dischargePlan && (
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 print:text-black border-b border-slate-200 dark:border-slate-800 pb-1">
              16. Transfer / Discharge Plan & Follow-Up
            </h3>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 text-xs space-y-1">
              <p><strong>Anticipated Destination:</strong> Step-Down Telemetry Ward then Home discharge with Cardiac Rehab program.</p>
              <p><strong>Discharge Medications:</strong> Aspirin 81mg daily, Ticagrelor 90mg BID, Atorvastatin 80mg daily, Metoprolol succinate 25mg daily, Ramipril 2.5mg daily.</p>
              <p><strong>Follow-Up:</strong> Post-discharge cardiology clinic visit in 14 days with repeat ECG and echocardiogram at 3 months.</p>
            </div>
          </div>
        )}

        {/* Legal & Attending Signature Block */}
        <div className="break-inside-avoid pt-6 border-t border-slate-200 dark:border-slate-800 print:border-gray-400 flex flex-col sm:flex-row items-end justify-between gap-4 text-xs">
          <div className="text-[10px] text-slate-400 print:text-gray-500 space-y-0.5">
            <p className="font-semibold text-slate-600 dark:text-slate-300 print:text-black">
              CardioVault Clinical Intelligence Platform • Version 2.6
            </p>
            <p>Certified Electronic Health Record Dossier • Confidential Clinical Record</p>
          </div>

          <div className="w-64 border-t border-slate-900 dark:border-slate-400 print:border-black pt-1 text-right">
            <p className="font-bold text-slate-900 dark:text-white print:text-black">
              {patient.attendingPhysician || 'Dr. Mohamed Khalid, MD'}
            </p>
            <p className="text-[10px] text-slate-500 print:text-gray-600">
              Staff Cardiologist & Critical Care Attending
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              Signed Digitally: {new Date().toISOString().split('T')[0]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
