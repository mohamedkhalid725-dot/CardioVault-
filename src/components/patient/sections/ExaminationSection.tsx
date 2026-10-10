import React, { useState } from 'react';
import {
  Stethoscope,
  Heart,
  Wind,
  Brain,
  Layers,
  Save,
  Check,
  Activity,
  AlertCircle,
  Footprints,
  ChevronDown,
} from 'lucide-react';
import { Patient, PhysicalExam } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { useIsPreviousViewer } from '../PreviousAdmissionViewer';
import { VoiceDictationButton } from '../VoiceDictationButton';
import { meaningfulExaminationText, examFieldText, applyNormalExamText, countExamSystemFields, EXAM_FIELD_OPTIONS } from '../../../services/examinationContent';

interface ExaminationSectionProps {
  patient: Patient;
}

const defaultExamData = {
  general: { appearance: '', vitalSignsSummary: '', hydration: '', pallor: false, cyanosis: false, jaundice: false, edema: '', mentalStatus: '', neck: '', skin: '' },
  cardiovascular: { jvp: '', heartSounds: '', murmurs: '', peripheralPulses: '', edema: '', perfusion: '', apexBeat: '', thrill: '', radiofemoralDelay: '' },
  respiratory: { chestExam: '', airEntry: '', addedSounds: '', workOfBreathing: '', fremitus: '' },
  abdomen: { inspection: '', palpation: '', tenderness: '', organomegaly: '', ascites: '', bowelSounds: '', hernia: '' },
  neurological: { consciousness: '', gcs: '', pupils: '', motor: '', sensory: '', reflexes: '', cranialNerves: '', motorPower: '', plantarResponse: '', speech: '' },
  extremities: { pulses: '', edema: '', temp: '', perfusion: '', calves: '', pressureAreas: '' },
  customFields: [] as Array<{ label: string; value: string }>,
};

