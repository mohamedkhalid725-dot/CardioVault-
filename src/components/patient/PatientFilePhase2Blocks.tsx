import React from 'react';
import { AlertCircle, ChevronRight, Clock3 } from 'lucide-react';
import type { Patient, PatientSectionId } from '../../types/clinical';
import { PATIENT_SECTIONS } from './PatientFileNavV2';
import {
  buildNeedsAttention,
  buildNowVitals,
  getSectionStatus,
} from '../../services/patientFilePhase2';

interface Props {
  patient: Patient;
  onSelectSection: (id: PatientSectionId) => void;
}

const SECTION_ROWS: PatientSectionId[] = [
  'history',
  'examination',
  'vitals',
  'ecg',
  'labs',
  'imaging',
  'medication',
  'procedure',
  'orders',
  'cardiology',
  'icu',
  'progress',
  'calculators',
  'clinical-tools',
];

export const PatientFilePhase2Blocks: React.FC<Props> = ({
  patient,
  onSelectSection,
}) => {
  const nowVitals = buildNowVitals(patient.vitalsHistory);
  const attentionItems = buildNeedsAttention(patient);

  return (
    <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-2 space-y-3" dir="auto">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase tracking-[0.16em] font-black text-cyan-500">Now</div>
          <div className="text-xs text-slate-400 mt-0.5">Latest recorded vital signs</div>
        </div>
        <div className="p-3">
          {!nowVitals.length ? (
            <div className="px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-sm font-bold text-slate-500 dark:text-slate-400">
              Not documented
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {nowVitals.map((item) => (
                <div key={item.key} className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wide font-black text-slate-400">{item.label}</div>
                  <div className="mt-1 text-sm font-extrabold truncate">{item.value}</div>
                  <div className="mt-1 text-[9px] text-slate-400 truncate" title={item.timestamp}>Recorded: {item.timestamp}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {attentionItems.length > 0 && (
        <section className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-[#111C2E] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200/70 dark:border-amber-900/50 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-black text-amber-500">Needs attention</div>
              <div className="text-xs text-slate-400 mt-0.5">Only explicit record-state items are shown.</div>
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {attentionItems.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <div className="text-sm font-semibold">{item.reason}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="px-1 pt-1">
          <div className="text-[10px] uppercase tracking-[0.16em] font-black text-cyan-500">Sections</div>
          <div className="text-xs text-slate-400 mt-0.5">Read-only status; tap a row to open the existing section.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] overflow-hidden">
          {SECTION_ROWS.map((id) => {
            const meta = PATIENT_SECTIONS.find((section) => section.id === id);
            if (!meta) return null;
            const status = getSectionStatus(patient, id);
            const Icon = meta.icon;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectSection(id)}
                className="w-full text-left px-4 py-3.5 border-b last:border-b-0 border-slate-200 dark:border-slate-800 hover:bg-cyan-500/5 active:bg-cyan-500/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold truncate">{meta.label}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {status.hasData ? `Has data (${status.count})` : 'Empty'}
                      {status.lastUpdated ? ` · Last updated ${status.lastUpdated}` : ''}
                    </div>
                  </div>
                  {status.hasData && (
                    <Clock3 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
