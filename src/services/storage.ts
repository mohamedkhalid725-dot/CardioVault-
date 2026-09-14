import {
  Patient,
  Unit,
  Bed,
  VitalRecord,
  FluidRecord,
  ExaminationData,
  ECGRecord,
  CardiologyData,
  Medication,
  VentilatorData,
  ImagingStudy,
  LabPanel,
  ProcedureRecord,
  CalculatorResult,
  ProgressNote,
} from '../types/clinical';

const STORAGE_KEYS = {
  UNITS: 'cardiovault_units_v2',
  BEDS: 'cardiovault_beds_v2',
  PATIENTS: 'cardiovault_patients_v2',
  THEME: 'cardiovault_theme_v2',
  AUTH: 'cardiovault_auth_v2',
  SETTINGS: 'cardiovault_settings_v2',
  LAST_SYNC: 'cardiovault_last_sync_v2',
};

// Initial Ahmed Mohamed Full Clinical Profile (Matches Reference Image 2 exactly)
const initialAhmedData: Patient = {
  id: 'patient-2025001',
  mrn: '2025001',
  fullName: 'Ahmed Mohamed',
  age: 58,
  sex: 'Male',
  weight: 80,
  height: 175,
  photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  unitId: 'unit-neuro-icu',
  bedId: 'bed-neuro-1',
  status: 'Critical',
  admissionDate: '2026-09-12',
  admissionTime: '10:30',
  primaryDiagnosis: 'Stroke (Ischemic)',
  secondaryDiagnoses: ['Hypertension', 'Type 2 Diabetes Mellitus', 'Dyslipidemia'],
  allergies: ['Penicillin (Anaphylaxis)', 'Sulfa Drugs (Rash)'],
  codeStatus: 'Full Code',
  isArchived: false,
  pastAdmissions: [
    {
      id: 'adm-past-1',
      admissionDate: '2025-11-10',
      dischargeDate: '2025-11-16',
      unitName: 'Medical ICU',
      dischargeReason: 'Discharged Home',
      primaryDiagnosis: 'Hypertensive Emergency',
      dischargeSummary: 'Admitted with SBP > 220 mmHg, stabilized on IV Nicardipine, transitioned to Oral Amlodipine & Lisinopril.',
    },
  ],

  clinicalSummary: {
    chiefComplaint: 'Sudden weakness and decreased consciousness.',
    hpi: 'A 58-year-old male with history of HTN and DM presented with sudden onset right-sided weakness and slurred speech starting 3 hours prior to arrival. Family noted acute facial asymmetry and progressive lethargy. NIHSS on admission was 16. CT Brain revealed acute left MCA territory hypodensity without hemorrhagic conversion.',
    pmh: ['Essential Hypertension (12 years)', 'Type 2 Diabetes Mellitus (8 years)', 'Dyslipidemia'],
    psh: ['Appendectomy (2010)', 'Right inguinal hernia repair (2018)'],
    drugHistory: 'Amlodipine 10mg daily, Metformin 1000mg BID, Atorvastatin 40mg daily.',
    allergies: ['Penicillin', 'Sulfa'],
    familyHistory: 'Father died of MI at age 62; Mother has DM and Osteoarthritis.',
    socialHistory: 'Former smoker (20 pack-years, quit 3 years ago). Occasional social alcohol.',
  },

  cardiovascularHistory: {
    hypertension: true,
    diabetes: true,
    dyslipidemia: true,
    cad: false,
    previousMI: false,
    heartFailure: false,
    arrhythmias: true,
    valvularDisease: false,
    previousPCI: false,
    previousCABG: false,
    previousStroke: false,
    pvd: false,
    smoking: true,
    alcohol: false,
    previousAdmissions: 'Hypertensive crisis Nov 2025',
    previousICU: 'Medical ICU 2025 (6 days)',
    other: 'Intermittent palpitations noted 1 month prior to admission.',
  },

  vitalsHistory: [
    {
      id: 'vital-1',
      timestamp: '2026-09-14 08:00',
      sbp: 120,
      dbp: 70,
      hr: 88,
      rr: 16,
      spo2: 98,
      temp: 36.8,
      pain: 2,
      gcsEye: 3,
      gcsVerbal: 4,
      gcsMotor: 6,
      gcsTotal: 13,
      rass: -1,
      cvp: 9,
      co: 5.2,
      ci: 2.7,
      sv: 60,
      svr: 1050,
      lactate: 1.4,
      notes: 'Blood pressure optimized on low-dose norepinephrine infusion.',
    },
    {
      id: 'vital-2',
      timestamp: '2026-09-14 04:00',
      sbp: 128,
      dbp: 74,
      hr: 86,
      rr: 17,
      spo2: 99,
      temp: 36.9,
      pain: 2,
      gcsEye: 3,
      gcsVerbal: 3,
      gcsMotor: 6,
      gcsTotal: 12,
      rass: -1,
      cvp: 8,
      co: 5.0,
      ci: 2.6,
      sv: 58,
      svr: 1100,
      lactate: 1.5,
    },
  ],

  fluidRecords: [
    {
      id: 'fluid-1',
      timestamp: '2026-09-14 08:00 (Past 24h)',
      oral: 0,
      ivFluids: 1500,
      bloodProducts: 0,
      enteralFeeding: 400,
      otherInput: 150,
      urine: 1540,
      ngOutput: 100,
      drains: 0,
      chestTube: 0,
      stool: 160,
      otherOutput: 0,
      notes: 'Urine output 0.8 mL/kg/hr sustained. 24-hr net balance +250 mL.',
    },
  ],

  examination: {
    general: {
      appearance: 'Intubated and sedated on light RASS -1 target. Well nourished.',
      consciousness: 'Drowsy but easily rouses to verbal call, follows simple commands with left hand.',
      distress: 'No acute respiratory distress; synchronous with ventilator.',
      hydration: 'Adequate mucous membranes, normotensive.',
      pallor: false,
      cyanosis: false,
      jaundice: false,
      edema: 'Trace 1+ bilateral lower extremity edema, no sacral edema.',
    },
    cardiovascular: {
      jvp: '5 cm H2O, no hepatojugular reflux.',
      heartSounds: 'S1, S2 audible, regular rhythm.',
      murmurs: 'No audible murmurs, rubs, or gallops.',
      peripheralPulses: 'Radial, dorsalis pedis, and posterior tibial pulses 2+ symmetric.',
      edema: 'Trace pedal edema.',
      perfusion: 'Warm peripheries, capillary refill < 2 seconds.',
    },
    respiratory: {
      chestExam: 'Bilateral symmetrical expansion with mechanical ventilator.',
      airEntry: 'Bilateral equal vesicular breath sounds.',
      addedSounds: 'Minimal coarse bibasilar crackles, clear after suctioning.',
      workOfBreathing: 'No accessory muscle use or intercostal retractions.',
    },
    abdomen: {
      inspection: 'Flat, soft, non-distended, surgical scar in right groin.',
      palpation: 'Soft, lax, non-tender on deep palpation throughout.',
      tenderness: 'Nil noted.',
      organomegaly: 'No hepatosplenomegaly palpable.',
      ascites: 'Absent.',
    },
    neurological: {
      consciousness: 'GCS E3 V4 (trachea/tube) M6 = 13. RASS -1.',
      gcs: 'E3 V4 M6 (13/15)',
      pupils: '3mm equal, round and briskly reactive to light bilaterally.',
      motor: 'Right upper extremity 2/5, Right lower extremity 3/5. Left extremities 5/5 intact power.',
      sensory: 'Decreased response to pinprick along right hemibody.',
      reflexes: 'Hyperreflexia 3+ right patellar/biceps; right positive Babinski sign; left negative.',
    },
    extremities: {
      pulses: 'Intact 2+ bilaterally.',
      edema: 'Trace 1+ bilateral ankles.',
      temp: 'Warm to touch distally.',
      perfusion: 'Capillary refill 1.8s.',
    },
    customFields: [
      { label: 'NIH Stroke Scale', value: '14 (Moderate-severe stroke)' },
      { label: 'Pupil Reactivity (NPi)', value: 'Right 4.4, Left 4.3 (Normal Neurological Pupil Index)' },
    ],
  },

  ecgRecords: [
    {
      id: 'ecg-1',
      date: '2026-09-12',
      time: '11:00',
      heartRate: 92,
      rhythm: 'Sinus rhythm',
      regularity: 'Regular',
      axis: 'Normal (approx +45°)',
      pr: 160,
      qrs: 88,
      qt: 380,
      qtc: 420,
      pWave: 'Normal morphology in II and V1',
      qrsFindings: 'Normal voltage, no pathological Q waves',
      stSegment: 'Isoelectric, non-specific T wave flattening in lateral leads',
      tWave: 'Non-specific ST-T changes',
      otherFindings: 'No acute ischemic changes or ST elevation.',
      interpretation: [
        'Sinus rhythm',
        'Normal axis',
        'Non-specific ST-T changes',
        'No acute ischemic changes',
      ],
      finalImpression: 'Normal Sinus Rhythm at 92 bpm with non-specific ST-T wave variations.',
      imageUrls: [],
    },
  ],

  cardiology: {
    rhythm: 'Sinus Rhythm',
    heartRate: 88,
    bp: '120/70 mmHg (MAP 87)',
    heartFailureStatus: 'Compensated',
    nyha: 'Class I',
    killip: 'Class I (No signs of heart failure)',
    congestion: 'Dry',
    perfusion: 'Warm',
    echo: {
      ef: 55,
      lvDimensions: 'LVEDD 48 mm, LVESD 31 mm (Normal)',
      lvFunction: 'Preserved systolic function, Grade I diastolic dysfunction (impaired relaxation)',
      rvFunction: 'Normal TAPSE (21 mm), normal RV free wall strain',
      rwma: 'No regional wall motion abnormalities detected',
      la: 'Mild left atrial enlargement (39 mL/m²)',
      ra: 'Normal size',
      mr: 'Trace',
      ar: 'None',
      as: 'None',
      ms: 'None',
      tr: 'Trivial',
      pr: 'None',
      pasp: 28,
      ivc: '16 mm with >50% inspiratory collapse (CVP estimated 5-10 mmHg)',
      pericardium: 'No pericardial effusion',
      otherFindings: 'No intracardiac thrombus or patent foramen ovale seen on agitated saline.',
    },
    biomarkers: {
      troponin: '0.012 ng/mL (Reference < 0.014 - Negative)',
      ckmb: '1.8 ng/mL (Normal)',
      bnp: '48 pg/mL (Normal < 100)',
      ntProBnp: '120 pg/mL (Normal < 125)',
    },
    coronary: {
      cath: 'Not performed during this admission',
      coronaryFindings: 'No prior history of ACS or coronary angiography.',
      pci: 'None',
      stent: 'None',
      cabg: 'None',
    },
    antithrombotic: {
      antiplatelet: 'Aspirin 81 mg daily + Clopidogrel 75 mg daily (DAPT started post-CT 24h)',
      anticoagulation: 'Prophylactic Enoxaparin 40 mg SC daily',
      thrombolysis: 'Beyond 4.5h window on initial presentation; mechanical thrombectomy not candidate.',
    },
  },

  medications: [
    {
      id: 'med-1',
      drug: 'Norepinephrine',
      dose: '0.04 mcg/kg/min',
      route: 'IV Infusion',
      frequency: 'Continuous',
      startDate: '2026-09-12',
      indication: 'Target MAP 85-90 mmHg for cerebral perfusion',
      status: 'Active',
      category: 'Sedatives & Vasoactives',
      isInfusion: true,
      infusionRate: '4.8 mL/hr (4mg/250mL)',
      doseUnit: 'mcg/kg/min',
    },
    {
      id: 'med-2',
      drug: 'Aspirin',
      dose: '81 mg',
      route: 'NG Tube',
      frequency: 'Once daily',
      startDate: '2026-09-13',
      indication: 'Secondary stroke prophylaxis',
      status: 'Active',
      category: 'Antiplatelets',
    },
    {
      id: 'med-3',
      drug: 'Clopidogrel',
      dose: '75 mg',
      route: 'NG Tube',
      frequency: 'Once daily',
      startDate: '2026-09-13',
      indication: 'DAPT for acute ischemic stroke',
      status: 'Active',
      category: 'Antiplatelets',
    },
    {
      id: 'med-4',
      drug: 'Atorvastatin',
      dose: '80 mg',
      route: 'NG Tube',
      frequency: 'At bedtime',
      startDate: '2026-09-12',
      indication: 'Plaque stabilization & lipid lowering',
      status: 'Active',
      category: 'Statins',
    },
    {
      id: 'med-5',
      drug: 'Enoxaparin',
      dose: '40 mg',
      route: 'SC',
      frequency: 'Once daily',
      startDate: '2026-09-13',
      indication: 'VTE prophylaxis',
      status: 'Active',
      category: 'Anticoagulants',
    },
    {
      id: 'med-6',
      drug: 'Labetalol',
      dose: '10 mg',
      route: 'IV Push',
      frequency: 'PRN for SBP > 160',
      startDate: '2026-09-12',
      indication: 'Blood pressure control',
      status: 'Active',
      category: 'Beta Blockers',
    },
    {
      id: 'med-7',
      drug: 'Pantoprazole',
      dose: '40 mg',
      route: 'IV',
      frequency: 'Once daily',
      startDate: '2026-09-12',
      indication: 'Stress ulcer prophylaxis',
      status: 'Active',
      category: 'Other',
    },
  ],

  ventilator: {
    mode: 'SIMV - Volume Control',
    fio2: 35,
    peep: 5,
    tidalVolume: 480,
    rr: 14,
    pressureSupport: 10,
    inspiratoryPressure: 18,
    ieRatio: '1:2',
    peakPressure: 22,
    plateauPressure: 18,
    meanAirwayPressure: 10,
    spo2: 98,
    etco2: 36,
    compliance: 45,
    resistance: 8,
    abgHistory: [
      {
        id: 'abg-1',
        timestamp: '2026-09-14 06:30',
        ph: 7.39,
        paco2: 38,
        pao2: 96,
        hco3: 24,
        baseExcess: 0.2,
        sao2: 98,
        lactate: 1.2,
        na: 139,
        k: 4.1,
        cl: 102,
        glucose: 135,
        interpretation: 'Normal Acid-Base Status. Adequate oxygenation (P/F ratio: 274).',
        anionGap: 13,
        pfRatio: 274,
        deltaGap: 1,
        deltaRatio: 1.0,
        wintersCompensation: 'Appropriate PCO2 range: 36 - 40 mmHg',
      },
      {
        id: 'abg-past',
        timestamp: '2026-09-13 06:00',
        ph: 7.36,
        paco2: 41,
        pao2: 90,
        hco3: 23,
        baseExcess: -1.0,
        sao2: 97,
        lactate: 1.6,
        na: 140,
        k: 4.0,
        cl: 103,
        glucose: 148,
        interpretation: 'Mild compensated respiratory/metabolic balance within normal limits.',
        anionGap: 14,
        pfRatio: 257,
      },
    ],
  },

  imaging: [
    {
      id: 'img-1',
      date: '2026-09-12 11:30',
      type: 'CT',
      bodyRegion: 'Brain Non-Contrast',
      findings: 'Early ischemic changes in left middle cerebral artery territory with subtle sulcal effacement and loss of gray-white differentiation. No acute intracranial hemorrhage or midline shift.',
      impression: 'Acute left MCA ischemic infarction. ASPECTS score 8. No hemorrhagic transformation.',
      notes: 'Repeat CT planned at 48 hours or upon any clinical deterioration.',
      images: [
        'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80',
      ],
    },
    {
      id: 'img-2',
      date: '2026-09-12 12:45',
      type: 'X-Ray',
      bodyRegion: 'Chest AP Portable',
      findings: 'Endotracheal tube tip 3.5 cm above the carina. Right subclavian central venous catheter tip in lower SVC. Lungs expanded without focal consolidation or pneumothorax.',
      impression: 'Satisfactory line and tube placement. Clear lung fields.',
      notes: 'Lines verified and ready for vasopressor infusion.',
      images: [
        'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&auto=format&fit=crop&q=80',
      ],
    },
  ],

  labs: [
    {
      date: '2026-09-14 06:00',
      hb: 13.8,
      wbc: 9.4,
      platelets: 230,
      hct: 41.5,
      rbc: 4.6,
      mcv: 89,
      mch: 29.8,
      mchc: 33.2,
      urea: 32,
      creatinine: 1.05,
      egfr: 82,
      uricAcid: 5.4,
      na: 139,
      k: 4.1,
      cl: 102,
      ca: 9.2,
      mg: 2.1,
      phosphate: 3.4,
      ast: 24,
      alt: 28,
      alp: 68,
      bilirubin: 0.8,
      albumin: 4.0,
      totalProtein: 7.1,
      pt: 12.2,
      inr: 1.04,
      aptt: 31,
      fibrinogen: 320,
      troponin: 0.012,
      ckmb: 1.8,
      bnp: 48,
      ntProBnp: 120,
      crp: 4.2,
      esr: 14,
      procalcitonin: 0.08,
      glucose: 134,
      hba1c: 7.2,
      cholesterol: 195,
      triglycerides: 170,
      ldl: 125,
      hdl: 42,
      lactate: 1.2,
      dDimer: 380,
      tsh: 1.8,
      customLabs: [
        { name: 'Serum Osmolality', value: '292', unit: 'mOsm/kg', referenceRange: '275 - 295' },
      ],
    },
  ],

  procedures: [
    {
      id: 'proc-1',
      date: '2026-09-12',
      time: '11:15',
      procedure: 'Endotracheal Intubation',
      indication: 'Airway protection given fluctuating consciousness and poor airway reflexes (GCS drop)',
      technique: 'Direct video laryngoscopy (GlideScope). Grade 1 Cormack-Lehane view. 8.0 mm cuffed ETT secured at 22 cm at lip.',
      operator: 'Dr. M. Khalid (Attending Intensivist)',
      findings: 'Vocal cords clearly visualized. Smooth atraumatic tube placement.',
      complications: 'None. SpO2 maintained >98% throughout.',
      outcome: 'Successful endotracheal intubation confirmed by capnography.',
      postProcedurePlan: 'Mechanical ventilation, in-line suctioning, sedation titration.',
      notes: 'Tube position confirmed on post-procedure portable chest radiograph.',
    },
    {
      id: 'proc-2',
      date: '2026-09-12',
      time: '12:00',
      procedure: 'Right Subclavian Central Venous Line',
      indication: 'Central venous access for vasopressor infusion and hemodynamic monitoring',
      technique: 'Real-time ultrasound guidance, Seldinger technique under sterile conditions. Triple lumen 7 Fr catheter.',
      operator: 'Dr. M. Khalid',
      findings: 'Smooth cannulation, dark venous return aspirated from all three ports.',
      complications: 'None. No arterial puncture or pneumothorax.',
      outcome: 'Patent triple lumen catheter secured with 2-0 silk.',
      postProcedurePlan: 'CVP transduction and continuous norepinephrine infusion.',
      notes: 'Position validated by post-procedure chest radiograph at cavoatrial junction.',
    },
  ],

  calculatorResults: [
    {
      id: 'calc-1',
      calculatorId: 'cha2ds2-vasc',
      name: 'CHA2DS2-VASc Score',
      timestamp: '2026-09-12 14:00',
      score: 4,
      riskLevel: 'High',
      interpretation: 'Annual stroke risk without oral anticoagulation is approx 4.8%.',
      summary: 'Age (58 = 0), HTN (+1), DM (+1), Stroke history (+2) = Score 4.',
    },
    {
      id: 'calc-2',
      calculatorId: 'nihss',
      name: 'NIH Stroke Scale',
      timestamp: '2026-09-12 10:45',
      score: 14,
      riskLevel: 'High',
      interpretation: 'Moderate to severe neurological impairment.',
      summary: 'Facial palsy (2), Right arm motor (3), Right leg motor (2), Sensory (1), Dysarthria (2), Best language (2), GCS component (2).',
    },
    {
      id: 'calc-3',
      calculatorId: 'gcs',
      name: 'Glasgow Coma Scale (GCS)',
      timestamp: '2026-09-14 08:00',
      score: '13 (E3 V4 M6)',
      riskLevel: 'Intermediate',
      interpretation: 'Moderate cognitive depression. Eye opens to speech, vocalizes words, obeys motor commands.',
      summary: 'Eye: 3 | Verbal: 4 | Motor: 6 | Total: 13/15',
    },
  ],

  progressNotes: [
    {
      id: 'note-1',
      date: '2026-09-14',
      time: '08:30',
      author: 'Dr. M. Khalid, MD (Attending Intensivist)',
      clinicalStatus: 'Critical but hemodynamically stable on low-dose support',
      events: 'Overnight was uneventful. No seizures or acute desaturations. Noradrenaline weaned from 0.08 to 0.04 mcg/kg/min.',
      examination: 'GCS E3 V4 M6 (13), pupils 3mm equal brisk, right hemiparesis stable (arm 2/5, leg 3/5). Chest clear bilaterally. Abdomen soft.',
      investigations: 'Morning ABG normal pH 7.39, P/F 274. Electrolytes and renal function stable (Cr 1.05).',
      treatment: 'Continue neuro-protective ICU bundle: MAP 85-90 mmHg, normoglycemia, normothermia, head elevation 30 degrees.',
      response: 'Patient maintaining stable cerebral perfusion pressure and adequate urine output (0.8 mL/kg/hr).',
      problems: '1. Acute ischemic stroke (Left MCA). 2. Controlled Hypertension. 3. Type 2 Diabetes.',
      plan: '1. Maintain MAP target 85-90 mmHg. 2. Trial of spontaneous breathing / weaning CPAP later today. 3. Physical therapy bedside evaluation. 4. Continue DAPT and high-intensity statin.',
    },
  ],
};

