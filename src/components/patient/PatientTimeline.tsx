import React, { useMemo } from 'react';
import {
  Activity,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  Image as ImageIcon,
  Pill,
  Syringe,
  Wind,
  X,
  MessageSquare,
  ShieldAlert,
  Edit3,
  UserCheck,
} from 'lucide-react';
import { Patient } from '../../types/clinical';

interface Props {
  patient: Patient;
  onClose: () => void;
}

type Event = {
  time: string;
  label: string;
  detail: string;
  audioUrl?: string;
  audioDurationSeconds?: number;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
};

export const PatientTimeline: React.FC<Props> = ({ patient, onClose }) => {
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];

    // Admission
    if (patient.admissionDate) {
      out.push({
        time: `${patient.admissionDate}T${patient.admissionTime || '00:00'}`,
        label: 'Patient Admission',
        detail: `Admitted under Cardiology. Primary diagnosis: ${patient.primaryDiagnosis || 'Unspecified'}. Status: ${patient.status}.`,
        icon: UserCheck,
        badge: 'Admission',
        badgeColor: 'bg-emerald-500/10 text-emerald-500',
      });
    }

    // Progress notes
    patient.progressNotes?.forEach(n =>
      out.push({
        time: `${n.date}T${n.time || '00:00'}`,
        label: n.type || 'Progress Note',
        audioUrl: n.audioUrl || '',
        audioDurationSeconds: n.audioDurationSeconds || 0,
        detail: [n.subjective, n.objective, n.assessment, n.plan].filter(Boolean).join(' • ') || 'Progress note recorded',
        icon: FileText,
        badge: 'Clinical Note',
        badgeColor: 'bg-indigo-500/10 text-indigo-500',
      })
    );

    // Vitals
    patient.vitalsHistory?.forEach(v =>
      out.push({
        time: v.timestamp,
        label: 'Vitals Entry',
        detail: `BP ${v.sbp}/${v.dbp} • HR ${v.hr} • SpO₂ ${v.spo2}% • RR ${v.rr} • Temp ${v.temp}°C • GCS ${v.gcsTotal}`,
        icon: HeartPulse,
        badge: 'Vitals',
        badgeColor: 'bg-rose-500/10 text-rose-500',
      })
    );

    // ECG
    patient.ecgRecords?.forEach(e =>
      out.push({
        time: `${e.date}T${e.time || '00:00'}`,
        label: 'ECG Recorded',
        detail: e.finalImpression || e.rhythm || 'ECG recorded',
        icon: Activity,
        badge: 'Cardiology',
        badgeColor: 'bg-cyan-500/10 text-cyan-500',
      })
    );

    // Labs & Investigations
    patient.investigations?.forEach(inv =>
      out.push({
        time: inv.orderedAt,
        label: `Investigation: ${inv.title}`,
        detail: `Status: ${inv.status.toUpperCase()}${inv.resultsSummary ? ` • Result: ${inv.resultsSummary}` : ''} • Ordered by ${inv.orderedBy}`,
        icon: FlaskConical,
        badge: inv.status === 'reviewed' ? 'Reviewed' : 'Ordered',
        badgeColor: inv.status === 'reviewed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500',
      })
    );

    patient.labResults?.forEach(l =>
      out.push({
        time: l.timestamp || '',
        label: `Lab Result: ${l.name || l.testName || 'Test'}`,
        detail: `${l.value} ${l.unit || ''} ${l.flag || l.status || ''}`.trim(),
        icon: FlaskConical,
        badge: 'Lab',
        badgeColor: 'bg-amber-500/10 text-amber-500',
      })
    );

    // Imaging
    patient.imaging?.forEach(i =>
      out.push({
        time: `${i.date}T00:00`,
        label: `Imaging: ${i.type || 'Study'}`,
        detail: i.impression || i.findings || 'Imaging study documented',
        icon: ImageIcon,
        badge: 'Imaging',
        badgeColor: 'bg-purple-500/10 text-purple-500',
      })
    );

    // Procedures
    patient.procedures?.forEach(p =>
      out.push({
        time: `${p.date}T${p.time || '00:00'}`,
        label: `Procedure: ${p.name || p.procedure || 'Procedure'}`,
        detail: [p.findings, p.complications, p.operator].filter(Boolean).join(' • ') || 'Intervention recorded',
        icon: Syringe,
        badge: 'Procedure',
        badgeColor: 'bg-rose-500/10 text-rose-500',
      })
    );

    // Medications
    patient.medications?.forEach(m =>
      out.push({
        time: m.startDate || m.stopDate || '',
        label: `Medication Order: ${m.name || m.drug || 'Medication'}`,
        detail: `${m.dose} ${m.route} ${m.frequency} • Status: ${m.status || 'Active'}`.trim(),
        icon: Pill,
        badge: 'Medication',
        badgeColor: 'bg-emerald-500/10 text-emerald-500',
      })
    );

    // Med Administrations
    patient.medicationAdministrations?.forEach(adm =>
      out.push({
        time: adm.time,
        label: `Med Administered: ${adm.medicationName}`,
        detail: `${adm.dosageGiven || ''} via ${adm.route || ''} by ${adm.user}. Status: ${adm.status}`,
        icon: Pill,
        badge: 'Administered',
        badgeColor: 'bg-emerald-500/10 text-emerald-500',
      })
    );

    // Consultations
    patient.consultations?.forEach(c =>
      out.push({
        time: c.requestedAt,
        label: `Consultation: ${c.specialty}`,
        detail: `${c.clinicalQuestion || 'Consultation requested'} • Status: ${c.status}${c.responseNotes ? ` • Reply: ${c.responseNotes}` : ''}`,
        icon: MessageSquare,
        badge: 'Consultation',
        badgeColor: 'bg-sky-500/10 text-sky-500',
      })
    );

    // Audit logs / Break-glass
    (patient.auditTrail || []).forEach(a => {
      const isBreakGlass = a.action.includes('Break-Glass');
      out.push({
        time: a.timestamp,
        label: a.action,
        detail: [a.fields?.length ? `Fields: ${a.fields.join(', ')}` : ''].filter(Boolean).join(' • ') || 'System governance entry',
        icon: isBreakGlass ? ShieldAlert : FileText,
        badge: isBreakGlass ? 'Break-Glass' : 'Audit',
        badgeColor: isBreakGlass ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-500',
      });
    });

    return out
      .filter(e => e.time && (e.detail || e.label))
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 200);
  }, [patient]);

  return (
    <div className="fixed inset-0 z-[115] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0E1626]/95">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-cyan-500" />
              Unified Patient Timeline (Protocol Section 32)
            </h2>
            <p className="text-[11px] text-slate-400">
              Chronological log of admissions, vitals, progress notes, orders, investigations, and governance events
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {events.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No clinical events have been recorded yet.
            </div>
          ) : (
            <div className="relative ml-2 border-l border-slate-200 dark:border-slate-800 pl-6 space-y-4">
              {events.map((e, i) => {
                const Icon = e.icon;
                return (
                  <div
                    key={`${e.time}-${e.label}-${i}`}
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4"
                  >
                    <div className="absolute -left-[39px] top-4 w-7 h-7 rounded-full bg-white dark:bg-[#0E1626] border border-cyan-500/40 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        {e.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              e.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            {e.badge}
                          </span>
                        )}
                        <b className="text-xs text-slate-900 dark:text-white">{e.label}</b>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {e.time ? new Date(e.time).toLocaleString() : 'Date not recorded'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap">
                      {e.detail || 'Recorded event'}
                    </p>
                    {e.audioUrl && <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">Voice recording{e.audioDurationSeconds ? ` • ${e.audioDurationSeconds}s` : ''}</div><audio controls preload="none" src={e.audioUrl} className="w-full" aria-label={`Play ${e.label} voice recording`} /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
