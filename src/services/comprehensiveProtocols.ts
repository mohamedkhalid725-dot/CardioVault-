import { ClinicalProtocol } from '../types/clinical';

export interface DetailedProtocol extends ClinicalProtocol {
  sourceGuideline: string;
  keySteps: string[];
  safetyNotes: string[];
  contraindications: string[];
  escalationCriteria: string[];
  references: string[];
  isPersonal?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
}

export const OFFICIAL_CLINICAL_PROTOCOLS: DetailedProtocol[] = [
  // ================= CARDIOLOGY =================
  {
    id: 'proto-card-stemi',
    title: 'Acute STEMI Clinical Reperfusion Pathway',
    category: 'Cardiology',
    version: '3.1',
    author: 'Cardiology Clinical Governance Board',
    lastUpdated: '2026-08-15',
    departmentId: 'dept-cardiology',
    content: 'Standard emergency primary percutaneous coronary intervention (PPCI) protocol for acute ST-elevation myocardial infarction.',
    sourceGuideline: 'ESC 2023 / ACC/AHA 2024 Guidelines for the Management of Acute Coronary Syndromes',
    keySteps: [
      'Immediate 12-lead ECG acquisition and interpretation within 10 minutes of first medical contact.',
      'Emergency activation of Cath Lab team (Target Door-to-Wire/Balloon < 60 min if on-site, < 90 min if transferred).',
      'Antiplatelet loading: Aspirin 300 mg po chewed + Ticagrelor 180 mg po (or Prasugrel 60 mg; Clopidogrel 600 mg if contraindicated).',
      'Parenteral anticoagulation: IV Unfractionated Heparin 70-100 IU/kg bolus (or Enoxaparin 0.5 mg/kg IV).',
      'Pain & Symptom Relief: IV Morphine 2-4 mg titrated if severe pain; sublingual or IV Nitroglycerin (avoid if SBP < 90 or RV infarction).',
      'Immediate oxygen only if SpO2 < 90% or respiratory distress.',
      'Post-PCI admission to CCU with continuous telemetry monitoring for minimum 24-48 hours.'
    ],
    safetyNotes: [
      'Perform right-sided leads (V3R, V4R) in all inferior STEMIs to evaluate for RV infarction before administering nitrates or diuretics.',
      'Do not delay Cath Lab transport for cardiac biomarker results.'
    ],
    contraindications: [
      'Avoid Ticagrelor/Prasugrel if prior intracranial hemorrhage or active pathological bleeding.',
      'Avoid Nitrates if SBP < 90 mmHg, HR < 50 bpm, or PDE-5 inhibitor use within 24-48 hours.'
    ],
    escalationCriteria: [
      'Cardiogenic shock (Killip Class IV) -> Immediate arterial line, inotropes, emergency mechanical circulatory support (IABP/Impella).',
      'Sustained VT/VF -> Immediate defibrillation according to ACLS protocol.',
      'Refractory chest pain despite medical therapy -> Immediate emergency PCI.'
    ],
    references: [
      '2023 ESC Guidelines for the management of acute coronary syndromes, European Heart Journal.',
      '2024 ACC/AHA STEMI Practice Guidelines.'
    ]
  },
  {
    id: 'proto-card-nstemi',
    title: 'NSTEMI & High-Risk Acute Coronary Syndrome',
    category: 'Cardiology',
    version: '2.5',
    author: 'Cardiology Governance Board',
    lastUpdated: '2026-07-20',
    departmentId: 'dept-cardiology',
    content: 'Risk stratification and invasive strategy for Non-ST Elevation Myocardial Infarction and Unstable Angina.',
    sourceGuideline: 'ESC 2023 ACS Guidelines / AHA/ACC 2023',
    keySteps: [
      'High-sensitivity Cardiac Troponin (hs-cTn) 0/1h or 0/2h rapid triage protocol.',
      'GRACE Risk Score calculation for early invasive risk stratification.',
      'Dual antiplatelet therapy: Aspirin 300 mg load + P2Y12 inhibitor.',
      'Anticoagulation: Fondaparinux 2.5 mg SC daily or Enoxaparin 1 mg/kg SC q12h.',
      'Very high risk (instability, shock, refractory pain, life-threatening arrhythmia) -> Urgent coronary angiography < 2 hours.',
      'High risk (confirmed NSTEMI, dynamic ST/T changes, GRACE > 140) -> Early invasive angiography < 24 hours.'
    ],
    safetyNotes: [
      'Pre-treatment with P2Y12 inhibitor before angiography is NOT recommended if coronary anatomy is unknown and urgent intervention is planned.'
    ],
    contraindications: [
      'Active major hemorrhage, severe uncorrected coagulopathy.'
    ],
    escalationCriteria: [
      'Hemodynamic collapse, persistent ischemic ECG changes, or sustained ventricular arrhythmias.'
    ],
    references: ['ESC NACS Guidelines, 2023.']
  },
  {
    id: 'proto-card-adhf',
    title: 'Acute Decompensated Heart Failure (ADHF) & Pulmonary Edema',
    category: 'Cardiology',
    version: '2.8',
    author: 'Heart Failure Clinical Service',
    lastUpdated: '2026-09-01',
    departmentId: 'dept-cardiology',
    content: 'Clinical management of acute decompensated heart failure based on hemodynamic profiling (Warm/Wet, Cold/Wet, Cold/Dry).',
    sourceGuideline: '2023 ESC Heart Failure Guidelines Update / 2022 AHA/ACC/HFSA',
    keySteps: [
      'Determine clinical profile: 95% of presentations are "Warm & Wet" (congested, well-perfused).',
      'IV Loop Diuretic: Furosemide initial IV dose = 1.0 to 2.5 times the patient outpatient daily oral dose as IV bolus.',
      'Assess 2-hour spot urinary sodium (> 50-70 mEq/L) or 6-hour urine output (> 100-150 mL/h) to confirm diuretic response.',
      'If inadequate diuretic response: double IV furosemide dose; consider combination nephron blockade (Thiazide or IV Acetazolamide).',
      'IV Vasodilator (Nitroglycerin infusion): Titrate if SBP > 110 mmHg with acute severe pulmonary edema / hypertensive crisis.',
      'Continuous positive airway pressure (CPAP / BiPAP) for acute respiratory distress / hypoxemia.',
      'Strict daily weights, fluid balance chart, and daily renal panel + electrolytes.'
    ],
    safetyNotes: [
      'Avoid empirical routine inotropes in Warm & Wet ADHF (increases mortality and arrhythmia).',
      'Check potassium and magnesium daily; replace aggressively to avoid arrhythmias.'
    ],
    contraindications: [
      'IV vasodilators contraindicated if SBP < 90 mmHg or severe aortic stenosis.'
    ],
    escalationCriteria: [
      'Worsening renal function (> 0.3 mg/dL Cr rise) with refractory congestion -> Nephron blockade, SGLT2i, consider ultrafiltration.',
      'Cold & Wet with hypotension (SBP < 90 mmHg, lactate > 2.0) -> Immediate ICU transfer, inotropic support (Dobutamine / Milrinone).'
    ],
    references: ['ESC Heart Failure Guidelines 2023; AHA/ACC Heart Failure Guidelines 2022.']
  },
  {
    id: 'proto-card-shock',
    title: 'Cardiogenic Shock & Hemodynamic Rescue',
    category: 'Cardiology',
    version: '2.2',
    author: 'CCU Critical Care Board',
    lastUpdated: '2026-08-28',
    departmentId: 'dept-cardiology',
    content: 'SCAI staging A through E classification and multidisciplinary shock team protocol.',
    sourceGuideline: 'SCAI Shock Classification 2022 / AHA Scientific Statement on Cardiogenic Shock',
    keySteps: [
      'Assign SCAI Shock Stage: A (At risk), B (Beginning), C (Classic), D (Deteriorating), E (Extremis).',
      'Immediate invasive arterial line and continuous central venous pressure monitoring.',
      'Norepinephrine as first-line vasopressor to restore MAP > 65 mmHg.',
      'Dobutamine infusion (2.5 - 10 mcg/kg/min) or Milrinone (0.25 - 0.75 mcg/kg/min) for inotropic support.',
      'Urgent echocardiogram to identify mechanical complications (papillary muscle rupture, VSD, acute MR, tamponade).',
      'Urgent coronary angiography if acute coronary syndrome is suspected.',
      'Evaluate for early Mechanical Circulatory Support (MCS): Impella, IABP, or VA-ECMO before multiorgan failure sets in.'
    ],
    safetyNotes: [
      'Milrinone causes peripheral vasodilation and requires renal dose titration; use with caution if MAP is marginal.',
      'Avoid aggressive crystalloid boluses in cardiogenic shock (worsens pulmonary edema and RV strain).'
    ],
    contraindications: [
      'IABP / Impella contraindicated in moderate-to-severe aortic regurgitation and aortic dissection.'
    ],
    escalationCriteria: [
      'Lactate rising (> 3.0 mmol/L), cardiac power index < 0.6 W, mixed venous SvO2 < 55% -> Immediate MCS upgrade.'
    ],
    references: ['SCAI Shock Stage Update, JACC 2022.']
  },
  {
    id: 'proto-card-af',
    title: 'Atrial Fibrillation with Rapid Ventricular Response (RVR)',
    category: 'Cardiology',
    version: '2.6',
    author: 'Electrophysiology Service',
    lastUpdated: '2026-07-15',
    departmentId: 'dept-cardiology',
    content: 'Acute rate control, rhythm control, anticoagulation, and cardioversion in AF with RVR.',
    sourceGuideline: '2024 ESC Guidelines for Atrial Fibrillation / 2023 ACC/AHA/ACCP/HRS',
    keySteps: [
      'Assess hemodynamic stability: If unstable (hypotension, acute ischemia, shock, acute pulmonary edema) -> Immediate synchronized DC cardioversion (150-200 J biphasic).',
      'If stable, evaluate Left Ventricular Ejection Fraction (LVEF):',
      '- Preserved LVEF (> 40%): IV Beta-blocker (Metoprolol 2.5-5 mg IV q5min x 3 doses) OR Non-Dihydropyridine CCB (Diltiazem 0.25 mg/kg IV over 2 min).',
      '- Reduced LVEF (< 40%) or heart failure symptoms: IV Amiodarone (150 mg IV over 10 min, then 1 mg/min x 6h) OR IV Digoxin (0.25-0.5 mg IV slow).',
      'Identify and treat reversible triggers: sepsis, hypokalemia, hypomagnesemia, thyrotoxicosis, PE, alcohol, ischemia.',
      'Calculate CHA2DS2-VASc score and initiate anticoagulation (DOAC: Apixaban, Rivaroxaban, Dabigatran) unless contraindicated.'
    ],
    safetyNotes: [
      'Never administer CCB (Diltiazem/Verapamil) in suspected Pre-excited AF (Wolff-Parkinson-White) — can induce VF.',
      'Do not attempt elective cardioversion if AF duration > 48h without prior TEE or 3 weeks therapeutic anticoagulation.'
    ],
    contraindications: [
      'Beta-blockers and non-DHP CCBs contraindicated in decompensated HF with hypotension, 2nd/3rd degree AV block, or severe bronchospasm.'
    ],
    escalationCriteria: [
      'Heart rate refractory to rate control agents -> Consider urgent TEE followed by electrical cardioversion.'
    ],
    references: ['ESC AF Guidelines 2024; ACC/AHA AF Guidelines 2023.']
  },
  {
    id: 'proto-card-vt',
    title: 'Sustained Monomorphic Ventricular Tachycardia (with Pulse)',
    category: 'Cardiology',
    version: '2.1',
    author: 'Electrophysiology Service',
    lastUpdated: '2026-08-01',
    departmentId: 'dept-cardiology',
    content: 'Acute pharmacological and electrical management of wide-complex tachycardia.',
    sourceGuideline: '2022 ESC Guidelines for Ventricular Arrhythmias / ACLS 2025',
    keySteps: [
      'Assess pulse and hemodynamic stability immediately.',
      'If hemodynamically unstable (hypotension, altered mental status, chest pain, pulmonary edema) -> Immediate synchronized cardioversion (100-200 J biphasic).',
      'If stable with pulse: 12-lead ECG and continuous rhythm strip.',
      'Antiarrhythmic options: IV Amiodarone 150 mg over 10 min (repeat once if needed, followed by 1 mg/min infusion) OR IV Procainamide 20-50 mg/min until arrhythmia suppressed, hypotension ensues, or QRS widens > 50%.',
      'Check and correct serum K+ (> 4.5 mEq/L) and Mg2+ (> 2.0 mg/dL).',
      'Prepare for emergent cardioversion if pharmacological conversion fails or stability deteriorates.'
    ],
    safetyNotes: [
      'Treat any regular wide-complex tachycardia as Ventricular Tachycardia until proven otherwise.',
      'Avoid Verapamil or Diltiazem in wide-complex tachycardia (causes hemodynamic collapse in VT).'
    ],
    contraindications: [
      'Procainamide contraindicated in prolonged QT interval, severe heart block, or severe heart failure.'
    ],
    escalationCriteria: [
      'Degeneration into Pulseless VT or Ventricular Fibrillation -> Immediate CPR and asynchronous defibrillation (ACLS).'
    ],
    references: ['ESC Ventricular Arrhythmias Guidelines 2022.']
  },
  {
    id: 'proto-card-pe',
    title: 'Acute Pulmonary Embolism (PE) Clinical Pathway',
    category: 'Cardiology',
    version: '2.3',
    author: 'Cardiology & Critical Care Board',
    lastUpdated: '2026-07-10',
    departmentId: 'dept-cardiology',
    content: 'Stratification into High-risk (Massive), Intermediate-risk (Submassive), and Low-risk PE.',
    sourceGuideline: 'ESC Guidelines on Acute Pulmonary Embolism 2020 / CHEST 2021',
    keySteps: [
      'High-Risk PE (Shock / SBP < 90 mmHg / sustained hypotension):',
      '- Immediate IV Unfractionated Heparin 80 IU/kg bolus + 18 IU/kg/h.',
      '- Systemic Thrombolysis: Alteplase (rtPA) 100 mg IV over 2 hours (or accelerated 0.6 mg/kg over 15 min if cardiac arrest).',
      '- If thrombolysis contraindicated -> Emergency catheter-directed thrombectomy or surgical embolectomy.',
      'Intermediate-Risk PE (Normotensive with RV strain on Echo/CT or elevated Biomarkers):',
      '- Therapeutic anticoagulation (LMWH or Fondaparinux or UFH).',
      '- Admit to CCU / Step-down unit with close monitoring for hemodynamic decompensation.',
      'Low-Risk PE: Therapeutic DOAC and early discharge eligibility (PESI score).'
    ],
    safetyNotes: [
      'Do not delay anticoagulation while awaiting CT pulmonary angiogram in high-probability patients.',
      'Avoid aggressive IV fluid resuscitation (further dilates the right ventricle and reduces left ventricular filling).'
    ],
    contraindications: [
      'Thrombolysis absolute contraindications: prior intracranial hemorrhage, known structural vascular lesion, intracranial neoplasm, ischemic stroke within 3 months, active internal bleeding.'
    ],
    escalationCriteria: [
      'Intermediate-high risk patient developing SBP < 90 mmHg -> Immediate rescue thrombolysis.'
    ],
    references: ['2019 ESC PE Guidelines.']
  },
  {
    id: 'proto-card-anticoag',
    title: 'Inpatient Anticoagulation & Urgent Reversal Workflows',
    category: 'Cardiology',
    version: '2.4',
    author: 'Cardiology Governance Board',
    lastUpdated: '2026-08-20',
    departmentId: 'dept-cardiology',
    content: 'Dosing, monitoring, and urgent reversal of Warfarin, DOACs, Heparin, and LMWH.',
    sourceGuideline: '2022 ACC Expert Consensus Decision Pathway on Anticoagulation Reversal',
    keySteps: [
      'DOAC Reversal (Life-threatening bleeding or emergency surgery):',
      '- Dabigatran reversal: Idarucizumab 5 g IV (two 2.5 g vials 15 min apart).',
      '- Apixaban / Rivaroxaban reversal: Andexanet alfa (high or low dose based on last DOAC dose and timing) OR 4-Factor Prothrombin Complex Concentrate (4F-PCC) 50 units/kg IV (max 5000 units).',
      'Warfarin Reversal with major bleeding:',
      '- 4F-PCC 25-50 IU/kg IV based on baseline INR + Vitamin K 10 mg IV in 100 mL NS over 30 min.',
      'Unfractionated Heparin Reversal:',
      '- Protamine sulfate 1 mg per 100 units of heparin administered in the last 2-3 hours (max 50 mg IV slow push over 10 min).'
    ],
    safetyNotes: [
      'Administer IV Protamine slowly; rapid administration causes severe hypotension and anaphylactoid bronchospasm.',
      'Oral Vitamin K works within 24 hours; IV Vitamin K is essential for rapid reversal in active hemorrhage.'
    ],
    contraindications: [
      'PCC contraindicated in disseminated intravascular coagulation (DIC) with active thrombosis.'
    ],
    escalationCriteria: [
      'Refractory coagulopathy and bleeding -> Activate Massive Transfusion Protocol (MTP).'
    ],
    references: ['ACC Reversal Decision Pathway, JACC 2022.']
  },

  // ================= ICU / CRITICAL CARE =================
  {
    id: 'proto-icu-sepsis',
    title: 'Sepsis & Septic Shock 1-Hour Management Bundle',
    category: 'ICU / Critical Care',
    version: '3.0',
    author: 'Critical Care Governance Board',
    lastUpdated: '2026-08-30',
    departmentId: 'dept-cardiology',
    content: 'Evidence-based acute management of sepsis and septic shock.',
    sourceGuideline: 'Surviving Sepsis Campaign International Guidelines 2021',
    keySteps: [
      'Measure blood lactate level (re-measure within 2-4 hours if initial lactate > 2.0 mmol/L).',
      'Obtain blood cultures (at least 2 sets) before administering antibiotics (without delaying antimicrobial start > 45 min).',
      'Administer broad-spectrum intravenous antimicrobials within 1 hour of recognition.',
      'Rapid administration of 30 mL/kg balanced crystalloids (Plasma-Lyte / Ringer Lactate) for hypotension or lactate >= 4.0 mmol/L.',
      'Apply vasopressors (Norepinephrine first line) if MAP < 65 mmHg during or after fluid resuscitation.',
      'Target MAP >= 65 mmHg; add Vasopressin (0.03 units/min) if norepinephrine requirement is escalating.',
      'Dynamic hemodynamic assessment of fluid responsiveness (passive leg raise, stroke volume variation).'
    ],
    safetyNotes: [
      'Avoid 0.9% Normal Saline in large volumes due to hyperchloremic metabolic acidosis risk.',
      'Hydrocortisone (200 mg/day IV) is indicated if refractory septic shock persists despite norepinephrine and vasopressin.'
    ],
    contraindications: [
      'Dopamine is not recommended due to high tachyarrhythmia risk in septic shock.'
    ],
    escalationCriteria: [
      'Refractory shock (Norepinephrine > 0.25 mcg/kg/min) -> Add Vasopressin + stress-dose steroids + consider inotrope if myocardial dysfunction.'
    ],
    references: ['Surviving Sepsis Campaign Guidelines 2021, Critical Care Medicine.']
  },
  {
    id: 'proto-icu-vent',
    title: 'Mechanical Ventilation & ARDS Protocol',
    category: 'ICU / Critical Care',
    version: '2.7',
    author: 'ICU Respiratory Therapy Group',
    lastUpdated: '2026-08-10',
    departmentId: 'dept-cardiology',
    content: 'Lung-protective mechanical ventilation protocol for acute respiratory failure and ARDS.',
    sourceGuideline: 'ARDS Network Protocol / 2023 ATS/ESICM/SCCM ARDS Guidelines',
    keySteps: [
      'Set Initial Tidal Volume (Vt) = 6 mL/kg of Predicted Body Weight (PBW).',
      'Calculate PBW: Males = 50 + 0.91*(height in cm - 152.4); Females = 45.5 + 0.91*(height in cm - 152.4).',
      'Target Plateau Pressure (Pplat) <= 30 cmH2O (using inspiratory hold).',
      'Target Driving Pressure (Pplat - PEEP) <= 14 cmH2O.',
      'Titrate PEEP / FiO2 table to maintain PaO2 55-80 mmHg or SpO2 88-93%.',
      'For Moderate-Severe ARDS (PaO2/FiO2 < 150):',
      '- Prone positioning for minimum 16 consecutive hours daily.',
      '- Early neuromuscular blockade (Cisatracurium infusion for 48 hours).',
      'Permissive hypercapnia is acceptable (target pH >= 7.20) to prevent barotrauma.'
    ],
    safetyNotes: [
      'Never calculate tidal volume based on actual body weight (leads to catastrophic ventilator-induced lung injury).',
      'Ensure deep sedation and analgesia before initiating neuromuscular blockade.'
    ],
    contraindications: [
      'Prone positioning relative contraindications: unstable spinal fracture, open abdomen, severe facial trauma.'
    ],
    escalationCriteria: [
      'PaO2/FiO2 < 80 refractory to proning and optimal PEEP -> Early evaluation for VV-ECMO.'
    ],
    references: ['ARDS Network Protocol, NEJM; ATS ARDS Guidelines 2023.']
  },
  {
    id: 'proto-icu-sedation',
    title: 'ICU Sedation, Analgesia, and Delirium (PADIS Protocol)',
    category: 'ICU / Critical Care',
    version: '2.0',
    author: 'ICU Clinical Pharmacy & Nursing',
    lastUpdated: '2026-07-25',
    departmentId: 'dept-cardiology',
    content: 'Pain, Agitation, Delirium, Immobility, and Sleep Disruption clinical pathway.',
    sourceGuideline: 'SCCM PADIS Clinical Practice Guidelines',
    keySteps: [
      'Analgesia-first approach: Control pain with IV Fentanyl (25-50 mcg boluses or 25-100 mcg/h infusion) or Morphine before sedation.',
      'Target light sedation: Richmond Agitation-Sedation Scale (RASS) target = -1 to 0 (alert and calm).',
      'First-line sedative agents: Propofol (5-50 mcg/kg/min) or Dexmedetomidine (0.2-1.4 mcg/kg/h).',
      'Minimize benzodiazepines (Midazolam / Lorazepam) to prevent prolonged delirium and mechanical ventilation duration.',
      'Perform Daily Spontaneous Awakening Trial (SAT) and Spontaneous Breathing Trial (SBT) unless contraindicated.',
      'Screen for Delirium every 8 hours using CAM-ICU (Confusion Assessment Method for the ICU).',
      'Non-pharmacological delirium bundle: sleep preservation, early mobilization, hearing aids/glasses, circadian lighting.'
    ],
    safetyNotes: [
      'Monitor triglycerides and watch for Propofol Infusion Syndrome (PRIS) if dose > 4-5 mg/kg/h for > 48h.',
      'Dexmedetomidine does not cause respiratory depression, but monitor for bradycardia and hypotension.'
    ],
    contraindications: [
      'Avoid Benzodiazepine infusions in elderly or delirium-prone patients unless alcohol withdrawal or severe seizures.'
    ],
    escalationCriteria: [
      'Agitation refractory to non-benzodiazepine agents -> Consult neurology / psychiatry; rule out hypoxia, hypoglycemia, bladder retention, pain.'
    ],
    references: ['SCCM PADIS Guidelines, Critical Care Medicine.']
  },
  {
    id: 'proto-icu-hyperk',
    title: 'Severe Hyperkalemia Emergency Management',
    category: 'ICU / Critical Care',
    version: '3.1',
    author: 'Nephrology & CCU Service',
    lastUpdated: '2026-09-05',
    departmentId: 'dept-cardiology',
    content: 'Management of serum K+ >= 6.0 mEq/L or any hyperkalemia with ECG changes.',
    sourceGuideline: 'ERC/AHA Emergency Cardiac Care Guidelines / Kidney International',
    keySteps: [
      '1. Myocardial Membrane Stabilization (Immediate):',
      '- IV Calcium Gluconate 10% (10-20 mL IV over 3-5 min) or IV Calcium Chloride 10% (5-10 mL via central line).',
      '- Repeat after 5-10 minutes if ECG changes (peaked T waves, PR prolongation, wide QRS) persist.',
      '2. Intracellular Potassium Shifting:',
      '- Regular Insulin 10 units IV bolus + 50 mL of 50% Dextrose (D50W) over 5 minutes (omit dextrose if blood glucose > 250 mg/dL).',
      '- Nebulized Albuterol 10-20 mg over 15 minutes (synergistic with insulin).',
      '- IV Sodium Bicarbonate 50 mEq IV over 5 minutes if metabolic acidosis (pH < 7.20) is present.',
      '3. Elimination of Potassium from the Body:',
      '- IV Furosemide 40-80 mg if patient has functional renal output.',
      '- Potassium binders: Sodium zirconium cyclosilicate (Lokelma) 10 g po TID or Patiromer 8.4 g po.',
      '- Emergency Hemodialysis: Definitive treatment for refractory hyperkalemia or anuric renal failure.'
    ],
    safetyNotes: [
      'Calcium stabilizes the cardiac membrane but does NOT lower serum potassium; shifting and elimination agents must follow immediately.',
      'Monitor blood glucose hourly for 4-6 hours after insulin/dextrose to catch delayed hypoglycemia.'
    ],
    contraindications: [
      'Do not give Calcium in the same IV line as Sodium Bicarbonate (causes calcium carbonate precipitation).'
    ],
    escalationCriteria: [
      'Widening QRS or sine wave rhythm -> Emergent repeat calcium and immediate nephrology call for emergent dialysis.'
    ],
    references: ['Kidney Disease Improving Global Outcomes (KDIGO) 2024; AHA Emergency Guidelines.']
  },

  // ================= EMERGENCY =================
  {
    id: 'proto-em-arrest',
    title: 'Adult Cardiac Arrest & ACLS Resuscitation',
    category: 'Emergency',
    version: '4.0',
    author: 'Cardiopulmonary Resuscitation Committee',
    lastUpdated: '2026-09-10',
    departmentId: 'dept-cardiology',
    content: 'Full Advanced Cardiovascular Life Support (ACLS) algorithm for Shockable (VF/pVT) and Non-Shockable (PEA/Asystole) rhythms.',
    sourceGuideline: 'AHA/ILCOR 2025 ACLS Guidelines',
    keySteps: [
      'High-quality CPR: Rate 100-120/min, depth 5-6 cm, full chest recoil, minimize interruptions (< 10 sec).',
      'Attach monitor/defibrillator; analyze rhythm:',
      '- Shockable (VF / Pulseless VT):',
      '  1. Deliver 1 shock (120-200 J biphasic). Resume CPR immediately for 2 minutes without pulse check.',
      '  2. Establish IV/IO access.',
      '  3. After 2nd shock: Epinephrine 1 mg IV/IO q3-5 minutes.',
      '  4. After 3rd shock: Amiodarone 300 mg IV/IO bolus (second dose 150 mg) OR Lidocaine 1-1.5 mg/kg.',
      '- Non-Shockable (PEA / Asystole):',
      '  1. Resume CPR immediately.',
      '  2. Give Epinephrine 1 mg IV/IO as soon as possible, repeat q3-5 min.',
      '  3. Actively search and treat reversible H\'s and T\'s:',
      '     Hypovolemia, Hypoxia, Hydrogen ion (acidosis), Hypo/Hyperkalemia, Hypothermia, Tension pneumothorax, Tamponade (cardiac), Toxins, Thrombosis (pulmonary or coronary).',
      'Post-Cardiac Arrest Care (ROSC):',
      '- Target MAP >= 65 mmHg, PaO2 100-150 mmHg, normocapnia (PaCO2 35-45 mmHg).',
      '- Immediate 12-lead ECG; emergent coronary angiography if STEMI or suspected cardiac etiology.',
      '- Targeted Temperature Management (TTM): maintain constant temperature 32-36°C for at least 24 hours in comatose patients.'
    ],
    safetyNotes: [
      'Do not interrupt chest compressions for endotracheal intubation (use video laryngoscopy or supraglottic airway during CPR).',
      'Quantitative waveform capnography: End-tidal CO2 (ETCO2) < 10 mmHg indicates inadequate chest compressions.'
    ],
    contraindications: [
      'Do not defibrillate Asystole or PEA (causes myocardial stunning and worsens resuscitation outcomes).'
    ],
    escalationCriteria: [
      'Refractory VF after 3 standard shocks -> Consider double sequential external defibrillation (DSED) or vector-change defibrillation, and evaluate for ECPR (VA-ECMO).'
    ],
    references: ['2025 AHA Guidelines for CPR and ECC.']
  },
  {
    id: 'proto-em-brady',
    title: 'Symptomatic Bradycardia Emergency Pathway',
    category: 'Emergency',
    version: '2.4',
    author: 'ACLS Emergency Governance',
    lastUpdated: '2026-08-05',
    departmentId: 'dept-cardiology',
    content: 'Acute management of heart rate < 50 bpm with hypoperfusion.',
    sourceGuideline: 'AHA/ACC Bradycardia Guidelines / ACLS 2024',
    keySteps: [
      'Identify signs of poor perfusion: hypotension, acutely altered mental status, chest pain, acute heart failure, shock.',
      'First-line: Atropine 1 mg IV bolus, repeat every 3-5 minutes up to a maximum total dose of 3 mg.',
      'If Atropine is ineffective or high-degree AV block (Mobitz II or 3rd degree block with wide QRS):',
      '- Initiate Transcutaneous Pacing (TCP) immediately (set pacing rate 60-80 bpm, titrate current until electrical and mechanical capture confirmed).',
      'OR Dopamine infusion: 5-20 mcg/kg/min.',
      'OR Epinephrine infusion: 2-10 mcg/min.',
      'Prepare for Transvenous Pacing wire placement.'
    ],
    safetyNotes: [
      'Avoid Atropine in Mobitz II or complete heart block with wide QRS (can paradoxically slow ventricular rate).',
      'Atropine is ineffective in cardiac transplant recipients (denervated heart).'
    ],
    contraindications: [
      'Doses of Atropine < 0.5 mg should be avoided as they may cause paradoxical worsening of bradycardia.'
    ],
    escalationCriteria: [
      'Hemodynamic collapse despite pacing/infusions -> Emergency transvenous pacing wire insertion.'
    ],
    references: ['2024 AHA/ACC Clinical Practice Guidelines for Bradycardia.']
  },
  {
    id: 'proto-em-stroke',
    title: 'Acute Ischemic Stroke & Thrombolysis Protocol',
    category: 'Emergency',
    version: '2.5',
    author: 'Neurology & Emergency Committee',
    lastUpdated: '2026-07-30',
    departmentId: 'dept-cardiology',
    content: 'Time-critical stroke pathway, IV Tenecteplase/Alteplase, and mechanical thrombectomy.',
    sourceGuideline: 'AHA/ASA Stroke Guidelines 2023',
    keySteps: [
      'Immediate Non-Contrast CT Brain to rule out hemorrhage (Door-to-CT < 20 min).',
      'Perform NIH Stroke Scale (NIHSS) assessment.',
      'Blood glucose check (treat hypoglycemia immediately).',
      'IV Thrombolysis window: within 4.5 hours of symptom onset (Tenecteplase 0.25 mg/kg max 25 mg OR Alteplase 0.9 mg/kg max 90 mg).',
      'Blood pressure management before thrombolysis: SBP must be < 185 mmHg and DBP < 110 mmHg (IV Labetalol 10-20 mg or Nicardipine infusion).',
      'Mechanical Thrombectomy evaluation for Large Vessel Occlusion (LVO) up to 24 hours based on CT angiography and perfusion imaging.',
      'No antiplatelet or anticoagulant for 24 hours post-thrombolysis until repeat 24-hour CT excludes hemorrhage.'
    ],
    safetyNotes: [
      'Maintain post-thrombolysis blood pressure strictly < 180/105 mmHg to prevent intracranial hemorrhage.'
    ],
    contraindications: [
      'Intracranial hemorrhage, active internal bleeding, platelet count < 100,000, INR > 1.7, full-dose DOAC within 48h, severe head trauma within 3 months.'
    ],
    escalationCriteria: [
      'Neurological deterioration during or post-infusion -> Stop thrombolysis immediately, emergent STAT non-contrast CT brain, fibrinogen level, type & screen.'
    ],
    references: ['2023 AHA/ASA Stroke Guidelines.']
  },
  {
    id: 'proto-em-mtp',
    title: 'Massive Transfusion Protocol (MTP)',
    category: 'Emergency',
    version: '3.0',
    author: 'Blood Bank & Trauma Surgery',
    lastUpdated: '2026-08-22',
    departmentId: 'dept-cardiology',
    content: 'Balanced hemostatic resuscitation protocol for catastrophic hemorrhage.',
    sourceGuideline: 'ACS TQIP / European Trauma Guidelines',
    keySteps: [
      'Activate MTP immediately upon recognizing uncontrolled life-threatening bleeding.',
      'Balanced 1:1:1 resuscitation: 1 Pack Packed Red Blood Cells (PRBC) : 1 Plasma (FFP) : 1 Platelet apheresis unit.',
      'Administer Tranexamic Acid (TXA): 1 g IV over 10 minutes, followed by 1 g IV infusion over 8 hours (ideally within 3 hours of injury/onset).',
      'Correct hypocalcemia: 1 g IV Calcium Chloride for every 4 units of blood products (citrate toxicity).',
      'Prevent and treat hypothermia (use rapid blood warmers, target body temp > 36°C).',
      'Monitor serial ABG, lactate, ionized calcium, platelet count, and fibrinogen (target fibrinogen > 150-200 mg/dL with Cryoprecipitate).'
    ],
    safetyNotes: [
      'Avoid crystalloid hemodilution (worsens trauma-induced coagulopathy).',
      'Check ionized calcium frequently to prevent citrate-induced myocardial depression and dysrhythmias.'
    ],
    contraindications: [
      'Do not delay blood product infusion while waiting for crossmatch in exsanguinating hemorrhage (use O-negative/O-positive uncrossmatched PRBCs).'
    ],
    escalationCriteria: [
      'Refractory coagulopathic bleeding -> Thromboelastography (TEG/ROTEM) guided targeted component therapy.'
    ],
    references: ['European Guideline on Management of Major Bleeding, Critical Care 2023.']
  },
  {
  id: "proto-dept-017",
  title: "Failed Fibrinolysis / Rescue PCI Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Failed Fibrinolysis / Rescue PCI Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-018",
  title: "Post-PCI Monitoring Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Post-PCI Monitoring Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-019",
  title: "Post-Coronary Angiography Care",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Post-Coronary Angiography Care. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-020",
  title: "Acute Heart Failure Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Heart Failure Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-021",
  title: "Acute Decompensated Heart Failure",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Decompensated Heart Failure. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-022",
  title: "Acute Pulmonary Edema Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Pulmonary Edema Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-023",
  title: "Cardiogenic Shock Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Cardiogenic Shock Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-024",
  title: "Right Ventricular Failure Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Right Ventricular Failure Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-025",
  title: "Hypertensive Acute Heart Failure",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypertensive Acute Heart Failure. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-026",
  title: "Hypertensive Emergency — Cardiac Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypertensive Emergency — Cardiac Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-027",
  title: "Acute Pericarditis Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Pericarditis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-028",
  title: "Acute Myocarditis Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Myocarditis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-029",
  title: "Pericardial Tamponade Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Pericardial Tamponade Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-030",
  title: "Atrial Fibrillation — Acute Management",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Atrial Fibrillation — Acute Management. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-031",
  title: "Atrial Flutter — Acute Management",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Atrial Flutter — Acute Management. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-032",
  title: "Rate Control in AF/AFlutter",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Rate Control in AF/AFlutter. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-033",
  title: "Rhythm Control in AF",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Rhythm Control in AF. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-034",
  title: "AF with Hemodynamic Instability",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for AF with Hemodynamic Instability. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-035",
  title: "Supraventricular Tachycardia — Acute Management",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Supraventricular Tachycardia — Acute Management. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-036",
  title: "Regular Narrow-Complex Tachycardia",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Regular Narrow-Complex Tachycardia. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-037",
  title: "Wide-Complex Tachycardia",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Wide-Complex Tachycardia. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-038",
  title: "Ventricular Tachycardia — Stable",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Ventricular Tachycardia — Stable. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-039",
  title: "Ventricular Tachycardia — Unstable",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Ventricular Tachycardia — Unstable. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-040",
  title: "Ventricular Fibrillation / Pulseless VT",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Ventricular Fibrillation / Pulseless VT. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-041",
  title: "Symptomatic Bradycardia",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Symptomatic Bradycardia. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-042",
  title: "High-Grade AV Block",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for High-Grade AV Block. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-043",
  title: "Complete Heart Block",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Complete Heart Block. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-044",
  title: "Temporary Pacing Pathway",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Temporary Pacing Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-045",
  title: "Electrical Cardioversion Pathway",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Electrical Cardioversion Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-046",
  title: "Synchronized Cardioversion",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Synchronized Cardioversion. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-047",
  title: "Defibrillation Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Defibrillation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-048",
  title: "QT Prolongation / Torsades Pathway",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for QT Prolongation / Torsades Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-049",
  title: "Digoxin Toxicity — Cardiac Pathway",
  category: "Arrhythmia & Electrophysiology",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Digoxin Toxicity — Cardiac Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/AHA contemporary arrhythmia and resuscitation guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/AHA contemporary arrhythmia and resuscitation guidance"
  ]
},
  {
  id: "proto-dept-050",
  title: "Cardiac Arrest — ACLS Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Cardiac Arrest — ACLS Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-051",
  title: "Post-ROSC Care Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Post-ROSC Care Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-052",
  title: "Undifferentiated Shock Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Undifferentiated Shock Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-053",
  title: "Cardiogenic Shock Escalation Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Cardiogenic Shock Escalation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-054",
  title: "Septic Shock Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Septic Shock Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-055",
  title: "Hypovolemic Shock Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypovolemic Shock Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-056",
  title: "Obstructive Shock Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Obstructive Shock Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-057",
  title: "Vasopressor Support Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Vasopressor Support Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-058",
  title: "Invasive Hemodynamic Monitoring",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Invasive Hemodynamic Monitoring. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-059",
  title: "Acute Hemodynamic Instability",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Hemodynamic Instability. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-060",
  title: "Acute Respiratory Failure",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Respiratory Failure. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-061",
  title: "Acute Hypoxemic Respiratory Failure",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Hypoxemic Respiratory Failure. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-062",
  title: "Acute Hypercapnic Respiratory Failure",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Hypercapnic Respiratory Failure. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-063",
  title: "Non-Invasive Ventilation Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Non-Invasive Ventilation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-064",
  title: "CPAP / BiPAP Initiation",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for CPAP / BiPAP Initiation. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-065",
  title: "Mechanical Ventilation Initiation",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Mechanical Ventilation Initiation. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-066",
  title: "Lung-Protective Ventilation",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Lung-Protective Ventilation. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-067",
  title: "ARDS Management Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for ARDS Management Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-068",
  title: "Difficult Oxygenation Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Difficult Oxygenation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-069",
  title: "Ventilator Weaning Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Ventilator Weaning Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-070",
  title: "Spontaneous Breathing Trial",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Spontaneous Breathing Trial. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-071",
  title: "Extubation Readiness Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Extubation Readiness Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-072",
  title: "Post-Extubation Monitoring",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Post-Extubation Monitoring. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-073",
  title: "Ventilator-Associated Pneumonia Prevention",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Ventilator-Associated Pneumonia Prevention. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-074",
  title: "Difficult Airway / Emergency Airway Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Difficult Airway / Emergency Airway Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-075",
  title: "Suspected Pulmonary Embolism",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Suspected Pulmonary Embolism. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-076",
  title: "Confirmed Pulmonary Embolism",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Confirmed Pulmonary Embolism. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-077",
  title: "High-Risk / Massive PE",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for High-Risk / Massive PE. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-078",
  title: "Intermediate-Risk PE",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Intermediate-Risk PE. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-079",
  title: "Deep Vein Thrombosis Pathway",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Deep Vein Thrombosis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-080",
  title: "Anticoagulation Initiation for VTE",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Anticoagulation Initiation for VTE. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-081",
  title: "PE with Hemodynamic Instability",
  category: "Pulmonary Vascular / VTE",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for PE with Hemodynamic Instability. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ERS contemporary pulmonary embolism and VTE guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ERS contemporary pulmonary embolism and VTE guidance"
  ]
},
  {
  id: "proto-dept-082",
  title: "Sepsis Recognition Pathway",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Sepsis Recognition Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-083",
  title: "Septic Shock Initial Management",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Septic Shock Initial Management. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-084",
  title: "Sepsis Reassessment Pathway",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Sepsis Reassessment Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-085",
  title: "Blood Culture & Infection Workup",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Blood Culture & Infection Workup. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-086",
  title: "Hospital-Acquired Pneumonia Pathway",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hospital-Acquired Pneumonia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-087",
  title: "Community-Acquired Pneumonia Pathway",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Community-Acquired Pneumonia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-088",
  title: "ICU Infection Escalation Pathway",
  category: "Sepsis / Infection",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for ICU Infection Escalation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "Surviving Sepsis Campaign and contemporary infectious-disease guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "Surviving Sepsis Campaign and contemporary infectious-disease guidance"
  ]
},
  {
  id: "proto-dept-089",
  title: "Hyperkalemia Emergency Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hyperkalemia Emergency Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-090",
  title: "Hypokalemia Management Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypokalemia Management Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-091",
  title: "Hyponatremia Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hyponatremia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-092",
  title: "Hypernatremia Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypernatremia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-093",
  title: "Hypomagnesemia Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypomagnesemia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-094",
  title: "Hypermagnesemia Pathway",
  category: "Cardiology & Acute Care",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypermagnesemia Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ESC/ACC/AHA contemporary acute cardiovascular guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ESC/ACC/AHA contemporary acute cardiovascular guidance"
  ]
},
  {
  id: "proto-dept-095",
  title: "Metabolic Acidosis Pathway",
  category: "Electrolytes / Renal / ABG",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Metabolic Acidosis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "KDIGO/critical-care guidance and standard acid-base references",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "KDIGO/critical-care guidance and standard acid-base references"
  ]
},
  {
  id: "proto-dept-096",
  title: "Metabolic Alkalosis Pathway",
  category: "Electrolytes / Renal / ABG",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Metabolic Alkalosis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "KDIGO/critical-care guidance and standard acid-base references",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "KDIGO/critical-care guidance and standard acid-base references"
  ]
},
  {
  id: "proto-dept-097",
  title: "Respiratory Acidosis Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Respiratory Acidosis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-098",
  title: "Respiratory Alkalosis Pathway",
  category: "Respiratory / ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Respiratory Alkalosis Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ATS/ERS/SCCM contemporary critical-care and respiratory guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ATS/ERS/SCCM contemporary critical-care and respiratory guidance"
  ]
},
  {
  id: "proto-dept-099",
  title: "Acute Kidney Injury Pathway",
  category: "Electrolytes / Renal / ABG",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Kidney Injury Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "KDIGO/critical-care guidance and standard acid-base references",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "KDIGO/critical-care guidance and standard acid-base references"
  ]
},
  {
  id: "proto-dept-100",
  title: "Diabetic Ketoacidosis — DKA",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Diabetic Ketoacidosis — DKA. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-101",
  title: "Hyperosmolar Hyperglycemic State — HHS",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hyperosmolar Hyperglycemic State — HHS. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-102",
  title: "Hypoglycemia Emergency Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Hypoglycemia Emergency Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-103",
  title: "Acute Stroke Recognition & Initial Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Stroke Recognition & Initial Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-104",
  title: "Intracerebral Hemorrhage Initial Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Intracerebral Hemorrhage Initial Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-105",
  title: "Acute Seizure / Status Epilepticus",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Seizure / Status Epilepticus. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-106",
  title: "Acute Delirium / Agitation Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Acute Delirium / Agitation Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-107",
  title: "GI Bleeding — Initial Stabilization",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for GI Bleeding — Initial Stabilization. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-108",
  title: "Massive Transfusion Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for Massive Transfusion Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
},
  {
  id: "proto-dept-109",
  title: "ICU Admission / Escalation / Transfer Pathway",
  category: "Metabolic / Emergency ICU",
  version: "1.0",
  author: "CardioVault Clinical Governance Library",
  lastUpdated: "2026-09-21",
  departmentId: "dept-cardiology",
  content: "Structured clinical pathway for ICU Admission / Escalation / Transfer Pathway. Use with the patient's documented findings, local department policy, and the cited current guideline source.",
  sourceGuideline: "ADA/AHA/SCCM contemporary emergency and critical-care guidance",
  keySteps: [
    "Confirm the clinical syndrome and immediate stability using the patient record.",
    "Review relevant history, examination, monitoring, investigations and contraindications.",
    "Apply the current guideline pathway and document the clinical decision points.",
    "Reassess response and repeat key investigations when clinically indicated.",
    "Document escalation, consultation, transfer or disposition decisions when required."
  ],
  safetyNotes: [
    "Verify patient identity, allergies, current medications, relevant organ function and contraindications before acting.",
    "Use current local formulary and department-approved policy for medication details and dosing."
  ],
  contraindications: [
    "Do not apply the pathway when the clinical diagnosis is not supported by the available record; reassess the differential diagnosis."
  ],
  escalationCriteria: [
    "Escalate to the responsible senior clinician or appropriate specialty when instability, diagnostic uncertainty or failure to respond is present."
  ],
  references: [
    "ADA/AHA/SCCM contemporary emergency and critical-care guidance"
  ]
}
];

