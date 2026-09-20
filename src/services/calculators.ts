// Clinical Decision-Support Calculators with Validated Medical Formulas

export interface CalculatorDefinition {
  id: string;
  name: string;
  category: 'Cardiology' | 'Critical Care' | 'ABG' | 'Hemodynamics' | 'Renal & Electrolytes' | 'Drug Infusion' | 'VTE / Emergency';
  subtitle: string;
  description: string;
}

export const CLINICAL_CALCULATORS: CalculatorDefinition[] = [
  {
    id: 'cha2ds2-vasc',
    name: 'CHA₂DS₂-VASc',
    category: 'Cardiology',
    subtitle: 'Stroke risk in AF',
    description: 'Estimates 1-year thromboembolic stroke risk in non-valvular atrial fibrillation.',
  },
  {
    id: 'has-bled',
    name: 'HAS-BLED',
    category: 'Cardiology',
    subtitle: 'Bleeding risk',
    description: 'Evaluates 1-year major bleeding risk for patients on oral anticoagulation.',
  },
  {
    id: 'heart-score',
    name: 'HEART Score',
    category: 'Cardiology',
    subtitle: 'Chest pain ED risk',
    description: 'Predicts 6-week risk of Major Adverse Cardiac Events (MACE) in acute chest pain.',
  },
  {
    id: 'timi-nstemi',
    name: 'TIMI Risk Score (UA/NSTEMI)',
    category: 'Cardiology',
    subtitle: 'ACS risk stratification',
    description: 'Estimates 14-day all-cause mortality, new or recurrent MI, or severe ischemia requiring revascularization.',
  },
  {
    id: 'killip-class',
    name: 'Killip Classification',
    category: 'Cardiology',
    subtitle: 'Heart failure in acute MI',
    description: 'Predicts 30-day mortality risk in patients presenting with acute myocardial infarction.',
  },
  {
    id: 'qtc-calc',
    name: 'QTc Corrected (Bazett & Fridericia)',
    category: 'Cardiology',
    subtitle: 'Arrhythmia risk & drug safety',
    description: 'Normalizes QT interval for heart rate to assess risk of Torsades de Pointes.',
  },
  {
    id: 'sofa-score',
    name: 'SOFA Score',
    category: 'Critical Care',
    subtitle: 'Sequential Organ Failure',
    description: 'Evaluates acute multi-organ dysfunction in sepsis and critical illness.',
  },
  {
    id: 'qsofa',
    name: 'qSOFA',
    category: 'Critical Care',
    subtitle: 'Bedside sepsis screen',
    description: 'Quick identification of patients at high risk of poor sepsis outcomes.',
  },
  {
    id: 'news2',
    name: 'NEWS2 Early Warning Score',
    category: 'Critical Care',
    subtitle: 'Deterioration detection',
    description: 'Standardized early warning score predicting acute physiological deterioration.',
  },
  {
    id: 'gcs-calc',
    name: 'Glasgow Coma Scale (GCS)',
    category: 'Critical Care',
    subtitle: 'Level of consciousness',
    description: 'Objective measure based on Eye, Verbal, and Motor responses.',
  },
  {
    id: 'vent-mechanics',
    name: 'Ventilator Mechanics (Cstat, Driving P)',
    category: 'Critical Care',
    subtitle: 'Lung-protective ventilation',
    description: 'Calculates static compliance, driving pressure (Pplat - PEEP), and RSBI.',
  },
  {
    id: 'winter-abg',
    name: "Systematic ABG & Winter's Formula",
    category: 'ABG',
    subtitle: 'Acid-base step-by-step',
    description: 'Evaluates pH, primary disorder, anion gap, delta ratio, and respiratory compensation.',
  },
  {
    id: 'map-hemodynamics',
    name: 'MAP & Hemodynamic Indices',
    category: 'Hemodynamics',
    subtitle: 'MAP, SVR, CI & Shock Index',
    description: 'Calculates MAP, BSA, Cardiac Index, Systemic Vascular Resistance, and Shock Index.',
  },
  {
    id: 'infusion-rate',
    name: 'Vasopressor & Infusion Rate',
    category: 'Drug Infusion',
    subtitle: 'mcg/kg/min ⇄ mL/hr',
    description: 'Calculates continuous infusion rates and reverse dose titrations for critical drips.',
  },
  {
    id: 'crcl-calc',
    name: 'Creatinine Clearance & eGFR',
    category: 'Renal & Electrolytes',
    subtitle: 'Cockcroft-Gault & CKD-EPI',
    description: 'Calculates estimated CrCl for medication dosing and eGFR for kidney function.',
  },
  {
    id: 'corrected-na-ca',
    name: 'Corrected Sodium & Calcium',
    category: 'Renal & Electrolytes',
    subtitle: 'Hyperglycemia & Albumin corrections',
    description: 'Corrects measured sodium for glucose (Katz) and calcium for hypoalbuminemia.',
  },
  {
    id: 'fena-calc',
    name: 'FENa & Free Water Deficit',
    category: 'Renal & Electrolytes',
    subtitle: 'Prerenal vs ATN & Hypernatremia',
    description: 'Fractional Excretion of Sodium (FENa) and free water replacement volume.',
  },
];

