import { CalculatorDefinition, CLINICAL_CALCULATORS } from './calculators';

const EXTRA_CALCULATORS: CalculatorDefinition[] = [
  {
    id: 'corrected-sofa',
    name: 'Corrected SOFA',
    category: 'Critical Care',
    subtitle: 'Full SOFA with vasopressors & urine output',
    description: 'Full six-organ SOFA calculation with standard cardiovascular vasopressor thresholds and renal urine-output criteria.',
  },
  {
    id: 'systematic-ecg',
    name: 'Systematic ECG',
    category: 'Cardiology',
    subtitle: 'Rate, rhythm, axis, intervals & ST/T checklist',
    description: 'Structured ECG measurement helper for rate, intervals, axis and a systematic ST/T review checklist.',
  },
];

export const CARDIOVAULT_CALCULATORS: CalculatorDefinition[] = [
  ...CLINICAL_CALCULATORS,
  ...EXTRA_CALCULATORS,
];