// Initial Bed configuration matching Reference Image 2
export const INITIAL_UNITS: Unit[] = [
  { id: 'unit-icu', name: 'ICU', type: 'Intensive Care Unit', totalBeds: 8 },
  { id: 'unit-ccu', name: 'CCU', type: 'Coronary Care Unit', totalBeds: 6 },
  { id: 'unit-pediatric-icu', name: 'Pediatric ICU', type: 'Pediatric Intensive Care', totalBeds: 4 },
  { id: 'unit-neuro-icu', name: 'Neuro ICU', type: 'Neuro Intensive Care', totalBeds: 5 },
  { id: 'unit-surgical-icu', name: 'Surgical ICU', type: 'Surgical Intensive Care', totalBeds: 6 },
];

export const INITIAL_BEDS: Bed[] = [
  // Neuro ICU Beds (Reference Image 2)
  { id: 'bed-neuro-1', unitId: 'unit-neuro-icu', bedNumber: 'Bed 1', status: 'Critical', patientId: 'patient-2025001' },
  { id: 'bed-neuro-2', unitId: 'unit-neuro-icu', bedNumber: 'Bed 2', status: 'Unstable', patientId: 'patient-sara' },
  { id: 'bed-neuro-3', unitId: 'unit-neuro-icu', bedNumber: 'Bed 3', status: 'Empty' },
  { id: 'bed-neuro-4', unitId: 'unit-neuro-icu', bedNumber: 'Bed 4', status: 'Stable', patientId: 'patient-mohamed-h' },
  { id: 'bed-neuro-5', unitId: 'unit-neuro-icu', bedNumber: 'Bed 5', status: 'Stable', patientId: 'patient-nada' },

  // CCU Beds
  { id: 'bed-ccu-1', unitId: 'unit-ccu', bedNumber: 'Bed 1', status: 'Critical', patientId: 'patient-tariq' },
  { id: 'bed-ccu-2', unitId: 'unit-ccu', bedNumber: 'Bed 2', status: 'Unstable', patientId: 'patient-mona' },
  { id: 'bed-ccu-3', unitId: 'unit-ccu', bedNumber: 'Bed 3', status: 'Stable', patientId: 'patient-youssef' },
  { id: 'bed-ccu-4', unitId: 'unit-ccu', bedNumber: 'Bed 4', status: 'Stable', patientId: 'patient-layla' },
  { id: 'bed-ccu-5', unitId: 'unit-ccu', bedNumber: 'Bed 5', status: 'Empty' },
  { id: 'bed-ccu-6', unitId: 'unit-ccu', bedNumber: 'Bed 6', status: 'Empty' },

  // ICU Beds
  { id: 'bed-icu-1', unitId: 'unit-icu', bedNumber: 'Bed 1', status: 'Critical', patientId: 'patient-omar' },
  { id: 'bed-icu-2', unitId: 'unit-icu', bedNumber: 'Bed 2', status: 'Unstable', patientId: 'patient-fatima' },
  { id: 'bed-icu-3', unitId: 'unit-icu', bedNumber: 'Bed 3', status: 'Stable', patientId: 'patient-khaled' },
  { id: 'bed-icu-4', unitId: 'unit-icu', bedNumber: 'Bed 4', status: 'Stable', patientId: 'patient-hassan' },
  { id: 'bed-icu-5', unitId: 'unit-icu', bedNumber: 'Bed 5', status: 'Stable', patientId: 'patient-zeinab' },
  { id: 'bed-icu-6', unitId: 'unit-icu', bedNumber: 'Bed 6', status: 'Stable', patientId: 'patient-samir' },
  { id: 'bed-icu-7', unitId: 'unit-icu', bedNumber: 'Bed 7', status: 'Empty' },
  { id: 'bed-icu-8', unitId: 'unit-icu', bedNumber: 'Bed 8', status: 'Empty' },

  // Pediatric ICU Beds
  { id: 'bed-peds-1', unitId: 'unit-pediatric-icu', bedNumber: 'Bed 1', status: 'Unstable', patientId: 'patient-adam' },
  { id: 'bed-peds-2', unitId: 'unit-pediatric-icu', bedNumber: 'Bed 2', status: 'Stable', patientId: 'patient-mariam' },
  { id: 'bed-peds-3', unitId: 'unit-pediatric-icu', bedNumber: 'Bed 3', status: 'Stable', patientId: 'patient-noor' },
  { id: 'bed-peds-4', unitId: 'unit-pediatric-icu', bedNumber: 'Bed 4', status: 'Empty' },

  // Surgical ICU Beds
  { id: 'bed-surg-1', unitId: 'unit-surgical-icu', bedNumber: 'Bed 1', status: 'Critical', patientId: 'patient-rashid' },
  { id: 'bed-surg-2', unitId: 'unit-surgical-icu', bedNumber: 'Bed 2', status: 'Unstable', patientId: 'patient-salma' },
  { id: 'bed-surg-3', unitId: 'unit-surgical-icu', bedNumber: 'Bed 3', status: 'Stable', patientId: 'patient-ibrahim' },
  { id: 'bed-surg-4', unitId: 'unit-surgical-icu', bedNumber: 'Bed 4', status: 'Stable', patientId: 'patient-dalia' },
  { id: 'bed-surg-5', unitId: 'unit-surgical-icu', bedNumber: 'Bed 5', status: 'Empty' },
  { id: 'bed-surg-6', unitId: 'unit-surgical-icu', bedNumber: 'Bed 6', status: 'Empty' },
];

