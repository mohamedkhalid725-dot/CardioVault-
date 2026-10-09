import type { CardiovascularHistory } from '../types/clinical';

export type ConditionFlagKey =
  | 'hypertension' | 'diabetes' | 'dyslipidemia' | 'cad' | 'previousMI'
  | 'heartFailure' | 'arrhythmias' | 'valvularDisease' | 'previousPCI'
  | 'previousCABG' | 'previousStroke' | 'pvd' | 'smoking' | 'alcohol';

export interface HistoryChipCondition {
  key: string;
  label: string;
  legacyKey?: ConditionFlagKey;
}

export const HISTORY_CONDITION_CHIPS: readonly HistoryChipCondition[] = [
  { key: 'hypertension', label: 'Hypertension', legacyKey: 'hypertension' },
  { key: 'diabetes', label: 'Diabetes', legacyKey: 'diabetes' },
  { key: 'dyslipidemia', label: 'Dyslipidemia', legacyKey: 'dyslipidemia' },
  { key: 'cad', label: 'CAD', legacyKey: 'cad' },
  { key: 'previousMI', label: 'Previous MI', legacyKey: 'previousMI' },
  { key: 'heartFailure', label: 'Heart failure', legacyKey: 'heartFailure' },
  { key: 'arrhythmias', label: 'Arrhythmias', legacyKey: 'arrhythmias' },
  { key: 'valvularDisease', label: 'Valvular disease', legacyKey: 'valvularDisease' },
  { key: 'previousPCI', label: 'Previous PCI', legacyKey: 'previousPCI' },
  { key: 'previousCABG', label: 'Previous CABG', legacyKey: 'previousCABG' },
  { key: 'previousStroke', label: 'Previous stroke/TIA', legacyKey: 'previousStroke' },
  { key: 'pvd', label: 'PVD', legacyKey: 'pvd' },
  { key: 'smoking', label: 'Smoking', legacyKey: 'smoking' },
  { key: 'alcohol', label: 'Alcohol', legacyKey: 'alcohol' },
  { key: 'obesity', label: 'Obesity' },
  { key: 'ckd', label: 'CKD' },
  { key: 'copd', label: 'COPD' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'liver', label: 'Liver disease' },
  { key: 'thyroid', label: 'Thyroid disorder' },
  { key: 'malignancy', label: 'Malignancy' },
  { key: 'epilepsy', label: 'Epilepsy' },
];

const PREDEFINED_LABELS: ReadonlySet<string> = new Set(
  HISTORY_CONDITION_CHIPS.map((c) => c.label.toLowerCase()),
);

export const isPredefinedConditionLabel = (label: string): boolean =>
  PREDEFINED_LABELS.has(String(label ?? '').trim().toLowerCase());

export const dedupeConditionLabels = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (key === 'no' || key === 'none' || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

export const buildSelectedConditions = (
  cardiovascularHistory: CardiovascularHistory | undefined,
  additionalConditions: string[] | undefined,
): string[] => {
  const fromLegacy = HISTORY_CONDITION_CHIPS.filter(
    (c) => c.legacyKey && cardiovascularHistory?.[c.legacyKey] === true,
  ).map((c) => c.label);
  const custom = Array.isArray(additionalConditions) ? additionalConditions.map(String) : [];
  return dedupeConditionLabels([...fromLegacy, ...custom]);
};

export const syncLegacyConditionFlags = (
  selected: string[],
): Partial<Record<ConditionFlagKey, boolean>> => {
  const set = new Set(selected.map((v) => String(v ?? '').trim().toLowerCase()));
  const patch: Partial<Record<ConditionFlagKey, boolean>> = {};
  for (const c of HISTORY_CONDITION_CHIPS) {
    if (c.legacyKey) patch[c.legacyKey] = set.has(c.label.toLowerCase());
  }
  return patch;
};

export interface HistoryAuditEntry {
  timestamp?: string;
  fields?: string[];
  action?: string;
}

const HISTORY_UPDATE_FIELDS: ReadonlySet<string> = new Set([
  'clinicalSummary',
  'cardiovascularHistory',
  'additionalConditions',
]);

export const latestHistoryUpdate = (
  auditTrail: HistoryAuditEntry[] | undefined,
): string | null => {
  if (!Array.isArray(auditTrail)) return null;
  for (const entry of auditTrail) {
    const fields = Array.isArray(entry?.fields) ? entry.fields : [];
    if (fields.some((f) => HISTORY_UPDATE_FIELDS.has(f))) {
      return typeof entry?.timestamp === 'string' && entry.timestamp ? entry.timestamp : null;
    }
  }
  return null;
};
