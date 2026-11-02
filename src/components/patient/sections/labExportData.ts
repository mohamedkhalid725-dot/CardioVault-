import type { LabPanel, LabResult, Patient } from '../../../types/clinical';

const LEGACY_LAB_FIELDS: Array<{ field: keyof Omit<LabPanel, 'date' | 'customLabs'>; name: string; unit: string }> = [
  {field:'hb',name:'Hemoglobin',unit:'g/dL'},{field:'wbc',name:'WBC',unit:'10^3/µL'},{field:'platelets',name:'Platelets',unit:'10^3/µL'},
  {field:'hct',name:'Hematocrit',unit:'%'},{field:'rbc',name:'RBC',unit:'10^6/µL'},{field:'mcv',name:'MCV',unit:'fL'},
  {field:'mch',name:'MCH',unit:'pg'},{field:'mchc',name:'MCHC',unit:'g/dL'},{field:'urea',name:'Urea / BUN',unit:'mg/dL'},
  {field:'creatinine',name:'Creatinine',unit:'mg/dL'},{field:'egfr',name:'eGFR',unit:'mL/min/1.73 m²'},{field:'uricAcid',name:'Uric Acid',unit:'mg/dL'},
  {field:'na',name:'Sodium',unit:'mmol/L'},{field:'k',name:'Potassium',unit:'mmol/L'},{field:'cl',name:'Chloride',unit:'mmol/L'},
  {field:'ca',name:'Calcium',unit:'mg/dL'},{field:'mg',name:'Magnesium',unit:'mg/dL'},{field:'phosphate',name:'Phosphate',unit:'mg/dL'},
  {field:'ast',name:'AST',unit:'U/L'},{field:'alt',name:'ALT',unit:'U/L'},{field:'alp',name:'ALP',unit:'U/L'},
  {field:'bilirubin',name:'Total Bilirubin',unit:'mg/dL'},{field:'albumin',name:'Albumin',unit:'g/dL'},{field:'totalProtein',name:'Total Protein',unit:'g/dL'},
  {field:'pt',name:'PT',unit:'sec'},{field:'inr',name:'INR',unit:'ratio'},{field:'aptt',name:'aPTT',unit:'sec'},
  {field:'fibrinogen',name:'Fibrinogen',unit:'mg/dL'},{field:'troponin',name:'Troponin',unit:'ng/L'},{field:'ckmb',name:'CK-MB',unit:'ng/mL'},
  {field:'bnp',name:'BNP',unit:'pg/mL'},{field:'ntProBnp',name:'NT-proBNP',unit:'pg/mL'},{field:'crp',name:'CRP',unit:'mg/L'},
  {field:'esr',name:'ESR',unit:'mm/hr'},{field:'procalcitonin',name:'Procalcitonin',unit:'ng/mL'},{field:'glucose',name:'Glucose',unit:'mg/dL'},
  {field:'hba1c',name:'HbA1c',unit:'%'},{field:'cholesterol',name:'Total Cholesterol',unit:'mg/dL'},{field:'triglycerides',name:'Triglycerides',unit:'mg/dL'},
  {field:'ldl',name:'LDL-C',unit:'mg/dL'},{field:'hdl',name:'HDL-C',unit:'mg/dL'},{field:'lactate',name:'Lactate',unit:'mmol/L'},
  {field:'dDimer',name:'D-Dimer',unit:'mg/L FEU'},{field:'tsh',name:'TSH',unit:'mIU/L'},
];

export type ExportLabResult = LabResult & { legacy?: boolean };
export const legacyLabResults = (panels: LabPanel[]): ExportLabResult[] => panels.flatMap(panel => {
  const timestamp = typeof panel.date === 'string' ? panel.date : '';
  const fields = LEGACY_LAB_FIELDS.flatMap(({field,name,unit}) => {
    const value = panel[field] as unknown;
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return [];
    const panelName = /^(hb|hct|rbc|mcv|mch|mchc|wbc|platelets)$/.test(String(field)) ? 'CBC'
      : /^(troponin|ckmb|bnp|ntProBnp)$/.test(String(field)) ? 'Cardiac Markers'
      : /^(pt|inr|aptt|fibrinogen|dDimer)$/.test(String(field)) ? 'Coagulation'
      : /^(ast|alt|alp|bilirubin|albumin|totalProtein)$/.test(String(field)) ? 'Liver'
      : /^(cholesterol|triglycerides|ldl|hdl)$/.test(String(field)) ? 'Lipid Profile'
      : field === 'hba1c' ? 'Diabetes'
      : field === 'tsh' ? 'Thyroid'
      : field === 'crp' || field === 'esr' || field === 'procalcitonin' ? 'Inflammatory / Infection'
      : 'Chemistry';
    return [{testName:name,value:value as string|number,unit,timestamp,panel:panelName,legacy:true}];
  });
  const custom = Array.isArray(panel.customLabs) ? panel.customLabs.flatMap(result => {
    if (result?.value === null || result?.value === undefined || !String(result.name || '').trim()) return [];
    return [{testName:String(result.name).trim(),value:result.value,unit:result.unit||'',referenceRange:result.referenceRange||'',timestamp,panel:'Legacy custom',legacy:true}];
  }) : [];
  return [...fields,...custom];
});

