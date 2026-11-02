import type { LabPanel, LabResult, Patient } from '../../../types/clinical';
import { panelForTest } from '../../../services/labResultParser.ts';

const LEGACY_FIELDS: Array<{ field: keyof Omit<LabPanel, 'date' | 'customLabs'>; name: string; unit: string; panel: string }> = [
  ['hb','Hemoglobin','g/dL','CBC'],['wbc','WBC','10^3/µL','CBC'],['platelets','Platelets','10^3/µL','CBC'],['hct','Hematocrit','%','CBC'],['rbc','RBC','10^6/µL','CBC'],['mcv','MCV','fL','CBC'],['mch','MCH','pg','CBC'],['mchc','MCHC','g/dL','CBC'],
  ['urea','Urea / BUN','mg/dL','Renal'],['creatinine','Creatinine','mg/dL','Renal'],['egfr','eGFR','mL/min/1.73 m²','Renal'],['uricAcid','Uric Acid','mg/dL','Renal'],['na','Sodium','mmol/L','Electrolytes'],['k','Potassium','mmol/L','Electrolytes'],['cl','Chloride','mmol/L','Electrolytes'],['ca','Calcium','mg/dL','Electrolytes'],['mg','Magnesium','mg/dL','Electrolytes'],['phosphate','Phosphate','mg/dL','Electrolytes'],
  ['ast','AST','U/L','LFT'],['alt','ALT','U/L','LFT'],['alp','ALP','U/L','LFT'],['bilirubin','Total Bilirubin','mg/dL','LFT'],['albumin','Albumin','g/dL','LFT'],['totalProtein','Total Protein','g/dL','LFT'],['pt','PT','sec','Coagulation'],['inr','INR','ratio','Coagulation'],['aptt','aPTT','sec','Coagulation'],['fibrinogen','Fibrinogen','mg/dL','Coagulation'],['troponin','Troponin','ng/L','Cardiac Markers'],['ckmb','CK-MB','ng/mL','Cardiac Markers'],['bnp','BNP','pg/mL','Cardiac Markers'],['ntProBnp','NT-proBNP','pg/mL','Cardiac Markers'],['crp','CRP','mg/L','Inflammatory'],['esr','ESR','mm/hr','Inflammatory'],['procalcitonin','Procalcitonin','ng/mL','Inflammatory'],['glucose','Glucose','mg/dL','Metabolic'],['hba1c','HbA1c','%','Metabolic'],['cholesterol','Total Cholesterol','mg/dL','Lipid Profile'],['triglycerides','Triglycerides','mg/dL','Lipid Profile'],['ldl','LDL-C','mg/dL','Lipid Profile'],['hdl','HDL-C','mg/dL','Lipid Profile'],['lactate','Lactate','mmol/L','Metabolic'],['dDimer','D-Dimer','mg/L FEU','Coagulation'],['tsh','TSH','mIU/L','Thyroid'],
 ].map(([field,name,unit,panel])=>({field:field as keyof Omit<LabPanel,'date'|'customLabs'>,name,unit,panel}));

export type ExportLabResult = LabResult & { legacy?: boolean; panel?: string };

/** Map a timestamp to the chart's horizontal range, centering zero-span series. */
export const pdfChartX = (timestamp: number, start: number, end: number, left: number, width: number): number => {
  const span = end - start;
  if (!Number.isFinite(timestamp) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(left) || !Number.isFinite(width)) return NaN;
  return span > 0 ? left + ((timestamp - start) / span) * width : left + width / 2;
};

export const legacyLabResults = (panels: LabPanel[] = []): ExportLabResult[] => panels.flatMap(panel => {
  const timestamp = typeof panel.date === 'string' ? panel.date : '';
  const fields = LEGACY_FIELDS.flatMap(({field,name,unit,panel: clinicalPanel}) => {
    const value = panel[field] as unknown;
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return [];
    return [{testName:name,value:value as string|number,unit,timestamp,panel:clinicalPanel}];
  });
  const custom = Array.isArray(panel.customLabs) ? panel.customLabs.flatMap(result => result?.value == null || !String(result.name||'').trim() ? [] : [{
     testName:String(result.name).trim(),value:result.value,unit:result.unit||'',referenceRange:result.referenceRange||'',timestamp,panel:panelForTest(String(result.name).trim()),
  }]) : [];
  return [...fields,...custom].map(result=>({...result,legacy:true}));
});

const parseClinicalDate = (value: unknown): { timestamp: string; time: number } | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
    const time = new Date(milliseconds).getTime();
    return Number.isFinite(time) ? { timestamp: new Date(time).toISOString(), time } : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? { timestamp: value, time } : null;
};
const validTime = (value?: unknown) => parseClinicalDate(value)?.time ?? null;
export const orderLabResults = <T extends {timestamp?: string}>(results:T[]):T[] => [...results].sort((a,b)=>{
  const ta=validTime(a.timestamp),tb=validTime(b.timestamp);
  return ta===null?(tb===null?0:1):tb===null?-1:ta-tb;
});

/** Combine observations only when their clinical panel, analyte, and unit all match. */
export const aggregateLabResults = (patient: Pick<Patient,'labResults'|'labs'>) => {
  const all: ExportLabResult[] = [...(patient.labResults||[]),...legacyLabResults(patient.labs||[])].map(r=>({
    ...r,panel:String(r.panel||panelForTest(String(r.testName||r.name||'Laboratory Test'))),testName:String(r.testName||r.name||'Laboratory Test').trim(),
  }));
  const analytes = new Map<string,ExportLabResult[]>();
  all.forEach(result=>{const key=JSON.stringify([result.panel||'Laboratory',result.testName!.trim().toLocaleLowerCase(),String(result.unit||'').trim().toLocaleLowerCase()]);analytes.set(key,[...(analytes.get(key)||[]),result]);});
  return [...analytes].map(([key,results])=>({key,name:results[0].testName||'Laboratory Test',panel:results[0].panel||'Laboratory',results:orderLabResults(results)})).sort((a,b)=>a.panel.localeCompare(b.panel)||a.name.localeCompare(b.name)||String(a.results[0]?.unit||'').localeCompare(String(b.results[0]?.unit||'')));
};