export const INITIAL_PATIENTS: Patient[] = [
  initialAhmedData,
  {
    ...initialAhmedData,
    id: 'patient-sara',
    mrn: '2025002',
    fullName: 'Sara Ali',
    age: 44,
    sex: 'Female',
    weight: 64,
    height: 165,
    unitId: 'unit-neuro-icu',
    bedId: 'bed-neuro-2',
    status: 'Unstable',
    primaryDiagnosis: 'Subarachnoid Hemorrhage (SAH)',
    secondaryDiagnoses: ['Aneurysmal Clipping Day 2', 'Cerebral Vasospasm risk'],
    clinicalSummary: {
      ...initialAhmedData.clinicalSummary,
      chiefComplaint: 'Severe "thunderclap" headache followed by syncope.',
      hpi: '44 yo female presenting with acute Hunt & Hess Grade 3 subarachnoid hemorrhage due to ruptured anterior communicating artery aneurysm. Successfully clipped on Day 0.',
    },
    vitalsHistory: [
      {
        id: 'vital-sara-1',
        timestamp: '2026-09-14 07:30',
        sbp: 138,
        dbp: 78,
        hr: 76,
        rr: 15,
        spo2: 99,
        temp: 37.1,
        pain: 4,
        gcsEye: 4,
        gcsVerbal: 4,
        gcsMotor: 6,
        gcsTotal: 14,
        rass: 0,
        cvp: 10,
        notes: 'Maintaining euvolemia, Nimodipine 60mg q4h administered on schedule.',
      },
    ],
  },
  {
    ...initialAhmedData,
    id: 'patient-mohamed-h',
    mrn: '2025004',
    fullName: 'Mohamed Hassan',
    age: 32,
    sex: 'Male',
    weight: 78,
    height: 180,
    unitId: 'unit-neuro-icu',
    bedId: 'bed-neuro-4',
    status: 'Stable',
    primaryDiagnosis: 'Brain Trauma (Closed Head Injury)',
    secondaryDiagnoses: ['Right frontal contusion', 'Linear skull fracture'],
  },
  {
    ...initialAhmedData,
    id: 'patient-nada',
    mrn: '2025005',
    fullName: 'Nada Ahmed',
    age: 51,
    sex: 'Female',
    weight: 70,
    height: 162,
    unitId: 'unit-neuro-icu',
    bedId: 'bed-neuro-5',
    status: 'Stable',
    primaryDiagnosis: 'Post Craniotomy',
    secondaryDiagnoses: ['Meningioma resection', 'Postoperative surveillance'],
  },
  {
    ...initialAhmedData,
    id: 'patient-tariq',
    mrn: '2025010',
    fullName: 'Tariq Mansoor',
    age: 63,
    sex: 'Male',
    weight: 85,
    height: 172,
    unitId: 'unit-ccu',
    bedId: 'bed-ccu-1',
    status: 'Critical',
    primaryDiagnosis: 'Acute Anterior STEMI (Killip III)',
    secondaryDiagnoses: ['Cardiogenic Shock', 'Post Primary PCI to LAD with DES'],
    cardiology: {
      ...initialAhmedData.cardiology,
      rhythm: 'Sinus Tachycardia with occasional PVCs',
      heartRate: 104,
      bp: '92/60 mmHg (MAP 70)',
      heartFailureStatus: 'Decompensated',
      nyha: 'Class IV',
      killip: 'Class III (Pulmonary edema)',
      echo: {
        ...initialAhmedData.cardiology.echo,
        ef: 32,
        lvFunction: 'Severe anterior and apical hypokinesis',
      },
      biomarkers: {
        troponin: '14.8 ng/mL (Significantly Elevated)',
        ckmb: '82 ng/mL',
        bnp: '1250 pg/mL',
        ntProBnp: '4800 pg/mL',
      },
      coronary: {
        cath: 'Emergency Coronary Angiogram',
        coronaryFindings: '100% proximal LAD occlusion. 70% RCA lesion.',
        pci: 'Primary PCI to proximal LAD with 3.5x24 mm Drug Eluting Stent',
        stent: '1 DES deployed, TIMI 3 flow restored',
        cabg: 'None',
      },
    },
  },
];

