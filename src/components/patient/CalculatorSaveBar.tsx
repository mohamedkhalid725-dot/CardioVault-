import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Patient, CalculatorResult } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import { useIsPreviousViewer } from './PreviousAdmissionViewer';

const calculators = [
  ['cha2ds2-vasc', 'CHA2DS2-VASc'], ['has-bled', 'HAS-BLED'], ['heart-score', 'HEART Score'],
  ['timi-nstemi', 'TIMI Risk Score (UA/NSTEMI)'], ['killip-class', 'Killip Classification'],
  ['qtc-calc', 'QTc Corrected'], ['sofa-score', 'SOFA Score'], ['qsofa', 'qSOFA'], ['news2', 'NEWS2'],
  ['gcs-calc', 'Glasgow Coma Scale (GCS)'], ['vent-mechanics', 'Ventilator Mechanics'],
  ['winter-abg', "Systematic ABG & Winter's Formula"], ['map-hemodynamics', 'MAP & Hemodynamic Indices'],
  ['infusion-rate', 'Vasopressor & Infusion Rate'], ['crcl-calc', 'Creatinine Clearance & eGFR'],
  ['corrected-na-ca', 'Corrected Sodium & Calcium'], ['fena-calc', 'FENa & Free Water Deficit'],
] as const;

const riskFromInterpretation = (text: string): CalculatorResult['riskLevel'] => {
  if (/critical/i.test(text)) return 'Critical';
  if (/very high/i.test(text)) return 'Very High';
  if (/high/i.test(text)) return 'High';
  if (/intermediate|moderate/i.test(text)) return 'Intermediate';
  if (/low/i.test(text)) return 'Low';
  return 'Normal';
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const CalculatorSaveBar: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const isPreviousViewer = useIsPreviousViewer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>(calculators[0][0]);
  const [score, setScore] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [inputsSummary, setInputsSummary] = useState('');

  const selected = calculators.find((x) => x[0] === name)?.[1] || name;
  const saved = patient.calculatorResults || [];

  const reset = () => { setScore(''); setInterpretation(''); setInputsSummary(''); setOpen(false); };

  const save = () => {
    if (isPreviousViewer) return;
    if (!score.trim()) return;
    const n = Number(score);
    const interp = interpretation.trim() || 'Saved clinical score';
    const result: CalculatorResult = {
      id: `calc-${Date.now()}`,
      calculatorId: name,
      name: selected,
      timestamp: new Date().toISOString(),
      score: Number.isFinite(n) && score.trim() !== '' ? n : score.trim(),
      riskLevel: riskFromInterpretation(interp),
      interpretation: interp,
      summary: inputsSummary.trim()
        ? `${selected}: ${score.trim()} (${inputsSummary.trim()})`
        : `${selected}: ${score.trim()}`,
    };
    updatePatient(patient.id, { calculatorResults: [...saved, result] });
    showToast(`${selected} saved to the patient file.`, 'success');
    reset();
  };

  const remove = (id: string) => {
    if (isPreviousViewer) return;
    if (!window.confirm('Delete this saved calculator result?')) return;
    updatePatient(patient.id, { calculatorResults: saved.filter((r) => r.id !== id) });
    showToast('Saved result deleted.', 'info');
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
        <div>
          <div className="text-xs font-extrabold text-slate-900 dark:text-white">Clinical Calculators</div>
          <div className="text-[10px] text-slate-400">Add a calculator result — it is saved into this patient file and listed below.</div>
        </div>
        {!isPreviousViewer && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />Add calculator
          </button>
        )}
      </div>

      {saved.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          No calculator results saved yet. Use <b>Add calculator</b> to pick one, fill in the inputs, and save it here.
        </div>
      ) : (
        <div className="space-y-2">
          {[...saved].reverse().map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {r.name}: {String(r.score)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {formatWhen(r.timestamp)} • {r.riskLevel}
                </div>
                {r.interpretation && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{r.interpretation}</p>}
                {r.summary && r.summary !== `${r.name}: ${String(r.score)}` && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.summary}</p>
                )}
              </div>
              {!isPreviousViewer && (
                <button onClick={() => remove(r.id)} className="p-2 text-rose-500 shrink-0" aria-label="Delete saved result">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && !isPreviousViewer && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">Add calculator</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 mt-4">
              <label className="block text-xs font-semibold text-slate-500">
                Calculator
                <select
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-normal"
                >
                  {calculators.map((x) => (
                    <option key={x[0]} value={x[0]}>{x[1]}</option>
                  ))}
                </select>
              </label>
              <input
                autoFocus
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Result / score (e.g. 3, 480 ms, 1.2%)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              />
              <input
                value={inputsSummary}
                onChange={(e) => setInputsSummary(e.target.value)}
                placeholder="Inputs used (optional, e.g. Age 65, HTN, DM)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              />
              <input
                value={interpretation}
                onChange={(e) => setInterpretation(e.target.value)}
                placeholder="Interpretation (optional)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              />
              <button
                onClick={save}
                disabled={!score.trim()}
                className="w-full py-2.5 rounded-xl bg-cyan-500 disabled:opacity-40 text-slate-950 text-xs font-bold"
              >
                Add to Patient File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
