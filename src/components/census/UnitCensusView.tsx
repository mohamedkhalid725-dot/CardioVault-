import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  ChevronRight,
  BedDouble,
  UserPlus,
  AlertCircle,
  MoreVertical,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientStatus, Patient } from '../../types/clinical';

export const UnitCensusView: React.FC = () => {
  const {
    currentUnitId,
    getUnitById,
    getBedsByUnit,
    patients,
    setCurrentPatientId,
    setCurrentView,
    addBed,
    addPatient,
    setActivePatientSection,
  } = useApp();

  const [showAddBedModal, setShowAddBedModal] = useState(false);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);

  // New Patient Form State
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState<number>(55);
  const [newPatientSex, setNewPatientSex] = useState<'Male' | 'Female'>('Male');
  const [newPatientDiagnosis, setNewPatientDiagnosis] = useState('');
  const [newPatientStatus, setNewPatientStatus] = useState<PatientStatus>('Stable');
  const [newPatientMRN, setNewPatientMRN] = useState('');

  const currentUnit = currentUnitId ? getUnitById(currentUnitId) : null;
  const unitBeds = currentUnitId ? getBedsByUnit(currentUnitId) : [];

  if (!currentUnit) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>No unit selected.</p>
        <button
          onClick={() => setCurrentView('home')}
          className="mt-4 px-4 py-2 bg-cyan-500 text-slate-950 rounded-xl font-semibold text-sm"
        >
          Return Home
        </button>
      </div>
    );
  }

  const handleOpenPatient = (patientId: string) => {
    setCurrentPatientId(patientId);
    setActivePatientSection('overview');
    setCurrentView('patient');
  };

  const handleOpenAdmitModal = (bedId: string) => {
    setSelectedBedId(bedId);
    setNewPatientName('');
    setNewPatientDiagnosis('');
    setNewPatientMRN(`MRN-${Math.floor(100000 + Math.random() * 900000)}`);
    setShowAdmitModal(true);
  };

  const handleAdmitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim() || !selectedBedId) return;

    const newPatient = addPatient(
      {
        fullName: newPatientName.trim(),
        age: newPatientAge,
        sex: newPatientSex,
        mrn: newPatientMRN,
        primaryDiagnosis: newPatientDiagnosis.trim() || 'Acute Admission',
        status: newPatientStatus,
        unitId: currentUnit.id,
      },
      selectedBedId
    );

    setShowAdmitModal(false);
    handleOpenPatient(newPatient.id);
  };

  const getStatusBadge = (status: PatientStatus) => {
    switch (status) {
      case 'Critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-500 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Critical
          </span>
        );
      case 'Unstable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unstable
          </span>
        );
      case 'Stable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Stable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
            Empty
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-200">
      {/* Census Header (Matching Reference Image 2) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView('home')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors focus:outline-none"
            title="Back to Units"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {currentUnit.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {unitBeds.length} Beds • {currentUnit.type}
            </p>
          </div>
        </div>

        <button
          onClick={() => addBed(currentUnit.id)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-all focus:outline-none"
        >
          <Plus className="w-4 h-4" /> Add Bed
        </button>
      </div>

      {/* Bed Cards List (Exact layout of Reference Image 2: Unit Census) */}
      <div className="space-y-3">
        {unitBeds.map((bed) => {
          const patient = bed.patientId
            ? patients.find((p) => p.id === bed.patientId && !p.isArchived)
            : null;

          return (
            <div
              key={bed.id}
              className={`rounded-2xl border transition-all duration-150 p-4 ${
                patient
                  ? 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 shadow-sm hover:shadow-md cursor-pointer'
                  : 'bg-slate-50/70 dark:bg-[#0E1626] border-dashed border-slate-200 dark:border-slate-800/80'
              }`}
              onClick={() => {
                if (patient) {
                  handleOpenPatient(patient.id);
                }
              }}
            >
              <div className="flex items-center justify-between">
                {/* Bed icon and title */}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      patient
                        ? patient.status === 'Critical'
                          ? 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/20'
                          : patient.status === 'Unstable'
                          ? 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20'
                        : 'bg-slate-200/50 text-slate-400 dark:bg-slate-800/60'
                    }`}
                  >
                    <BedDouble className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {bed.bedNumber}
                      </span>
                      {patient && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          • {patient.mrn}
                        </span>
                      )}
                    </div>

                    {patient ? (
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {patient.fullName}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {patient.primaryDiagnosis}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                          Empty Bed
                        </h3>
                        <p className="text-xs text-slate-400/80 dark:text-slate-600">
                          Available for immediate admission
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Action: Status Badge + Chevron OR Admit Button */}
                <div className="flex items-center gap-3">
                  {patient ? (
                    <>
                      {getStatusBadge(patient.status)}
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAdmitModal(bed.id);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Admit Patient
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Admit Patient Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Admit Patient to {currentUnit.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create a new patient file assigned to this bed.
            </p>

            <form onSubmit={handleAdmitSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="e.g. Ahmed Mohamed"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    MRN (Medical Record #)
                  </label>
                  <input
                    type="text"
                    value={newPatientMRN}
                    onChange={(e) => setNewPatientMRN(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Age
                    </label>
                    <input
                      type="number"
                      value={newPatientAge}
                      onChange={(e) => setNewPatientAge(parseInt(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Sex
                    </label>
                    <select
                      value={newPatientSex}
                      onChange={(e) => setNewPatientSex(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Diagnosis *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatientDiagnosis}
                    onChange={(e) => setNewPatientDiagnosis(e.target.value)}
                    placeholder="e.g. Acute Ischemic Stroke, Acute STEMI"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Initial Acuity Status
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Stable', 'Unstable', 'Critical'] as PatientStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setNewPatientStatus(st)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          newPatientStatus === st
                            ? st === 'Critical'
                              ? 'bg-rose-500 text-white border-rose-500'
                              : st === 'Unstable'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Complete Admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
