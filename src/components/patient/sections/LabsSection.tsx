import React,{useMemo,useState} from 'react';
import {FlaskConical,Plus,Trash2,X,ChevronDown,ChevronUp} from 'lucide-react';
import {LabResult,Patient} from '../../../types/clinical';
import {useApp} from '../../../context/AppContext';

interface Props{patient:Patient}
type TestDef={name:string;unit:string;min?:number;max?:number;referenceRange?:string};
type PatientLabs=Patient&{customLabTests?:string[];customLabTestDefinitions?:TestDef[]};

const defs=(a:Array<[string,string,number?,number?]>):TestDef[]=>a.map(([name,unit,min,max])=>({name,unit,min,max}));
const TESTS:Record<string,TestDef[]>={
  CBC:defs([['Hemoglobin','g/dL',13,17.5],['Hematocrit','%',40,52],['RBC','10^6/µL',4.5,6],['WBC','10^3/µL',4,11],['Platelets','10^3/µL',150,400],['MCV','fL',80,100],['MCH','pg',27,33],['MCHC','g/dL',32,36],['RDW','%',11.5,14.5],['Neutrophils','%',40,75],['Lymphocytes','%',20,45],['Monocytes','%',2,10],['Eosinophils','%',1,6],['Basophils','%',0,2]]),
  Chemistry:defs([['Sodium','mmol/L',135,145],['Potassium','mmol/L',3.5,5.1],['Chloride','mmol/L',98,107],['Bicarbonate / HCO3','mmol/L',22,29],['Urea / BUN','mg/dL',7,20],['Creatinine','mg/dL',.6,1.3],['Glucose','mg/dL',70,99],['Calcium','mg/dL',8.5,10.5],['Magnesium','mg/dL',1.7,2.2],['Phosphate','mg/dL',2.5,4.5],['Uric Acid','mg/dL',3.5,7.2],['Serum Osmolality','mOsm/kg',275,295],['Lactate','mmol/L',.5,2.2],['AST','U/L',10,40],['ALT','U/L',7,56],['ALP','U/L',44,147],['GGT','U/L',8,61],['Bilirubin Total','mg/dL',.1,1.2],['Bilirubin Direct','mg/dL',0,.3],['Albumin','g/dL',3.5,5],['Total Protein','g/dL',6,8.3]]),
  'Coagulation Profile':defs([['PT','sec',11,14],['INR','ratio',.8,1.2],['aPTT','sec',25,35],['Fibrinogen','mg/dL',200,400],['D-Dimer','mg/L FEU',0,.5],['Anti-Xa','IU/mL']]),
  'Cardiac Markers':defs([['High-sensitivity Troponin','ng/L'],['CK','U/L'],['CK-MB','ng/mL'],['BNP','pg/mL'],['NT-proBNP','pg/mL'],['Myoglobin','ng/mL']]),
  'Lipid Profile':defs([['Total Cholesterol','mg/dL'],['LDL-C','mg/dL'],['HDL-C','mg/dL'],['Triglycerides','mg/dL'],['Non-HDL Cholesterol','mg/dL'],['Lipoprotein(a)','mg/dL']]),
  Diabetes:defs([['HbA1c','%'],['Fasting Glucose','mg/dL'],['Random Glucose','mg/dL'],['C-Peptide','ng/mL'],['Beta-hydroxybutyrate','mmol/L']]),
  'Liver Profile':defs([['AST','U/L'],['ALT','U/L'],['ALP','U/L'],['GGT','U/L'],['Total Bilirubin','mg/dL'],['Direct Bilirubin','mg/dL'],['Albumin','g/dL'],['Total Protein','g/dL'],['Ammonia','µmol/L']]),
  Thyroid:defs([['TSH','mIU/L'],['Free T4','ng/dL'],['Free T3','pg/mL'],['Total T4','µg/dL'],['Thyroid Peroxidase Ab','IU/mL']]),
  'Inflammatory / Infection':defs([['CRP','mg/L'],['hs-CRP','mg/L'],['ESR','mm/hr'],['Procalcitonin','ng/mL'],['Ferritin','ng/mL'],['IL-6','pg/mL'],['Blood Culture','result'],['Urine Culture','result'],['Sputum Culture','result']]),
  'Iron / Vitamins':defs([['Serum Iron','µg/dL'],['Ferritin','ng/mL'],['TIBC','µg/dL'],['Transferrin Saturation','%'],['Vitamin B12','pg/mL'],['Folate','ng/mL'],['25-OH Vitamin D','ng/mL']]),
  'Pancreatic / Muscle':defs([['Amylase','U/L'],['Lipase','U/L'],['LDH','U/L'],['CK Total','U/L'],['CK-MB','ng/mL']]),
  Endocrine:defs([['Cortisol','µg/dL'],['ACTH','pg/mL'],['PTH','pg/mL'],['Prolactin','ng/mL']]),
  Urinalysis:defs([['Urine pH',''],['Urine Specific Gravity',''],['Protein','result'],['Glucose','result'],['Ketones','result'],['Blood','result'],['Nitrite','result'],['Leukocyte Esterase','result']]),
  'ABG / Critical Care':defs([['pH',''],['PaCO2','mmHg'],['PaO2','mmHg'],['HCO3','mmol/L'],['Base Excess','mmol/L'],['Lactate','mmol/L']]),
  'Electrolytes / Renal':defs([['Ionized Calcium','mmol/L'],['Urine Sodium','mmol/L'],['Urine Creatinine','mg/dL'],['Urine Potassium','mmol/L'],['Urine Urea','mg/dL']])
};

