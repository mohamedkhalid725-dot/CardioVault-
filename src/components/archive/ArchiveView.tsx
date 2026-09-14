import React, { useState } from 'react';
import {
  Archive,
  Search,
  RotateCcw,
  Trash2,
  Calendar,
  FileText,
  User,
  ArrowRight,
  ShieldCheck,
  Building2,
  Eye,
  AlertTriangle,
  X,
  Heart,
  Pill,
  Activity,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient } from '../../types/clinical';

export const ArchiveView: React.FC = () => {
  const {
    archivedPatients,
    readmitPatient,
    deletePatientPermanently,
    units,
    beds,
    setCurrentPatientId,
    setCurrentView,
    showToast,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [showReadmitModal, setShowReadmitModal] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState(units[0]?.id || '');
  const [targetBedId, setTargetBedId] = useState('');

  const filtered = archivedPatients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.mrn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.primaryDiagnosis.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableBeds = beds.filter((b) => b.unitId === targetUnitId && !b.patientId);

  const handleOpenReadmit = (patient: Patient) => {
    setSelectedPatient(patient);
    const unit = units[0];
    setTargetUnitId(unit?.id || '');
    const firstFreeBed = beds.find((b) => b.unitId === unit?.id && !b.patientId);
    setTargetBedId(firstFreeBed?.id || '');
    setShowReadmitModal(true);
  };

  const handleConfirmReadmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !targetUnitId || !targetBedId) {
      showToast('Please select an available bed.', 'error');
      return;
    }

    readmitPatient(selectedPatient.id, targetUnitId, targetBedId);
    setShowReadmitModal(false);
    setCurrentPatientId(selectedPatient.id);
    setCurrentView('patient');
    showToast(`${selectedPatient.fullName} successfully re-admitted.`, 'success');
  };

  const handleConfirmDelete = () => {
    if (!patientToDelete) return;
    deletePatientPermanently(patientToDelete.id);
    showToast(`Dossier for ${patientToDelete.fullName} permanently deleted`, 'info');
    setPatientToDelete(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Archive className="w-6 h-6 text-cyan-500" /> Discharged & Past Patient Archive
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Historical medical dossiers, past admissions, discharge summaries, and re-admission workflow
          </p>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, MRN, diagnosis..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
      </div>

      {/* Archive List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((patient) => (
          <div
            key={patient.id}
            className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 hover:border-cyan-500/30 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {patient.fullName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  MRN: <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{patient.mrn}</span> • {patient.age}y {patient.sex}
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {patient.archiveReason || 'Discharged'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Primary Diagnosis
              </span>
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {patient.primaryDiagnosis}
              </p>
            </div>

            {patient.dischargeSummary && (
              <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">
                "{patient.dischargeSummary}"
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Archived: {patient.archiveDate || patient.admissionDate}</span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingPatient(patient)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-500" /> View Dossier
                </button>

                <button
                  onClick={() => handleOpenReadmit(patient)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Re-admit
                </button>

                <button
                  onClick={() => setPatientToDelete(patient)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  title="Permanently Delete Dossier"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-2 p-12 text-center text-slate-400 bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <Archive className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
            <p className="text-sm font-semibold">No archived records found.</p>
            <p className="text-xs text-slate-500">
              Patients discharged from active units will automatically appear here with their complete clinical files preserved.
            </p>
          </div>
        )}
      </div>

      {/* Historical Dossier Inspection Modal */}
      {viewingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-3xl bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-500" /> Historical File: {viewingPatient.fullName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  MRN: {viewingPatient.mrn} • {viewingPatient.age}y {viewingPatient.sex} • Code Status: {viewingPatient.codeStatus}
                </p>
              </div>
              <button
                onClick={() => setViewingPatient(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Admission Details</span>
                <p><span className="text-slate-500">Admitted:</span> {viewingPatient.admissionDate}</p>
                <p><span className="text-slate-500">Archived:</span> {viewingPatient.archiveDate || 'N/A'}</p>
                <p><span className="text-slate-500">Reason:</span> {viewingPatient.archiveReason || 'Discharged'}</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Diagnosis & Summary</span>
                <p className="font-semibold text-slate-900 dark:text-white">{viewingPatient.primaryDiagnosis}</p>
                <p className="text-slate-600 dark:text-slate-300">{viewingPatient.clinicalSummary}</p>
              </div>
            </div>

            {viewingPatient.dischargeSummary && (
              <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs space-y-1">
                <span className="font-bold text-cyan-600 dark:text-cyan-400 uppercase text-[10px]">
                  Discharge Summary / Transfer Plan
                </span>
                <p className="text-slate-800 dark:text-slate-200">{viewingPatient.dischargeSummary}</p>
              </div>
            )}

            {/* Cardiology highlights */}
            {viewingPatient.cardiology && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <span className="font-bold text-rose-500 uppercase text-[10px] flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5" /> Cardiology Dossier Record
                </span>
                <div className="grid grid-cols-3 gap-2 text-slate-700 dark:text-slate-300">
                  <p><span className="text-slate-400">LVEF:</span> {viewingPatient.cardiology.echo?.lvef || 50}%</p>
                  <p><span className="text-slate-400">Killip:</span> {viewingPatient.cardiology.killipClass || 'Class I'}</p>
                  <p><span className="text-slate-400">NYHA:</span> {viewingPatient.cardiology.nyhaClass || 'Class I'}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewingPatient(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = viewingPatient;
                  setViewingPatient(null);
                  handleOpenReadmit(p);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Re-admit Patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-admit Modal */}
      {showReadmitModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Re-admit Patient
            </h3>
            <p className="text-xs text-slate-400">
              Re-admitting <span className="font-bold text-cyan-400">{selectedPatient.fullName}</span> (MRN: {selectedPatient.mrn}). Previous historical data will be linked as Past Admission.
            </p>

            <form onSubmit={handleConfirmReadmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Unit
                </label>
                <select
                  value={targetUnitId}
                  onChange={(e) => {
                    const uid = e.target.value;
                    setTargetUnitId(uid);
                    const free = beds.find((b) => b.unitId === uid && !b.patientId);
                    setTargetBedId(free?.id || '');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assign Bed
                </label>
                <select
                  value={targetBedId}
                  onChange={(e) => setTargetBedId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                >
                  {availableBeds.length === 0 ? (
                    <option value="">No empty beds in this unit</option>
                  ) : (
                    availableBeds.map((b) => (
                      <option key={b.id} value={b.id}>
                        Bed {b.bedNumber} (Available)
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReadmitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetBedId}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
                >
                  Confirm Re-admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {patientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Permanently Delete File?
                </h3>
                <p className="text-xs text-slate-400">Irreversible clinical archive action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete the archived clinical file for{' '}
              <span className="font-bold text-slate-900 dark:text-white">{patientToDelete.fullName}</span> (MRN:{' '}
              {patientToDelete.mrn})? All notes, lab results, cardiology data, and vitals history will be erased.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPatientToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
              >
                Delete File Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