export const ExaminationSection: React.FC<ExaminationSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const isPreviousViewer = useIsPreviousViewer();
  type ExamSystemId = 'cv' | 'neuro' | 'resp' | 'general' | 'abdomen' | 'extremities';
  const [openSystems, setOpenSystems] = useState<Record<ExamSystemId, boolean>>({ cv: false, neuro: false, resp: false, general: false, abdomen: false, extremities: false });
  const toggleSystem = (id: ExamSystemId) => setOpenSystems((p) => ({ ...p, [id]: !p[id] }));
  const [isEditing, setIsEditing] = useState(false);

  const rawExam = patient.examination || (patient as any).physicalExam || {};

  const [exam, setExam] = useState({
    general: { ...defaultExamData.general, ...(rawExam.general || {}) },
    cardiovascular: { ...defaultExamData.cardiovascular, ...(rawExam.cardiovascular || {}) },
    respiratory: { ...defaultExamData.respiratory, ...(rawExam.respiratory || {}) },
    abdomen: { ...defaultExamData.abdomen, ...(rawExam.abdomen || {}) },
    neurological: { ...defaultExamData.neurological, ...(rawExam.neurological || {}) },
    extremities: { ...defaultExamData.extremities, ...(rawExam.extremities || {}) },
    customFields: rawExam.customFields || defaultExamData.customFields,
  });
  const cvCount = countExamSystemFields(exam.cardiovascular);
  const neuroCount = countExamSystemFields(exam.neurological);
  const respCount = countExamSystemFields(exam.respiratory);
  const generalCount = countExamSystemFields(exam.general);
  const abdomenCount = countExamSystemFields(exam.abdomen);
  const extremitiesCount = countExamSystemFields(exam.extremities);

  const handleSave = () => {
    if (isPreviousViewer) return;
    updatePatient(patient.id, {
      examination: exam as any,
    });
    setIsEditing(false);
    showToast('Physical Examination saved successfully', 'success');
  };
  const setAllNormal = () => {
    if (isPreviousViewer) return;
    setExam((prev) => ({
      ...prev,
      general: applyNormalExamText(prev.general),
      cardiovascular: applyNormalExamText(prev.cardiovascular),
      respiratory: applyNormalExamText(prev.respiratory),
      abdomen: applyNormalExamText(prev.abdomen),
      neurological: applyNormalExamText(prev.neurological),
      extremities: applyNormalExamText(prev.extremities),
      customFields: prev.customFields,
    }));
    showToast('All examination fields set to normal. Review and save.', 'info');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-cyan-500" /> Comprehensive Physical Examination
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Systematic head-to-toe clinical assessment with focused cardiovascular and neurologic exams
          </p>
        </div>

        {!isPreviousViewer && (
        <div className="flex items-center gap-2">
        {isEditing && (
        <button
          type="button"
          onClick={setAllNormal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
        >
          Set all normal
        </button>
        )}
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
              <Check className="w-4 h-4" /> Save Exam
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Edit Exam
            </>
          )}
        </button>
        </div>
        )}
      </div>

      {/* Cardiovascular Tab */}
      <button
        type="button"
        onClick={() => toggleSystem('cv')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Heart className="w-4 h-4 text-rose-500" /> Cardiovascular Exam
        <span className="ml-auto text-[10px] font-bold text-slate-400">{cvCount.documented}/{cvCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.cv && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" /> Precordial Auscultation & Hemodynamic Perfusion
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Thrill / Heave</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.thrill.map((o) => { const selthrill = exam.cardiovascular.thrill === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, thrill: exam.cardiovascular.thrill === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selthrill ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.thrill}
                  onChange={(e) => setExam({...exam, cardiovascular: {...exam.cardiovascular, thrill: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.thrill} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,thrill:draft}})} fieldLabel="thrill" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.cardiovascular.thrill)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Radiofemoral Delay</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.radiofemoralDelay.map((o) => { const selradiofemoralDelay = exam.cardiovascular.radiofemoralDelay === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, radiofemoralDelay: exam.cardiovascular.radiofemoralDelay === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selradiofemoralDelay ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.radiofemoralDelay}
                  onChange={(e) => setExam({...exam, cardiovascular: {...exam.cardiovascular, radiofemoralDelay: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.radiofemoralDelay} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,radiofemoralDelay:draft}})} fieldLabel="radiofemoralDelay" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.cardiovascular.radiofemoralDelay)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Perfusion</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.perfusion.map((o) => { const selperfusion = exam.cardiovascular.perfusion === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, perfusion: exam.cardiovascular.perfusion === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selperfusion ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.perfusion}
                  onChange={(e) => setExam({...exam, cardiovascular: {...exam.cardiovascular, perfusion: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.perfusion} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,perfusion:draft}})} fieldLabel="perfusion" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.cardiovascular.perfusion)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Edema</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.edema.map((o) => { const seledema = exam.cardiovascular.edema === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, edema: exam.cardiovascular.edema === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seledema ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.edema}
                  onChange={(e) => setExam({...exam, cardiovascular: {...exam.cardiovascular, edema: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.edema} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,edema:draft}})} fieldLabel="edema" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.cardiovascular.edema)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Heart Sounds (S1, S2)
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.heartSounds.map((o) => { const selheartSounds = exam.cardiovascular.heartSounds === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, heartSounds: exam.cardiovascular.heartSounds === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selheartSounds ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.heartSounds}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, heartSounds: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.heartSounds} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,heartSounds:draft}})} fieldLabel="heartSounds" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.cardiovascular.heartSounds)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Murmurs, Rubs & Gallops
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.murmurs.map((o) => { const selmurmurs = exam.cardiovascular.murmurs === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, murmurs: exam.cardiovascular.murmurs === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selmurmurs ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.murmurs}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, murmurs: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.murmurs} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,murmurs:draft}})} fieldLabel="murmurs" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.cardiovascular.murmurs)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Apex Beat / PMI
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.apexBeat.map((o) => { const selapexBeat = exam.cardiovascular.apexBeat === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, apexBeat: exam.cardiovascular.apexBeat === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selapexBeat ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.apexBeat}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, apexBeat: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.apexBeat} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,apexBeat:draft}})} fieldLabel="apexBeat" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.cardiovascular.apexBeat)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Jugular Venous Pressure (JVP)
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.jvp.map((o) => { const seljvp = exam.cardiovascular.jvp === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, cardiovascular: { ...exam.cardiovascular, jvp: exam.cardiovascular.jvp === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seljvp ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.cardiovascular.jvp}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, jvp: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.jvp} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,jvp:draft}})} fieldLabel="jvp" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.cardiovascular.jvp)}
                </p>
              )}
            </div>

            <div className="sm:col-span-2 p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Pulses & Perfusion
              </span>
              {isEditing ? (
                <><input
                  type="text"
                  value={exam.cardiovascular.peripheralPulses}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, peripheralPulses: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.cardiovascular.peripheralPulses} onApply={(draft)=>setExam({...exam,cardiovascular:{...exam.cardiovascular,peripheralPulses:draft}})} fieldLabel="peripheralPulses" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {[meaningfulExaminationText(exam.cardiovascular.peripheralPulses), meaningfulExaminationText(exam.cardiovascular.perfusion) ? `Cap refill: ${meaningfulExaminationText(exam.cardiovascular.perfusion)}` : ''].filter(Boolean).join(' • ') || 'Not documented'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Neurologic Tab */}
      <button
        type="button"
        onClick={() => toggleSystem('neuro')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Brain className="w-4 h-4 text-purple-500" /> Neurologic Exam
        <span className="ml-auto text-[10px] font-bold text-slate-400">{neuroCount.documented}/{neuroCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.neuro && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" /> Cranial Nerves, Motor Power & Reflexes
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Sensation</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.sensory.map((o) => { const selsensory = exam.neurological.sensory === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, sensory: exam.neurological.sensory === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selsensory ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.sensory}
                  onChange={(e) => setExam({...exam, neurological: {...exam.neurological, sensory: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.sensory} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,sensory:draft}})} fieldLabel="sensory" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.neurological.sensory)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Cranial Nerves</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.cranialNerves.map((o) => { const selcranialNerves = exam.neurological.cranialNerves === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, cranialNerves: exam.neurological.cranialNerves === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selcranialNerves ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.cranialNerves}
                  onChange={(e) => setExam({...exam, neurological: {...exam.neurological, cranialNerves: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.cranialNerves} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,cranialNerves:draft}})} fieldLabel="cranialNerves" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.neurological.cranialNerves)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Plantar Response</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.plantarResponse.map((o) => { const selplantarResponse = exam.neurological.plantarResponse === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, plantarResponse: exam.neurological.plantarResponse === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selplantarResponse ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.plantarResponse}
                  onChange={(e) => setExam({...exam, neurological: {...exam.neurological, plantarResponse: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.plantarResponse} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,plantarResponse:draft}})} fieldLabel="plantarResponse" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.neurological.plantarResponse)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Speech</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.speech.map((o) => { const selspeech = exam.neurological.speech === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, speech: exam.neurological.speech === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selspeech ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.speech}
                  onChange={(e) => setExam({...exam, neurological: {...exam.neurological, speech: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.speech} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,speech:draft}})} fieldLabel="speech" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.neurological.speech)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Consciousness & GCS
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.consciousness.map((o) => { const selconsciousness = exam.neurological.consciousness === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, consciousness: exam.neurological.consciousness === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selconsciousness ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.consciousness}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      neurological: { ...exam.neurological, consciousness: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.consciousness} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,consciousness:draft}})} fieldLabel="consciousness" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {[meaningfulExaminationText(exam.neurological.consciousness), meaningfulExaminationText(exam.neurological.gcs)].filter(Boolean).join(' • ') || 'Not documented'}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Pupillary Light Reflex
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.pupils.map((o) => { const selpupils = exam.neurological.pupils === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, pupils: exam.neurological.pupils === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selpupils ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.pupils}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      neurological: { ...exam.neurological, pupils: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.pupils} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,pupils:draft}})} fieldLabel="pupils" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.neurological.pupils)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Motor Power (Grade 0-5)
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.motor.map((o) => { const selmotor = exam.neurological.motor === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, motor: exam.neurological.motor === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selmotor ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.motor}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      neurological: { ...exam.neurological, motor: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.motor} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,motor:draft}})} fieldLabel="motor" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.neurological.motor)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Motor Power Grade (0-5)
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.motorPower.map((o) => { const selmotorPower = exam.neurological.motorPower === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, motorPower: exam.neurological.motorPower === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selmotorPower ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={exam.neurological.motorPower}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      neurological: { ...exam.neurological, motorPower: e.target.value },
                    })
                  }
                  placeholder="0-5, grade 0 is meaningful"
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.neurological.motorPower)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Deep Tendon Reflexes & Babinski
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.reflexes.map((o) => { const selreflexes = exam.neurological.reflexes === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, neurological: { ...exam.neurological, reflexes: exam.neurological.reflexes === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selreflexes ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.neurological.reflexes}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      neurological: { ...exam.neurological, reflexes: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.neurological.reflexes} onApply={(draft)=>setExam({...exam,neurological:{...exam.neurological,reflexes:draft}})} fieldLabel="reflexes" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.neurological.reflexes)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Respiratory Tab */}
      <button
        type="button"
        onClick={() => toggleSystem('resp')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Wind className="w-4 h-4 text-sky-500" /> Respiratory Exam
        <span className="ml-auto text-[10px] font-bold text-slate-400">{respCount.documented}/{respCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.resp && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-500" /> Breath Sounds & Thoracic Examination
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Tactile Fremitus</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.fremitus.map((o) => { const selfremitus = exam.respiratory.fremitus === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, respiratory: { ...exam.respiratory, fremitus: exam.respiratory.fremitus === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selfremitus ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.respiratory.fremitus}
                  onChange={(e) => setExam({...exam, respiratory: {...exam.respiratory, fremitus: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.respiratory.fremitus} onApply={(draft)=>setExam({...exam,respiratory:{...exam.respiratory,fremitus:draft}})} fieldLabel="fremitus" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.respiratory.fremitus)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Chest Expansion & Inspection
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.chestExam.map((o) => { const selchestExam = exam.respiratory.chestExam === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, respiratory: { ...exam.respiratory, chestExam: exam.respiratory.chestExam === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selchestExam ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.respiratory.chestExam}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      respiratory: { ...exam.respiratory, chestExam: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.respiratory.chestExam} onApply={(draft)=>setExam({...exam,respiratory:{...exam.respiratory,chestExam:draft}})} fieldLabel="chestExam" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.respiratory.chestExam)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Air Entry
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.airEntry.map((o) => { const selairEntry = exam.respiratory.airEntry === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, respiratory: { ...exam.respiratory, airEntry: exam.respiratory.airEntry === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selairEntry ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.respiratory.airEntry}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      respiratory: { ...exam.respiratory, airEntry: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.respiratory.airEntry} onApply={(draft)=>setExam({...exam,respiratory:{...exam.respiratory,airEntry:draft}})} fieldLabel="airEntry" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.respiratory.airEntry)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Added Breath Sounds
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.addedSounds.map((o) => { const seladdedSounds = exam.respiratory.addedSounds === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, respiratory: { ...exam.respiratory, addedSounds: exam.respiratory.addedSounds === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seladdedSounds ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.respiratory.addedSounds}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      respiratory: { ...exam.respiratory, addedSounds: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.respiratory.addedSounds} onApply={(draft)=>setExam({...exam,respiratory:{...exam.respiratory,addedSounds:draft}})} fieldLabel="addedSounds" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.respiratory.addedSounds)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Work of Breathing
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.workOfBreathing.map((o) => { const selworkOfBreathing = exam.respiratory.workOfBreathing === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, respiratory: { ...exam.respiratory, workOfBreathing: exam.respiratory.workOfBreathing === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selworkOfBreathing ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.respiratory.workOfBreathing}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      respiratory: { ...exam.respiratory, workOfBreathing: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.respiratory.workOfBreathing} onApply={(draft)=>setExam({...exam,respiratory:{...exam.respiratory,workOfBreathing:draft}})} fieldLabel="workOfBreathing" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.respiratory.workOfBreathing)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* General Appearance */}
      <button
        type="button"
        onClick={() => toggleSystem('general')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Layers className="w-4 h-4 text-emerald-500" /> General Appearance
        <span className="ml-auto text-[10px] font-bold text-slate-400">{generalCount.documented}/{generalCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.general && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" /> General Habit, Edema & Stigmata
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Edema</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.edema.map((o) => { const seledema = exam.general.edema === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, edema: exam.general.edema === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seledema ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.edema}
                  onChange={(e) => setExam({...exam, general: {...exam.general, edema: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.edema} onApply={(draft)=>setExam({...exam,general:{...exam.general,edema:draft}})} fieldLabel="edema" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.general.edema)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Distress</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.distress.map((o) => { const seldistress = exam.general.distress === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, distress: exam.general.distress === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seldistress ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.distress}
                  onChange={(e) => setExam({...exam, general: {...exam.general, distress: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.distress} onApply={(draft)=>setExam({...exam,general:{...exam.general,distress:draft}})} fieldLabel="distress" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.general.distress)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Mental Status</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.mentalStatus.map((o) => { const selmentalStatus = exam.general.mentalStatus === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, mentalStatus: exam.general.mentalStatus === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selmentalStatus ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.mentalStatus}
                  onChange={(e) => setExam({...exam, general: {...exam.general, mentalStatus: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.mentalStatus} onApply={(draft)=>setExam({...exam,general:{...exam.general,mentalStatus:draft}})} fieldLabel="mentalStatus" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.general.mentalStatus)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Neck & Lymph Nodes</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.neck.map((o) => { const selneck = exam.general.neck === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, neck: exam.general.neck === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selneck ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.neck}
                  onChange={(e) => setExam({...exam, general: {...exam.general, neck: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.neck} onApply={(draft)=>setExam({...exam,general:{...exam.general,neck:draft}})} fieldLabel="neck" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.general.neck)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Skin</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.skin.map((o) => { const selskin = exam.general.skin === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, skin: exam.general.skin === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selskin ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.skin}
                  onChange={(e) => setExam({...exam, general: {...exam.general, skin: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.skin} onApply={(draft)=>setExam({...exam,general:{...exam.general,skin:draft}})} fieldLabel="skin" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.general.skin)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                General Appearance
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.appearance.map((o) => { const selappearance = exam.general.appearance === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, appearance: exam.general.appearance === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selappearance ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.appearance}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      general: { ...exam.general, appearance: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.appearance} onApply={(draft)=>setExam({...exam,general:{...exam.general,appearance:draft}})} fieldLabel="appearance" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.general.appearance)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Hydration & Perfusion
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.hydration.map((o) => { const selhydration = exam.general.hydration === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, general: { ...exam.general, hydration: exam.general.hydration === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selhydration ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.general.hydration}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      general: { ...exam.general, hydration: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.general.hydration} onApply={(draft)=>setExam({...exam,general:{...exam.general,hydration:draft}})} fieldLabel="hydration" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.general.hydration)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Pallor / Cyanosis / Jaundice
              </span>
              {isEditing ? (
                <div className="flex items-center gap-3 text-xs pt-1">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={exam.general.pallor}
                      onChange={(e) =>
                        setExam({
                          ...exam,
                          general: { ...exam.general, pallor: e.target.checked },
                        })
                      }
                    />
                    Pallor
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={exam.general.cyanosis}
                      onChange={(e) =>
                        setExam({
                          ...exam,
                          general: { ...exam.general, cyanosis: e.target.checked },
                        })
                      }
                    />
                    Cyanosis
                  </label>
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {[exam.general.pallor ? 'Pallor present' : '', exam.general.cyanosis ? 'Cyanosis present' : ''].filter(Boolean).join(' • ') || 'Not documented'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Abdomen Tab */}
      <button
        type="button"
        onClick={() => toggleSystem('abdomen')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Activity className="w-4 h-4 text-amber-500" /> Abdomen & GI
        <span className="ml-auto text-[10px] font-bold text-slate-400">{abdomenCount.documented}/{abdomenCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.abdomen && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" /> Abdominal Palpation, Peritoneal Signs & Bowel Sounds
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Inspection</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.inspection.map((o) => { const selinspection = exam.abdomen.inspection === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, inspection: exam.abdomen.inspection === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selinspection ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.inspection}
                  onChange={(e) => setExam({...exam, abdomen: {...exam.abdomen, inspection: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.inspection} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,inspection:draft}})} fieldLabel="inspection" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.abdomen.inspection)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Hernia</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.hernia.map((o) => { const selhernia = exam.abdomen.hernia === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, hernia: exam.abdomen.hernia === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selhernia ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.hernia}
                  onChange={(e) => setExam({...exam, abdomen: {...exam.abdomen, hernia: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.hernia} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,hernia:draft}})} fieldLabel="hernia" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.abdomen.hernia)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Inspection & Palpation
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.palpation.map((o) => { const selpalpation = exam.abdomen.palpation === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, palpation: exam.abdomen.palpation === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selpalpation ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.palpation}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      abdomen: { ...exam.abdomen, palpation: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.palpation} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,palpation:draft}})} fieldLabel="palpation" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.abdomen.palpation)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Tenderness & Guarding
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.tenderness.map((o) => { const seltenderness = exam.abdomen.tenderness === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, tenderness: exam.abdomen.tenderness === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seltenderness ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.tenderness}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      abdomen: { ...exam.abdomen, tenderness: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.tenderness} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,tenderness:draft}})} fieldLabel="tenderness" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.abdomen.tenderness)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Organomegaly & Ascites
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.organomegaly.map((o) => { const selorganomegaly = exam.abdomen.organomegaly === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, organomegaly: exam.abdomen.organomegaly === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selorganomegaly ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.organomegaly}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      abdomen: { ...exam.abdomen, organomegaly: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.organomegaly} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,organomegaly:draft}})} fieldLabel="organomegaly" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {[meaningfulExaminationText(exam.abdomen.organomegaly), meaningfulExaminationText(exam.abdomen.ascites) ? `Ascites: ${meaningfulExaminationText(exam.abdomen.ascites)}` : ''].filter(Boolean).join(' • ') || 'Not documented'}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Bowel Sounds
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.bowelSounds.map((o) => { const selbowelSounds = exam.abdomen.bowelSounds === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, abdomen: { ...exam.abdomen, bowelSounds: exam.abdomen.bowelSounds === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selbowelSounds ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.abdomen.bowelSounds}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      abdomen: { ...exam.abdomen, bowelSounds: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.abdomen.bowelSounds} onApply={(draft)=>setExam({...exam,abdomen:{...exam.abdomen,bowelSounds:draft}})} fieldLabel="bowelSounds" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.abdomen.bowelSounds)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Extremities Tab */}
      <button
        type="button"
        onClick={() => toggleSystem('extremities')}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] text-xs font-bold text-slate-700 dark:text-slate-200"
      >
        <Footprints className="w-4 h-4 text-indigo-500" /> Extremities & Pulses
        <span className="ml-auto text-[10px] font-bold text-slate-400">{extremitiesCount.documented}/{extremitiesCount.total}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {openSystems.extremities && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Footprints className="w-4 h-4 text-indigo-500" /> Peripheral Extremities, Edema & Calves
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Perfusion</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.perfusion.map((o) => { const selperfusion = exam.extremities.perfusion === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, extremities: { ...exam.extremities, perfusion: exam.extremities.perfusion === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selperfusion ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.extremities.perfusion}
                  onChange={(e) => setExam({...exam, extremities: {...exam.extremities, perfusion: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.extremities.perfusion} onApply={(draft)=>setExam({...exam,extremities:{...exam.extremities,perfusion:draft}})} fieldLabel="perfusion" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.extremities.perfusion)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Calves (DVT check)</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.calves.map((o) => { const selcalves = exam.extremities.calves === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, extremities: { ...exam.extremities, calves: exam.extremities.calves === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selcalves ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.extremities.calves}
                  onChange={(e) => setExam({...exam, extremities: {...exam.extremities, calves: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.extremities.calves} onApply={(draft)=>setExam({...exam,extremities:{...exam.extremities,calves:draft}})} fieldLabel="calves" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.extremities.calves)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Pressure Areas</span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.pressureAreas.map((o) => { const selpressureAreas = exam.extremities.pressureAreas === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, extremities: { ...exam.extremities, pressureAreas: exam.extremities.pressureAreas === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selpressureAreas ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.extremities.pressureAreas}
                  onChange={(e) => setExam({...exam, extremities: {...exam.extremities, pressureAreas: e.target.value}})}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.extremities.pressureAreas} onApply={(draft)=>setExam({...exam,extremities:{...exam.extremities,pressureAreas:draft}})} fieldLabel="pressureAreas" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">{examFieldText(exam.extremities.pressureAreas)}</p>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Pulses (Dorsalis Pedis / Post-Tibial)
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.pulses.map((o) => { const selpulses = exam.extremities.pulses === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, extremities: { ...exam.extremities, pulses: exam.extremities.pulses === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${selpulses ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.extremities.pulses}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      extremities: { ...exam.extremities, pulses: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.extremities.pulses} onApply={(draft)=>setExam({...exam,extremities:{...exam.extremities,pulses:draft}})} fieldLabel="pulses" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {examFieldText(exam.extremities.pulses)}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Edema & Calves
              </span>
              {isEditing ? (<>
                <div className="flex flex-wrap gap-1 mb-1">{EXAM_FIELD_OPTIONS.edema.map((o) => { const seledema = exam.extremities.edema === o; return <button key={o} type="button" onClick={() => setExam({ ...exam, extremities: { ...exam.extremities, edema: exam.extremities.edema === o ? '' : o } })} className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${seledema ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}>{o}</button>; })}</div>
                <input
                  type="text"
                  value={exam.extremities.edema}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      extremities: { ...exam.extremities, edema: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                /><div className="mt-1"><VoiceDictationButton value={exam.extremities.edema} onApply={(draft)=>setExam({...exam,extremities:{...exam.extremities,edema:draft}})} fieldLabel="edema" /></div></>
              ) : (
                <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                  {[meaningfulExaminationText(exam.extremities.edema), meaningfulExaminationText(exam.extremities.temp) ? `Temperature: ${meaningfulExaminationText(exam.extremities.temp)}` : ''].filter(Boolean).join(' • ') || 'Not documented'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