// Local-first persistent storage helpers
export const StorageService = {
  getUnits(): Unit[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.UNITS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Storage getUnits error:', e);
    }
    this.saveUnits(INITIAL_UNITS);
    return INITIAL_UNITS;
  },

  saveUnits(units: Unit[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(units));
    } catch (e) {
      console.error('Storage saveUnits error:', e);
    }
  },

  getBeds(): Bed[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BEDS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Storage getBeds error:', e);
    }
    this.saveBeds(INITIAL_BEDS);
    return INITIAL_BEDS;
  },

  saveBeds(beds: Bed[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.BEDS, JSON.stringify(beds));
    } catch (e) {
      console.error('Storage saveBeds error:', e);
    }
  },

  getPatients(): Patient[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PATIENTS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Storage getPatients error:', e);
    }
    this.savePatients(INITIAL_PATIENTS);
    return INITIAL_PATIENTS;
  },

  savePatients(patients: Patient[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients));
    } catch (e) {
      console.error('Storage savePatients error:', e);
    }
  },

  getTheme(): 'dark' | 'light' {
    try {
      const theme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (theme === 'light' || theme === 'dark') return theme;
    } catch (e) {
      console.error('Storage getTheme error:', e);
    }
    return 'dark'; // Dark theme default as per Reference Images
  },

  saveTheme(theme: 'dark' | 'light'): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    } catch (e) {
      console.error('Storage saveTheme error:', e);
    }
  },

  getAuth(): { isAuthenticated: boolean; userEmail: string; userName: string; pinCode: string } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTH);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Storage getAuth error:', e);
    }
    const defaultAuth = {
      isAuthenticated: true, // Default to authenticated so physician can explore immediately
      userEmail: 'mohamedkhalid725@gmail.com',
      userName: 'Dr. Mohamed Khalid',
      pinCode: '1234',
    };
    this.saveAuth(defaultAuth);
    return defaultAuth;
  },

  saveAuth(authData: any): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authData));
    } catch (e) {
      console.error('Storage saveAuth error:', e);
    }
  },

  exportDatabaseBackup(): string {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      units: this.getUnits(),
      beds: this.getBeds(),
      patients: this.getPatients(),
    };
    return JSON.stringify(backup, null, 2);
  },

  importDatabaseBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.units && data.beds && data.patients) {
        this.saveUnits(data.units);
        this.saveBeds(data.beds);
        this.savePatients(data.patients);
        return true;
      }
    } catch (e) {
      console.error('Invalid backup JSON:', e);
    }
    return false;
  },

  resetToDefaultSeed(): void {
    localStorage.removeItem(STORAGE_KEYS.UNITS);
    localStorage.removeItem(STORAGE_KEYS.BEDS);
    localStorage.removeItem(STORAGE_KEYS.PATIENTS);
    this.saveUnits(INITIAL_UNITS);
    this.saveBeds(INITIAL_BEDS);
    this.savePatients(INITIAL_PATIENTS);
  },
};