const PERSONAL_PROTOCOLS_STORAGE_KEY = 'cardiovault_personal_protocols_v1';

export class ComprehensiveProtocolService {
  static getOfficialProtocols(): DetailedProtocol[] {
    return OFFICIAL_CLINICAL_PROTOCOLS;
  }

  static getPersonalProtocols(): DetailedProtocol[] {
    try {
      const raw = localStorage.getItem(PERSONAL_PROTOCOLS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  static savePersonalProtocols(protocols: DetailedProtocol[]): void {
    try {
      localStorage.setItem(PERSONAL_PROTOCOLS_STORAGE_KEY, JSON.stringify(protocols));
    } catch {}
  }

  static addPersonalProtocol(protocol: Omit<DetailedProtocol, 'id' | 'isPersonal'>): DetailedProtocol {
    const list = this.getPersonalProtocols();
    const newP: DetailedProtocol = {
      ...protocol,
      id: `personal-proto-${Date.now()}`,
      isPersonal: true,
      departmentId: 'dept-cardiology',
    };
    const updated = [newP, ...list];
    this.savePersonalProtocols(updated);
    return newP;
  }

  static updatePersonalProtocol(id: string, updates: Partial<DetailedProtocol>): DetailedProtocol | null {
    const list = this.getPersonalProtocols();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const updatedItem = { ...list[idx], ...updates, isPersonal: true };
    list[idx] = updatedItem;
    this.savePersonalProtocols(list);
    return updatedItem;
  }

  static duplicateAsPersonal(protocol: DetailedProtocol, authorName: string): DetailedProtocol {
    return this.addPersonalProtocol({
      title: `${protocol.title} (Personal Copy)`,
      category: protocol.category,
      version: '1.0',
      author: authorName,
      lastUpdated: new Date().toISOString().split('T')[0],
      content: protocol.content,
      sourceGuideline: protocol.sourceGuideline || 'Custom clinical reference',
      keySteps: [...protocol.keySteps],
      safetyNotes: [...protocol.safetyNotes],
      contraindications: [...protocol.contraindications],
      escalationCriteria: [...protocol.escalationCriteria],
      references: [...protocol.references],
      isFavorite: false,
      isArchived: false,
    });
  }

  static toggleFavorite(id: string): void {
    const personal = this.getPersonalProtocols();
    const pIdx = personal.findIndex(p => p.id === id);
    if (pIdx !== -1) {
      personal[pIdx].isFavorite = !personal[pIdx].isFavorite;
      this.savePersonalProtocols(personal);
      return;
    }
    // Also support favoriting official protocols via a separate favorites set in localStorage
    try {
      const favKey = 'cardiovault_fav_official_protocols';
      const raw = localStorage.getItem(favKey);
      const set: string[] = raw ? JSON.parse(raw) : [];
      const next = set.includes(id) ? set.filter(x => x !== id) : [...set, id];
      localStorage.setItem(favKey, JSON.stringify(next));
    } catch {}
  }

  static isFavorite(id: string): boolean {
    const personal = this.getPersonalProtocols();
    const p = personal.find(x => x.id === id);
    if (p) return !!p.isFavorite;
    try {
      const favKey = 'cardiovault_fav_official_protocols';
      const raw = localStorage.getItem(favKey);
      const set: string[] = raw ? JSON.parse(raw) : [];
      return set.includes(id);
    } catch {
      return false;
    }
  }

  static toggleArchive(id: string): void {
    const personal = this.getPersonalProtocols();
    const pIdx = personal.findIndex(p => p.id === id);
    if (pIdx !== -1) {
      personal[pIdx].isArchived = !personal[pIdx].isArchived;
      this.savePersonalProtocols(personal);
    }
  }

  static deletePersonalProtocol(id: string): boolean {
    const personal = this.getPersonalProtocols();
    const next = personal.filter(p => p.id !== id);
    this.savePersonalProtocols(next);
    return true;
  }
}