export type PdfTimelineEvent = {timestamp?:string;type:string;title:string;details:string;source:string};
const SECTION_SOURCES: Record<string, Array<[string,string]>> = {
  identification:[['Admission','admission'],['Diagnosis','diagnosis'],['Past admissions','pastAdmissions']],
  history:[['Clinical history','clinicalSummary'],['Cardiovascular history','cardiovascularHistory']],
  'vitals-exam':[['Vital signs','vitalsHistory'],['Examination','examination'],['Fluid balance','fluidRecords'],['Fluid intake','fluidIntakeHistory'],['Urine output','urineOutputHistory'],['Hemodynamics','hemodynamicHistory']],
  ecg:[['ECG','ecgRecords']], labs:[],
  'imaging-cardiology':[['Imaging','imaging'],['Cardiology','cardiology']],
  medications:[['Medication orders','medications'],['Infusions','infusions'],['Administration','medicationAdministrations']],
  'icu-procedures':[['Ventilator and ABG','ventilator'],['Hemodynamic history','hemodynamicHistory'],['Fluid records','fluidRecords'],['Procedures','procedures']],
  'course-plan':[['Investigations','investigations'],['Consultations','consultations'],['Tasks','tasks'],['Progress note','progressNotes'],['Clinical timeline','timelineEvents'],['Problems','problems'],['Handover','handover'],['Shift handover','shiftHandovers'],['Discharge summary','dischargeSummary']],
};
const OMIT_KEYS = new Set(['id','patientId','unitId','departmentId','imageUrls','imageStoragePaths','audioUrl','audioStoragePath','photoUrl']);
const stringifyClinical = (value: unknown): string => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringifyClinical).filter(Boolean).join(' • ');
  if (typeof value === 'object') return Object.entries(value as Record<string,unknown>).filter(([key])=>!OMIT_KEYS.has(key)).map(([key,item])=>{
    const rendered=stringifyClinical(item);return rendered?`${key}: ${rendered}`:'';
  }).filter(Boolean).join(' | ');
  return '';
};
const DATE_KEYS = ['timestamp','date','admissionDate','orderedAt','requestedAt','dueDateTime','dateIdentified','startDate','createdAt','completedAt','availableAt','reviewedAt','acknowledgedAt','updatedAt','resolvedDate','orderDate','collectionUpdatedAt'] as const;
export const dateOf = (record: any): string | undefined => {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of DATE_KEYS) {
    const raw = record[key];
    const candidate = key === 'date' && typeof raw === 'string' && record.time
      ? `${raw} ${record.time}` : raw;
    const parsed = parseClinicalDate(candidate);
    if (parsed) return parsed.timestamp;
  }
  return undefined;
};
const records = (value: any): any[] => Array.isArray(value)?value:[value];

/** Extract selected report content once. Records without a parseable date remain explicitly undated. */
export const buildPdfTimeline = (p: any, selected: string[]): PdfTimelineEvent[] => {
  const events: PdfTimelineEvent[]=[];
  const add=(timestamp:unknown,type:string,title:string,details:unknown,source:string)=>{
    const body=stringifyClinical(details);if(!body)return;
    events.push({timestamp:typeof timestamp==='string'&&validTime(timestamp)!==null?timestamp:undefined,type,title,details:body,source});
  };
  for(const section of selected){
    if(section==='labs'){
      aggregateLabResults(p).forEach(analyte=>analyte.results.forEach(result=>{
        const flag=result.flag||result.status||'';
        add(result.timestamp,'Laboratory',analyte.name,[result.value,result.unit,flag&&`Flag: ${flag}`].filter(value=>value!==undefined&&value!==null&&value!=='').join(' '),'labs');
      }));
      continue;
    }
    for(const [label,key] of SECTION_SOURCES[section]||[]){
      const value=key==='admission'?{admissionDate:p.admissionDate,admissionTime:p.admissionTime,unit:p.unitId,bed:p.bedNumber}:key==='diagnosis'?{primaryDiagnosis:p.primaryDiagnosis||p.diagnosis,secondaryDiagnoses:p.secondaryDiagnoses,additionalConditions:p.additionalConditions}:p[key];
      records(value).forEach(record=>{
        if(record==null)return;
        const title=record.type||record.title||record.eventType||record.parameter||record.name||label;
        add(dateOf(record),label,String(title),record,section);
      });
    }
    if(section==='history'){
      // Include standalone patient-level allergy and diagnosis history as part of the selected clinical history.
      add(undefined,'History','Allergies',p.allergies,'history');
      add(undefined,'History','Current diagnoses',[p.primaryDiagnosis||p.diagnosis,...(p.secondaryDiagnoses||[])].filter(Boolean),'history');
    }
  }
  return events.map((event,index)=>({...event,_index:index})).sort((a,b)=>{
    const ta=validTime(a.timestamp),tb=validTime(b.timestamp);
    return ta===null?(tb===null?a._index-b._index:1):tb===null?-1:ta-tb||a._index-b._index;
  }).map(({_index,...event})=>event);
};
