const normalizeExaminationText = (value: string): string =>
  value.replace(/^[•·▪◦*-]\s*/, '').replace(/\s+/g, ' ').trim();

const isLabelOnlyTemplate = (value: string): boolean => {
  const text = normalizeExaminationText(value);
  if (!text || /^\(\s*\)$/.test(text)) return true;
  return /^[^:]{1,120}:\s*$/.test(text);
};

export function hasMeaningfulExaminationContent(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') {
    const text = normalizeExaminationText(value);
    return text.length > 0 && !isLabelOnlyTemplate(text);
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulExaminationContent(item));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      if (key === 'customFields' && Array.isArray(child)) {
        return child.some((field) => field && typeof field === 'object'
          ? hasMeaningfulExaminationContent((field as Record<string, unknown>).value)
          : false);
      }
      return hasMeaningfulExaminationContent(child);
    });
  }
  return false;
}

export function meaningfulExaminationText(value: unknown): string {
  if (!hasMeaningfulExaminationContent(value)) return '';
  return typeof value === 'string' ? normalizeExaminationText(value) : String(value);
}

export function examFieldText(value: unknown): string {
  return meaningfulExaminationText(value) || 'Not documented';
}

export const NORMAL_EXAM_TEXT: Readonly<Record<string, string>> = {
  appearance: 'Well, no distress',
  hydration: 'Normal hydration',
  mentalStatus: 'Alert',
  vitalSignsSummary: '',
  consciousness: 'Alert',
  gcs: '15',
  pupils: 'Reactive to light',
  motor: 'Full power',
  sensory: 'Intact',
  reflexes: 'Normal reflexes',
  cranialNerves: 'Intact',
  motorPower: '5',
  plantarResponse: 'Flexor',
  jvp: 'Normal JVP',
  heartSounds: 'Normal S1, S2',
  murmurs: 'No murmurs',
  peripheralPulses: 'Palpable peripheral pulses',
  edema: 'No edema',
  perfusion: 'Normal perfusion',
  pulses: 'Palpable pulses',
  temp: 'Warm',
  chestExam: 'Normal chest expansion',
  airEntry: 'Normal air entry',
  addedSounds: 'No added sounds',
  workOfBreathing: 'No distress',
  inspection: 'Normal inspection',
  palpation: 'Soft, non-tender',
  tenderness: 'No tenderness',
  organomegaly: 'No organomegaly',
  ascites: 'No ascites',
  bowelSounds: 'Normal bowel sounds',
};

export function applyNormalExamText<T extends Record<string, unknown>>(system: T): T {
  const out: Record<string, unknown> = { ...system };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value === 'string') out[key] = NORMAL_EXAM_TEXT[key] ?? value;
    else if (typeof value === 'boolean') out[key] = false;
  }
  return out as T;
}
