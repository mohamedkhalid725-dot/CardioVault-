import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Activity,
  ArrowRightLeft,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  Image as ImageIcon,
  LogOut,
  MessageSquare,
  Pill,
  Syringe,
  UserCheck,
  X,
} from 'lucide-react';
import { Patient } from '../../types/clinical';
import { ClinicalAudioPlayer } from './ClinicalAudioPlayer';
import { useApp } from '../../context/AppContext';

interface Props {
  patient: Patient;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Category model                                                     */
/* ------------------------------------------------------------------ */

export type TimelineCategory =
  | 'labs'
  | 'imaging'
  | 'vitals'
  | 'progressNotes'
  | 'ecg'
  | 'procedures'
  | 'medications'
  | 'consultations'
  | 'admissions'
  | 'transfers'
  | 'discharges';

/** Clinical categories a secretary must never see. */
const MEDICAL_CATEGORIES: TimelineCategory[] = [
  'labs',
  'imaging',
  'vitals',
  'progressNotes',
  'ecg',
  'procedures',
  'medications',
  'consultations',
];

interface CategoryDef {
  id: TimelineCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
  badgeColor: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'labs', label: 'Labs', icon: FlaskConical, badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { id: 'imaging', label: 'Imaging', icon: ImageIcon, badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse, badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { id: 'progressNotes', label: 'Progress Notes', icon: FileText, badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  { id: 'ecg', label: 'ECG', icon: Activity, badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  { id: 'procedures', label: 'Procedures', icon: Syringe, badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { id: 'medications', label: 'Medications', icon: Pill, badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { id: 'consultations', label: 'Consultations', icon: MessageSquare, badgeColor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  { id: 'admissions', label: 'Admissions', icon: UserCheck, badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft, badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  { id: 'discharges', label: 'Discharges', icon: LogOut, badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
];

const categoryLabel = (id: TimelineCategory): string =>
  CATEGORIES.find((c) => c.id === id)?.label || id;

const LEGACY_EVENT_CATEGORIES: Record<string, TimelineCategory> = {
  Admission: 'admissions',
  'Clinical Assessment': 'progressNotes',
  Vitals: 'vitals',
  Investigation: 'labs',
  Medication: 'medications',
  'Medication Administration': 'medications',
  Procedure: 'procedures',
  Consultation: 'consultations',
  'Progress Note': 'progressNotes',
  Transfer: 'transfers',
  Discharge: 'discharges',
};

const SECRETARY_CATEGORY_LABELS: Partial<Record<TimelineCategory, string>> = {
  admissions: 'Patient admission',
  transfers: 'Patient transfer',
  discharges: 'Patient discharge',
};

/* ------------------------------------------------------------------ */
/* List-item model                                                    */
/* ------------------------------------------------------------------ */

export interface TimelineItem {
  /** Generated React key only. The source record is never mutated. */
  key: string;
  category: TimelineCategory;
  time: string; // ISO-ish, used for newest-first sorting and display
  label: string;
  detail: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
  /** The actual record object, rendered verbatim in the detail view. */
  record: unknown;
}

/** Stable rendering key for records that lack a stable `id`. Never mutates `record`. */
const recordKey = (category: TimelineCategory, source: string, record: unknown, index: number): string => {
  const r = record as Record<string, unknown> | undefined;
  if (r?.id !== undefined && r.id !== null && r.id !== '') {
    return `${category}::${source}::${String(r.id)}`;
  }
  const stamp =
    r?.timestamp ?? r?.date ?? r?.startDate ?? r?.requestedAt ?? r?.orderedAt ?? r?.admissionDate ?? '';
  return `${category}::${source}::${index}::${stamp}`;
};

const fmtDate = (v?: string | null): string => {
  if (!v) return 'Not recorded';
  const parsed = new Date(v);
  if (!Number.isFinite(parsed.getTime())) return v;
  try {
    return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return v;
  }
};

/* ------------------------------------------------------------------ */
/* Presentational helpers                                             */
/* ------------------------------------------------------------------ */

const formatFieldLabel = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());

const formatFieldValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const RawRecordDetails: React.FC<{
  record: Record<string, unknown>;
}> = ({ record }) => {
  const fields = Object.entries(record).filter(([, value]) => value !== undefined);

  if (fields.length === 0) {
    return <p className="text-sm text-slate-500">Record details not available.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map(([key, value]) => {
        const isPlan = key === 'plan';
        const headingId = isPlan ? 'patient-timeline-plan-heading' : undefined;
        return (
          <section
            key={key}
            aria-labelledby={headingId}
            className={`rounded-xl border p-3 ${isPlan
              ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 sm:col-span-2'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
            }`}
          >
            <h3
              id={headingId}
              className={`text-xs font-bold uppercase tracking-wider mb-1 ${isPlan
                ? 'text-indigo-700 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {formatFieldLabel(key)}
            </h3>
            <pre className="m-0 text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-sans" dir="auto">
              {formatFieldValue(value)}
            </pre>
          </section>
        );
      })}
    </div>
  );
};

const SECRETARY_ALLOWED_FIELDS: Partial<Record<TimelineCategory, ReadonlySet<string>>> = {
  admissions: new Set(['timestamp', 'admissionDate', 'admissionTime', 'dischargeDate', 'unitId', 'unitName', 'bedId']),
  transfers: new Set(['timestamp', 'actor', 'actorName']),
  discharges: new Set(['timestamp', 'archiveDate', 'dischargeDate', 'unitId', 'unitName', 'bedId']),
};

export const isTimelineCategoryVisible = (
  category: TimelineCategory,
  isSecretary: boolean,
): boolean => !isSecretary || !MEDICAL_CATEGORIES.includes(category);

export const getTimelineRecordFieldsForRole = (
  record: Record<string, unknown>,
  category: TimelineCategory,
  isSecretary: boolean,
): Record<string, unknown> => {
  if (!isSecretary) return record;
  if (!isTimelineCategoryVisible(category, true)) return {};

  const allowedFields = SECRETARY_ALLOWED_FIELDS[category] ?? new Set<string>();
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => allowedFields.has(key)),
  );
};

export const buildTimelineItems = (patient: Patient, category: TimelineCategory, isSecretary = false): TimelineItem[] => {
  const out: TimelineItem[] = [];
  const push = (
    item: Omit<TimelineItem, 'key' | 'category' | 'record'>,
    record: unknown,
    source: string,
    index: number,
  ) => out.push({ ...item, key: recordKey(category, source, record, index), category, record });
  const pushLegacyEvents = (
    eventTypes: readonly string[],
    icon: React.FC<{ className?: string }>,
    badgeColor: string,
  ) => {
    patient.timelineEvents
      ?.filter((event) => eventTypes.includes(event.eventType))
      .forEach((event, index) => {
        const secretaryLabel = SECRETARY_CATEGORY_LABELS[category];
        push(
          {
            time: event.timestamp ?? '',
            label: isSecretary && secretaryLabel ? secretaryLabel : event.title || event.eventType,
            detail: isSecretary && secretaryLabel
              ? `${categoryLabel(category).replace(/s$/, '')} record`
              : event.summary || 'Timeline event recorded',
            icon,
            badge: isSecretary ? secretaryLabel ?? categoryLabel(category) : event.eventType,
            badgeColor,
          },
          event,
          'patient-timeline-event',
          index,
        );
      });
  };

  switch (category) {
    case 'labs':
      patient.labs?.forEach((r, i) =>
        push(
          {
            time: r.date ?? '',
            label: 'Lab Panel',
            detail: 'Lab panel recorded',
            icon: FlaskConical,
            badge: 'Lab Panel',
            badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          },
          r,
          'lab-panel',
          i,
        ),
      );
      patient.investigations
        ?.filter((record) => record.type !== 'ECG' && record.type !== 'Echo' && record.type !== 'Imaging')
        .forEach((r, i) =>
        push(
          {
            time: r.orderedAt ?? '',
            label: `Investigation: ${r.title ?? 'Investigation'}`,
            detail: [
              r.status ? `Status: ${r.status}` : '',
              r.resultsSummary ?? '',
              r.flag ? `Flag: ${r.flag}` : '',
            ].filter(Boolean).join(' • ') || 'Investigation recorded',
            icon: FlaskConical,
            badge: 'Investigation',
            badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          },
          r,
          'investigation',
          i,
        ),
      );
      patient.labResults?.forEach((r, i) =>
        push(
          {
            time: r.timestamp ?? '',
            label: `Lab: ${r.name ?? r.testName ?? 'Lab Test'}`,
            detail: [
              r.value == null ? '' : String(r.value),
              r.unit ? String(r.unit) : '',
              r.flag ? `• ${r.flag}` : r.status ? `• ${r.status}` : '',
            ]
              .filter(Boolean)
              .join(' ') || 'Result recorded',
            icon: FlaskConical,
            badge: 'Lab',
            badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          },
          r,
          'lab-result',
          i,
        ),
      );
      pushLegacyEvents(['Investigation'], FlaskConical, 'bg-amber-500/10 text-amber-600 dark:text-amber-400');
      break;

    case 'imaging':
      patient.imaging?.forEach((r, i) =>
        push(
          {
            time: r.date,
            label: `Imaging: ${r.type ?? r.modality ?? 'Study'}`,
            detail: r.impression ?? r.findings ?? 'Imaging study documented',
            icon: ImageIcon,
            badge: 'Imaging',
            badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
          },
          r,
          'imaging',
          i,
        ),
      );
      patient.investigations
        ?.filter((record) => record.type === 'Echo' || record.type === 'Imaging')
        .forEach((r, i) =>
          push(
            {
              time: r.orderedAt ?? '',
              label: `Investigation: ${r.title ?? 'Imaging study'}`,
              detail: [
                r.status ? `Status: ${r.status}` : '',
                r.resultsSummary ?? '',
                r.flag ? `Flag: ${r.flag}` : '',
              ].filter(Boolean).join(' • ') || 'Investigation recorded',
              icon: ImageIcon,
              badge: 'Investigation',
              badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            },
            r,
            'investigation',
            i,
          ),
        );
      break;

    case 'vitals':
      patient.vitalsHistory?.forEach((r, i) =>
        push(
          {
            time: r.timestamp,
            label: 'Vitals Entry',
            detail: `BP ${r.sbp ?? '—'}/${r.dbp ?? '—'} • HR ${r.hr ?? '—'} • SpO₂ ${r.spo2 ?? '—'}% • Temp ${r.temp ?? '—'}°C • GCS ${r.gcsTotal ?? '—'}`,
            icon: HeartPulse,
            badge: 'Vitals',
            badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
          },
          r,
          'vital',
          i,
        ),
      );
      pushLegacyEvents(['Vitals'], HeartPulse, 'bg-rose-500/10 text-rose-600 dark:text-rose-400');
      break;

    case 'progressNotes':
      patient.progressNotes?.forEach((r, i) =>
        push(
          {
            time: r.date ? `${r.date}T${r.time || '00:00'}` : '',
            label: r.type ?? 'Progress Note',
            detail:
              [r.subjective, r.objective, r.assessment, r.plan].filter(Boolean).join(' • ') ||
              'Progress note recorded',
            icon: FileText,
            badge: 'Clinical Note',
            badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
          },
          r,
          'progress-note',
          i,
        ),
      );
      pushLegacyEvents(
        ['Clinical Assessment', 'Progress Note'],
        FileText,
        'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      );
      break;

    case 'ecg':
      patient.ecgRecords?.forEach((r, i) =>
        push(
          {
            time: r.date ? `${r.date}T${r.time || '00:00'}` : '',
            label: 'ECG Record',
            detail: r.finalImpression ?? r.rhythm ?? 'ECG recorded',
            icon: Activity,
            badge: 'Cardiology',
            badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
          },
          r,
          'ecg',
          i,
        ),
      );
      patient.investigations
        ?.filter((record) => record.type === 'ECG')
        .forEach((r, i) =>
          push(
            {
              time: r.orderedAt ?? '',
              label: `Investigation: ${r.title ?? 'ECG'}`,
              detail: [
                r.status ? `Status: ${r.status}` : '',
                r.resultsSummary ?? '',
                r.flag ? `Flag: ${r.flag}` : '',
              ].filter(Boolean).join(' • ') || 'Investigation recorded',
              icon: Activity,
              badge: 'Investigation',
              badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
            },
            r,
            'investigation',
            i,
          ),
        );
      break;

    case 'procedures':
      patient.procedures?.forEach((r, i) =>
        push(
          {
            time: r.date ? `${r.date}T${r.time || '00:00'}` : '',
            label: `Procedure: ${r.name ?? r.procedure ?? 'Procedure'}`,
            detail: [r.findings, r.complications, r.operator].filter(Boolean).join(' • ') || 'Intervention recorded',
            icon: Syringe,
            badge: 'Procedure',
            badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
          },
          r,
          'procedure',
          i,
        ),
      );
      pushLegacyEvents(['Procedure'], Syringe, 'bg-rose-500/10 text-rose-600 dark:text-rose-400');
      break;

    case 'medications':
      patient.medications?.forEach((r, i) =>
        push(
          {
            time: r.startDate ?? r.stopDate ?? '',
            label: `Medication: ${r.name ?? r.drug ?? 'Medication'}`,
            detail: `${r.dose ?? ''} ${r.route ?? ''} ${r.frequency ?? ''} • Status: ${r.status ?? 'Not recorded'}`.trim(),
            icon: Pill,
            badge: 'Medication',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          },
          r,
          'medication',
          i,
        ),
      );
      patient.medicationAdministrations?.forEach((r, i) =>
        push(
          {
            time: r.time ?? '',
            label: `Medication administration: ${r.medicationName ?? 'Medication'}`,
            detail: `${r.dosageGiven ?? ''} ${r.route ?? ''} • ${r.status ?? ''}`.trim(),
            icon: Pill,
            badge: 'Administration',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          },
          r,
          'medication-administration',
          i,
        ),
      );
      patient.infusions?.forEach((r, i) =>
        push(
          {
            time: '',
            label: `Infusion: ${r.drugName ?? 'Medication'}`,
            detail: `${r.dose ?? ''} ${r.unit ?? ''} • ${r.rateMlHr ?? ''} mL/hr`.trim(),
            icon: Pill,
            badge: 'Infusion',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          },
          r,
          'infusion',
          i,
        ),
      );
      pushLegacyEvents(
        ['Medication', 'Medication Administration'],
        Pill,
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      );
      break;

    case 'consultations':
      patient.consultations?.forEach((r, i) =>
        push(
          {
            time: r.requestedAt,
            label: `Consultation: ${r.specialty}`,
            detail: `${r.clinicalQuestion ?? 'Consultation requested'} • Status: ${r.status}${
              r.responseNotes ? ` • Reply: ${r.responseNotes}` : ''
            }`,
            icon: MessageSquare,
            badge: 'Consultation',
            badgeColor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
          },
          r,
          'consultation',
          i,
        ),
      );
      pushLegacyEvents(['Consultation'], MessageSquare, 'bg-sky-500/10 text-sky-600 dark:text-sky-400');
      break;

    case 'admissions':
      if (patient.admissionDate) {
        const rec = {
          admissionDate: patient.admissionDate,
          admissionTime: patient.admissionTime,
          unitId: patient.unitId,
          bedId: patient.bedId,
          primaryDiagnosis: patient.primaryDiagnosis,
          status: patient.status,
        };
        push(
          {
            time: `${patient.admissionDate}T${patient.admissionTime || '00:00'}`,
            label: isSecretary ? 'Patient admission' : 'Patient Admission',
            detail: isSecretary
              ? 'Admission record'
              : `Admitted to unit ${patient.unitId ?? '—'} bed ${patient.bedId ?? '—'}. Reason: ${
                patient.primaryDiagnosis || 'Not documented'
              }. Status: ${patient.status}.`,
            icon: UserCheck,
            badge: 'Admission',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          },
          rec,
          'current-admission',
          0,
        );
      }
      patient.pastAdmissions?.forEach((r, i) =>
        push(
          {
            time: r.admissionDate,
            label: isSecretary ? 'Past admission' : `Admission: ${r.primaryDiagnosis || 'Admission'}`,
            detail: isSecretary
              ? 'Admission record'
              : `${r.admissionDate} → ${r.dischargeDate || 'ongoing'} • ${r.unitName ?? '—'} • ${
                r.dischargeReason || 'Not documented'
              }`,
            icon: UserCheck,
            badge: 'Past Admission',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          },
          r,
          'past-admission',
          i,
        ),
      );
      pushLegacyEvents(['Admission'], UserCheck, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400');
      break;

    case 'transfers':
      (patient.auditTrail ?? [])
        .filter((a) => /transfer/i.test(a.action ?? ''))
        .forEach((a, i) =>
          push(
            {
              time: a.timestamp,
              label: isSecretary ? 'Patient transfer' : a.action,
              detail: isSecretary
                ? 'Transfer record'
                : `Actor: ${a.actorName ?? a.actor ?? '—'} • Fields: ${
                  a.fields?.length ? a.fields.join(', ') : 'none'
                }`,
              icon: ArrowRightLeft,
              badge: 'Transfer',
              badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
            },
            a,
            'transfer-audit',
            i,
          ),
        );
      pushLegacyEvents(['Transfer'], ArrowRightLeft, 'bg-slate-500/10 text-slate-600 dark:text-slate-400');
      break;

    case 'discharges':
      if (patient.isArchived) {
        const rec = {
          isArchived: patient.isArchived,
          archiveDate: patient.archiveDate,
          unitId: patient.unitId,
          bedId: patient.bedId,
          archiveReason: patient.archiveReason,
          dischargeSummary: patient.dischargeSummary,
          status: patient.status,
        };
        push(
          {
            time: patient.archiveDate ?? '',
            label: isSecretary ? 'Patient discharge' : 'Discharge / Archive',
            detail: isSecretary
              ? 'Discharge record'
              : `Reason: ${patient.archiveReason || 'Not documented'}. Status: ${patient.status}.`,
            icon: LogOut,
            badge: 'Discharge',
            badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
          },
          rec,
          'current-discharge',
          0,
        );
      }
      patient.pastAdmissions
        ?.filter((a) => Boolean(a.dischargeDate))
        .forEach((r, i) =>
          push(
            {
              time: r.dischargeDate!,
              label: isSecretary ? 'Past discharge' : `Discharge: ${r.primaryDiagnosis || 'Admission'}`,
              detail: isSecretary
                ? 'Discharge record'
                : `${r.unitName ?? '—'} • ${r.dischargeReason || 'Not documented'} • ${
                  r.dischargeSummary ? 'Summary recorded' : 'No summary'
                }`,
              icon: LogOut,
              badge: 'Discharge',
              badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
            },
            r,
            'past-discharge',
            i,
          ),
        );
      pushLegacyEvents(['Discharge'], LogOut, 'bg-slate-500/10 text-slate-600 dark:text-slate-400');
      break;
  }

  return out.sort((a, b) => {
    const aTime = Date.parse(a.time);
    const bTime = Date.parse(b.time);
    const aComparable = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
    const bComparable = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
    if (aComparable === bComparable) return 0;
    return aComparable > bComparable ? -1 : 1;
  });
};



/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export const PatientTimeline: React.FC<Props> = ({ patient, onClose }) => {
  const { currentUser } = useApp();
  const isSecretary = currentUser?.clinicRole === 'secretary';

  const [view, setView] = useState<'categories' | 'list' | 'detail'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<TimelineCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);

  // Role restriction: secretaries see only non-medical categories.
  const enabledCategories = useMemo<CategoryDef[]>(
    () => CATEGORIES.filter((category) => isTimelineCategoryVisible(category.id, isSecretary)),
    [isSecretary],
  );

  useEffect(() => {
    if (selectedCategory && !enabledCategories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory(null);
      setSelectedItem(null);
      setView('categories');
    }
  }, [enabledCategories, selectedCategory]);

  const itemsByCategory = useMemo<Record<TimelineCategory, TimelineItem[]>>(() => {
    const map = {} as Record<TimelineCategory, TimelineItem[]>;
    for (const category of CATEGORIES) {
      map[category.id] = isTimelineCategoryVisible(category.id, isSecretary)
        ? buildTimelineItems(patient, category.id, isSecretary)
        : [];
    }
    return map;
  }, [patient, isSecretary]);

  const counts = useMemo<Record<TimelineCategory, number>>(
    () => Object.fromEntries(CATEGORIES.map((category) => [category.id, itemsByCategory[category.id].length])) as Record<TimelineCategory, number>,
    [itemsByCategory],
  );

  const items = selectedCategory ? itemsByCategory[selectedCategory] ?? [] : [];
  const selectedCategoryVisible = Boolean(
    selectedCategory && enabledCategories.some((category) => category.id === selectedCategory),
  );

  const goBack = () => {
    if (selectedItem) {
      setSelectedItem(null);
      setView('list');
      return;
    }
    if (selectedCategory) {
      setSelectedCategory(null);
      setView('categories');
      return;
    }
    setView('categories');
  };

  /* ------------------------------------------------------------------ */
  /* Detail view: renders the ACTUAL record verbatim, read-only         */
  /* ------------------------------------------------------------------ */
  const renderDetail = (item: TimelineItem): React.JSX.Element => {
    const sourceRecord = (item.record as Record<string, unknown> | undefined) ?? {};
    const record = getTimelineRecordFieldsForRole(sourceRecord, item.category, isSecretary);

    return (
      <>
        <RawRecordDetails record={record} />
        {item.category === 'progressNotes' && typeof record.audioUrl === 'string' && (
          <ClinicalAudioPlayer
            url={record.audioUrl}
            storagePath={typeof record.audioStoragePath === 'string' ? record.audioStoragePath : undefined}
            durationSeconds={typeof record.audioDurationSeconds === 'number' ? record.audioDurationSeconds : undefined}
            label="Voice recording"
          />
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[115] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0E1626]/95 backdrop-blur">
          <div className="flex items-center gap-3">
            {view !== 'categories' && (
              <button
                onClick={goBack}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span className="ml-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hidden sm:inline">
                  Back
                </span>
              </button>
            )}
            <div>
              {view === 'categories' ? (
                <>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock3 className="w-5 h-5 text-cyan-500" />
                    Patient Timeline
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Select a category to view its records, newest first
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {selectedCategoryVisible && selectedCategory ? categoryLabel(selectedCategory) : 'Patient Timeline'}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {view === 'list'
                      ? 'Chronological records • newest first'
                      : 'Actual record • read-only • no edits'}
                  </p>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ============ Level 1: category view with counts ============ */}
          {view === 'categories' && (
            <>
              {enabledCategories.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No categories available for your role.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {enabledCategories.map((cat) => {
                    const n = counts[cat.id];
                    const empty = n === 0;
                    return (
                      <button
                        key={cat.id}
                        aria-label={`${cat.label}, ${n} ${n === 1 ? 'record' : 'records'}`}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setSelectedItem(null);
                          setView('list');
                        }}
                        className={`
                          rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all
                          ${empty
                            ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-slate-400 opacity-70 hover:opacity-100'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] text-slate-900 dark:text-white hover:border-cyan-500/60 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                        }
                        `}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${empty ? 'bg-slate-200 dark:bg-slate-800' : 'bg-cyan-500/10'}`}>
                          <cat.icon className={`w-5 h-5 ${empty ? 'text-slate-500' : 'text-cyan-500'}`} />
                        </div>
                        <div className="text-xs font-bold leading-none text-center">{cat.label}</div>
                        <span
                          className={`
                            text-[10px] font-black px-2 py-0.5 rounded leading-none
                            ${empty ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'}
                          `}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ Level 2: chronological list for one category ============ */}
          {view === 'list' && selectedCategory && selectedCategoryVisible && (
            <>
              <div className="mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Records in {categoryLabel(selectedCategory)}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {items.length} record{items.length !== 1 ? 's' : ''}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No records in this category.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setSelectedItem(item);
                        setView('detail');
                      }}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 flex items-center justify-between group hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                          <item.icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {item.badge && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  item.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                            <b className="text-sm text-slate-900 dark:text-white truncate">
                              {item.label}
                            </b>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.time ? fmtDate(item.time) : 'Date not recorded'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ============ Detail view: actual record ============ */}
          {view === 'detail' && selectedItem && selectedCategoryVisible && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] p-5">
              {renderDetail(selectedItem)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
