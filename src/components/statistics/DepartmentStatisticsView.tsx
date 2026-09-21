import React from 'react';
import { BarChart3, BedDouble, Users, ArrowUpRight, ArrowDownLeft, CheckCircle, AlertTriangle, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClinicalWorkflowService } from '../../services/clinicalWorkflowService';

export const DepartmentStatisticsView: React.FC = () => {
  const { patients, beds, units } = useApp();
  const stats = ClinicalWorkflowService.computeDepartmentStatistics(patients, beds);

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500">
          Department Analytics & Census
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
          Cardiology Department Statistics
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Bed occupancy, clinical severity distribution, workload, and unit utilization
        </p>
      </div>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Bed Occupancy Rate</div>
          <div className="text-3xl font-black text-cyan-500 mt-1">{stats.occupancyRate}%</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.occupiedBeds} of {stats.totalBeds} beds occupied
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Available Beds</div>
          <div className="text-3xl font-black text-emerald-500 mt-1">{stats.availableBeds}</div>
          <div className="text-[11px] text-slate-500 mt-1">Ready for direct admission</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Admissions Today</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            {stats.newAdmissionsToday}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">New acute presentations</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Discharges Today</div>
          <div className="text-3xl font-black text-indigo-500 mt-1">{stats.dischargesToday}</div>
          <div className="text-[11px] text-slate-500 mt-1">Completed stays / transferred</div>
        </div>
      </div>

      {/* Severity & Clinical Distribution */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" />
              Patient Acuity Breakdown
            </h2>
            <span className="text-xs text-slate-400">{stats.activePatientsCount} Active</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-rose-500">Critical Acuity</span>
                <span>{stats.criticalCount} patients</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-rose-500 h-full rounded-full transition-all"
                  style={{
                    width: `${stats.activePatientsCount ? (stats.criticalCount / stats.activePatientsCount) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-amber-500">Unstable / Monitoring</span>
                <span>{stats.unstableCount} patients</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{
                    width: `${stats.activePatientsCount ? (stats.unstableCount / stats.activePatientsCount) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-emerald-500">Clinically Stable</span>
                <span>{stats.stableCount} patients</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${stats.activePatientsCount ? (stats.stableCount / stats.activePatientsCount) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Workload */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-cyan-500" />
            Clinical Workload Indicators
          </h2>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div className="text-[10px] uppercase font-bold text-slate-400">Pending Tasks</div>
              <div className="text-2xl font-black text-cyan-500 mt-1">{stats.pendingTasks}</div>
              <div className="text-[10px] text-slate-500 mt-1">Active nursing & physician tasks</div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div className="text-[10px] uppercase font-bold text-slate-400">Pending Labs</div>
              <div className="text-2xl font-black text-amber-500 mt-1">
                {stats.pendingInvestigations}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Awaiting laboratory / imaging</div>
            </div>
          </div>
        </div>
      </div>

      {/* Unit Utilization Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Unit Occupancy Breakdown</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {units.map(unit => {
            const unitBeds = beds.filter(b => b.unitId === unit.id);
            const occupied = unitBeds.filter(b => b.status !== 'Empty' && b.patientId).length;
            const rate = unitBeds.length > 0 ? Math.round((occupied / unitBeds.length) * 100) : 0;
            return (
              <div
                key={unit.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {unit.name}
                </div>
                <div className="text-[10px] text-slate-400">{unit.type}</div>
                <div className="flex items-baseline justify-between mt-3">
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {occupied} / {unitBeds.length}
                  </div>
                  <span className="text-xs font-bold text-cyan-500">{rate}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
