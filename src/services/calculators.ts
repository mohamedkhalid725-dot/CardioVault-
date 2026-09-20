// Clinical Decision-Support Calculators with Validated Medical Formulas

export interface CalculatorDefinition {
  id: string;
  name: string;
  category: 'Cardiology' | 'Emergency & Risk' | 'Critical Care' | 'ABG' | 'Hemodynamics' | 'Renal & Electrolytes' | 'Drug Infusion';
  subtitle: string;
  description: string;
}

export const CLINICAL_CALCULATORS: CalculatorDefinition[] = [ 
  {
    id: 'grace-acs',
    name: 'GRACE Score',
    category: 'Cardiology',
    subtitle: 'ACS risk stratification',
    description: 'GRACE risk score inputs for acute coronary syndrome risk assessment.',
  },
  {
    id: 'timi-stemi',
    name: 'TIMI Risk Score (STEMI)',
    category: 'Cardiology',
    subtitle: 'STEMI risk stratification',
    description: 'TIMI risk score for patients with ST-elevation myocardial infarction.',
  },
  {
    id: 'dapt-score',
    name: 'DAPT Score',
    category: 'Cardiology',
    subtitle: 'Extended DAPT assessment',
    description: 'Estimates benefit and bleeding trade-off considerations for prolonged dual antiplatelet therapy after PCI.',
  },
  {
    id: 'precise-dapt',
    name: 'PRECISE-DAPT',
    category: 'Cardiology',
    subtitle: 'DAPT bleeding risk',
    description: 'Five-item bleeding risk score using age, hemoglobin, white-cell count, creatinine clearance and prior bleeding.',
  },
  {
    id: 'wells-pe',
    name: 'Wells Score — PE',
    category: 'Emergency & Risk',
    subtitle: 'Pulmonary embolism pretest probability',
    description: 'Clinical pretest probability score for suspected pulmonary embolism.',
  },
  {
    id: 'wells-dvt',
    name: 'Wells Score — DVT',
    category: 'Emergency & Risk',
    subtitle: 'DVT pretest probability',
    description: 'Clinical pretest probability score for suspected lower-extremity deep-vein thrombosis.',
  },
  {
    id: 'perc-rule',
    name: 'PERC Rule',
    category: 'Emergency & Risk',
    subtitle: 'PE rule-out criteria',
    description: 'Eight-item pulmonary embolism rule-out checklist for selected low-risk patients.',
  },
  {
    id: 'revised-geneva',
    name: 'Revised Geneva Score',
    category: 'Emergency & Risk',
    subtitle: 'PE pretest probability',
    description: 'Clinical and objective pretest probability score for pulmonary embolism.',
  },
  {
    id: 'curb-65',
    name: 'CURB-65',
    category: 'Emergency & Risk',
    subtitle: 'Community-acquired pneumonia severity',
    description: 'Five-item severity score for community-acquired pneumonia.',
  },
  {
    id: 'orbit-bleeding',
    name: 'ORBIT Bleeding Score',
    category: 'Emergency & Risk',
    subtitle: 'Bleeding risk in AF',
    description: 'Bleeding risk score for patients with atrial fibrillation receiving antithrombotic therapy.',
  },
  {
    id: 'crusade-bleeding',
    name: 'CRUSADE Bleeding Score',
    category: 'Emergency & Risk',
    subtitle: 'NSTE-ACS bleeding risk',
    description: 'Bleeding risk assessment for patients with non-ST-elevation acute coronary syndrome.',
  },
  {
    id: 'four-ts',
    name: '4Ts Score',
    category: 'Emergency & Risk',
    subtitle: 'HIT pretest probability',
    description: 'Pretest probability score for heparin-induced thrombocytopenia.',
  },
  {
    id: 'ist-dic',
    name: 'ISTH DIC Score',
    category: 'Emergency & Risk',
    subtitle: 'Overt DIC scoring',
    description: 'ISTH overt disseminated intravascular coagulation scoring framework.',
  },
  {
    id: 'cha2ds2-va',
    name: 'CHA₂DS₂-VA',
    category: 'Cardiology',
    subtitle: 'Stroke risk in AF',
    description: 'Sex-neutral stroke risk score for atrial fibrillation.',
  },
  {
    id: 'atria-bleeding',
    name: 'ATRIA Bleeding Score',
    category: 'Cardiology',
    subtitle: 'Warfarin bleeding risk',
    description: 'Major bleeding risk score for patients receiving warfarin.',
  },
  {
    id: 'vte-bleed',
    name: 'VTE-BLEED',
    category: 'Emergency & Risk',
    subtitle: 'Bleeding risk during anticoagulation',
    description: 'Bleeding risk assessment during anticoagulation for venous thromboembolism.',
  },
  {
    id: 'improve-bleeding',
    name: 'IMPROVE Bleeding Score',
    category: 'Critical Care',
    subtitle: 'Hospital bleeding risk',
    description: 'In-hospital major bleeding risk assessment for medical patients.',
  },
  {
    id: 'pesi',
    name: 'PESI',
    category: 'Emergency & Risk',
    subtitle: '30-day PE outcome risk',
    description: 'Pulmonary Embolism Severity Index for 30-day outcome risk stratification.',
  },
  {
    id: 'spesi',
    name: 'Simplified PESI',
    category: 'Emergency & Risk',
    subtitle: 'Simplified PE outcome score',
    description: 'Six-item simplified pulmonary embolism severity score.',
  },
  {
    id: 'age-adjusted-ddimer',
    name: 'Age-Adjusted D-dimer',
    category: 'Emergency & Risk',
    subtitle: 'VTE rule-out threshold',
    description: 'Age-adjusted D-dimer threshold for selected patients aged 50 years or older.',
  },
  {
    id: 'glasgow-blatchford',
    name: 'Glasgow-Blatchford Score',
    category: 'Emergency & Risk',
    subtitle: 'Upper GI bleeding risk',
    description: 'Risk stratification score for upper gastrointestinal bleeding.',
  },

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
  // GRACE ACS (points are entered using the published category bins)
  calcGRACE(inputs: { age:number; hr:number; sbp:number; creatinine:number; killip:number; cardiacArrest:boolean; stDeviation:boolean; elevatedMarkers:boolean }) {
    const agePts = inputs.age < 40 ? 0 : inputs.age < 50 ? 18 : inputs.age < 60 ? 36 : inputs.age < 70 ? 55 : inputs.age < 80 ? 73 : inputs.age < 90 ? 91 : 100;
    const hrPts = inputs.hr < 50 ? 0 : inputs.hr < 70 ? 3 : inputs.hr < 90 ? 9 : inputs.hr < 110 ? 14 : inputs.hr < 150 ? 23 : inputs.hr < 200 ? 36 : 46;
    const sbpPts = inputs.sbp >= 200 ? 0 : inputs.sbp >= 180 ? 3 : inputs.sbp >= 160 ? 7 : inputs.sbp >= 140 ? 11 : inputs.sbp >= 120 ? 15 : inputs.sbp >= 100 ? 24 : inputs.sbp >= 80 ? 38 : 58;
    const crPts = inputs.creatinine < 0.4 ? 1 : inputs.creatinine < 0.8 ? 4 : inputs.creatinine < 1.2 ? 7 : inputs.creatinine < 1.6 ? 10 : inputs.creatinine < 2.0 ? 13 : inputs.creatinine < 4.0 ? 21 : 28;
    const killipPts = [0,20,39,59][Math.max(0,Math.min(3,Math.round(inputs.killip)-1))];
    const score = agePts + hrPts + sbpPts + crPts + killipPts + (inputs.cardiacArrest?39:0) + (inputs.stDeviation?28:0) + (inputs.elevatedMarkers?14:0);
    const risk = score < 109 ? 'Low' : score < 141 ? 'Intermediate' : 'High';
    return {score,risk};
  },

  calcTIMISTEMI(inputs:{age65Plus:boolean;weightUnder67:boolean;diabetesHypertension:boolean;sbpUnder100:boolean;hrOver100:boolean;killipIItoIV:boolean;anteriorSTOrLBBB:boolean;timeToTreatmentOver4h:boolean}) {
    let score=0;
    if(inputs.age65Plus)score+=1;if(inputs.weightUnder67)score+=1;if(inputs.diabetesHypertension)score+=1;if(inputs.sbpUnder100)score+=3;if(inputs.hrOver100)score+=2;if(inputs.killipIItoIV)score+=2;if(inputs.anteriorSTOrLBBB)score+=1;if(inputs.timeToTreatmentOver4h)score+=1;
    return {score,risk:score<=2?'Lower':score<=4?'Intermediate':'Higher'};
  },

  calcDAPT(inputs:{age:number;smoker:boolean;diabetes:boolean;miAtPresentation:boolean;priorPciOrMi:boolean;stentDiameterSmall:boolean;paclitaxelStent:boolean;chfOrLvefLow:boolean;veinGraftStent:boolean}) {
    let score=0;
    if(inputs.age>=75)score-=2;else if(inputs.age>=65)score-=1;
    if(inputs.smoker)score+=1;if(inputs.diabetes)score+=1;if(inputs.miAtPresentation)score+=1;if(inputs.priorPciOrMi)score+=1;if(inputs.stentDiameterSmall)score+=1;if(inputs.paclitaxelStent)score+=1;if(inputs.chfOrLvefLow)score+=2;if(inputs.veinGraftStent)score+=2;
    return {score,interpretation:score>=2?'Score ≥2: greater net benefit from prolonged DAPT in the original DAPT study population.':'Score <2: less favorable benefit-to-risk balance for prolonged DAPT in the original DAPT study population.'};
  },

  calcPreciseDAPT(inputs:{age:number;hemoglobin:number;wbc:number;crcl:number;priorBleeding:boolean}) {
    const score= Math.round((inputs.age*0.1) + Math.max(0,15-inputs.hemoglobin)*2 + Math.max(0,inputs.wbc-10)*1.5 + Math.max(0,30-inputs.crcl)*0.2 + (inputs.priorBleeding?10:0));
    return {score,risk:score>=25?'High':score>=11?'Intermediate':'Low'};
  },

  calcWellsPE(inputs:{clinicalDvt:boolean;peMostLikely:boolean;hrOver100:boolean;immobilizationOrSurgery:boolean;previousVte:boolean;hemoptysis:boolean;malignancy:boolean}) {
    const score=(inputs.clinicalDvt?3:0)+(inputs.peMostLikely?3:0)+(inputs.hrOver100?1.5:0)+(inputs.immobilizationOrSurgery?1.5:0)+(inputs.previousVte?1.5:0)+(inputs.hemoptysis?1:0)+(inputs.malignancy?1:0);
    return {score,risk:score<=1?'Low':score<=6?'Moderate':'High',twoTier:score>4?'PE likely':'PE unlikely'};
  },

  calcWellsDVT(inputs:{activeCancer:boolean;paralysisOrParesis:boolean;immobilizedOrSurgery:boolean;localizedTenderness:boolean;entireLegSwollen:boolean;calfSwelling3cm:boolean;pittingEdema:boolean;collateralSuperficialVeins:boolean;previousDvt:boolean;alternativeDiagnosisLikely:boolean}) {
    const score=(inputs.activeCancer?1:0)+(inputs.paralysisOrParesis?1:0)+(inputs.immobilizedOrSurgery?1:0)+(inputs.localizedTenderness?1:0)+(inputs.entireLegSwollen?1:0)+(inputs.calfSwelling3cm?1:0)+(inputs.pittingEdema?1:0)+(inputs.collateralSuperficialVeins?1:0)+(inputs.previousDvt?1:0)-(inputs.alternativeDiagnosisLikely?2:0);
    return {score,risk:score>=2?'DVT likely':'DVT unlikely'};
  },

  calcPERC(inputs:{age50Plus:boolean;hr100Plus:boolean;oxygenSat95Below:boolean;unilateralLegSwelling:boolean;hemoptysis:boolean;recentSurgeryTrauma:boolean;priorVte:boolean;hormoneUse:boolean}) {
    const positive=Object.values(inputs).filter(Boolean).length;
    return {score:positive,negative:positive===0,result:positive===0?'PERC negative':'PERC positive'};
  },

  calcRevisedGeneva(inputs:{age65Plus:boolean;previousVte:boolean;surgeryOrFracture:boolean;activeCancer:boolean;unilateralLegPain:boolean;hemoptysis:boolean;hr75to94:boolean;hr95Plus:boolean;legPainOnPalpation:boolean}) {
    let score=0;
    if(inputs.age65Plus)score+=1;if(inputs.previousVte)score+=3;if(inputs.surgeryOrFracture)score+=2;if(inputs.activeCancer)score+=2;if(inputs.unilateralLegPain)score+=3;if(inputs.hemoptysis)score+=2;if(inputs.hr75to94)score+=3;if(inputs.hr95Plus)score+=5;if(inputs.legPainOnPalpation)score+=4;
    return {score,risk:score<=3?'Low':score<=10?'Intermediate':'High'};
  },

  calcCURB65(inputs:{confusion:boolean;ureaOver7:boolean;rr30Plus:boolean;sbp90OrDbp60:boolean;age65Plus:boolean}) {
    const score=(inputs.confusion?1:0)+(inputs.ureaOver7?1:0)+(inputs.rr30Plus?1:0)+(inputs.sbp90OrDbp60?1:0)+(inputs.age65Plus?1:0);
    return {score,risk:score<=1?'Lower':score===2?'Intermediate':'Higher'};
  },

  calcORBIT(inputs:{age74Plus:boolean;hemoglobinLow:boolean;bleedingHistory:boolean;renalInsufficiency:boolean;antiplatelet:boolean}) {
    const score=(inputs.age74Plus?1:0)+(inputs.hemoglobinLow?2:0)+(inputs.bleedingHistory?2:0)+(inputs.renalInsufficiency?1:0)+(inputs.antiplatelet?1:0);
    return {score,risk:score<=2?'Low':score<=4?'Intermediate':'High'};
  },

  calcCRUSADE(inputs:{female:boolean;diabetes:boolean;vascularDisease:boolean;heartRate:number;systolicBp:number;hematocrit:number;crcl:number;chf:boolean}) {
    const score=(inputs.female?8:0)+(inputs.diabetes?6:0)+(inputs.vascularDisease?6:0)+(inputs.chf?7:0)+(inputs.heartRate>=110?9:inputs.heartRate>=90?6:inputs.heartRate>=70?3:0)+(inputs.systolicBp<90?10:inputs.systolicBp<110?8:inputs.systolicBp<120?5:inputs.systolicBp<140?1:0)+(inputs.hematocrit<30?9:inputs.hematocrit<36?7:inputs.hematocrit<40?3:0)+(inputs.crcl<15?39:inputs.crcl<30?35:inputs.crcl<60?28:inputs.crcl<90?17:inputs.crcl<120?7:0);
    return {score,risk:score<=20?'Very Low':score<=30?'Low':score<=40?'Moderate':score<=50?'High':'Very High'};
  },

  calcFourTs(inputs:{thrombocytopenia:number;timing:number;thrombosis:number;otherCause:number}) {
    const score=inputs.thrombocytopenia+inputs.timing+inputs.thrombosis+inputs.otherCause;
    return {score,risk:score<=3?'Low':score<=5?'Intermediate':'High'};
  },

  calcISTHDIC(inputs:{platelet:number;fibrinMarker:number;ptProlongation:number;fibrinogen:number}) {
    const score=(inputs.platelet<50?2:inputs.platelet<100?1:0)+(inputs.fibrinMarker>=3?3:inputs.fibrinMarker>=1?2:0)+(inputs.ptProlongation>=6?2:inputs.ptProlongation>=3?1:0)+(inputs.fibrinogen<100?1:0);
    return {score,risk:score>=5?'Overt DIC score compatible':'Non-overt / lower score'};
  },

  calcCHA2DS2VA(inputs:{chf:boolean;htn:boolean;age75Plus:boolean;diabetes:boolean;strokeOrTia:boolean;vascularDisease:boolean;age65To74:boolean}) {
    let score=0;if(inputs.chf)score+=1;if(inputs.htn)score+=1;if(inputs.age75Plus)score+=2;if(inputs.diabetes)score+=1;if(inputs.strokeOrTia)score+=2;if(inputs.vascularDisease)score+=1;if(inputs.age65To74&&!inputs.age75Plus)score+=1;
    return {score};
  },

  calcATRIA(inputs:{anemia:boolean;severeRenal:boolean;age75Plus:boolean;priorHemorrhage:boolean;hypertension:boolean}) {
    const score=(inputs.anemia?3:0)+(inputs.severeRenal?3:0)+(inputs.age75Plus?2:0)+(inputs.priorHemorrhage?1:0)+(inputs.hypertension?1:0);
    return {score,risk:score<4?'Low':score===4?'Intermediate':'High'};
  },

  calcVTEBleed(inputs:{age60Plus:boolean;cancer:boolean;maleUncontrolledHtn:boolean;anemia:boolean;priorBleeding:boolean;crcl30to60:boolean}) {
    const score=(inputs.age60Plus?1.5:0)+(inputs.cancer?2:0)+(inputs.maleUncontrolledHtn?1:0)+(inputs.anemia?1.5:0)+(inputs.priorBleeding?1.5:0)+(inputs.crcl30to60?1.5:0);
    return {score,risk:score>=2?'Elevated bleeding risk':'Lower bleeding risk'};
  },

  calcIMPROVEBleeding(inputs:{age40to84:boolean;age85Plus:boolean;male:boolean;gfr30to59:boolean;gfrBelow30:boolean;cancer:boolean;rheumatic:boolean;cvc:boolean;icu:boolean;hepaticFailure:boolean;plateletsBelow50:boolean;recentBleed:boolean;ulcer:boolean}) {
    const score=(inputs.age40to84?1.5:0)+(inputs.age85Plus?3.5:0)+(inputs.male?1:0)+(inputs.gfr30to59?1:0)+(inputs.gfrBelow30?2.5:0)+(inputs.cancer?2:0)+(inputs.rheumatic?2:0)+(inputs.cvc?2:0)+(inputs.icu?2.5:0)+(inputs.hepaticFailure?2.5:0)+(inputs.plateletsBelow50?4:0)+(inputs.recentBleed?4:0)+(inputs.ulcer?4.5:0);
    return {score,risk:score>=7?'High':'Lower'};
  },

  calcPESI(inputs:{age:number;male:boolean;cancer:boolean;heartFailure:boolean;chronicLung:boolean;hr110Plus:boolean;sbp100Below:boolean;rr30Plus:boolean;temp36Below:boolean;alteredMental:boolean;sat90Below:boolean}) {
    const score=inputs.age+(inputs.male?10:0)+(inputs.cancer?30:0)+(inputs.heartFailure?10:0)+(inputs.chronicLung?10:0)+(inputs.hr110Plus?20:0)+(inputs.sbp100Below?30:0)+(inputs.rr30Plus?20:0)+(inputs.temp36Below?20:0)+(inputs.alteredMental?60:0)+(inputs.sat90Below?20:0);
    return {score,class:score<=65?'I':score<=85?'II':score<=105?'III':score<=125?'IV':'V'};
  },

  calcSPESI(inputs:{age80Plus:boolean;cancer:boolean;cardiopulmonaryDisease:boolean;hr110Plus:boolean;sbp100Below:boolean;sat90Below:boolean}) {
    const score=(inputs.age80Plus?1:0)+(inputs.cancer?1:0)+(inputs.cardiopulmonaryDisease?1:0)+(inputs.hr110Plus?1:0)+(inputs.sbp100Below?1:0)+(inputs.sat90Below?1:0);
    return {score,risk:score===0?'Low risk':'Higher risk'};
  },

  calcAgeAdjustedDimer(age:number,unit:'FEU'|'DDU') {
    const cutoff=age>=50?(unit==='FEU'?age*10:age*5):unit==='FEU'?500:250;
    return {cutoff,unit};
  },

  calcGlasgowBlatchford(inputs:{hb:number;bun:number;sbp:number;male:boolean;hr100Plus:boolean;melena:boolean;syncope:boolean;liverDisease:boolean;heartFailure:boolean}) {
    const hbPts=inputs.male?(inputs.hb<10?6:inputs.hb<12?3:inputs.hb<13?1:0):(inputs.hb<10?6:inputs.hb<12?1:0);
    const bunPts=inputs.bun<6.5?0:inputs.bun<8?2:inputs.bun<10?3:inputs.bun<25?4:6;
    const sbpPts=inputs.sbp<90?3:inputs.sbp<100?2:inputs.sbp<110?1:0;
    const score=hbPts+bunPts+sbpPts+(inputs.hr100Plus?1:0)+(inputs.melena?1:0)+(inputs.syncope?2:0)+(inputs.liverDisease?2:0)+(inputs.heartFailure?2:0);
    return {score};
  },

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
