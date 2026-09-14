import React, { useState } from 'react';
import {
  ArrowLeft,
  Edit,
  ArrowRightLeft,
  LogOut,
  AlertTriangle,
  Heart,
  FileText,
  Clock,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient, PatientStatus } from '../../types/clinical';

interface PatientFileHeaderProps {
  patient: Patient;
  onEditClick?: () => void;
}

export const PatientFileHeader: React.FC<PatientFileHeaderProps> = ({ patient, onEditClick }) => {
  const {
    setCurrentView,
    getUnitById,
    beds,
    units,
    transferPatient,
    dischargePatient,
    updatePatient,
  } = useApp();

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);

  // Transfer state
  const [targetUnitId, setTargetUnitId] = useState(patient.unitId);
  const [targetBedId, setTargetBedId] = useState('');

  // Discharge state
  const [dischargeReason, setDischargeReason] = useState('Discharged Home');
  const [dischargeSummary, setDischargeSummary] = useState('');

  const currentUnit = getUnitById(patient.unitId);
  const currentBed = beds.find((b) => b.id === patient.bedId);
  const availableBeds = beds.filter((b) => b.unitId === targetUnitId && !b.patientId);

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBedId) return;
    transferPatient(patient.id, targetUnitId, targetBedId);
    setShowTransferModal(false);
  };

  const handleDischarge = (e: React.FormEvent) => {
    e.preventDefault();
    dischargePatient(patient.id, dischargeReason, dischargeSummary);
    setShowDischargeModal(false);
  };

  const handleStatusChange = (newStatus: PatientStatus) => {
    updatePatient(patient.id, { status: newStatus });
  };

  return (
    <>
      <div className="bg-white dark:bg-[#111C2E] border-b border-slate-200 dark:border-slate-800 p-4 sticky top-14 z-20 transition-colors shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Back + Patient Avatar & Identity (Reference 2 style) */}
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setCurrentView('census')}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors focus:outline-none"
              title="Back to Unit Census"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Photo */}
            <div className="relative">
              {patient.photoUrl ? (
                <img
                  src={patient.photoUrl}
                  alt={patient.fullName}
                  referrerPolicy="no-referrer"
                  className="w-13 h-13 rounded-2xl object-cover ring-2 ring-cyan-500/40 shadow-md"
                />
              ) : (
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-cyan-600 to-sky-400 text-white font-bold flex items-center justify-center text-lg shadow-md">
                  {patient.fullName.charAt(0)}
                </div>
              )}
              {patient.status === 'Critical' && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 border-2 border-white dark:border-[#111C2E] rounded-full animate-ping" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {patient.fullName}
                </h1>
                {/* Status Dropdown Pill */}
                <div className="relative group">
                  <select
                    value={patient.status}
                    onChange={(e) => handleStatusChange(e.target.value as PatientStatus)}
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border cursor-pointer focus:outline-none appearance-none pr-5 ${
                      patient.status === 'Critical'
                        ? 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                        : patient.status === 'Unstable'
                        ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
                        : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                    }`}
                  >
                    <option value="Critical">Critical</option>
                    <option value="Unstable">Unstable</option>
                    <option value="Stable">Stable</option>
                  </select>
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px]">
                    ▼
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  MRN: {patient.mrn}
                </span>
                <span>•</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                  {currentUnit?.name || 'Unit'} • {currentBed?.bedNumber || 'Bed'}
                </span>
                <span>•</span>
                <span>{patient.age}y / {patient.sex}</span>
                <span>•</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {patient.primaryDiagnosis}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={onEditClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <Edit className="w-3.5 h-3.5 text-cyan-500" />
              Edit
            </button>

            <button
              onClick={() => {
                setTargetUnitId(patient.unitId);
                setShowTransferModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-500" />
              Transfer
            </button>

            <button
              onClick={() => setShowDischargeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Discharge
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Patient Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Transfer {patient.fullName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select destination unit and available bed.
            </p>

            <form onSubmit={handleTransfer} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Destination Unit
                </label>
                <select
                  value={targetUnitId}
                  onChange={(e) => {
                    setTargetUnitId(e.target.value);
                    setTargetBedId('');
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Available Bed
                </label>
                {availableBeds.length === 0 ? (
                  <p className="text-xs text-rose-500 py-1">
                    No empty beds in this unit. Please choose another unit or discharge a bed first.
                  </p>
                ) : (
                  <select
                    required
                    value={targetBedId}
                    onChange={(e) => setTargetBedId(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Select Bed</option>
                    {availableBeds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bedNumber}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetBedId}
                  className="px-4 py-2 bg-sky-500 disabled:opacity-50 hover:bg-sky-400 text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discharge Patient Modal */}
      {showDischargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Discharge & Archive Patient
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The bed will become empty. All medical history, labs, notes, and records will be preserved in the permanent Patient Archive.
            </p>

            <form onSubmit={handleDischarge} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Discharge Disposition
                </label>
                <select
                  value={dischargeReason}
                  onChange={(e) => setDischargeReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="Discharged Home">Discharged Home (Stable)</option>
                  <option value="Transferred to Ward">Transferred to Step-Down / Ward</option>
                  <option value="Transferred to Rehab">Transferred to Rehabilitation</option>
                  <option value="Deceased">Deceased</option>
                  <option value="Left AMA">Left Against Medical Advice (AMA)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Discharge Clinical Summary
                </label>
                <textarea
                  rows={3}
                  value={dischargeSummary}
                  onChange={(e) => setDischargeSummary(e.target.value)}
                  placeholder="Summary of hospital course, key interventions, and discharge instructions..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Discharge to Archive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
