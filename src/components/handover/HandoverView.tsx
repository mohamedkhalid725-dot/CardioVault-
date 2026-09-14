import React, { useState } from 'react';
import {
  Users,
  Copy,
  Printer,
  CheckCircle2,
  Building2,
  BedDouble,
  HeartPulse,
  Filter,
  FileText,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient } from '../../types/clinical';

export const HandoverView: React.FC = () => {
  const { patients, units, beds, showToast, selectPatient, setCurrentView } = useApp();
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const activePatients = patients.filter((p) => !p.isArchived);

  const filteredPatients =
    selectedUnitFilter === 'all'
      ? activePatients
      : activePatients.filter((p) => p.unitId === selectedUnitFilter);

  const generateSBARForPatient = (p: Patient) => {
    const unit = units.find((u) => u.id === p.unitId);
    const bed = beds.find((b) => b.id === p.bedId);
    const latestVital = p.vitalsHistory?.[0];

    return `[SBAR HANDOVER] ${unit?.name || 'Unit'} - Bed ${bed?.bedNumber || '--'}
PATIENT: ${p.fullName}, ${p.age}y ${p.sex} (MRN: ${p.mrn}) | Code: ${p.codeStatus} | Acuity: ${p.status}
SITUATION: ${p.primaryDiagnosis} (Admitted: ${p.admissionDate})
BACKGROUND: PMH: ${p.clinicalSummary?.pmh?.join(', ') || 'Under reconciliation'}. Allergies: ${p.allergies?.join(', ') || 'NKDA'}
ASSESSMENT:
- Vitals: BP ${latestVital?.sbp || 120}/${latestVital?.dbp || 80} mmHg, HR ${latestVital?.hr || 75} bpm, SpO2 ${latestVital?.spo2 || 99}%, Temp ${latestVital?.temp || 36.8}°C
- Cardiology/Exam: ${p.cardiology?.heartFailureStatus || 'Stable cardiac rhythm'}, LVEF: ${p.cardiology?.echo?.ef || 50}%
RECOMMENDATION:
- Continue ongoing protocol and telemetry monitoring.
- Plan: ${p.progressNotes?.[0]?.plan || 'Routine shift surveillance and targeted therapeutic plan.'}`;
  };

  const handleCopySingle = (p: Patient) => {
    const text = generateSBARForPatient(p);
    navigator.clipboard.writeText(text);
    setCopiedId(p.id);
    showToast(`Copied SBAR for ${p.fullName}`, 'success');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyAll = () => {
    const header = `=== CLINICAL SHIFT HANDOVER REPORT ===\nDate: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nTotal Active Patients: ${filteredPatients.length}\n\n`;
    const body = filteredPatients.map((p) => generateSBARForPatient(p)).join('\n\n------------------------------------\n\n');
    navigator.clipboard.writeText(header + body);
    setCopiedAll(true);
    showToast(`Copied shift handover for ${filteredPatients.length} patient(s)`, 'success');
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 animate-in fade-in duration-150">
      {/* Top Header / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 no-print">
        <div>
          <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
            <Users className="w-5 h-5" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Clinical Shift Handover & SBAR
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Structured physician-to-physician shift transition across {units.length} clinical divisions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
          >
            {copiedAll ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-cyan-500" />}
            Copy Entire Census SBAR
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20"
          >
            <Printer className="w-4 h-4" /> Print Shift Handover Sheet
          </button>
        </div>
      </div>

      {/* Filter Strip (no-print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111C2E] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm no-print">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Filter by Unit:</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedUnitFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              selectedUnitFilter === 'all'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All Units ({activePatients.length})
          </button>

          {units.map((u) => {
            const count = activePatients.filter((p) => p.unitId === u.id).length;
            return (
              <button
                key={u.id}
                onClick={() => setSelectedUnitFilter(u.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  selectedUnitFilter === u.id
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {u.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Sheet Layout */}
      <div className="space-y-4">
        {/* Printable Header */}
        <div className="hidden print:block pb-4 mb-4 border-b-2 border-black">
          <h1 className="text-xl font-black uppercase">CardioVault — Clinical Shift Handover Report</h1>
          <div className="flex justify-between text-xs mt-1">
            <span>Date & Time: {new Date().toLocaleString()}</span>
            <span>Attending / Physician: Dr. Mohamed Khalid</span>
            <span>Total Census: {filteredPatients.length} Patients</span>
          </div>
        </div>

        {/* Patient Handover Cards */}
        {filteredPatients.map((patient) => {
          const unit = units.find((u) => u.id === patient.unitId);
          const bed = beds.find((b) => b.id === patient.bedId);
          const latestVital = patient.vitalsHistory?.[0];
          const latestNote = patient.progressNotes?.[0];

          return (
            <div
              key={patient.id}
              className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 print:border-black print:rounded-none print:shadow-none print:break-inside-avoid print:bg-white print:text-black"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 print:border-gray-300 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 print:text-black flex items-center justify-center font-bold">
                    <BedDouble className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white print:text-black">
                        {patient.fullName}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {patient.age}y {patient.sex} • MRN: {patient.mrn}
                      </span>
                    </div>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 print:text-black font-semibold">
                      {unit?.name || 'Unit'} — Bed {bed?.bedNumber || '--'} • Code: {patient.codeStatus}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 no-print">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      patient.status === 'Critical'
                        ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                        : patient.status === 'Unstable'
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {patient.status}
                  </span>

                  <button
                    onClick={() => handleCopySingle(patient)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                    title="Copy SBAR"
                  >
                    {copiedId === patient.id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => {
                      selectPatient(patient.id);
                      setCurrentView('patient-file');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    Open File <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* SBAR Structured Content */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {/* Situation */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 print:text-black block">
                    Situation
                  </span>
                  <p className="font-bold text-slate-900 dark:text-white print:text-black">
                    {patient.primaryDiagnosis}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Admitted: {patient.admissionDate} ({patient.admissionTime || '08:00'})
                  </p>
                </div>

                {/* Background */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 print:text-black block">
                    Background
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 print:text-black">
                    <strong>Allergies:</strong> {patient.allergies?.join(', ') || 'NKDA'}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 print:text-black">
                    <strong>PMH:</strong> {patient.clinicalSummary?.pmh?.join(', ') || 'CAD, HTN, T2DM'}
                  </p>
                </div>

                {/* Assessment */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 print:text-black block">
                    Assessment
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 print:text-black">
                    <strong>Vitals:</strong> {latestVital?.sbp || 120}/{latestVital?.dbp || 80} mmHg, HR {latestVital?.hr || 75} bpm, SpO₂ {latestVital?.spo2 || 99}%
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 print:text-black">
                    <strong>Echo EF:</strong> {patient.cardiology?.echo?.ef || 50}% • Rhythm: {patient.cardiology?.rhythm || 'Sinus Rhythm'}
                  </p>
                </div>

                {/* Recommendation */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 print:bg-gray-50 rounded-xl border border-slate-200 dark:border-slate-800 print:border-gray-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 print:text-black block">
                    Recommendation & Plan
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 print:text-black leading-relaxed">
                    {latestNote?.plan || 'Continue medical therapy, monitor hemodynamics and maintain fluid balance.'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {filteredPatients.length === 0 && (
          <div className="p-12 text-center text-slate-400 bg-white dark:bg-[#111C2E] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            No active patients in this unit for shift handover.
          </div>
        )}
      </div>
    </div>
  );
};
