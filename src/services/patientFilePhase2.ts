import type { Patient, PatientSectionId, VitalRecord } from '../types/clinical';

export interface NowVitalItem {
  key: 'hr' | 'bp' | 'rr' | 'spo2' | 'temp';
  label: string;
  value: string;
  timestamp: string;
}

export interface NeedsAttentionItem {
  id: 'chief-complaint' | 'abnormal-lab';
  reason: string;
}

export interface SectionStatus {
  id: PatientSectionId;
  hasData: boolean;
  count: number;
  lastUpdated: string | null;
}

const FIXED_NOW_FIELDS: Array<{
  key: NowVitalItem['key'];
  label: string;
}> = [
  { key: 'hr', label: 'HR' },
  { key: 'bp', label: 'BP' },
  { key: 'rr', label: 'RR' },
  { key: 'spo2', label: 'SpO2' },
  { key: 'temp', label: 'Temp' },
];

const SECTION_AUDIT_FIELDS: Partial<Record<PatientSectionId, string[]>> = {
  history: ['clinicalSummary'],
  examination: ['examination'],
  vitals: ['vitalsHistory', 'fluidRecords', 'hemodynamicHistory'],
  ecg: ['ecgRecords'],
  labs: ['labResults', 'labs'],
  imaging: ['imaging', 'imagingStudies'],
  medication: ['medications'],
  procedure: ['procedures'],
  orders: ['investigations', 'consultations', 'tasks'],
  cardiology: ['cardiology'],
  icu: ['ventilator'],
  progress: ['progressNotes'],
  calculators: ['calculatorResults'],
};

const hasRecordedVitalValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0;

const timestampMs = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function getLatestVitalRecord(
  vitalsHistory: VitalRecord[] | undefined,
): VitalRecord | null {
  if (!Array.isArray(vitalsHistory) || vitalsHistory.length === 0) return null;

  let latest: VitalRecord | null = null;
  let latestMs = -Infinity;

  for (const record of vitalsHistory) {
    const currentMs = timestampMs(record?.timestamp);
    if (currentMs === null) continue;
    if (currentMs >= latestMs) {
      latest = record;
      latestMs = currentMs;
    }
  }

  return latest;
}

export function buildNowVitals(
  vitalsHistory: VitalRecord[] | undefined,
): NowVitalItem[] {
  const latest = getLatestVitalRecord(vitalsHistory);
  if (!latest) return [];

  const timestamp = String(latest.timestamp || 'Not documented');
  const bp =
    hasRecordedVitalValue(latest.sbp) && hasRecordedVitalValue(latest.dbp)
      ? `${latest.sbp}/${latest.dbp}`
      : hasRecordedVitalValue(latest.sbp)
        ? `${latest.sbp}/Not documented`
        : hasRecordedVitalValue(latest.dbp)
          ? `Not documented/${latest.dbp}`
          : 'Not documented';

  const values: Record<NowVitalItem['key'], string> = {
    hr: hasRecordedVitalValue(latest.hr) ? String(latest.hr) : 'Not documented',
    bp,
    rr: hasRecordedVitalValue(latest.rr) ? String(latest.rr) : 'Not documented',
    spo2: hasRecordedVitalValue(latest.spo2) ? String(latest.spo2) : 'Not documented',
    temp: hasRecordedVitalValue(latest.temp) ? String(latest.temp) : 'Not documented',
  };

  return FIXED_NOW_FIELDS.map(({ key, label }) => ({
    key,
    label,
    value: values[key],
    timestamp,
  }));
}

export function buildNeedsAttention(patient: Patient): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  const chiefComplaint = patient.clinicalSummary?.chiefComplaint;

  if (typeof chiefComplaint !== 'string' || !chiefComplaint.trim()) {
    items.push({
      id: 'chief-complaint',
      reason: 'Chief complaint is not documented.',
    });
  }

  const abnormalLab = (patient.labResults || []).find((lab) => {
    const status = String(lab.status || '').trim().toLowerCase();
    const flag = String(lab.flag || '').trim().toLowerCase();
    return ['low', 'high', 'critical', 'abnormal'].includes(status)
      || ['low', 'high', 'critical', 'abnormal'].includes(flag);
  });

  if (abnormalLab) {
    items.push({
      id: 'abnormal-lab',
      reason: 'This lab was already flagged as abnormal in the record.',
    });
  }

  return items;
}

const latestFromValues = (values: unknown[]): string | null => {
  let latest: string | null = null;
  let latestMs = -Infinity;

  for (const value of values) {
    const candidate = typeof value === 'string' ? value : '';
    const currentMs = timestampMs(candidate);
    if (currentMs === null) continue;
    if (currentMs >= latestMs) {
      latest = candidate;
      latestMs = currentMs;
    }
  }

  return latest;
};

