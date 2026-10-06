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
  cardiovascularHistory?: {
    diabetes?: unknown;
    hypertension?: unknown;
  };
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
}

function hasRecordedPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value === true;
  return false;
}

function filterRecordedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const filtered = value
      .map(filterRecordedValue)
      .filter((item) => item !== undefined);

    return filtered.length ? filtered : undefined;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const filtered = filterRecordedValue(child);

      if (filtered !== undefined) {
        output[key] = filtered;
      }
    }

    return Object.keys(output).length ? output : undefined;
  }

  return hasRecordedPrimitive(value) ? value : undefined;
}

export function serializeExamination(examination: unknown): string {
  const filtered = filterRecordedValue(examination);

  return filtered === undefined ? 'Not documented' : JSON.stringify(filtered);
}

function textOrNotDocumented(value: unknown): string {
  return hasRecordedPrimitive(value) ? String(value).trim() : 'Not documented';
}

function humanizeExaminationKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
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
  const filtered = filterRecordedValue(examination);

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
      : 'NKDA';

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
  };
}
