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
import { meaningfulExaminationText, examFieldText, applyNormalExamText } from '../../../services/examinationContent';

interface ExaminationSectionProps {
  patient: Patient;
}

const defaultExamData = {
  general: { appearance: '', vitalSignsSummary: '', hydration: '', pallor: false, cyanosis: false, jaundice: false, edema: '', mentalStatus: '' },
  cardiovascular: { jvp: '', heartSounds: '', murmurs: '', peripheralPulses: '', edema: '', perfusion: '', apexBeat: '' },
  respiratory: { chestExam: '', airEntry: '', addedSounds: '', workOfBreathing: '' },
  abdomen: { inspection: '', palpation: '', tenderness: '', organomegaly: '', ascites: '', bowelSounds: '' },
  neurological: { consciousness: '', gcs: '', pupils: '', motor: '', sensory: '', reflexes: '', cranialNerves: '', motorPower: '', plantarResponse: '' },
  extremities: { pulses: '', edema: '', temp: '', perfusion: '' },
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.cv && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" /> Precordial Auscultation & Hemodynamic Perfusion
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Heart Sounds (S1, S2)
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.neuro && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" /> Cranial Nerves, Motor Power & Reflexes
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Consciousness & GCS
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.resp && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-500" /> Breath Sounds & Thoracic Examination
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Chest Expansion & Inspection
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.general && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" /> General Habit, Edema & Stigmata
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                General Appearance
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.abdomen && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" /> Abdominal Palpation, Peritoneal Signs & Bowel Sounds
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Inspection & Palpation
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
      </button>
      {openSystems.extremities && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Footprints className="w-4 h-4 text-indigo-500" /> Peripheral Extremities, Edema & Calves
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Pulses (Dorsalis Pedis / Post-Tibial)
              </span>
              {isEditing ? (
                <><input
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
              {isEditing ? (
                <><input
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
