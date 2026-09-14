import React, { useMemo, useState } from 'react';
import { FlaskConical, Plus, Trash2, X } from 'lucide-react';
import { LabResult, Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface Props { patient: Patient; }
type TestDef = { name: string; unit: string; min?: number; max?: number; referenceRange?: string };
const defs = (items: Array<[string, string, number?, number?]>): TestDef[] =>
  items.map(([name, unit, min, max]) => ({ name, unit, min, max }));

const TESTS: Record<string, TestDef[]> = {
  CBC: defs([
    ['Hemoglobin','g/dL',13,17.5],['Hematocrit','%',40,52],['RBC','10^6/µL',4.5,6],['WBC','10^3/µL',4,11],
    ['Platelets','10^3/µL',150,400],['MCV','fL',80,100],['MCH','pg',27,33],['MCHC','g/dL',32,36],['RDW','%',11.5,14.5],
    ['Neutrophils','%',40,75],['Lymphocytes','%',20,45],['Monocytes','%',2,10],['Eosinophils','%',1,6],['Basophils','%',0,2]
  ]),
  Chemistry: defs([
    ['Sodium','mmol/L',135,145],['Potassium','mmol/L',3.5,5.1],['Chloride','mmol/L',98,107],['Bicarbonate / HCO3','mmol/L',22,29],
    ['Urea / BUN','mg/dL',7,20],['Creatinine','mg/dL',0.6,1.3],['Glucose','mg/dL',70,99],['Calcium','mg/dL',8.5,10.5],
    ['Magnesium','mg/dL',1.7,2.2],['Phosphate','mg/dL',2.5,4.5],['Uric Acid','mg/dL',3.5,7.2],['Serum Osmolality','mOsm/kg',275,295],
    ['Lactate','mmol/L',0.5,2.2],['AST','U/L',10,40],['ALT','U/L',7,56],['ALP','U/L',44,147],['GGT','U/L',8,61],
    ['Bilirubin Total','mg/dL',0.1,1.2],['Bilirubin Direct','mg/dL',0,0.3],['Albumin','g/dL',3.5,5],['Total Protein','g/dL',6,8.3]
  ]),
  'Coagulation Profile': defs([
    ['PT','sec',11,14],['INR','ratio',0.8,1.2],['aPTT','sec',25,35],['Fibrinogen','mg/dL',200,400],['D-Dimer','mg/L FEU',0,0.5],['Anti-Xa','IU/mL']
  ]),
  'Cardiac Markers': defs([['High-sensitivity Troponin','ng/L'],['CK','U/L'],['CK-MB','ng/mL'],['BNP','pg/mL'],['NT-proBNP','pg/mL'],['Myoglobin','ng/mL']]),
  'Lipid Profile': defs([['Total Cholesterol','mg/dL'],['LDL-C','mg/dL'],['HDL-C','mg/dL'],['Triglycerides','mg/dL'],['Non-HDL Cholesterol','mg/dL'],['Lipoprotein(a)','mg/dL']]),
  Diabetes: defs([['HbA1c','%'],['Fasting Glucose','mg/dL'],['Random Glucose','mg/dL'],['C-Peptide','ng/mL'],['Beta-hydroxybutyrate','mmol/L']]),
  'Liver Profile': defs([['AST','U/L'],['ALT','U/L'],['ALP','U/L'],['GGT','U/L'],['Total Bilirubin','mg/dL'],['Direct Bilirubin','mg/dL'],['Albumin','g/dL'],['Total Protein','g/dL'],['Ammonia','µmol/L']]),
  Thyroid: defs([['TSH','mIU/L'],['Free T4','ng/dL'],['Free T3','pg/mL'],['Total T4','µg/dL'],['Thyroid Peroxidase Ab','IU/mL']]),
  'Inflammatory / Infection': defs([['CRP','mg/L'],['hs-CRP','mg/L'],['ESR','mm/hr'],['Procalcitonin','ng/mL'],['Ferritin','ng/mL'],['IL-6','pg/mL'],['Blood Culture','result'],['Urine Culture','result'],['Sputum Culture','result']]),
  'Iron / Vitamins': defs([['Serum Iron','µg/dL'],['Ferritin','ng/mL'],['TIBC','µg/dL'],['Transferrin Saturation','%'],['Vitamin B12','pg/mL'],['Folate','ng/mL'],['25-OH Vitamin D','ng/mL']]),
  'Pancreatic / Muscle': defs([['Amylase','U/L'],['Lipase','U/L'],['LDH','U/L'],['CK Total','U/L'],['CK-MB','ng/mL']]),
  Endocrine: defs([['Cortisol','µg/dL'],['ACTH','pg/mL'],['PTH','pg/mL'],['Prolactin','ng/mL']]),
  Urinalysis: defs([['Urine pH',''],['Urine Specific Gravity',''],['Protein','result'],['Glucose','result'],['Ketones','result'],['Blood','result'],['Nitrite','result'],['Leukocyte Esterase','result']]),
  'ABG / Critical Care': defs([['pH',''],['PaCO2','mmHg'],['PaO2','mmHg'],['HCO3','mmol/L'],['Base Excess','mmol/L'],['Lactate','mmol/L']]),
  'Electrolytes / Renal': defs([['Ionized Calcium','mmol/L'],['Urine Sodium','mmol/L'],['Urine Creatinine','mg/dL'],['Urine Potassium','mmol/L'],['Urine Urea','mg/dL']]),
};

export const LabsSection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const labs = Array.isArray(patient.labResults) ? patient.labResults : [];
  const p = patient as Patient & { customLabTests?: string[]; customLabTestDefinitions?: TestDef[] };
  const customDefs = Array.isArray(p.customLabTestDefinitions) ? p.customLabTestDefinitions : [];
  const legacyCustom = Array.isArray(p.customLabTests) ? p.customLabTests.filter(x => typeof x === 'string') : [];
  const customNames = useMemo(() => Array.from(new Set([...legacyCustom, ...customDefs.map(x => x.name)])), [legacyCustom.join('|'), customDefs]);

  const [panel, setPanel] = useState('CBC');
  const [filter, setFilter] = useState('All');
  const [selectedTest, setSelectedTest] = useState(TESTS.CBC[0].name);
  const [selectedDef, setSelectedDef] = useState<TestDef>(TESTS.CBC[0]);
  const [showLog, setShowLog] = useState(false);
  const [showAddTest, setShowAddTest] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState(TESTS.CBC[0].unit);
  const [referenceRange, setReferenceRange] = useState('13 - 17.5');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newRef, setNewRef] = useState('');

  const panels = ['All', ...Object.keys(TESTS)];
  const filtered = filter === 'All' ? labs : labs.filter(x => (x.panel || '').toLowerCase() === filter.toLowerCase());

  const applyDef = (def: TestDef, isCustom = false) => {
    setSelectedTest(def.name); setSelectedDef(def); setUnit(def.unit || '');
    setReferenceRange(def.referenceRange || (def.min !== undefined && def.max !== undefined ? `${def.min} - ${def.max}` : ''));
    if (isCustom) setPanel('Custom Lab');
  };

  const changePanel = (next: string) => {
    setPanel(next); setFilter(next === 'All' ? 'All' : next);
    const first = TESTS[next]?.[0]; if (first) applyDef(first);
  };

  const chooseTest = (name: string) => {
    const def = (TESTS[panel] || []).find(x => x.name === name);
    if (def) { applyDef(def); return; }
    const custom = customDefs.find(x => x.name === name) || { name, unit: '', referenceRange: '' };
    applyDef(custom, true);
  };

  const logResult = () => {
    if (!selectedTest.trim() || !value.trim()) { showToast('Test name and result are required.', 'error'); return; }
    const numeric = Number(value); const bounds = referenceRange.split('-').map(x => Number(x.trim()));
    let flag = 'Normal';
    if (bounds.length === 2 && bounds.every(Number.isFinite) && Number.isFinite(numeric)) {
      if (numeric < bounds[0]) flag = 'Low'; else if (numeric > bounds[1]) flag = 'High';
    }
    const result: LabResult = {
      id: `lab-${Date.now()}`,
      panel: panel === 'Custom Lab' ? 'Custom Lab' : panel,
      testName: selectedTest,
      value: Number.isFinite(numeric) ? numeric : value,
      unit,
      referenceRange,
      flag,
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    updatePatient(patient.id, { labResults: [result, ...labs] });
    setValue(''); setShowLog(false); showToast('Lab result logged.', 'success');
  };

  const addCustomTest = () => {
    const name = newName.trim(); if (!name) { showToast('Enter a laboratory test name.', 'error'); return; }
    if (customNames.some(x => x.toLowerCase() === name.toLowerCase())) { showToast('This test name already exists.', 'error'); return; }
    const def = { name, unit: newUnit.trim(), referenceRange: newRef.trim() };
    updatePatient(patient.id, { customLabTests: [...customNames, name], customLabTestDefinitions: [...customDefs, def] } as Partial<Patient>);
    setNewName(''); setNewUnit(''); setNewRef(''); setShowAddTest(false); showToast('Custom laboratory test added.', 'success');
  };

  const deleteLab = (id?: string) => {
    if (!id || !window.confirm('Delete this laboratory result?')) return;
    updatePatient(patient.id, { labResults: labs.filter(x => x.id !== id) });
  };

  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><FlaskConical className="w-5 h-5 text-cyan-500" /> Laboratory Results</h2><p className="text-xs text-slate-500 dark:text-slate-400">Expanded ICU/CCU laboratory catalog with Custom Lab.</p></div>
      <div className="flex gap-2"><button onClick={() => setShowAddTest(true)} className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"><Plus className="inline w-4 h-4 mr-1 text-cyan-500" /> Add Custom Test</button><button onClick={() => setShowLog(true)} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Plus className="inline w-4 h-4 mr-1" /> Log Lab Result</button></div>
    </div>
    <div className="flex gap-2 overflow-x-auto no-scrollbar">{panels.map(x => <button key={x} onClick={() => setFilter(x)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${filter === x ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{x}</button>)}</div>
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 dark:bg-slate-900 text-slate-400"><tr>{['Timestamp','Panel','Test','Result','Reference Range','Flag',''].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{filtered.map(l => <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3 text-slate-400">{l.timestamp || '—'}</td><td className="p-3 font-semibold">{l.panel || 'Custom Lab'}</td><td className="p-3 font-bold text-slate-900 dark:text-white">{l.testName || l.name}</td><td className="p-3">{String(l.value)} {l.unit}</td><td className="p-3 text-slate-400">{l.referenceRange || '—'}</td><td className="p-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800">{l.flag || 'Normal'}</span></td><td className="p-3"><button onClick={() => deleteLab(l.id)} className="p-1.5 text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="p-10 text-center text-xs text-slate-400">No laboratory results recorded for this filter.</div>}</div>

    {showAddTest && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl p-5 border border-slate-200 dark:border-slate-800"><div className="flex justify-between"><div><h3 className="font-bold">Add Custom Laboratory Test</h3><p className="text-xs text-slate-400 mt-1">Name, unit and reference range are stored with the patient.</p></div><button onClick={() => setShowAddTest(false)}><X /></button></div><div className="space-y-3 mt-5"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Test name" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /><input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="Unit" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /><input value={newRef} onChange={e => setNewRef(e.target.value)} placeholder="Reference range" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /></div><div className="flex justify-end gap-2 mt-5"><button onClick={() => setShowAddTest(false)} className="px-4 py-2 text-xs">Cancel</button><button onClick={addCustomTest} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Add Test</button></div></div></div>}

    {showLog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-2xl p-5 border border-slate-200 dark:border-slate-800"><div className="flex justify-between"><div><h3 className="font-bold">Log Laboratory Result</h3><p className="text-xs text-slate-400 mt-1">Choose a panel and test, then enter the result.</p></div><button onClick={() => setShowLog(false)}><X /></button></div><div className="space-y-4 py-5"><label className="block text-xs font-semibold">Panel<select value={panel} onChange={e => changePanel(e.target.value)} className="w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2">{Object.keys(TESTS).map(x => <option key={x}>{x}</option>)}</select></label><div className="flex gap-2 flex-wrap">{(TESTS[panel] || []).map(t => <button key={t.name} onClick={() => chooseTest(t.name)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${selectedTest === t.name ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800'}`}>{t.name}</button>)}{customNames.map(t => <button key={`custom-${t}`} onClick={() => chooseTest(t)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${selectedTest === t && panel === 'Custom Lab' ? 'bg-cyan-500 text-slate-950' : 'bg-emerald-500/10 text-emerald-600'}`}>{t}</button>)}</div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold col-span-2">Result<input autoFocus value={value} onChange={e => setValue(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /></label><label className="text-xs font-semibold">Unit<input value={unit} onChange={e => setUnit(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /></label><label className="text-xs font-semibold">Reference Range<input value={referenceRange} onChange={e => setReferenceRange(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /></label></div></div><div className="flex justify-end gap-2"><button onClick={() => setShowLog(false)} className="px-4 py-2 text-xs">Cancel</button><button onClick={logResult} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save Result</button></div></div></div>}
  </div>;
};
