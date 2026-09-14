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
} from 'lucide-react';
import { Patient, PhysicalExam } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ExaminationSectionProps {
  patient: Patient;
}

const defaultExamData = {
  general: {
    appearance: 'Alert, oriented, no acute distress.',
    vitalSignsSummary: 'Hemodynamically stable.',
    hydration: 'Euvolemic, moist mucous membranes.',
    pallor: false,
    cyanosis: false,
    jaundice: false,
    edema: 'Trace pedal edema.',
    mentalStatus: 'Alert and oriented x4.',
  },
  cardiovascular: {
    jvp: 'Normal (< 4 cm above sternal angle).',
    heartSounds: 'S1, S2 audible, regular rate and rhythm.',
    murmurs: 'No systolic or diastolic murmurs, rubs, or gallops.',
    peripheralPulses: '2+ symmetric in radial, dorsalis pedis, posterior tibial.',
    edema: 'Trace 1+ bilateral ankle edema.',
    perfusion: 'Warm, capillary refill < 2 seconds.',
    apexBeat: '5th intercostal space, midclavicular line.',
  },
  respiratory: {
    chestExam: 'Symmetric chest expansion.',
    airEntry: 'Bilateral vesicular breath sounds.',
    addedSounds: 'Clear to auscultation bilaterally, no wheezes or crackles.',
    workOfBreathing: 'Unlabored, no accessory muscle use.',
  },
  abdomen: {
    inspection: 'Flat, soft, non-distended.',
    palpation: 'Soft, non-tender to light and deep palpation.',
    tenderness: 'None noted.',
    organomegaly: 'No hepatosplenomegaly palpable.',
    ascites: 'Absent.',
    bowelSounds: 'Normoactive in all 4 quadrants.',
  },
  neurological: {
    consciousness: 'Alert, awake, responds appropriately.',
    gcs: 'E4 V5 M6 (15/15)',
    pupils: '3mm equal, round, reactive to light and accommodation.',
    motor: '5/5 power throughout all 4 limbs.',
    sensory: 'Intact to light touch and pinprick bilaterally.',
    reflexes: '2+ symmetric patellar, biceps, and Achilles reflexes.',
    cranialNerves: 'Cranial nerves II-XII grossly intact.',
    motorPower: '5/5 in all extremities.',
    plantarResponse: 'Flexor / Downward bilaterally.',
  },
  extremities: {
    pulses: 'Intact 2+ bilaterally.',
    edema: 'Trace pedal edema.',
    temp: 'Warm to touch distally.',
    perfusion: 'Capillary refill 1.8s.',
  },
  customFields: [] as Array<{ label: string; value: string }>,
};

export const ExaminationSection: React.FC<ExaminationSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'cv' | 'neuro' | 'resp' | 'general' | 'abdomen' | 'extremities'>('cv');
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
    updatePatient(patient.id, {
      examination: exam as any,
      physicalExam: exam as any,
    });
    setIsEditing(false);
    showToast('Physical Examination saved successfully', 'success');
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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('cv')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'cv'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Heart className="w-3.5 h-3.5 text-rose-500" /> Cardiovascular Exam
        </button>

        <button
          onClick={() => setActiveTab('neuro')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'neuro'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Brain className="w-3.5 h-3.5 text-purple-500" /> Neurologic Exam
        </button>

        <button
          onClick={() => setActiveTab('resp')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'resp'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Wind className="w-3.5 h-3.5 text-sky-500" /> Respiratory Exam
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'general'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-500" /> General Appearance
        </button>

        <button
          onClick={() => setActiveTab('abdomen')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'abdomen'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-amber-500" /> Abdomen & GI
        </button>

        <button
          onClick={() => setActiveTab('extremities')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeTab === 'extremities'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Footprints className="w-3.5 h-3.5 text-indigo-500" /> Extremities & Pulses
        </button>
      </div>

      {/* Cardiovascular Tab */}
      {activeTab === 'cv' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" /> Precordial Auscultation & Hemodynamic Perfusion
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Heart Sounds (S1, S2)
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.cardiovascular.heartSounds}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Murmurs, Rubs & Gallops
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.cardiovascular.murmurs}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Apex Beat / PMI
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.cardiovascular.apexBeat}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Jugular Venous Pressure (JVP)
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.cardiovascular.jvp}
                </p>
              )}
            </div>

            <div className="sm:col-span-2 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Pulses & Perfusion
              </span>
              {isEditing ? (
                <input
                  type="text"
                  value={exam.cardiovascular.peripheralPulses}
                  onChange={(e) =>
                    setExam({
                      ...exam,
                      cardiovascular: { ...exam.cardiovascular, peripheralPulses: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.cardiovascular.peripheralPulses} • Cap refill: {exam.cardiovascular.perfusion}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Neurologic Tab */}
      {activeTab === 'neuro' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" /> Cranial Nerves, Motor Power & Reflexes
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Consciousness & GCS
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.neurological.consciousness} ({exam.neurological.gcs})
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Pupillary Light Reflex
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.neurological.pupils}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Motor Power (Grade 0-5)
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.neurological.motor}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Deep Tendon Reflexes & Babinski
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.neurological.reflexes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Respiratory Tab */}
      {activeTab === 'resp' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-500" /> Breath Sounds & Thoracic Examination
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Chest Expansion & Inspection
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.respiratory.chestExam}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Air Entry
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.respiratory.airEntry}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Added Breath Sounds
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.respiratory.addedSounds}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Work of Breathing
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.respiratory.workOfBreathing}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* General Appearance */}
      {activeTab === 'general' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" /> General Habit, Edema & Stigmata
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                General Appearance
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.general.appearance}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Hydration & Perfusion
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.general.hydration}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
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
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.general.pallor ? 'Pallor present' : 'No pallor'} •{' '}
                  {exam.general.cyanosis ? 'Cyanosis present' : 'No cyanosis'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Abdomen Tab */}
      {activeTab === 'abdomen' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" /> Abdominal Palpation, Peritoneal Signs & Bowel Sounds
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Inspection & Palpation
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.abdomen.palpation}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Tenderness & Guarding
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.abdomen.tenderness}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Organomegaly & Ascites
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.abdomen.organomegaly} • Ascites: {exam.abdomen.ascites}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Bowel Sounds
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.abdomen.bowelSounds}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Extremities Tab */}
      {activeTab === 'extremities' && (
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Footprints className="w-4 h-4 text-indigo-500" /> Peripheral Extremities, Edema & Calves
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Pulses (Dorsalis Pedis / Post-Tibial)
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.extremities.pulses}
                </p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Peripheral Edema & Calves
              </span>
              {isEditing ? (
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
                />
              ) : (
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {exam.extremities.edema} • Temperature: {exam.extremities.temp}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
