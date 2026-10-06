import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPatientReadableSummary,
  buildPatientSummaryInput,
  serializeExamination,
  serializeReadableExamination,
} from '../src/services/patientSummaryInput.ts';

const defaultExamination = {
  general: {
    appearance: '',
    consciousness: '',
    distress: '',
    hydration: '',
    pallor: false,
    cyanosis: false,
    jaundice: false,
    edema: '',
  },
  cardiovascular: {
    jvp: '',
    heartSounds: '',
    murmurs: '',
    peripheralPulses: '',
    edema: '',
    perfusion: '',
  },
  respiratory: {
    chestExam: '',
    airEntry: '',
    addedSounds: '',
    workOfBreathing: '',
  },
  abdomen: {
    inspection: '',
    palpation: '',
    tenderness: '',
    organomegaly: '',
    ascites: '',
  },
  neurological: {
    consciousness: '',
    gcs: '',
    pupils: '',
    motor: '',
    sensory: '',
    reflexes: '',
  },
  extremities: {
    pulses: '',
    edema: '',
    temp: '',
    perfusion: '',
  },
  customFields: [],
};

test('age=65 + chief complaint only', () => {
  assert.deepEqual(
    buildPatientSummaryInput({
      age: 65,
      clinicalSummary: { chiefComplaint: 'Chest pain' },
    }),
    {
      age: '65',
      diabeticStatus: 'Not documented',
      hypertensiveStatus: 'Not documented',
      chiefComplaint: 'Chest pain',
      history: 'Not documented',
      examination: 'Not documented',
    },
  );
});

test('default examination gives exactly Not documented', () => {
  assert.equal(serializeExamination(defaultExamination), 'Not documented');
  assert.equal(serializeReadableExamination(defaultExamination), 'Not documented');
});

test('one real examination finding gives one readable line', () => {
  const examination = {
    ...defaultExamination,
    cardiovascular: {
      ...defaultExamination.cardiovascular,
      murmurs: 'ESM at apex',
    },
  };

  assert.equal(
    serializeReadableExamination(examination),
    'Cardiovascular - Murmurs: ESM at apex',
  );
});

test('one real examination finding is preserved by the filtered serializer', () => {
  const examination = {
    ...defaultExamination,
    cardiovascular: {
      ...defaultExamination.cardiovascular,
      murmurs: 'ESM at apex',
    },
  };

  assert.deepEqual(JSON.parse(serializeExamination(examination)), {
    cardiovascular: { murmurs: 'ESM at apex' },
  });
});

test('heartSounds is humanized in readable examination output', () => {
  const examination = {
    ...defaultExamination,
    cardiovascular: {
      ...defaultExamination.cardiovascular,
      heartSounds: 'S1 S2 normal',
    },
  };

  assert.equal(
    serializeReadableExamination(examination),
    'Cardiovascular - Heart sounds: S1 S2 normal',
  );
});

test('custom examination field is rendered as one readable line', () => {
  const examination = {
    ...defaultExamination,
    customFields: [
      {
        label: 'Peripheral perfusion',
        value: 'Warm with good capillary refill',
      },
    ],
  };

  assert.equal(
    serializeReadableExamination(examination),
    'Peripheral perfusion: Warm with good capillary refill',
  );
});

test('diabetes and hypertension are shown only when true', () => {
  assert.equal(buildPatientReadableSummary({ cardiovascularHistory: { diabetes: true } }).diabetes, true);
  assert.equal(buildPatientReadableSummary({ cardiovascularHistory: { diabetes: false } }).diabetes, false);
  assert.equal(buildPatientReadableSummary({}).diabetes, false);
  assert.equal(buildPatientReadableSummary({ cardiovascularHistory: { hypertension: true } }).hypertension, true);
  assert.equal(buildPatientReadableSummary({ cardiovascularHistory: { hypertension: false } }).hypertension, false);
  assert.equal(buildPatientReadableSummary({}).hypertension, false);
});

test('diabetes and hypertension are both true when both are recorded true', () => {
  const summary = buildPatientReadableSummary({
    cardiovascularHistory: { diabetes: true, hypertension: true },
  });

  assert.equal(summary.diabetes, true);
  assert.equal(summary.hypertension, true);
});

test('realistic patient preserves summary fields', () => {
  const summary = buildPatientReadableSummary({
    age: 65,
    sex: 'Male',
    admissionDate: '2026-10-05',
    admissionTime: '14:30',
    status: 'Stable',
    primaryDiagnosis: 'Acute coronary syndrome',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    clinicalSummary: {
      chiefComplaint: 'Chest pain',
      hpi: 'Retrosternal chest pain for 2 hours',
    },
    cardiovascularHistory: { diabetes: true, hypertension: true },
    examination: {
      ...defaultExamination,
      cardiovascular: {
        ...defaultExamination.cardiovascular,
        murmurs: 'ESM at apex',
      },
    },
  });

  assert.equal(summary.age, '65');
  assert.equal(summary.sex, 'Male');
  assert.equal(summary.admissionDate, '2026-10-05');
  assert.equal(summary.admissionTime, '14:30');
  assert.equal(summary.status, 'Stable');
  assert.equal(summary.primaryDiagnosis, 'Acute coronary syndrome');
  assert.equal(summary.allergies, 'NKDA');
  assert.equal(summary.codeStatus, 'Full Code');
  assert.equal(summary.chiefComplaint, 'Chest pain');
  assert.equal(summary.history, 'Retrosternal chest pain for 2 hours');
  assert.equal(summary.examination, 'Cardiovascular - Murmurs: ESM at apex');
  assert.equal(summary.diabetes, true);
  assert.equal(summary.hypertension, true);
});

test('missing admission date and time remain separate', () => {
  const summary = buildPatientReadableSummary({});
  assert.equal(summary.admissionDate, 'Not documented');
  assert.equal(summary.admissionTime, 'Not documented');
});
