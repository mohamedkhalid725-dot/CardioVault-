import React from 'react';
import {AlertCircle, HeartPulse, UserRound} from 'lucide-react';
import {Patient} from '../../types/clinical';

interface ClinicalHistorySnapshotProps {
  patient: Patient;
}

const clean = (value?: string) => String(value || '').trim();

const unique = (items: string[]) =>
  Array.from(new Set(items.map(clean).filter(Boolean)));

const buildRiskFactors = (patient: Patient) => {
  const cv = patient.cardiovascularHistory;
  const risks: string[] = [];
  if (cv?.hypertension) risks.push('Hypertension');
  if (cv?.diabetes) risks.push('Diabetes');
  if (cv?.dyslipidemia) risks.push('Dyslipidemia');
  if (cv?.cad) risks.push('CAD');
  if (cv?.previousMI) risks.push('Previous MI');
  if (cv?.heartFailure) risks.push('Heart failure');
  if (cv?.arrhythmias) risks.push('Arrhythmia');
  if (cv?.valvularDisease) risks.push('Valvular disease');
  if (cv?.previousPCI) risks.push('Previous PCI');
  if (cv?.previousCABG) risks.push('Previous CABG');
  if (cv?.previousStroke) risks.push('Previous stroke');
  if (cv?.pvd) risks.push('PVD');
  if (cv?.smoking) risks.push('Smoking');
  return unique(risks);
};

export const ClinicalHistorySnapshot: React.FC<ClinicalHistorySnapshotProps> = ({patient}) => {
  const summary = patient.clinicalSummary;
  const pmh = unique([
    ...(summary?.pmh || []),
    ...(summary?.psh || []),
    clean(summary?.drugHistory) ? `Drug history: ${clean(summary.drugHistory)}` : ''
  ]);
  const riskFactors = buildRiskFactors(patient);
  const allergies = unique(patient.allergies || []);
  const complaint = clean(summary?.chiefComplaint);
  const hpi = clean(summary?.hpi);
  const familyHistory = clean(summary?.familyHistory);
  const socialHistory = clean(summary?.socialHistory);

  const hasClinicalHistory = Boolean(
    complaint || hpi || pmh.length || riskFactors.length || allergies.length || familyHistory || socialHistory
  );

  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.08] via-white to-white dark:from-cyan-500/[0.10] dark:via-[#111C2E] dark:to-[#111C2E] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shrink-0">
          <HeartPulse className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider font-black text-cyan-500">Clinical History Snapshot</div>
          <div className="mt-1 text-sm sm:text-base font-extrabold leading-snug">
            {patient.age}-year-old {patient.sex.toLowerCase()} patient
            {riskFactors.length ? `, with ${riskFactors.slice(0, 4).join(', ')}${riskFactors.length > 4 ? ', and other documented risk factors' : ''}` : ''}
            {complaint ? `, presenting with ${complaint}.` : '.'}
          </div>
        </div>
      </div>

      {hasClinicalHistory ? (
        <div className="mt-3 space-y-2.5">
          {hpi && (
            <div>
              <div className="text-[9px] uppercase font-black text-slate-400 mb-0.5">History of Present Illness</div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">{hpi}</p>
            </div>
          )}

          {pmh.length > 0 && (
            <div>
              <div className="text-[9px] uppercase font-black text-slate-400 mb-1">Past / Relevant History</div>
              <div className="flex flex-wrap gap-1.5">
                {pmh.map((item, index) => (
                  <span key={`pmh-${index}`} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/70 text-[10px] font-semibold">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {riskFactors.length > 0 && (
            <div>
              <div className="text-[9px] uppercase font-black text-slate-400 mb-1">Documented Cardiovascular Risk Factors</div>
              <div className="flex flex-wrap gap-1.5">
                {riskFactors.map(item => (
                  <span key={item} className="px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 text-[10px] font-bold">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(allergies.length > 0 || familyHistory || socialHistory) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {allergies.length > 0 && (
                <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-2">
                  <div className="text-[9px] uppercase font-black text-rose-500">Allergies</div>
                  <div className="text-[10px] font-semibold mt-0.5">{allergies.join(', ')}</div>
                </div>
              )}
              {familyHistory && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-2">
                  <div className="text-[9px] uppercase font-black text-slate-400">Family History</div>
                  <div className="text-[10px] font-semibold mt-0.5">{familyHistory}</div>
                </div>
              )}
              {socialHistory && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-2">
                  <div className="text-[9px] uppercase font-black text-slate-400">Social History</div>
                  <div className="text-[10px] font-semibold mt-0.5">{socialHistory}</div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-2.5 text-[10px] text-slate-400">
          <UserRound className="w-4 h-4 shrink-0" />
          Clinical history has not been documented yet.
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-400">
        <AlertCircle className="w-3.5 h-3.5" />
        Snapshot is generated only from documented patient data and updates when the history is changed.
      </div>
    </section>
  );
};
