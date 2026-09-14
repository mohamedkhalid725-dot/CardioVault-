import React, { useState, useMemo } from 'react';
import {
  X,
  Building2,
  BedDouble,
  UserPlus,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Stethoscope,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientStatus, Patient } from '../../types/clinical';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUnitId?: string;
  defaultBedId?: string;
}

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  isOpen,
  onClose,
  defaultUnitId,
  defaultBedId,
}) => {
  const { units, beds, patients, addPatient, showToast, selectPatient } = useApp();

  const [step, setStep] = useState<'unit' | 'bed' | 'details'>(
    defaultUnitId && defaultBedId ? 'details' : defaultUnitId ? 'bed' : 'unit'
  );

  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    defaultUnitId || (units.length > 0 ? units[0].id : '')
  );
  const [selectedBedId, setSelectedBedId] = useState<string>(defaultBedId || '');

  // Patient Form Fields
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<number>(55);
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [acuity, setAcuity] = useState<PatientStatus>('Stable');
  const [codeStatus, setCodeStatus] = useState<'Full Code' | 'DNR' | 'DNI' | 'Comfort Measures Only'>('Full Code');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [allergies, setAllergies] = useState('NKDA');

  // Beds in selected unit
  const unitBeds = useMemo(() => {
    return beds.filter((b) => b.unitId === selectedUnitId);
  }, [beds, selectedUnitId]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId);
  const selectedBed = beds.find((b) => b.id === selectedBedId);

  if (!isOpen) return null;

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setSelectedBedId(''); // reset bed selection
    setStep('bed');
  };

  const handleSelectBed = (bedId: string) => {
    setSelectedBedId(bedId);
    setStep('details');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !primaryDiagnosis.trim() || !selectedUnitId || !selectedBedId) {
      showToast('Please provide all required patient and unit assignment details.', 'error');
      return;
    }

    const patientData: Partial<Patient> = {
      fullName: fullName.trim(),
      age,
      sex,
      primaryDiagnosis: primaryDiagnosis.trim(),
      status: acuity,
      codeStatus,
      unitId: selectedUnitId,
      bedId: selectedBedId,
      allergies: allergies.split(',').map((s) => s.trim()).filter(Boolean),
      clinicalSummary: {
        chiefComplaint: chiefComplaint || primaryDiagnosis,
        hpi: `${fullName} is a ${age}yo ${sex} admitted to ${selectedUnit?.name || 'Unit'} Bed ${selectedBed?.bedNumber || ''} for ${primaryDiagnosis}.`,
        pmh: [],
        psh: [],
        drugHistory: 'Under clinical reconciliation',
        allergies: allergies.split(',').map((s) => s.trim()).filter(Boolean),
        familyHistory: 'Non-contributory',
        socialHistory: 'Non-smoker',
      },
    };

    const newPatient = addPatient(patientData, selectedBedId);
    if (newPatient) {
      selectPatient(newPatient.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header with Step Indicator */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Admit New Clinical Patient
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Step {step === 'unit' ? '1: Select Unit' : step === 'bed' ? '2: Select Bed' : '3: Patient Clinical Details'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progression Bar */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
              step === 'unit'
                ? 'bg-cyan-500 text-slate-950 border-cyan-500'
                : selectedUnitId
                ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
                : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px]">
              1
            </span>
            <span className="truncate">1. Unit</span>
            {selectedUnitId && step !== 'unit' && <Check className="w-3.5 h-3.5 ml-auto text-cyan-600 dark:text-cyan-400" />}
          </div>

          <div
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
              step === 'bed'
                ? 'bg-cyan-500 text-slate-950 border-cyan-500'
                : selectedBedId
                ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
                : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px]">
              2
            </span>
            <span className="truncate">2. Bed</span>
            {selectedBedId && step === 'details' && <Check className="w-3.5 h-3.5 ml-auto text-cyan-600 dark:text-cyan-400" />}
          </div>

          <div
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
              step === 'details'
                ? 'bg-cyan-500 text-slate-950 border-cyan-500'
                : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px]">
              3
            </span>
            <span className="truncate">3. Patient File</span>
          </div>
        </div>

        {/* STEP 1: Select Unit */}
        {step === 'unit' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Step 1: Choose Admitting Clinical Unit
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select the target department or unit where the patient will be admitted:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {units.map((unit) => {
                const uBeds = beds.filter((b) => b.unitId === unit.id);
                const occupiedCount = uBeds.filter((b) => b.patientId).length;
                const availableCount = uBeds.length - occupiedCount;
                const isSelected = selectedUnitId === unit.id;

                return (
                  <button
                    key={unit.id}
                    onClick={() => handleSelectUnit(unit.id)}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-sm ring-2 ring-cyan-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-cyan-500/50 hover:bg-white dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                          {unit.type}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {unit.name}
                        </h4>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        <Building2 className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {uBeds.length} Total Beds
                      </span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-full ${
                          availableCount > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {availableCount} Available
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Select Bed */}
        {step === 'bed' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Step 2: Assign Bed in {selectedUnit?.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select an available bed to admit the patient:
                </p>
              </div>
              <button
                onClick={() => setStep('unit')}
                className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change Unit
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {unitBeds.map((bed) => {
                const isOccupied = Boolean(bed.patientId);
                const occupant = isOccupied ? patients.find((p) => p.id === bed.patientId) : null;
                const isSelected = selectedBedId === bed.id;

                return (
                  <button
                    key={bed.id}
                    disabled={isOccupied}
                    onClick={() => handleSelectBed(bed.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30'
                        : isOccupied
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/30 opacity-60 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-cyan-500/50 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Bed {bed.bedNumber}
                      </span>
                      <BedDouble
                        className={`w-4 h-4 ${
                          isOccupied ? 'text-slate-400' : 'text-cyan-500'
                        }`}
                      />
                    </div>

                    {isOccupied ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-rose-500 font-bold block">Occupied</span>
                        <p className="text-[11px] text-slate-500 truncate font-medium">
                          {occupant?.fullName || 'Patient'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                        Vacant (Available)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {unitBeds.length === 0 && (
              <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-xs">
                No beds configured in this unit yet.
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Patient Details Form */}
        {step === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Assigned Unit & Bed:</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">
                  {selectedUnit?.name} — Bed {selectedBed?.bedNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('bed')}
                className="text-xs font-semibold text-slate-500 hover:text-cyan-500"
              >
                Change Bed
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Age & Sex
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value as any)}
                    className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Primary Admitting Diagnosis *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Acute STEMI, Cardiogenic Shock, Post-CABG, Acute Heart Failure"
                value={primaryDiagnosis}
                onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Acuity / Clinical Status
                </label>
                <select
                  value={acuity}
                  onChange={(e) => setAcuity(e.target.value as PatientStatus)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                >
                  <option value="Stable">Stable</option>
                  <option value="Unstable">Unstable</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Code Status
                </label>
                <select
                  value={codeStatus}
                  onChange={(e) => setCodeStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                >
                  <option value="Full Code">Full Code</option>
                  <option value="DNR">DNR (Do Not Resuscitate)</option>
                  <option value="DNI">DNI (Do Not Intubate)</option>
                  <option value="Comfort Measures Only">Comfort Measures Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Chief Complaint / Presenting Problem
              </label>
              <textarea
                rows={2}
                placeholder="Brief reason for admission, symptoms, onset..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Allergies
              </label>
              <input
                type="text"
                placeholder="NKDA, Penicillin, Contrast media..."
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep('bed')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Bed Selection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-cyan-500/20"
                >
                  Admit & Open Patient File
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
