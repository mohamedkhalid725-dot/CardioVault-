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
  apexBeat: 'Normal PMI',
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
  hernia: 'No hernia',
  neck: 'Normal neck, no lymphadenopathy',
  skin: 'Normal skin',
  thrill: 'No thrill',
  radiofemoralDelay: 'No delay',
  fremitus: 'Normal fremitus',
  speech: 'Normal speech',
  calves: 'No swelling',
  pressureAreas: 'Intact',
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

export interface ExamSystemCount {
  documented: number;
  total: number;
}
export function countExamSystemFields(system: unknown): ExamSystemCount {
  if (!system || typeof system !== 'object' || Array.isArray(system)) return { documented: 0, total: 0 };
  let documented = 0;
  let total = 0;
  for (const [key, value] of Object.entries(system as Record<string, unknown>)) {
    if (key === 'customFields') {
      if (Array.isArray(value)) {
        for (const field of value) {
          total += 1;
          if (field && typeof field === 'object'
            && hasMeaningfulExaminationContent((field as Record<string, unknown>).value)) documented += 1;
        }
      }
      continue;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      total += 1;
      if (hasMeaningfulExaminationContent(value)) documented += 1;
    }
  }
  return { documented, total };
}

export const EXAM_FIELD_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  appearance: ['Well', 'Ill', 'Cachectic'],
  hydration: ['Normal', 'Dehydrated', 'Overloaded'],
  consciousness: ['Alert', 'Drowsy', 'Stupor'],
  distress: ['No distress', 'Dyspneic', 'In pain'],
  mentalStatus: ['Alert', 'Confused', 'Agitated'],
  neck: ['Normal', 'Lymphadenopathy', 'Goiter'],
  skin: ['Normal', 'Rash', 'Ulcer'],
  heartSounds: ['Normal S1S2', 'Gallop', 'Muffled'],
  murmurs: ['No murmurs', 'Systolic', 'Diastolic'],
  apexBeat: ['Normal PMI', 'Displaced', 'Sustained'],
  jvp: ['Normal', 'Elevated'],
  thrill: ['Absent', 'Present'],
  radiofemoralDelay: ['Absent', 'Present'],
  peripheralPulses: ['Palpable', 'Weak', 'Absent'],
  edema: ['No edema', 'Pitting'],
  perfusion: ['Normal', 'Poor'],
  pulses: ['Palpable', 'Weak', 'Absent'],
  chestExam: ['Normal expansion', 'Asymmetric'],
  airEntry: ['Normal bilateral', 'Reduced'],
  addedSounds: ['None', 'Crackles', 'Wheeze'],
  workOfBreathing: ['No distress', 'Tachypneic', 'Accessory muscles'],
  fremitus: ['Normal', 'Increased', 'Decreased'],
  inspection: ['Normal', 'Distended', 'Scars'],
  palpation: ['Soft', 'Guarding', 'Rigidity'],
  tenderness: ['No tenderness'],
  organomegaly: ['None', 'Hepatomegaly', 'Splenomegaly'],
  ascites: ['Absent', 'Present'],
  bowelSounds: ['Normal', 'Absent', 'Hyperactive'],
  hernia: ['Absent', 'Present'],
  pupils: ['Reactive', 'Sluggish', 'Fixed'],
  motor: ['Full power', 'Weakness'],
  motorPower: ['0', '1', '2', '3', '4', '5'],
  sensory: ['Intact', 'Reduced', 'Absent'],
  reflexes: ['Normal', 'Brisk', 'Absent'],
  cranialNerves: ['Intact', 'Deficit'],
  plantarResponse: ['Flexor', 'Extensor'],
  speech: ['Normal', 'Dysphasic', 'Dysarthric'],
  temp: ['Warm', 'Cold'],
  calves: ['No swelling', 'Swelling'],
  pressureAreas: ['Intact', 'Sore'],
};
