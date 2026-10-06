import React from 'react';
import { Clock3, UserRound } from 'lucide-react';
import { Patient } from '../../../types/clinical';

interface OverviewSectionProps {
  patient: Patient;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({ patient }) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150" dir="auto">
      <section
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] shadow-sm overflow-hidden"
        dir="auto"
      >
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2" dir="auto">
            <UserRound className="w-4 h-4 text-cyan-500" />
            <div dir="auto">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400" dir="auto">Patient Info</p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white" dir="auto">{patient.fullName}</h2>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800">
          <div className="p-4 bg-white dark:bg-[#111C2E]" dir="auto"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400" dir="auto">Age</span><span className="block mt-1 text-sm font-extrabold text-slate-900 dark:text-white" dir="auto">{patient.age}</span></div>
          <div className="p-4 bg-white dark:bg-[#111C2E]" dir="auto"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400" dir="auto">Sex</span><span className="block mt-1 text-sm font-extrabold text-slate-900 dark:text-white" dir="auto">{patient.sex}</span></div>
          <div className="p-4 bg-white dark:bg-[#111C2E]" dir="auto"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400" dir="auto">Admission date</span><span className="block mt-1 text-sm font-extrabold text-slate-900 dark:text-white" dir="auto">{patient.admissionDate || 'Not documented'}</span></div>
          <div className="p-4 bg-white dark:bg-[#111C2E]" dir="auto"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400" dir="auto">Admission time</span><span className="block mt-1 text-sm font-extrabold text-slate-900 dark:text-white" dir="auto">{patient.admissionTime || 'Not documented'}</span></div>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800" dir="auto">
          <div className="flex items-center gap-2" dir="auto"><Clock3 className="w-4 h-4 text-cyan-500" /><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400" dir="auto">Current status</span></div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2" dir="auto"><span className="text-xs font-extrabold" dir="auto">{patient.status}</span></div>
        </div>
      </section>
    </div>
  );
};
