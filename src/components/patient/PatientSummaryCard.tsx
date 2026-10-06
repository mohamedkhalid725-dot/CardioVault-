import React, { useState } from 'react';
import type { PatientReadableSummary } from '../../services/patientSummaryInput';

interface PatientSummaryCardProps {
  summary: PatientReadableSummary;
}

export const PatientSummaryCard: React.FC<PatientSummaryCardProps> = ({
  summary,
}) => {
  const [expanded, setExpanded] = useState(false);

  const admission =
    summary.admissionDate === 'Not documented' &&
    summary.admissionTime === 'Not documented'
      ? 'Not documented'
      : summary.admissionDate + ' • ' + summary.admissionTime;

  return (
    <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-3" dir="auto">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] shadow-sm overflow-hidden" dir="auto">
        <div className="p-4 sm:p-5 space-y-3" dir="auto">
          <div className="grid grid-cols-2 gap-3" dir="auto">
            <div className="rounded-2xl border border-rose-300/60 dark:border-rose-500/30 bg-rose-500/10 p-4" dir="auto">
              <span className="block text-[10px] uppercase tracking-wide text-rose-500 font-black" dir="auto">Code status</span>
              <span className="block mt-1 text-base font-black text-rose-700 dark:text-rose-300" dir="auto">{summary.codeStatus}</span>
            </div>
            <div className="rounded-2xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-500/10 p-4" dir="auto">
              <span className="block text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-black" dir="auto">Allergies</span>
              <span className="block mt-1 text-base font-black text-amber-800 dark:text-amber-200" dir="auto">{summary.allergies}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold" dir="auto">
            <span dir="auto">Age: {summary.age}</span>
            <span dir="auto">Sex: {summary.sex}</span>
            <span dir="auto">Status: {summary.status}</span>
          </div>
          <div className="text-xs font-bold" dir="auto"><span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold" dir="auto">Primary diagnosis</span><div className="mt-0.5" dir="auto">{summary.primaryDiagnosis}</div></div>
          <div className="text-xs font-bold" dir="auto"><span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold" dir="auto">Admission</span><div className="mt-0.5" dir="auto">{admission}</div></div>
          {(summary.diabetes || summary.hypertension) && (
            <div className="flex flex-wrap gap-2" dir="auto">
              {summary.diabetes && <span className="rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-extrabold" dir="auto">Diabetes: Yes</span>}
              {summary.hypertension && <span className="rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-extrabold" dir="auto">Hypertension: Yes</span>}
            </div>
          )}
          <div className="text-xs font-bold" dir="auto"><span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold" dir="auto">Chief complaint</span><div className="mt-0.5" dir="auto">{summary.chiefComplaint}</div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="auto">
            <div className="min-w-0" dir="auto">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold" dir="auto">History</span>
              <p className={'mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed ' + (expanded ? '' : 'line-clamp-3')} dir="auto">{summary.history}</p>
            </div>
            <div className="min-w-0" dir="auto">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold" dir="auto">Examination</span>
              <p className={'mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line ' + (expanded ? '' : 'line-clamp-3')} dir="auto">{summary.examination}</p>
            </div>
          </div>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400" dir="auto">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      </section>
    </div>
  );
};