export const aggregateLabResults = (patient: Pick<Patient, 'labResults'|'labs'>) => {
  const all: ExportLabResult[] = [
    ...(patient.labResults || []),
    ...legacyLabResults(patient.labs || []),
  ].map(r => ({...r, panel: String(r.panel || 'Laboratory'), testName: String(r.testName || r.name || 'Laboratory Test').trim()}));
  const panels = new Map<string, Map<string, ExportLabResult[]>>();
  for (const result of all) {
    const panel = result.panel || 'Laboratory';
    if (!panels.has(panel)) panels.set(panel, new Map());
    const analytes = panels.get(panel)!;
    const key = result.testName!.trim().toLocaleLowerCase();
    if (!analytes.has(key)) analytes.set(key, []);
    analytes.get(key)!.push(result);
  }
  return [...panels].map(([panel, analytes]) => ({panel, analytes:[...analytes].map(([key, results]) => ({key, name:results[0].testName || results[0].name || 'Laboratory Test', results:orderLabResults(results)})).sort((a,b)=>a.name.localeCompare(b.name))})).sort((a,b)=>a.panel.localeCompare(b.panel));
};

export const orderLabResults = <T extends {timestamp?: string}>(results: T[]): T[] => [...results].sort((a,b) => {
  const ta = validTime(a.timestamp), tb = validTime(b.timestamp);
  if (ta === null) return tb === null ? 0 : 1;
  if (tb === null) return -1;
  return ta-tb;
});
const validTime = (value?: string) => { if (!value?.trim()) return null; const n=Date.parse(value); return Number.isFinite(n)?n:null; };

export type PdfTimelineEvent = { timestamp?: string; type: string; title: string; details: string };
export const buildPdfTimeline = (p: any, selected: string[]): PdfTimelineEvent[] => {
  const events: PdfTimelineEvent[] = [];
  const add = (timestamp: unknown, type: string, title: unknown, details: unknown) => {
    const body=String(details??'').trim();
    events.push({timestamp:typeof timestamp==='string'&&timestamp.trim()?timestamp:undefined,type,title:String(title||type),details:body});
  };
  if (selected.includes('history') && p.admissionDate) add(`${p.admissionDate} ${p.admissionTime||''}`,'Admission','Admission',p.primaryDiagnosis||p.diagnosis||'');
  if (selected.includes('vitals-exam')) (p.vitalsHistory||[]).forEach((v:any)=>add(v.timestamp,'Vitals','Vital signs',[v.sbp&&v.dbp?`BP ${v.sbp}/${v.dbp}`:'',v.hr?`HR ${v.hr}`:'',v.spo2?`SpO₂ ${v.spo2}%`:'' ].filter(Boolean).join(' • ')));
  if (selected.includes('ecg')) (p.ecgRecords||[]).forEach((e:any)=>add(e.date?`${e.date} ${e.time||''}`:e.timestamp,'ECG','ECG',e.finalImpression||e.rhythm||''));
  if (selected.includes('labs')) aggregateLabResults(p).forEach(group=>group.analytes.forEach(a=>a.results.forEach(r=>add(r.timestamp,'Laboratory',`${group.panel} — ${a.name}`,`${r.value??''} ${r.unit||''} ${r.flag||r.status||''}`.trim()))));
  if (selected.includes('imaging-cardiology')) {
    (p.imaging||[]).forEach((x:any)=>add(x.date,'Imaging',x.modality||x.type||'Imaging',x.impression||x.findings||''));
    (p.cardiology?.cathRecords||[]).forEach((x:any)=>add(x.date,'Catheterization','Coronary procedure',x.finalResult||x.intervention||x.findings||''));
  }
  if (selected.includes('medications')) (p.medicationAdministrations||[]).forEach((x:any)=>add(x.timestamp||x.date||x.time,'Medication',x.medicationName||x.drugName,x.status||x.dose||''));
  if (selected.includes('icu-procedures')) {
    (p.procedures||[]).forEach((x:any)=>add(x.date?`${x.date} ${x.time||''}`:x.timestamp,'Procedure',x.procedure||x.name||x.surgeryName,x.outcome||x.findings||''));
    (p.ventilator?.abgHistory||[]).forEach((x:any)=>add(x.timestamp,'ABG','Arterial blood gas',[x.ph&&`pH ${x.ph}`,x.pao2&&`PaO₂ ${x.pao2}`,x.paco2&&`PaCO₂ ${x.paco2}`].filter(Boolean).join(' • ')));
  }
  if (selected.includes('course-plan')) {
    (p.progressNotes||[]).forEach((n:any)=>add(n.date?`${n.date} ${n.time||''}`:n.timestamp,'Progress note',n.type||n.author||'Progress note',[n.assessment,n.events,n.plan].filter(Boolean).join(' • ')));
    (p.timelineEvents||[]).forEach((e:any)=>add(e.timestamp,e.eventType||'Clinical event',e.title||e.eventType,e.summary||''));
  }
  const sortTime=(e:PdfTimelineEvent)=>e.timestamp?validTime(e.timestamp):null;
  return events.map((e,i)=>({...e,_i:i})).sort((a,b)=>{const ta=sortTime(a),tb=sortTime(b);if(ta===null)return tb===null?a._i-b._i:1;if(tb===null)return-1;return ta-tb||a._i-b._i;}).map(({_i,...event})=>event);
};
