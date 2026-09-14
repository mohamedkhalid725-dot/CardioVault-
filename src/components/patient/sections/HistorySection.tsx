import React, { useState } from 'react';
import { Clock, ShieldAlert, Heart, Cigarette, AlertCircle, Save, Check } from 'lucide-react';
import { Patient, CardiovascularHistory, ClinicalSummary } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface HistorySectionProps {
  patient: Patient;
}

export const HistorySection: React.FC<HistorySectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [isEditing, setIsEditing] = useState(false);

  const [summary, setSummary] = useState<ClinicalSummary>({ ...patient.clinicalSummary });
  const [cvHistory, setCvHistory] = useState<CardiovascularHistory>({
    ...patient.cardiovascularHistory,
  });

  const handleSave = () => {
    updatePatient(patient.id, {
      clinicalSummary: summary,
      cardiovascularHistory: cvHistory,
    });
    setIsEditing(false);
    showToast('Clinical History updated successfully', 'success');
  };

  const toggleCVFactor = (key: keyof CardiovascularHistory) => {
    if (!isEditing) return;
    setCvHistory((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const cvFactorsList: Array<{ key: keyof CardiovascularHistory; label: string }> = [
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-500" /> Patient Medical & Cardiovascular History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Comprehensive anamnesis and cardiovascular risk factors
          </p>
        </div>

        <button
          onClick={() => {
            if (isEditing) handleSave();
            else setIsEditing(true);
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
            isEditing
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
        >
          {isEditing ? (
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

      {/* Cardiovascular Risk Factors Grid (Checklist) */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500" /> Cardiovascular & Atherosclerotic Risk Profile
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isEditing
            ? 'Click each factor to toggle presence for this patient.'
            : 'Active positive indicators highlighted.'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-2">
          {cvFactorsList.map((factor) => {
            const isPresent = !!cvHistory[factor.key];
            return (
              <button
                key={factor.key}
                type="button"
                disabled={!isEditing}
                onClick={() => toggleCVFactor(factor.key)}
                className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-semibold text-left border transition-all ${
                  isPresent
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                } ${isEditing ? 'cursor-pointer hover:border-cyan-400' : 'cursor-default'}`}
              >
                <div
                  className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                    isPresent
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'border-slate-400 dark:border-slate-600'
                  }`}
                >
                  {isPresent && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className="truncate">{factor.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Narrative Anamnesis Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chief Complaint */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            Chief Complaint
          </label>
          {isEditing ? (
            <input
              type="text"
              value={summary.chiefComplaint}
              onChange={(e) => setSummary({ ...summary, chiefComplaint: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
            />
          ) : (
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {summary.chiefComplaint}
            </p>
          )}
        </div>

        {/* Drug History */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            Home Drug History
          </label>
          {isEditing ? (
            <input
              type="text"
              value={summary.drugHistory}
              onChange={(e) => setSummary({ ...summary, drugHistory: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
            />
          ) : (
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {summary.drugHistory || 'None reported'}
            </p>
          )}
        </div>

        {/* HPI */}
        <div className="md:col-span-2 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            History of Present Illness (HPI)
          </label>
          {isEditing ? (
            <textarea
              rows={4}
              value={summary.hpi}
              onChange={(e) => setSummary({ ...summary, hpi: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm leading-relaxed"
            />
          ) : (
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {summary.hpi}
            </p>
          )}
        </div>

        {/* Family & Social History */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            Family History
          </label>
          {isEditing ? (
            <input
              type="text"
              value={summary.familyHistory}
              onChange={(e) => setSummary({ ...summary, familyHistory: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
            />
          ) : (
            <p className="text-xs text-slate-700 dark:text-slate-300">{summary.familyHistory}</p>
          )}
        </div>

        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            Social History & Habitus
          </label>
          {isEditing ? (
            <input
              type="text"
              value={summary.socialHistory}
              onChange={(e) => setSummary({ ...summary, socialHistory: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
            />
          ) : (
            <p className="text-xs text-slate-700 dark:text-slate-300">{summary.socialHistory}</p>
          )}
        </div>
      </div>
    </div>
  );
};