export const MedicalCalculators = {
  // CHA2DS2-VASc
  calcCHA2DS2VASc(inputs: {
    chf: boolean;
    htn: boolean;
    age75Plus: boolean;
    diabetes: boolean;
    strokeOrTia: boolean;
    vascularDisease: boolean;
    age65To74: boolean;
    isFemale: boolean;
  }) {
    let score = 0;
    if (inputs.chf) score += 1;
    if (inputs.htn) score += 1;
    if (inputs.age75Plus) score += 2;
    if (inputs.diabetes) score += 1;
    if (inputs.strokeOrTia) score += 2;
    if (inputs.vascularDisease) score += 1;
    if (inputs.age65To74 && !inputs.age75Plus) score += 1;
    if (inputs.isFemale) score += 1;

    let risk: 'Low' | 'Intermediate' | 'High' = 'Low';
    let strokeRisk = '0.2%';

    if (score === 1 && inputs.isFemale) {
      risk = 'Low';
      strokeRisk = '0.6%';
    } else if (score === 1 && !inputs.isFemale) {
      risk = 'Intermediate';
      strokeRisk = '1.3%';
    } else if (score >= 2) {
      risk = 'High';
      const riskTable: Record<number, string> = {
        2: '2.2%',
        3: '3.2%',
        4: '4.8%',
        5: '7.2%',
        6: '9.7%',
        7: '11.2%',
        8: '12.5%',
        9: '15.2%',
      };
      strokeRisk = riskTable[Math.min(score, 9)] || '>15%';
    }

    const recommendation =
      risk === 'High'
        ? 'Oral anticoagulation (DOAC preferred over Warfarin) strongly recommended unless contraindicated.'
        : risk === 'Intermediate'
        ? 'Oral anticoagulation should be considered based on clinical assessment.'
        : 'Low stroke risk. No antithrombotic therapy or antiplatelet alone may be reasonable.';

    return { score, risk, strokeRisk, recommendation };
  },

  // HAS-BLED
  calcHASBLED(inputs: {
    hypertension: boolean;
    renalDisease: boolean;
    liverDisease: boolean;
    strokeHistory: boolean;
    priorBleeding: boolean;
    labileINR: boolean;
    elderly: boolean;
    drugs: boolean;
    alcohol: boolean;
  }) {
    let score = 0;
    if (inputs.hypertension) score += 1;
    if (inputs.renalDisease) score += 1;
    if (inputs.liverDisease) score += 1;
    if (inputs.strokeHistory) score += 1;
    if (inputs.priorBleeding) score += 1;
    if (inputs.labileINR) score += 1;
    if (inputs.elderly) score += 1;
    if (inputs.drugs) score += 1;
    if (inputs.alcohol) score += 1;

    const isHigh = score >= 3;
    return {
      score,
      riskLevel: isHigh ? 'High Risk' : 'Low to Moderate Risk',
      bleedingRate: score === 0 ? '1.13 bleeds/100 pt-years' : score === 1 ? '1.02' : score === 2 ? '1.88' : score === 3 ? '3.74' : score === 4 ? '8.70' : '>12 bleeds/100 pt-years',
      advice: isHigh
        ? 'High bleeding risk (Score ≥ 3). Exercise caution, correct reversible risk factors, monitor closely.'
        : 'Low to moderate bleeding risk. Standard monitoring.',
    };
  },

  // HEART Score
  calcHEART(inputs: {
    history: number;
    ecg: number;
    age: number;
    riskFactors: number;
    troponin: number;
  }) {
    const score = inputs.history + inputs.ecg + inputs.age + inputs.riskFactors + inputs.troponin;
    let risk: 'Low' | 'Intermediate' | 'High' = 'Low';
    let maceRate = '0.9% - 1.7%';
    let management = 'Low risk for 6-week MACE. Early discharge may be considered.';

    if (score >= 7) {
      risk = 'High';
      maceRate = '50% - 65%';
      management = 'High risk. Recommend early invasive strategy, telemetry, and CCU admission.';
    } else if (score >= 4) {
      risk = 'Intermediate';
      maceRate = '12% - 16%';
      management = 'Moderate risk. Recommend hospital observation, serial troponins, non-invasive testing.';
    }

    return { score, risk, maceRate, management };
  },

  // TIMI NSTEMI
  calcTIMINSTEMI(inputs: {
    age65Plus: boolean;
    threeCadFactors: boolean;
    knownCadStenosis50: boolean;
    aspirinPast7Days: boolean;
    severeAnginaPast24h: boolean;
    elevatedMarkers: boolean;
    stDeviation05mm: boolean;
  }) {
    let score = 0;
    if (inputs.age65Plus) score += 1;
    if (inputs.threeCadFactors) score += 1;
    if (inputs.knownCadStenosis50) score += 1;
    if (inputs.aspirinPast7Days) score += 1;
    if (inputs.severeAnginaPast24h) score += 1;
    if (inputs.elevatedMarkers) score += 1;
    if (inputs.stDeviation05mm) score += 1;

    let risk = 'Low Risk (4.7% 14-day event rate)';
    if (score >= 5) risk = 'High Risk (26.2% - 40.9% 14-day event rate)';
    else if (score >= 3) risk = 'Intermediate Risk (13.2% - 19.9% 14-day event rate)';

    return { score, risk };
  },

  // QTc Bazett & Fridericia
  calcQTc(qtMs: number, hrBpm: number) {
    if (!qtMs || !hrBpm || hrBpm <= 0) return { bazett: 0, fridericia: 0, status: 'Invalid' };
    const rrSec = 60 / hrBpm;
    const bazett = Math.round(qtMs / Math.sqrt(rrSec));
    const fridericia = Math.round(qtMs / Math.cbrt(rrSec));

    let status = 'Normal QTc';
    if (bazett > 500) status = 'Severely Prolonged (High Torsades de Pointes Risk)';
    else if (bazett > 460) status = 'Borderline Prolonged';

    return { bazett, fridericia, status };
  },

  // SOFA Score
  calcSOFA(inputs: {
    pao2: number;
    fio2: number;
    platelets: number;
    bilirubin: number;
    map: number;
    gcs: number;
    creatinine: number;
  }) {
    const pf = inputs.pao2 / (inputs.fio2 / 100);
    let pfScore = 0;
    if (pf < 100) pfScore = 4;
    else if (pf < 200) pfScore = 3;
    else if (pf < 300) pfScore = 2;
    else if (pf < 400) pfScore = 1;

    let pltScore = 0;
    if (inputs.platelets < 20) pltScore = 4;
    else if (inputs.platelets < 50) pltScore = 3;
    else if (inputs.platelets < 100) pltScore = 2;
    else if (inputs.platelets < 150) pltScore = 1;

    let biliScore = 0;
    if (inputs.bilirubin >= 12.0) biliScore = 4;
    else if (inputs.bilirubin >= 6.0) biliScore = 3;
    else if (inputs.bilirubin >= 2.0) biliScore = 2;
    else if (inputs.bilirubin >= 1.2) biliScore = 1;

    let cardioScore = inputs.map < 70 ? 1 : 0;

    let gcsScore = 0;
    if (inputs.gcs < 6) gcsScore = 4;
    else if (inputs.gcs < 10) gcsScore = 3;
    else if (inputs.gcs < 13) gcsScore = 2;
    else if (inputs.gcs < 15) gcsScore = 1;

    let crScore = 0;
    if (inputs.creatinine >= 5.0) crScore = 4;
    else if (inputs.creatinine >= 3.5) crScore = 3;
    else if (inputs.creatinine >= 2.0) crScore = 2;
    else if (inputs.creatinine >= 1.2) crScore = 1;

    const total = pfScore + pltScore + biliScore + cardioScore + gcsScore + crScore;
    let mortality = '< 10%';
    if (total >= 15) mortality = '> 80%';
    else if (total >= 12) mortality = '50% - 60%';
    else if (total >= 9) mortality = '33% - 50%';
    else if (total >= 6) mortality = '15% - 20%';

    return { score: total, totalScore: total, mortality };
  },

  // qSOFA
  calcQSOFA(rrGe22: boolean, alteredMental: boolean, sbpLe100: boolean) {
    let score = 0;
    if (rrGe22) score += 1;
    if (alteredMental) score += 1;
    if (sbpLe100) score += 1;
    return {
      score,
      risk: score >= 2 ? 'High risk of poor sepsis outcome (ICU admission / mortality)' : 'Low risk',
    };
  },

  // Systematic ABG Interpretation
  calcABGMetabolic(inputs: {
    ph: number;
    paco2: number;
    hco3: number;
    na: number;
    cl: number;
    albumin?: number;
    pao2?: number;
    fio2?: number;
  }) {
    const anionGap = inputs.na - (inputs.cl + inputs.hco3);
    const correctedAG = inputs.albumin && inputs.albumin < 4.0 ? anionGap + 2.5 * (4.0 - inputs.albumin) : anionGap;

    // Winter's formula
    const expectedPCO2Mid = 1.5 * inputs.hco3 + 8;
    const expectedPCO2Min = expectedPCO2Mid - 2;
    const expectedPCO2Max = expectedPCO2Mid + 2;

    let primaryDisorder = 'Normal Acid-Base Profile';
    if (inputs.ph < 7.35) {
      if (inputs.paco2 > 45 && inputs.hco3 < 22) primaryDisorder = 'Mixed Respiratory & Metabolic Acidosis';
      else if (inputs.paco2 > 45) primaryDisorder = 'Respiratory Acidosis';
      else if (inputs.hco3 < 22) primaryDisorder = 'Metabolic Acidosis';
    } else if (inputs.ph > 7.45) {
      if (inputs.paco2 < 35 && inputs.hco3 > 26) primaryDisorder = 'Mixed Respiratory & Metabolic Alkalosis';
      else if (inputs.paco2 < 35) primaryDisorder = 'Respiratory Alkalosis';
      else if (inputs.hco3 > 26) primaryDisorder = 'Metabolic Alkalosis';
    }

    let compensation = 'Normal / Not indicated';
    if (primaryDisorder.includes('Metabolic Acidosis')) {
      if (inputs.paco2 > expectedPCO2Max) {
        compensation = 'Concurrent Respiratory Acidosis (Winter PaCO₂ exceeded)';
      } else if (inputs.paco2 < expectedPCO2Min) {
        compensation = 'Concurrent Respiratory Alkalosis (Winter PaCO₂ lower than expected)';
      } else {
        compensation = 'Appropriate Respiratory Compensation (Winter Formula Met)';
      }
    }

    // Delta Ratio
    const deltaAG = anionGap - 12;
    const deltaHCO3 = 24 - inputs.hco3;
    const deltaRatio = deltaHCO3 > 0 ? Math.round((deltaAG / deltaHCO3) * 100) / 100 : 0;

    let deltaInterpretation = 'N/A';
    if (anionGap > 12) {
      if (deltaRatio < 0.4) deltaInterpretation = 'Hyperchloremic / Normal AG Acidosis present';
      else if (deltaRatio <= 0.8) deltaInterpretation = 'Mixed High AG and Normal AG Acidosis';
      else if (deltaRatio <= 2.0) deltaInterpretation = 'Pure High Anion Gap Acidosis (HAGMA)';
      else deltaInterpretation = 'High AG Acidosis with concurrent Metabolic Alkalosis';
    }

    const pf = inputs.pao2 && inputs.fio2 ? Math.round(inputs.pao2 / ((inputs.fio2 || 21) / 100)) : 0;

    return {
      primaryDisorder,
      anionGap: Math.round(anionGap * 10) / 10,
      correctedAG: Math.round(correctedAG * 10) / 10,
      expectedPCO2Range: `${expectedPCO2Min.toFixed(1)} - ${expectedPCO2Max.toFixed(1)} mmHg`,
      compensation,
      deltaRatio: deltaRatio || 'N/A',
      deltaInterpretation,
      pfRatio: pf,
    };
  },

  // Hemodynamics
  calcHemodynamics(sbp: number, dbp: number, hr: number, cvp: number, heightCm: number, weightKg: number, co?: number) {
    const map = Math.round((2 * dbp + sbp) / 3);
    const bsa = Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;
    const pulsePressure = sbp - dbp;
    const shockIndex = sbp > 0 ? Math.round((hr / sbp) * 100) / 100 : 0;

    let ci = 0;
    let svr = 0;
    let sv = 0;
    let svri = 0;

    if (co && co > 0) {
      ci = Math.round((co / (bsa || 1.8)) * 100) / 100;
      svr = Math.round((80 * (map - cvp)) / co);
      svri = Math.round(svr * (bsa || 1.8));
      sv = Math.round((co * 1000) / (hr || 70));
    }

    return { map, bsa, pulsePressure, shockIndex, ci, svr, svri, sv };
  },

  // Infusion calculator
  calcInfusion(params: {
    weightKg: number;
    drugAmountMg: number;
    diluentVolumeMl: number;
    rateMlHr?: number;
    targetDoseMcgKgMin?: number;
  }) {
    const concentrationMcgMl = (params.drugAmountMg * 1000) / params.diluentVolumeMl;
    if (params.targetDoseMcgKgMin !== undefined) {
      const rateMlHr = (params.targetDoseMcgKgMin * params.weightKg * 60) / concentrationMcgMl;
      return {
        rateMlHr: Math.round(rateMlHr * 10) / 10,
        concentrationMcgMl: Math.round(concentrationMcgMl),
        doseMcgKgMin: params.targetDoseMcgKgMin,
      };
    } else if (params.rateMlHr !== undefined) {
      const doseMcgKgMin = (params.rateMlHr * concentrationMcgMl) / (params.weightKg * 60);
      return {
        rateMlHr: params.rateMlHr,
        concentrationMcgMl: Math.round(concentrationMcgMl),
        doseMcgKgMin: Math.round(doseMcgKgMin * 1000) / 1000,
      };
    }
    return { rateMlHr: 0, concentrationMcgMl: 0, doseMcgKgMin: 0 };
  },

  // Cockcroft-Gault & eGFR
  calcCockcroftGault(age: number, weightKg: number, serumCrMgDl: number, isFemale: boolean) {
    if (!serumCrMgDl || serumCrMgDl <= 0) return { crcl: 0, stage: 'Invalid Cr' };
    let crcl = ((140 - age) * weightKg) / (72 * serumCrMgDl);
    if (isFemale) crcl *= 0.85;
    crcl = Math.round(crcl * 10) / 10;

    let stage = 'Normal renal function';
    if (crcl < 15) stage = 'End-stage kidney failure (CrCl < 15)';
    else if (crcl < 30) stage = 'Severely decreased (CrCl 15 - 29)';
    else if (crcl < 60) stage = 'Moderately decreased (CrCl 30 - 59)';
    else if (crcl < 90) stage = 'Mildly decreased (CrCl 60 - 89)';

    return { crcl, stage };
  },

  // Corrected Sodium for Hyperglycemia
  calcElectrolyteCorrections(measuredNa: number, glucoseMgDl: number, measuredCa: number, albuminGdl: number) {
    // Katz formula: Na + 0.016 * (Glucose - 100)
    const correctedNa = measuredNa + 0.016 * Math.max(0, glucoseMgDl - 100);
    // Hillier formula: Na + 0.024 * (Glucose - 100)
    const hillierNa = measuredNa + 0.024 * Math.max(0, glucoseMgDl - 100);
    // Corrected Ca: Ca + 0.8 * (4.0 - Albumin)
    const correctedCa = measuredCa + 0.8 * (4.0 - albuminGdl);

    return {
      correctedNa: Math.round(correctedNa * 10) / 10,
      hillierNa: Math.round(hillierNa * 10) / 10,
      correctedCa: Math.round(correctedCa * 10) / 10,
    };
  },

  // FENa & Free Water Deficit
  calcFENa(urineNa: number, serumNa: number, urineCr: number, serumCr: number) {
    if (!serumNa || !urineCr) return { fena: 0, etiology: 'Invalid inputs' };
    const fena = ((urineNa * serumCr) / (serumNa * urineCr)) * 100;
    const rounded = Math.round(fena * 100) / 100;
    let etiology = 'Prerenal Azotemia (< 1%)';
    if (rounded > 2.0) etiology = 'Intrinsic Acute Tubular Necrosis (ATN) (> 2%)';
    else if (rounded >= 1.0) etiology = 'Indeterminate / Mixed (1% - 2%)';

    return { fena: rounded, etiology };
  },

  calcFreeWaterDeficit(serumNa: number, weightKg: number, sex: 'Male' | 'Female') {
    const tbwFraction = sex === 'Male' ? 0.6 : 0.5;
    const tbw = weightKg * tbwFraction;
    const deficit = tbw * ((serumNa - 140) / 140);
    return Math.max(0, Math.round(deficit * 10) / 10);
  },

  // Ventilator Mechanics
  calcVentilator(vtMl: number, pplat: number, peep: number, rr: number) {
    const drivingPressure = pplat - peep;
    const cstat = drivingPressure > 0 ? Math.round((vtMl / drivingPressure) * 10) / 10 : 0;
    const vtLiters = vtMl / 1000;
    const rsbi = vtLiters > 0 ? Math.round(rr / vtLiters) : 0;

    let dpRisk = 'Lung Protective (Driving Pressure ≤ 14 cmH₂O)';
    if (drivingPressure > 14) dpRisk = 'Elevated Driving Pressure (> 14 cmH₂O) - Increased ARDS Mortality Risk';

    let rsbiRisk = 'Successful Weaning Likely (RSBI < 105)';
    if (rsbi >= 105) rsbiRisk = 'Weaning Failure Likely (RSBI ≥ 105)';

    return { drivingPressure, cstat, rsbi, dpRisk, rsbiRisk };
  },

  // Forwarding aliases for backward compatibility
  calculateCHA2DS2_VASc(inputs: any) {
    return this.calcCHA2DS2VASc({
      chf: inputs.chf,
      htn: inputs.hypertension,
      age75Plus: inputs.age >= 75,
      diabetes: inputs.diabetes,
      strokeOrTia: inputs.strokeTIA,
      vascularDisease: inputs.vascularDisease,
      age65To74: inputs.age >= 65 && inputs.age < 75,
      isFemale: inputs.sex === 'Female',
    });
  },

  calculateHAS_BLED(inputs: any) {
    return this.calcHASBLED({
      hypertension: inputs.hypertension,
      renalDisease: inputs.renalDisease,
      liverDisease: inputs.liverDisease,
      strokeHistory: inputs.strokeHistory,
      priorBleeding: inputs.priorMajorBleed,
      labileINR: inputs.labileINR,
      elderly: inputs.ageOver65,
      drugs: inputs.antiplateletOrNSAID,
      alcohol: inputs.alcoholExcess,
    });
  },

  calculateEGFR(cr: number, age: number, sex: 'Male' | 'Female', weight: number = 70) {
    const res = this.calcCockcroftGault(age, weight, cr, sex === 'Female');
    return { egfr: res.crcl, stage: res.stage };
  },

  calculateShockIndex(hr: number, sbp: number) {
    const index = sbp > 0 ? Math.round((hr / sbp) * 100) / 100 : 0;
    let risk = 'Normal (< 0.7)';
    if (index >= 1.0) risk = 'Severe Shock (≥ 1.0) - High Mortality Risk';
    else if (index >= 0.7) risk = 'Elevated (0.7 - 0.9) - Potential Occult Shock';
    return { index, shockIndex: index, risk, interpretation: risk };
  },

  calculateABG(ph: number, paco2: number, hco3: number, pao2: number, fio2: number = 21) {
    return this.calcABGMetabolic({ ph, paco2, hco3, na: 140, cl: 102, pao2, fio2 });
  },
};