const normalize=(s:string='')=>s.trim().toLowerCase().replace(/\s+/g,' ');
const flagStyle=(f:string)=>f==='High'?'border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30':f==='Low'?'border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30':'border-slate-200 bg-white dark:bg-[#111C2E] dark:border-slate-800';
const valueStyle=(f:string)=>f==='High'?'text-rose-600 dark:text-rose-300':f==='Low'?'text-amber-600 dark:text-amber-300':'text-slate-900 dark:text-white';
const badgeStyle=(f:string)=>f==='High'?'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300':f==='Low'?'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300':'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';

export const LabsSection:React.FC<Props>=({patient})=>{
  const {updatePatient,showToast}=useApp();
  const p=patient as PatientLabs;
  const labs=Array.isArray(patient.labResults)?patient.labResults:[];
  const customDefs=Array.isArray(p.customLabTestDefinitions)?p.customLabTestDefinitions:[];
  const legacy=Array.isArray(p.customLabTests)?p.customLabTests.filter(Boolean):[];
  const customNames=useMemo(()=>Array.from(new Set([...legacy,...customDefs.map(x=>x.name).filter(Boolean)])),[legacy.join('|'),customDefs]);

  const [filter,setFilter]=useState('All');
  const [panel,setPanel]=useState('CBC');
  const [selectedTest,setSelectedTest]=useState('Hemoglobin');
  const [unit,setUnit]=useState('g/dL');
  const [referenceRange,setReferenceRange]=useState('13 - 17.5');
  const [value,setValue]=useState('');
  const [showLog,setShowLog]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [newName,setNewName]=useState('');
  const [newUnit,setNewUnit]=useState('');
  const [newRef,setNewRef]=useState('');
  const [openHistory,setOpenHistory]=useState<Record<string,boolean>>({});

  const panels=['All',...Object.keys(TESTS)];
  const filtered=filter==='All'?labs:labs.filter(x=>(x.panel||'').toLowerCase()===filter.toLowerCase());
  const groups=useMemo(()=>{
    const map=new Map<string,LabResult[]>();
    for(const lab of filtered){
      const key=normalize(lab.testName||lab.name||'Laboratory Test');
      if(!map.has(key))map.set(key,[]);
      map.get(key)!.push(lab);
    }
    return Array.from(map.entries()).map(([key,items])=>{
      const ordered=[...items].sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')));
      return {key,latest:ordered[0],history:ordered.slice(1)};
    });
  },[filtered]);

  const applyDef=(d:TestDef)=>{setSelectedTest(d.name);setUnit(d.unit||'');setReferenceRange(d.referenceRange||(d.min!==undefined&&d.max!==undefined?`${d.min} - ${d.max}`:''));};
  const choosePanel=(next:string)=>{
    setPanel(next);
    setFilter(next==='All'?'All':next);
    if(TESTS[next]?.[0])applyDef(TESTS[next][0]);
    else if(next==='Custom Lab'&&customDefs[0])applyDef(customDefs[0]);
    else if(next==='Custom Lab'&&customNames[0]){setSelectedTest(customNames[0]);setUnit('');setReferenceRange('');}
  };
  const chooseTest=(name:string)=>{
    const d=(TESTS[panel]||[]).find(x=>x.name===name)||customDefs.find(x=>normalize(x.name)===normalize(name))||{name,unit:'',referenceRange:''};
    applyDef(d);
  };
  const openLog=()=>{setShowLog(true);if(panel==='All')choosePanel('CBC');};

  const logResult=()=>{
    const name=selectedTest.trim();
    if(!name||!value.trim()){showToast('Test name and result are required.','error');return;}
    const n=Number(value);
    const bounds=referenceRange.split(/\s*(?:-|–|to)\s*/).map(Number);
    let flag:'Normal'|'Low'|'High'='Normal';
    if(bounds.length===2&&bounds.every(Number.isFinite)&&Number.isFinite(n)){if(n<bounds[0])flag='Low';else if(n>bounds[1])flag='High';}
    const existing=labs.find(l=>normalize(l.testName||l.name)===normalize(name));
    const r:LabResult={id:`lab-${Date.now()}`,panel:panel==='All'||panel==='Custom Lab'?'Custom Lab':panel,testName:name,value:Number.isFinite(n)?n:value,unit,referenceRange,flag,timestamp:new Date().toISOString().slice(0,16).replace('T',' ')};
    updatePatient(patient.id,{labResults:[r,...labs]});
    setOpenHistory(h=>({...h,[normalize(name)]:true}));
    setValue('');setShowLog(false);
    showToast(existing?'New value added to the existing test history.':'Lab result logged.','success');
  };

  const addCustom=()=>{
    const name=newName.trim();
    if(!name){showToast('Enter a laboratory test name.','error');return;}
    if(customNames.some(x=>normalize(x)===normalize(name))){showToast('This test name already exists.','error');return;}
    const d={name,unit:newUnit.trim(),referenceRange:newRef.trim()};
    updatePatient(patient.id,{customLabTests:[...customNames,name],customLabTestDefinitions:[...customDefs,d]} as Partial<Patient>);
    setNewName('');setNewUnit('');setNewRef('');setShowAdd(false);showToast('Custom laboratory test added.','success');
  };

  const deleteLab=(id?:string)=>{if(!id||!window.confirm('Delete this laboratory result?'))return;updatePatient(patient.id,{labResults:labs.filter(x=>x.id!==id)});};

  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5 text-cyan-500"/>Laboratory Results</h2><p className="text-xs text-slate-500 dark:text-slate-400">Each test has one card. Repeated values are kept in the same card as history.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={()=>setShowAdd(true)} className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"><Plus className="inline w-4 h-4 mr-1 text-cyan-500"/>Add Custom Test</button><button onClick={openLog} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Plus className="inline w-4 h-4 mr-1"/>Log Lab Result</button></div>
    </div>
    <div className="flex flex-wrap gap-2">{panels.map(x=><button key={x} onClick={()=>choosePanel(x)} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${filter===x?'bg-cyan-500 text-slate-950':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{x}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {groups.map(({key,latest,history})=>{const flag=latest.flag||'Normal';const expanded=!!openHistory[key];return <article key={key} className={`rounded-2xl border p-4 shadow-sm ${flagStyle(flag)}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{latest.panel||'Custom Lab'}</div><h3 className="text-base font-extrabold mt-1 break-words">{latest.testName||latest.name||'Laboratory Test'}</h3></div><button onClick={()=>deleteLab(latest.id)} className="p-2 rounded-lg text-rose-500"><Trash2 className="w-4 h-4"/></button></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3"><div className="text-slate-400">Latest Result</div><div className={`text-lg font-extrabold mt-1 break-words ${valueStyle(flag)}`}>{String(latest.value)} <span className="text-xs font-bold">{latest.unit||'—'}</span></div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3"><div className="text-slate-400">Reference range</div><div className="font-bold mt-1 break-words">{latest.referenceRange||'Not specified'}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3"><div className="text-slate-400">Latest timestamp</div><div className="font-semibold mt-1 break-words">{latest.timestamp||'Not recorded'}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3"><div className="text-slate-400">Latest status</div><div className={`font-extrabold mt-1 ${valueStyle(flag)}`}>{flag==='High'?'↑ HIGH':flag==='Low'?'↓ LOW':'✓ NORMAL'}</div></div></div>
        {history.length>0&&<><button onClick={()=>setOpenHistory(h=>({...h,[key]:!expanded}))} className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"><span>Previous values ({history.length})</span>{expanded?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}</button>{expanded&&<div className="mt-2 space-y-2">{history.map(h=><div key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3 text-xs"><div><div className="font-bold">{String(h.value)} {h.unit}</div><div className="text-slate-400 mt-0.5">{h.timestamp||'No timestamp'}</div></div><span className={`px-2 py-1 rounded-full text-[9px] font-extrabold ${badgeStyle(h.flag||'Normal')}`}>{h.flag||'Normal'}</span><button onClick={()=>deleteLab(h.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5"/></button></div>)}</div>}</>}
      </article>})}
    </div>
    {!groups.length&&<div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-xs text-slate-400">No laboratory results recorded for this filter.</div>}

    {showAdd&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl p-5 border border-slate-200 dark:border-slate-800"><div className="flex justify-between"><h3 className="font-bold">Add Custom Laboratory Test</h3><button onClick={()=>setShowAdd(false)}><X/></button></div><div className="space-y-3 mt-5"><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Test name" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/><input value={newUnit} onChange={e=>setNewUnit(e.target.value)} placeholder="Unit" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/><input value={newRef} onChange={e=>setNewRef(e.target.value)} placeholder="Reference range e.g. 10 - 20" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></div><div className="flex justify-end gap-2 mt-5"><button onClick={()=>setShowAdd(false)} className="px-4 py-2 text-xs">Cancel</button><button onClick={addCustom} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Add Test</button></div></div></div>}

    {showLog&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-2xl p-5 border border-slate-200 dark:border-slate-800"><div className="flex justify-between"><div><h3 className="font-bold">Log Laboratory Result</h3><p className="text-xs text-slate-400 mt-1">Adding the same test again updates its history instead of creating another card.</p></div><button onClick={()=>setShowLog(false)}><X/></button></div><div className="space-y-4 py-5"><select value={panel} onChange={e=>choosePanel(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">{Object.keys(TESTS).map(x=><option key={x}>{x}</option>)}<option value="Custom Lab">Custom Lab</option></select><select value={selectedTest} onChange={e=>chooseTest(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">{(TESTS[panel]||[]).map(x=><option key={x.name}>{x.name}</option>)}{customNames.map(x=><option key={`custom-${x}`}>{x}</option>)}</select><input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" placeholder="Result" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/><div className="grid grid-cols-2 gap-3"><input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="Unit" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/><input value={referenceRange} onChange={e=>setReferenceRange(e.target.value)} placeholder="Reference range" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></div></div><div className="flex justify-end gap-2"><button onClick={()=>setShowLog(false)} className="px-4 py-2 text-xs">Cancel</button><button onClick={logResult} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save Result</button></div></div></div>}
  </div>;
};
