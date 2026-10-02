import React, { useState } from 'react';
import { Clock, Heart, Save, Check, ShieldAlert, Pill, Scissors, FileText } from 'lucide-react';
import { Patient, CardiovascularHistory, ClinicalSummary } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { SectionQuickRecordButton } from '../SectionQuickRecordButton';

interface Props {
  patient: Patient;
}

export const HistorySection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<ClinicalSummary>({
    ...(patient.clinicalSummary || {
      chiefComplaint: '',
      hpi: '',
      pmh: [],
      psh: [],
      drugHistory: '',
      allergies: [],
      familyHistory: '',
      socialHistory: '',
    }),
  });
  const [allergiesText, setAllergiesText] = useState<string>(
    Array.isArray(patient.allergies) ? patient.allergies.join(', ') : ''
  );
  const [cv, setCv] = useState<CardiovascularHistory>({
    ...(patient.cardiovascularHistory || ({} as CardiovascularHistory)),
  });

  const factors: Array<{ key: keyof CardiovascularHistory; label: string }> = [
    { key: 'hypertension', label: 'Hypertension' },
    { key: 'diabetes', label: 'Diabetes Mellitus' },
    { key: 'dyslipidemia', label: 'Dyslipidemia' },
    { key: 'cad', label: 'Coronary Artery Disease (CAD)' },
    { key: 'previousMI', label: 'Previous Myocardial Infarction' },
    { key: 'heartFailure', label: 'Heart Failure' },
    { key: 'arrhythmias', label: 'Arrhythmias / AF' },
    { key: 'valvularDisease', label: 'Valvular Heart Disease' },
    { key: 'previousPCI', label: 'Previous PCI / Stenting' },
    { key: 'previousCABG', label: 'Previous CABG Surgery' },
    { key: 'previousStroke', label: 'Previous Stroke / TIA' },
    { key: 'pvd', label: 'Peripheral Vascular Disease (PVD)' },
    { key: 'smoking', label: 'Tobacco / Smoking History' },
    { key: 'alcohol', label: 'Alcohol Intake' },
  ];

  const save = () => {
    const allergyList = allergiesText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    updatePatient(patient.id, {
      clinicalSummary: summary,
      cardiovascularHistory: cv,
      allergies: allergyList.length > 0 ? allergyList : ['NKDA'],
    });
    setEditing(false);
    showToast('Clinical History updated successfully', 'success');
  };

  const handleApplyVoice = (
    fieldKey: 'chiefComplaint' | 'hpi' | 'pmh' | 'psh' | 'drugHistory' | 'familyHistory' | 'socialHistory' | 'allergies',
    medicalText: string,
    mode: 'replace' | 'append'
  ) => {
    if (fieldKey === 'allergies') {
      const existing = allergiesText.trim();
      const updated = mode === 'append' && existing ? `${existing}, ${medicalText}` : medicalText;
      setAllergiesText(updated);
      const allergyList = updated
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      updatePatient(patient.id, {
        allergies: allergyList.length > 0 ? allergyList : ['NKDA'],
      });
      return;
    }

    if (fieldKey === 'pmh' || fieldKey === 'psh') {
      const existingArray = summary[fieldKey] || [];
      const updated =
        mode === 'append' && existingArray.length > 0
          ? [...existingArray, medicalText]
          : [medicalText];
      const newSummary = { ...summary, [fieldKey]: updated };
      setSummary(newSummary);
      updatePatient(patient.id, { clinicalSummary: newSummary });
      return;
    }

    const existingText = String((summary as any)[fieldKey] || '').trim();
    const updatedText =
      mode === 'append' && existingText ? `${existingText}\n\n${medicalText}` : medicalText;
    const newSummary = { ...summary, [fieldKey]: updatedText };
    setSummary(newSummary);
    updatePatient(patient.id, { clinicalSummary: newSummary });
  };

  const textClass =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-500" /> Patient Medical & Cardiovascular History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Comprehensive anamnesis with field-level contextual AI Quick Record
          </p>
        </div>
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
            editing ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-cyan-500 text-slate-950 shadow-cyan-500/20'
          }`}
        >
          {editing ? (
            <>
              <Check className="w-4 h-4" /> Save Changes
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Edit History
            </>
          )}
        </button>
      </div>

      {/* Cardiovascular Risk Factors Grid */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500" /> Cardiovascular & Atherosclerotic Risk Profile
        </h3>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-2">
          {factors.map(f => {
            const present = Boolean(cv[f.key]);
            return (
              <button
                key={f.key}
                type="button"
                disabled={!editing}
                onClick={() => setCv(p => ({ ...p, [f.key]: !p[f.key] }))}
                className={`min-h-11 w-full flex items-start gap-2 p-3 rounded-xl text-[11px] sm:text-xs leading-tight font-semibold text-left border transition-all ${
                  present
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <span
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded-md border flex items-center justify-center ${
                    present ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-400'
                  }`}
                >
                  {present && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 break-words">{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contextual Clinical History Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Chief Complaint */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Chief Complaint
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="chiefComplaint"
              contextLabel="Chief Complaint"
              currentValue={summary.chiefComplaint || ''}
              onApply={(text, mode) => handleApplyVoice('chiefComplaint', text, mode)}
            />
          </div>
          {editing ? (
            <input
              value={summary.chiefComplaint || ''}
              onChange={e => setSummary({ ...summary, chiefComplaint: e.target.value })}
              className={textClass}
              placeholder="e.g. Acute crushing chest pain x 2 hours"
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {summary.chiefComplaint || 'Not documented.'}
            </p>
          )}
        </div>

        {/* 2. Drug History / Home Medications */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Drug History / Home Medications
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="drugHistory"
              contextLabel="Drug History"
              currentValue={summary.drugHistory || ''}
              onApply={(text, mode) => handleApplyVoice('drugHistory', text, mode)}
            />
          </div>
          {editing ? (
            <textarea
              rows={2}
              value={summary.drugHistory || ''}
              onChange={e => setSummary({ ...summary, drugHistory: e.target.value })}
              className={textClass}
              placeholder="e.g. Aspirin 81mg daily, Atorvastatin 40mg at bedtime"
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {summary.drugHistory || 'Not documented.'}
            </p>
          )}
        </div>

        {/* 3. History of Present Illness (HPI) — Full width */}
        <div className="md:col-span-2 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              History of Present Illness (HPI)
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="hpi"
              contextLabel="History / HPI"
              currentValue={summary.hpi || ''}
              onApply={(text, mode) => handleApplyVoice('hpi', text, mode)}
            />
          </div>
          {editing ? (
            <textarea
              rows={4}
              value={summary.hpi || ''}
              onChange={e => setSummary({ ...summary, hpi: e.target.value })}
              className={textClass}
              placeholder="Detailed narrative chronology of presenting symptoms and acute evolution..."
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {summary.hpi || 'Not documented.'}
            </p>
          )}
        </div>

        {/* 4. Past Medical History (PMH) */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Past Medical History (PMH)
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="pmh"
              contextLabel="Past Medical History"
              currentValue={Array.isArray(summary.pmh) ? summary.pmh.join(', ') : String(summary.pmh || '')}
              onApply={(text, mode) => handleApplyVoice('pmh', text, mode)}
            />
          </div>
          {editing ? (
            <textarea
              rows={2}
              value={Array.isArray(summary.pmh) ? summary.pmh.join(', ') : String(summary.pmh || '')}
              onChange={e =>
                setSummary({
                  ...summary,
                  pmh: e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
              className={textClass}
              placeholder="e.g. Type 2 DM, HTN, Dyslipidemia, CKD stage 3"
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {Array.isArray(summary.pmh) && summary.pmh.length > 0
                ? summary.pmh.join(' • ')
                : typeof summary.pmh === 'string' && summary.pmh
                  ? summary.pmh
                  : 'Not documented.'}
            </p>
          )}
        </div>

        {/* 5. Past Surgical History (PSH) */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Past Surgical History (PSH)
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="psh"
              contextLabel="Past Surgical History"
              currentValue={Array.isArray(summary.psh) ? summary.psh.join(', ') : String(summary.psh || '')}
              onApply={(text, mode) => handleApplyVoice('psh', text, mode)}
            />
          </div>
          {editing ? (
            <textarea
              rows={2}
              value={Array.isArray(summary.psh) ? summary.psh.join(', ') : String(summary.psh || '')}
              onChange={e =>
                setSummary({
                  ...summary,
                  psh: e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
              className={textClass}
              placeholder="e.g. PCI with DES to LAD 2022, Appendectomy 2010"
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {Array.isArray(summary.psh) && summary.psh.length > 0
                ? summary.psh.join(' • ')
                : typeof summary.psh === 'string' && summary.psh
                  ? summary.psh
                  : 'Not documented.'}
            </p>
          )}
        </div>

        {/* 6. Allergies */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Allergies & Adverse Drug Reactions
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="allergies"
              contextLabel="Allergies"
              currentValue={allergiesText}
              onApply={(text, mode) => handleApplyVoice('allergies', text, mode)}
            />
          </div>
          {editing ? (
            <input
              value={allergiesText}
              onChange={e => setAllergiesText(e.target.value)}
              className={textClass}
              placeholder="e.g. Penicillin (anaphylaxis), Contrast Media (rash)"
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {allergiesText || 'NKDA (No known drug allergies)'}
            </p>
          )}
        </div>

        {/* 7. Family History */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Family History
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="history"
              contextLabel="Family History"
              currentValue={summary.familyHistory || ''}
              onApply={(text, mode) => handleApplyVoice('familyHistory', text, mode)}
            />
          </div>
          {editing ? (
            <input
              value={summary.familyHistory || ''}
              onChange={e => setSummary({ ...summary, familyHistory: e.target.value })}
              className={textClass}
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {summary.familyHistory || 'Not documented.'}
            </p>
          )}
        </div>

        {/* 8. Social History & Habitus */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Social History & Habitus
            </label>
            <SectionQuickRecordButton
              patient={patient}
              context="history"
              contextLabel="Social History"
              currentValue={summary.socialHistory || ''}
              onApply={(text, mode) => handleApplyVoice('socialHistory', text, mode)}
            />
          </div>
          {editing ? (
            <input
              value={summary.socialHistory || ''}
              onChange={e => setSummary({ ...summary, socialHistory: e.target.value })}
              className={textClass}
            />
          ) : (
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {summary.socialHistory || 'Not documented.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