const recordTimestamp = (record: Record<string, unknown>): string | null => {
  if (typeof record.timestamp === 'string' && record.timestamp.trim()) {
    return record.timestamp;
  }

  const date = typeof record.date === 'string' ? record.date.trim() : '';
  const time = typeof record.time === 'string' ? record.time.trim() : '';
  if (date && time) return `${date} ${time}`;
  if (date) return date;
  if (typeof record.updatedAt === 'string' && record.updatedAt.trim()) {
    return record.updatedAt;
  }

  return null;
};

const arrayCount = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

const hasExaminationData = (patient: Patient): boolean => {
  const examination = patient.examination;
  if (!examination) return false;
  const serialized = JSON.stringify(examination)
    .replace(/[{}\[\]":,]/g, '')
    .trim();
  return serialized.length > 0;
};

const hasCardiologyData = (patient: Patient): boolean => {
  const cardiology = patient.cardiology;
  if (!cardiology) return false;
  return Boolean(
    cardiology.rhythm
      || cardiology.echo?.ef
      || cardiology.biomarkerRecords?.length
      || cardiology.cathRecords?.length
      || cardiology.echoBriefSummary,
  );
};

const sectionCount = (patient: Patient, id: PatientSectionId): number => {
  switch (id) {
    case 'history':
      return patient.clinicalSummary ? 1 : 0;
    case 'examination':
      return hasExaminationData(patient) ? 1 : 0;
    case 'vitals':
      return arrayCount(patient.vitalsHistory)
        + arrayCount(patient.fluidRecords)
        + arrayCount(patient.hemodynamicHistory);
    case 'ecg':
      return arrayCount(patient.ecgRecords);
    case 'labs':
      return arrayCount(patient.labResults) + arrayCount(patient.labs);
    case 'imaging':
      return arrayCount(patient.imaging);
    case 'medication':
      return arrayCount(patient.medications);
    case 'procedure':
      return arrayCount(patient.procedures);
    case 'orders':
      return arrayCount(patient.investigations)
        + arrayCount(patient.consultations)
        + arrayCount(patient.tasks);
    case 'cardiology':
      return hasCardiologyData(patient) ? 1 : 0;
    case 'icu':
      return arrayCount(patient.ventilator?.abgHistory)
        + (patient.ventilator?.mode ? 1 : 0);
    case 'progress':
      return arrayCount(patient.progressNotes);
    case 'calculators':
      return arrayCount(patient.calculatorResults);
    default:
      return 0;
  }
};

const sectionHasData = (patient: Patient, id: PatientSectionId): boolean =>
  sectionCount(patient, id) > 0;

const sectionRecordTimestamps = (
  patient: Patient,
  id: PatientSectionId,
): string[] => {
  const records = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) =>
            item && typeof item === 'object'
              ? recordTimestamp(item as Record<string, unknown>)
              : null,
          )
          .filter((item): item is string => Boolean(item))
      : [];

  switch (id) {
    case 'vitals':
      return [
        ...records(patient.vitalsHistory),
        ...records(patient.fluidRecords),
        ...records(patient.hemodynamicHistory),
      ];
    case 'ecg':
      return records(patient.ecgRecords);
    case 'labs':
      return [...records(patient.labResults), ...records(patient.labs)];
    case 'imaging':
      return records(patient.imaging);
    case 'procedure':
      return records(patient.procedures);
    case 'progress':
      return records(patient.progressNotes);
    case 'calculators':
      return records(patient.calculatorResults);
    case 'icu':
      return [
        ...records(patient.ventilator?.abgHistory),
      ];
    default:
      return [];
  }
};

const latestAuditTimestamp = (
  patient: Patient,
  id: PatientSectionId,
): string | null => {
  const fields = SECTION_AUDIT_FIELDS[id] || [];
  const timestamps = (patient.auditTrail || [])
    .filter((event) =>
      Array.isArray(event.fields)
      && event.fields.some((field) => fields.includes(field)),
    )
    .map((event) => event.timestamp);

  return latestFromValues(timestamps);
};

export function getSectionStatus(
  patient: Patient,
  id: PatientSectionId,
): SectionStatus {
  const count = sectionCount(patient, id);
  const lastUpdated = latestFromValues([
    ...sectionRecordTimestamps(patient, id),
    latestAuditTimestamp(patient, id) || '',
  ]);

  return {
    id,
    hasData: sectionHasData(patient, id),
    count,
    lastUpdated,
  };
}
