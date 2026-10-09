import type { CardiovascularHistory, Patient } from '../types/clinical.ts';
import { hasMeaningfulExaminationContent } from './examinationContent.ts';

export interface PatientSummarySource {
  age?: unknown;
  sex?: unknown;
  admissionDate?: unknown;
  admissionTime?: unknown;
  status?: unknown;
  primaryDiagnosis?: unknown;
  allergies?: unknown;
  codeStatus?: unknown;
  clinicalSummary?: {
    chiefComplaint?: unknown;
    hpi?: unknown;
  };
  cardiovascularHistory?: Partial<Record<keyof CardiovascularHistory, unknown>>;
  additionalConditions?: unknown;
  examination?: unknown;
}

export interface PatientSummaryInput {
  age: string;
  diabeticStatus: 'Yes' | 'Not documented';
  hypertensiveStatus: 'Yes' | 'Not documented';
  chiefComplaint: string;
  history: string;
  examination: string;
}

export interface PatientReadableSummarySource extends PatientSummarySource {}

export interface PatientReadableSummary {
  age: string;
  sex: string;
  admissionDate: string;
  admissionTime: string;
  status: string;
  primaryDiagnosis: string;
  allergies: string;
  codeStatus: string;
  chiefComplaint: string;
  history: string;
  examination: string;
  diabetes: boolean;
  hypertension: boolean;
  additionalConditions: string[];
}

const SNAPSHOT_EXCLUDED_PATIENT_KEYS = new Set<keyof Patient>(['id','mrn','fullName','name','age','sex','gender','weight','height','photoUrl','pastAdmissions','auditTrail','aiSummary']);
export const patientKeyClassification: Record<keyof Patient, 'snapshotted' | 'excluded-from-snapshot'> = {
  id:'excluded-from-snapshot', mrn:'excluded-from-snapshot', fullName:'excluded-from-snapshot', name:'excluded-from-snapshot', age:'excluded-from-snapshot', sex:'excluded-from-snapshot', gender:'excluded-from-snapshot', weight:'excluded-from-snapshot', height:'excluded-from-snapshot', photoUrl:'excluded-from-snapshot',
  unitId:'snapshotted', bedId:'snapshotted', bedNumber:'snapshotted', departmentId:'snapshotted', status:'snapshotted', admissionDate:'snapshotted', admissionTime:'snapshotted', primaryDiagnosis:'snapshotted', diagnosis:'snapshotted', secondaryDiagnoses:'snapshotted', allergies:'snapshotted', codeStatus:'snapshotted', isArchived:'snapshotted', archiveReason:'snapshotted', archiveDate:'snapshotted', currentAdmissionStartedAt:'snapshotted', dischargeSummary:'snapshotted', pastAdmissions:'excluded-from-snapshot', clinicalSummary:'snapshotted', cardiovascularHistory:'snapshotted', handover:'snapshotted', vitalsHistory:'snapshotted', fluidRecords:'snapshotted', hemodynamicHistory:'snapshotted', fluidIntakeHistory:'snapshotted', urineOutputHistory:'snapshotted', examination:'snapshotted', ecgRecords:'snapshotted', cardiology:'snapshotted', medications:'snapshotted', infusions:'snapshotted', ventilator:'snapshotted', imaging:'snapshotted', labs:'snapshotted', labResults:'snapshotted', procedures:'snapshotted', calculatorResults:'snapshotted', progressNotes:'snapshotted', auditTrail:'excluded-from-snapshot', aiSummary:'excluded-from-snapshot', problems:'snapshotted', tasks:'snapshotted', investigations:'snapshotted', medicationAdministrations:'snapshotted', consultations:'snapshotted', shiftHandovers:'snapshotted', corrections:'snapshotted', timelineEvents:'snapshotted', attendedClinician:'snapshotted', attendedNurse:'snapshotted', additionalConditions:'snapshotted'
};
void SNAPSHOT_EXCLUDED_PATIENT_KEYS;

function dedupeConditions(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(v => v.trim()).filter(Boolean).filter(v => { const key=v.toLowerCase(); if (key==='no'||key==='none'||seen.has(key)) return false; seen.add(key); return true; });
}
const CONDITION_LABELS: ReadonlyArray<{key: keyof CardiovascularHistory; label: string}> = [
  {key:'hypertension',label:'Hypertension'},{key:'diabetes',label:'Diabetes'},{key:'dyslipidemia',label:'Dyslipidemia'},{key:'cad',label:'CAD'},{key:'previousMI',label:'Previous MI'},{key:'heartFailure',label:'Heart failure'},{key:'arrhythmias',label:'Arrhythmias'},{key:'valvularDisease',label:'Valvular disease'},{key:'previousPCI',label:'Previous PCI'},{key:'previousCABG',label:'Previous CABG'},{key:'previousStroke',label:'Previous stroke/TIA'},{key:'pvd',label:'PVD'},{key:'smoking',label:'Smoking'},{key:'alcohol',label:'Alcohol'}
];
export function buildAdditionalConditions(patient: PatientReadableSummarySource): string[] {
  const cardiovascular = patient.cardiovascularHistory || {};
  const recorded = CONDITION_LABELS.filter(item => cardiovascular[item.key] === true).map(item => item.label);
  const custom = Array.isArray(patient.additionalConditions) ? patient.additionalConditions.map(String) : [];
  return dedupeConditions([...recorded, ...custom]);
}

function hasRecordedPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value === true;
  return false;
}

function filterRecordedValue(value: unknown, preserveNumericZero = false): unknown {
  if (Array.isArray(value)) {
    const filtered = value
      .map((item) => filterRecordedValue(item, preserveNumericZero))
      .filter((item) => item !== undefined);

    return filtered.length ? filtered : undefined;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (preserveNumericZero && key === 'customFields' && Array.isArray(child)) {
        const filteredFields = child
          .map((field) => {
            if (!field || typeof field !== 'object') return undefined;

            const fieldValue = (field as Record<string, unknown>).value;
            if (!hasMeaningfulExaminationContent(fieldValue)) return undefined;

            return filterRecordedValue(field, preserveNumericZero);
          })
          .filter((field): field is Record<string, unknown> => Boolean(field));

        if (filteredFields.length) {
          output[key] = filteredFields;
        }
        continue;
      }

      const filtered = filterRecordedValue(child, preserveNumericZero);

      if (filtered !== undefined) {
        output[key] = filtered;
      }
    }

    return Object.keys(output).length ? output : undefined;
  }

  if (preserveNumericZero) {
    return hasMeaningfulExaminationContent(value) ? value : undefined;
  }

  return hasRecordedPrimitive(value) ? value : undefined;
}

export function serializeExamination(examination: unknown): string {
  const filtered = filterRecordedValue(examination, true);

  return filtered === undefined ? 'Not documented' : JSON.stringify(filtered);
}

function textOrNotDocumented(value: unknown): string {
  return hasRecordedPrimitive(value) ? String(value).trim() : 'Not documented';
}

function humanizeExaminationKey(key: string): string {
  const sentence = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  return sentence ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : '';
}

function readableExaminationValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function buildReadableExaminationLines(
  value: unknown,
  path: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      buildReadableExaminationLines(item, path),
    );
  }

  if (!value || typeof value !== 'object') {
    const readableValue = readableExaminationValue(value);

    return readableValue && path.length
      ? [path.join(' - ') + ': ' + readableValue]
      : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => {
      if (key === 'customFields' && Array.isArray(child)) {
        return child.flatMap((field) => {
          if (!field || typeof field !== 'object') return [];

          const label = readableExaminationValue(
            (field as Record<string, unknown>).label,
          );
          const fieldValue = readableExaminationValue(
            (field as Record<string, unknown>).value,
          );

          return label && fieldValue ? [label + ': ' + fieldValue] : [];
        });
      }

      return buildReadableExaminationLines(child, [
        ...path,
        humanizeExaminationKey(key),
      ]);
    },
  );
}

export function serializeReadableExamination(examination: unknown): string {
  const filtered = filterRecordedValue(examination, true);

  if (filtered === undefined) return 'Not documented';

  const lines = buildReadableExaminationLines(filtered);

  return lines.length ? lines.join('\n') : 'Not documented';
}

export function buildPatientSummaryInput(
  patient: PatientSummarySource,
): PatientSummaryInput {
  return {
    age: textOrNotDocumented(patient.age),
    diabeticStatus:
      patient.cardiovascularHistory?.diabetes === true
        ? 'Yes'
        : 'Not documented',
    hypertensiveStatus:
      patient.cardiovascularHistory?.hypertension === true
        ? 'Yes'
        : 'Not documented',
    chiefComplaint: textOrNotDocumented(
      patient.clinicalSummary?.chiefComplaint,
    ),
    history: textOrNotDocumented(patient.clinicalSummary?.hpi),
    examination: serializeExamination(patient.examination),
  };
}

export function buildPatientReadableSummary(
  patient: PatientReadableSummarySource,
): PatientReadableSummary {
  const allergies =
    Array.isArray(patient.allergies) && patient.allergies.length > 0
      ? patient.allergies
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(', ')
      : 'Not documented';

  return {
    age: textOrNotDocumented(patient.age),
    sex: textOrNotDocumented(patient.sex),
    admissionDate: textOrNotDocumented(patient.admissionDate),
    admissionTime: textOrNotDocumented(patient.admissionTime),
    status: textOrNotDocumented(patient.status),
    primaryDiagnosis: textOrNotDocumented(patient.primaryDiagnosis),
    allergies,
    codeStatus: textOrNotDocumented(patient.codeStatus),
    chiefComplaint: textOrNotDocumented(
      patient.clinicalSummary?.chiefComplaint,
    ),
    history: textOrNotDocumented(patient.clinicalSummary?.hpi),
    examination: serializeReadableExamination(patient.examination),
    diabetes: patient.cardiovascularHistory?.diabetes === true,
    hypertension: patient.cardiovascularHistory?.hypertension === true,
    additionalConditions: buildAdditionalConditions(patient),
  };
}
