import { CalculatorDefinition, CLINICAL_CALCULATORS } from './calculators';

const EXTRA_CALCULATORS: CalculatorDefinition[] = [
  {
    id: 'wells-pe',
    name: 'Wells Score for PE',
    category: 'VTE / Emergency',
    subtitle: 'Pulmonary embolism pre-test probability',
    description: 'Clinical pre-test probability score for suspected pulmonary embolism.',
  },
  {
    id: 'wells-dvt',
    name: 'Wells Score for DVT',
    category: 'VTE / Emergency',
    subtitle: 'Deep vein thrombosis probability',
    description: 'Clinical probability score for suspected lower-extremity DVT.',
  },
  {
    id: 'perc-pe',
    name: 'PERC Rule',
    category: 'VTE / Emergency',
    subtitle: 'PE rule-out criteria',
    description: 'Eight bedside criteria for low-risk patients being evaluated for pulmonary embolism.',
  },
  {
    id: 'revised-geneva',
    name: 'Revised Geneva Score',
    category: 'VTE / Emergency',
    subtitle: 'PE pre-test probability',
    description: 'Objective clinical probability score for suspected pulmonary embolism.',
  },
  {
    id: 'pesi',
    name: 'PESI',
    category: 'VTE / Emergency',
    subtitle: 'Pulmonary embolism severity',
    description: 'Pulmonary Embolism Severity Index for 30-day outcome stratification after PE diagnosis.',
  },
  {
    id: 'spesi',
    name: 'sPESI',
    category: 'VTE / Emergency',
    subtitle: 'Simplified PE severity',
    description: 'Simplified Pulmonary Embolism Severity Index.',
  },
  {
    id: 'four-ts',
    name: '4Ts Score',
    category: 'VTE / Emergency',
    subtitle: 'HIT probability',
    description: 'Thrombocytopenia, timing, thrombosis and other causes score for suspected HIT.',
  },
  {
    id: 'dapt-score',
    name: 'DAPT Score',
    category: 'Cardiology',
    subtitle: 'Extended DAPT assessment',
    description: 'Score incorporating ischemic and bleeding predictors after coronary stenting.',
  },
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
