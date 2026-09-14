import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Moon,
  Sun,
  Lock,
  Database,
  RefreshCw,
  User,
  Key,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  Building2,
  BedDouble,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { UnitManagementModal } from '../units/UnitManagementModal';

export const SettingsView: React.FC = () => {
  const {
    theme,
    toggleTheme,
    auth,
    lockApp,
    resetDatabase,
    showToast,
    units,
    beds,
    patients,
    addUnit,
    updateUnit,
    deleteUnit,
  } = useApp();

  const [showUnitModal, setShowUnitModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [doctorName, setDoctorName] = useState(auth.userName);
  const [doctorEmail, setDoctorEmail] = useState(auth.userEmail);

  // Embedded Unit Management quick add/edit
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitFormName, setUnitFormName] = useState('');
  const [unitFormType, setUnitFormType] = useState('Intensive Care');
  const [unitFormBeds, setUnitFormBeds] = useState(6);
  const [unitToDelete, setUnitToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    StorageService.saveAuth({ userName: doctorName, userEmail: doctorEmail });
    showToast('Clinician profile updated', 'success');
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      showToast('New PIN and confirmation do not match', 'error');
      return;
    }

    StorageService.saveAuth({ pinCode: newPin });
    setNewPin('');
    setConfirmPin('');
    showToast('Security PIN updated successfully', 'success');
  };

  const handleExportBackup = () => {
    const backupData = {
      units: StorageService.getUnits(),
      beds: StorageService.getBeds(),
      patients: StorageService.getPatients(),
      timestamp: new Date().toISOString(),
      appVersion: '2.4.0',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cardiovault_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Clinical database exported successfully', 'success');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-cyan-500" /> System Settings & Security
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Physician credentials, local biometric/PIN protection, visual theme & data persistence
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Clinician Profile */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <User className="w-5 h-5 text-cyan-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Clinician Profile & Digital Signature
            </h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name & Title
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Institutional Email
              </label>
              <input
                type="email"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
            >
              Update Profile
            </button>
          </form>
        </div>

        {/* Security & PIN Lock */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Shield className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Security PIN & Privacy Lock
            </h2>
          </div>

          <form onSubmit={handleUpdatePin} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tracking-widest text-center font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tracking-widest text-center font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Change PIN
              </button>

              <button
                type="button"
                onClick={lockApp}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold"
              >
                <Lock className="w-3.5 h-3.5 text-cyan-500" /> Lock Screen Now
              </button>
            </div>
          </form>
        </div>

        {/* Display & Interface */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Sun className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Visual Theme & Appearance
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-slate-500 dark:text-slate-400">
              High-contrast dark mode is optimized for low-light critical care and night shift rounds.
            </p>

            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold transition-colors"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" /> Switch to High-Visibility Light Mode
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-500" /> Switch to Deep ICU Dark Mode
                </>
              )}
            </button>
          </div>
        </div>

        {/* Database Management & Local Storage */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Database className="w-5 h-5 text-cyan-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Database Persistence & Backup
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-slate-500 dark:text-slate-400">
              CardioVault runs with client-side zero-knowledge encryption in localStorage. You can export a full JSON backup of all patient records anytime.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleExportBackup}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export Database Backup
              </button>

              <button
                onClick={() => {
                  if (confirm('Reset database back to the standard sample clinical dataset? All custom edits will be reverted.')) {
                    resetDatabase();
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold border border-rose-500/30 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset to Clinical Sample Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DEDICATED UNIT MANAGEMENT SECTION (Requirement 3) */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Clinical Unit & Bed Capacity Management
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure wards, ICUs, coronary divisions, and bed allocations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingUnitId(null);
                setUnitFormName('');
                setUnitFormType('Intensive Care');
                setUnitFormBeds(6);
                setIsAddingUnit(!isAddingUnit);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> {isAddingUnit ? 'Close Form' : 'Add New Unit'}
            </button>
            <button
              type="button"
              onClick={() => setShowUnitModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
            >
              Full Dialog Mode
            </button>
          </div>
        </div>

        {/* Inline Add / Edit Unit Form */}
        {isAddingUnit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!unitFormName.trim()) return;
              if (editingUnitId) {
                updateUnit(editingUnitId, { name: unitFormName.trim(), type: unitFormType });
                showToast('Unit updated', 'success');
              } else {
                addUnit(unitFormName.trim(), unitFormType, unitFormBeds);
                showToast(`Created unit "${unitFormName.trim()}" with ${unitFormBeds} beds`, 'success');
              }
              setIsAddingUnit(false);
              setEditingUnitId(null);
              setUnitFormName('');
            }}
            className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {editingUnitId ? 'Edit Clinical Unit' : 'Add New Clinical Unit'}
              </span>
              <button
                type="button"
                onClick={() => setIsAddingUnit(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coronary ICU"
                  value={unitFormName}
                  onChange={(e) => setUnitFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Specialty / Type
                </label>
                <select
                  value={unitFormType}
                  onChange={(e) => setUnitFormType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</option>
                  <option value="Coronary Care Unit (CCU)">Coronary Care Unit (CCU)</option>
                  <option value="Neuro ICU">Neuro ICU</option>
                  <option value="Pediatric ICU (PICU)">Pediatric ICU (PICU)</option>
                  <option value="Surgical ICU (SICU)">Surgical ICU (SICU)</option>
                  <option value="Cardiac Surgery ICU (CSICU)">Cardiac Surgery ICU (CSICU)</option>
                  <option value="Cardiology Inpatient Ward">Cardiology Inpatient Ward</option>
                  <option value="Custom Clinical Unit">Custom Clinical Unit</option>
                </select>
              </div>

              {!editingUnitId && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Initial Bed Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={unitFormBeds}
                    onChange={(e) => setUnitFormBeds(parseInt(e.target.value) || 4)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingUnit(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg"
              >
                {editingUnitId ? 'Save Changes' : 'Create Unit'}
              </button>
            </div>
          </form>
        )}

        {/* Existing Units Table */}
        <div className="space-y-2">
          {units.map((unit) => {
            const unitBeds = beds.filter((b) => b.unitId === unit.id);
            const admittedPatients = patients.filter((p) => p.unitId === unit.id && !p.isArchived);

            return (
              <div
                key={unit.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-cyan-600 dark:text-cyan-400">
                    <BedDouble className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{unit.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {unit.type || 'Clinical Division'} • {unitBeds.length} Beds ({admittedPatients.length} Active Patients)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {admittedPatients.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                      {admittedPatients.length} Admitted
                    </span>
                  )}

                  <button
                    onClick={() => {
                      setEditingUnitId(unit.id);
                      setUnitFormName(unit.name);
                      setUnitFormType(unit.type || 'Intensive Care');
                      setIsAddingUnit(true);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title="Edit / Rename Unit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      if (admittedPatients.length > 0) {
                        showToast(
                          `Cannot delete "${unit.name}". It contains ${admittedPatients.length} admitted patient(s). Transfer or discharge them first.`,
                          'error'
                        );
                        return;
                      }
                      setUnitToDelete({ id: unit.id, name: unit.name });
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                    title="Delete Unit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unit Deletion Confirmation Modal */}
      {unitToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Clinical Unit
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">"{unitToDelete.name}"</strong>? All associated unoccupied beds will be permanently removed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setUnitToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUnit(unitToDelete.id);
                  setUnitToDelete(null);
                  showToast(`Unit "${unitToDelete.name}" deleted`, 'success');
                }}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Modal Mode */}
      <UnitManagementModal
        isOpen={showUnitModal}
        onClose={() => setShowUnitModal(false)}
      />
    </div>
  );
};
