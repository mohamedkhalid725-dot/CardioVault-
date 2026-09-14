import React, { useState } from 'react';
import {
  Activity,
  Heart,
  Wind,
  FlaskConical,
  Pill,
  Image as ImageIcon,
  Syringe,
  FileText,
  AlertCircle,
  Thermometer,
  Brain,
  Droplet,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { Patient, PatientSectionId } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface OverviewSectionProps {
  patient: Patient;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({ patient }) => {
  const { setActivePatientSection } = useApp();
  const [activeTab, setActiveTab] = useState<'summary' | 'status' | 'cardio' | 'icu' | 'labs' | 'meds'>('summary');

  const latestVital = patient.vitalsHistory[0] || {
    sbp: 120,
    dbp: 70,
    hr: 88,
    rr: 16,
    spo2: 98,
    temp: 36.8,
    gcsTotal: 13,
    gcsEye: 3,
    gcsVerbal: 4,
    gcsMotor: 6,
    rass: -1,
  };

  const latestABG = patient.ventilator.abgHistory[0];
  const latestFluid = patient.fluidRecords[0];

  const map = Math.round((2 * latestVital.dbp + latestVital.sbp) / 3);

  const tabs = [
    { id: 'summary', label: 'Clinical Summary', icon: FileText },
    { id: 'status', label: 'Current Status', icon: Activity },
    { id: 'cardio', label: 'Cardiology', icon: Heart, targetSection: 'cardiology' as PatientSectionId },
    { id: 'icu', label: 'ICU', icon: Wind, targetSection: 'icu' as PatientSectionId },
    { id: 'labs', label: 'Labs', icon: FlaskConical, targetSection: 'labs' as PatientSectionId },
    { id: 'meds', label: 'Medications', icon: Pill, targetSection: 'medication' as PatientSectionId },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Patient Demographic Bar (Reference 2 style) */}
      <div className="bg-slate-50 dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 text-xs text-slate-700 dark:text-slate-300 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div>
            <span className="text-slate-400 block text-[11px]">Age & Sex</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {patient.age} y / {patient.sex}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Weight & Height</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {patient.weight} kg • {patient.height} cm
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Admission Date</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {patient.admissionDate}, {patient.admissionTime}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Primary Diagnosis</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400 text-sm truncate block" title={patient.primaryDiagnosis}>
              {patient.primaryDiagnosis}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Code Status</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              {patient.codeStatus}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Allergies</span>
            <span className="font-bold text-rose-500 text-sm truncate block" title={patient.allergies.join(', ')}>
              {patient.allergies[0] || 'NKDA'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Sidebar quick navigation + Main cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side Quick Menu (Matches Reference 2 Overview screen) */}
        <div className="lg:col-span-1 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">
            Overview Sections
          </p>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.targetSection) {
                    setActivePatientSection(tab.targetSection);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-cyan-500' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            );
          })}
        </div>

        {/* Right Content Area: Clinical Summary + Current Status Grid */}
        <div className="lg:col-span-3 space-y-6">
          {/* Clinical Summary Card (Reference 2) */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-500" /> Clinical Summary
              </h3>
              <button
                onClick={() => setActivePatientSection('history')}
                className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                Full History →
              </button>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Chief Complaint
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80">
                "{patient.clinicalSummary.chiefComplaint}"
              </p>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                History of Present Illness (HPI)
              </span>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {patient.clinicalSummary.hpi}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Past Medical History
                </span>
                <ul className="text-xs space-y-0.5 text-slate-700 dark:text-slate-300">
                  {patient.clinicalSummary.pmh.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Home / Prior Drug History
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-normal">
                  {patient.clinicalSummary.drugHistory}
                </p>
              </div>
            </div>
          </div>

          {/* Current Status Card (Exact Grid from Reference Image 2) */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-500" /> Current Status
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {latestVital.timestamp}
              </span>
            </div>

            {/* 8 Metric Tiles Grid matching Reference Image 2:
                BP: 120/70 (MAP 87)
                HR: 88 bpm
                SpO2: 98%
                Temp: 36.8°C
                GCS: E3 V4 M6 (13)
                RASS: -1
                Urine Output: 0.8 mL/kg/hr
                Balance: +250 mL */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* BP */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">BP</span>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {latestVital.sbp}/{latestVital.dbp}
                </div>
                <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                  (MAP {map})
                </span>
              </div>

              {/* HR */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">HR</span>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {latestVital.hr} <span className="text-xs font-normal text-slate-400">bpm</span>
                </div>
                <span className="text-[11px] text-emerald-500 font-medium">Sinus rhythm</span>
              </div>

              {/* SpO2 */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">SpO₂</span>
                <div className="text-lg font-extrabold text-cyan-500 mt-0.5">
                  {latestVital.spo2}%
                </div>
                <span className="text-[11px] text-slate-400">FiO₂ {patient.ventilator.fio2}%</span>
              </div>

              {/* Temp */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">Temp</span>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {latestVital.temp}°C
                </div>
                <span className="text-[11px] text-emerald-500">Normothermic</span>
              </div>

              {/* GCS */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">GCS</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  E{latestVital.gcsEye} V{latestVital.gcsVerbal} M{latestVital.gcsMotor}
                </div>
                <span className="text-xs font-extrabold text-cyan-500">
                  ({latestVital.gcsTotal}/15)
                </span>
              </div>

              {/* RASS */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">RASS</span>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {latestVital.rass}
                </div>
                <span className="text-[11px] text-slate-400">Light sedation</span>
              </div>

              {/* Urine Output */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">Urine Output</span>
                <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  0.8 <span className="text-[10px] font-normal text-slate-400">mL/kg/hr</span>
                </div>
                <span className="text-[11px] text-emerald-500 font-medium">Adequate perfusion</span>
              </div>

              {/* Balance */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">Balance</span>
                <div className="text-lg font-extrabold text-cyan-500 mt-0.5">
                  +250 mL
                </div>
                <span className="text-[11px] text-slate-400">24-hour cumulative</span>
              </div>
            </div>
          </div>

          {/* Quick Subsystem Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cardiology Snapshot */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-500" /> Cardiac Echo & Biomarkers
                </h4>
                <button
                  onClick={() => setActivePatientSection('cardiology')}
                  className="text-xs text-cyan-500 hover:underline"
                >
                  View details →
                </button>
              </div>
              <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">LVEF:</span> {patient.cardiology.echo.ef}% ({patient.cardiology.echo.lvFunction})
                </p>
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">Troponin:</span> {patient.cardiology.biomarkers.troponin}
                </p>
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">Rhythm:</span> {patient.cardiology.rhythm}
                </p>
              </div>
            </div>

            {/* ICU Snapshot */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-sky-500" /> Ventilator & ABG
                </h4>
                <button
                  onClick={() => setActivePatientSection('icu')}
                  className="text-xs text-cyan-500 hover:underline"
                >
                  View details →
                </button>
              </div>
              <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">Mode:</span> {patient.ventilator.mode}
                </p>
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">PEEP / FiO₂:</span> {patient.ventilator.peep} cmH₂O / {patient.ventilator.fio2}%
                </p>
                <p>
                  <span className="font-semibold text-slate-900 dark:text-white">Latest ABG:</span> pH {latestABG?.ph || 7.39}, PaO₂ {latestABG?.pao2 || 96} (P/F: {latestABG?.pfRatio || 274})
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
