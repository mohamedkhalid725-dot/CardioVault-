import React, { useState } from 'react';
import {
  UserPlus,
  Search,
  ClipboardList,
  Calculator,
  Plus,
  Settings,
  ChevronRight,
  Activity,
  BedDouble,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Unit } from '../../types/clinical';
import { UnitManagementModal } from '../units/UnitManagementModal';
import { AddPatientModal } from '../patient/AddPatientModal';

export const UnitsDashboard: React.FC = () => {
  const {
    units,
    beds,
    patients,
    setCurrentUnitId,
    setCurrentView,
    setIsSearchOpen,
    addUnit,
  } = useApp();

  const [showUnitManagementModal, setShowUnitManagementModal] = useState(false);
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);

  // Compute unit statistics (Critical, Unstable, Stable, Empty)
  const getUnitStats = (unitId: string) => {
    const unitBeds = beds.filter((b) => b.unitId === unitId);
    let critical = 0;
    let unstable = 0;
    let stable = 0;
    let empty = 0;

    unitBeds.forEach((bed) => {
      if (!bed.patientId) {
        empty += 1;
      } else {
        const patient = patients.find((p) => p.id === bed.patientId && !p.isArchived);
        if (!patient) {
          empty += 1;
        } else if (patient.status === 'Critical') {
          critical += 1;
        } else if (patient.status === 'Unstable') {
          unstable += 1;
        } else {
          stable += 1;
        }
      }
    });

    return {
      total: unitBeds.length,
      occupied: unitBeds.length - empty,
      empty,
      critical,
      unstable,
      stable,
    };
  };

  const handleSelectUnit = (unitId: string) => {
    setCurrentUnitId(unitId);
    setCurrentView('census');
  };

  // Overall totals
  const totalBeds = beds.length;
  const occupiedBeds = beds.filter((b) => b.patientId).length;
  const totalCritical = patients.filter((p) => !p.isArchived && p.status === 'Critical').length;
  const totalUnstable = patients.filter((p) => !p.isArchived && p.status === 'Unstable').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8 animate-in fade-in duration-200">
      {/* Overview Stat Strip - fully adaptive to light & dark modes */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl text-slate-900 dark:text-white flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-200 dark:border-cyan-500/30">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Active Clinical Census</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personal multi-unit tracking across {visibleUnits.length} clinical divisions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
          <div className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
            <span>
              {occupiedBeds} / {totalBeds} Beds Occupied
            </span>
          </div>
          {totalCritical > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800/50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>{totalCritical} Critical</span>
            </div>
          )}
          {totalUnstable > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-3.5 py-2 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{totalUnstable} Unstable</span>
            </div>
          )}
        </div>
      </div>

      {/* Units Section Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Units
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a clinical unit to access bed census and patient charts
            </p>
          </div>

          <button
            onClick={() => setShowUnitManagementModal(true)}
            className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40"
          >
            <Settings className="w-3.5 h-3.5" /> Manage Units
          </button>
        </div>

        {/* Units Grid (Reference Image 2 style) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleUnits.map((unit) => {
            const stats = getUnitStats(unit.id);

            return (
              <button
                key={unit.id}
                onClick={() => handleSelectUnit(unit.id)}
                className="group relative bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-[#16243B] border border-slate-200 dark:border-slate-800/90 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 rounded-2xl p-5 text-left transition-all duration-200 shadow-sm hover:shadow-xl focus:outline-none flex flex-col justify-between min-h-[140px]"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {unit.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {stats.total} Beds • {stats.occupied} Occupied
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Patient Status Badges matching reference 🟢 # 🟠 # 🔴 # */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs font-medium">
                  {/* Stable (Green) */}
                  <div
                    className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                    title={`${stats.stable} Stable Patients`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm" />
                    <span>{stats.stable}</span>
                  </div>

                  {/* Unstable (Orange) */}
                  <div
                    className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
                    title={`${stats.unstable} Unstable Patients`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm" />
                    <span>{stats.unstable}</span>
                  </div>

                  {/* Critical (Red) */}
                  <div
                    className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400"
                    title={`${stats.critical} Critical Patients`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm" />
                    <span>{stats.critical}</span>
                  </div>

                  {/* Empty beds count */}
                  <div className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                    {stats.empty} empty
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add Unit Card Button */}
          <button
            onClick={() => setShowUnitManagementModal(true)}
            className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-cyan-500/70 dark:hover:border-cyan-500/70 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2 group transition-all min-h-[140px] hover:bg-cyan-50/20 dark:hover:bg-cyan-950/10 focus:outline-none"
          >
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-cyan-500">
              Add Unit
            </span>
          </button>
        </div>
      </div>

      {/* Quick Actions (Reference Image 2) */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setShowAddPatientModal(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500 dark:hover:border-cyan-500/80 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserPlus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Add Patient
            </span>
          </button>

          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500 dark:hover:border-cyan-500/80 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Search className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Search
            </span>
          </button>

          <button
            onClick={() => setCurrentView('handover')}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500 dark:hover:border-cyan-500/80 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ClipboardList className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Handover
            </span>
          </button>

          <button
            onClick={() => setCurrentView('calculators')}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500 dark:hover:border-cyan-500/80 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calculator className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Calculators
            </span>
          </button>
        </div>
      </div>

      {/* Unit Management Modal */}
      <UnitManagementModal
        isOpen={showUnitManagementModal}
        onClose={() => setShowUnitManagementModal(false)}
      />

      {/* Add Patient Modal (stepped: unit -> bed -> details) */}
      <AddPatientModal
        isOpen={showAddPatientModal}
        onClose={() => setShowAddPatientModal(false)}
      />
    </div>
  );
};
