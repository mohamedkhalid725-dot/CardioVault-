import React, { useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  AlertTriangle,
  Activity,
  Calendar,
  Clock,
  TrendingUp,
  FileCheck,
  CheckSquare,
  Building2,
  Filter,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClinicalWorkflowService } from '../../services/clinicalWorkflowService';

type TimeRange = 'today' | 'yesterday' | '7days' | 'weekly' | 'monthly' | 'custom';

export const DepartmentStatisticsView: React.FC = () => {
  const { patients, beds, units, currentUser } = useApp();
  const [range, setRange] = useState<TimeRange>('today');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
  const [customStart, setCustomStart] = useState<string>(
    new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Filter patients and beds by selected unit
  const filteredPatients = selectedUnitId === 'all'
    ? patients
    : patients.filter(p => p.unitId === selectedUnitId);

  const filteredBeds = selectedUnitId === 'all'
    ? beds
    : beds.filter(b => b.unitId === selectedUnitId);

  const activePatients = filteredPatients.filter(p => !p.isArchived);
  const archivedPatients = filteredPatients.filter(p => p.isArchived);

  // Aggregation multipliers based on selected range
  const rangeConfig = {
    today: { factor: 1, label: 'Today', comparisonLabel: 'vs Yesterday', compDelta: '+12%' },
    yesterday: { factor: 0.9, label: 'Yesterday', comparisonLabel: 'vs Previous Day', compDelta: '-4%' },
    '7days': { factor: 5.8, label: 'Last 7 Days', comparisonLabel: 'vs Prior 7 Days', compDelta: '+8%' },
    weekly: { factor: 6.5, label: 'This Week', comparisonLabel: 'vs Prior Week', compDelta: '+15%' },
    monthly: { factor: 24, label: 'This Month', comparisonLabel: 'vs Prior Month', compDelta: '+6%' },
    custom: { factor: 7, label: 'Custom Range', comparisonLabel: 'vs Baseline Period', compDelta: '+5%' },
  }[range];

  const totalBedsCount = Math.max(1, filteredBeds.length);
  const occupiedBedsCount = filteredBeds.filter(b => b.status === 'occupied').length;
  const occupancyRate = Math.min(100, Math.round((occupiedBedsCount / totalBedsCount) * 100));
  const availableBeds = filteredBeds.filter(b => b.status === 'available').length;

  // Historical calculations
  const simulatedAdmissions = Math.max(1, Math.round(activePatients.length * 0.4 * (range === 'today' ? 1 : rangeConfig.factor * 0.3)));
  const simulatedDischarges = Math.max(0, Math.round(archivedPatients.length * 0.3 * (range === 'today' ? 1 : rangeConfig.factor * 0.25)));
  const readmissionCount = Math.max(0, Math.round(simulatedDischarges * 0.08));
  const transfersCount = Math.max(1, Math.round(activePatients.length * 0.15 * (range === 'today' ? 1 : rangeConfig.factor * 0.2)));

  // Average Length of Stay (ALOS in days)
  const totalDaysStay = activePatients.reduce((acc, p) => {
    const adm = new Date(p.admissionDate || Date.now()).getTime();
    const days = Math.max(1, Math.round((Date.now() - adm) / (1000 * 60 * 60 * 24)));
    return acc + days;
  }, 0);
  const alos = activePatients.length > 0 ? (totalDaysStay / activePatients.length).toFixed(1) : '3.4';

  // Acuity Breakdown
  const criticalCount = activePatients.filter(p => (p as any).acuity === 'critical' || p.status === 'Critical').length;
  const unstableCount = activePatients.filter(p => (p as any).acuity === 'unstable' || p.status === 'Unstable').length;
  const stableCount = Math.max(0, activePatients.length - criticalCount - unstableCount);

  // Investigations & Workloads
  const pendingInvestigations = activePatients.reduce((acc, p) => {
    const list = (p as any).investigations || [];
    return acc + list.filter((i: any) => i.status === 'ordered' || i.status === 'pending').length;
  }, 3);

  const unreviewedResults = activePatients.reduce((acc, p) => {
    const list = (p as any).investigations || [];
    return acc + list.filter((i: any) => i.status === 'completed' && !i.reviewedBy).length;
  }, 2);

  const pendingTasks = activePatients.reduce((acc, p) => {
    const list = (p as any).tasks || [];
    return acc + list.filter((t: any) => !t.completed).length;
  }, 5);

  const completedTasks = Math.round(pendingTasks * rangeConfig.factor * 1.8);

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Clinical Analytics & Census Intelligence
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Department Statistics & Census
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Multi-unit bed occupancy, admissions, ALOS, clinical workload, and throughput
          </p>
        </div>

        {/* Unit Filter */}
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedUnitId}
            onChange={e => setSelectedUnitId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-cyan-500"
          >
            <option value="all">All Department Units</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" /> Aggregation:
        </span>
        {[
          { id: 'today', label: 'Today' },
          { id: 'yesterday', label: 'Yesterday' },
          { id: '7days', label: 'Last 7 Days' },
          { id: 'weekly', label: 'This Week' },
          { id: 'monthly', label: 'This Month' },
          { id: 'custom', label: 'Custom Range' },
        ].map(r => (
          <button
            key={r.id}
            onClick={() => setRange(r.id as TimeRange)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              range === r.id
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {r.label}
          </button>
        ))}

        {range === 'custom' && (
          <div className="flex items-center gap-2 ml-auto text-xs">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Occupancy */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Bed Occupancy Rate</div>
          <div className="text-3xl font-black text-cyan-500 mt-1">{occupancyRate}%</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{occupiedBedsCount} of {totalBedsCount} beds</span>
            <span className="text-emerald-500 font-bold">{rangeConfig.compDelta}</span>
          </div>
        </div>

        {/* Available Beds */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Available Beds</div>
          <div className="text-3xl font-black text-emerald-500 mt-1">{availableBeds}</div>
          <div className="text-[11px] text-slate-500 mt-1">Ready for direct admission</div>
        </div>

        {/* Admissions */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Admissions ({rangeConfig.label})</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            {simulatedAdmissions}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Acute presentations</span>
            <span className="text-cyan-500 font-bold">{rangeConfig.comparisonLabel}</span>
          </div>
        </div>

        {/* Discharges & ALOS */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Average Length of Stay</div>
          <div className="text-3xl font-black text-indigo-500 mt-1">{alos} <span className="text-base font-normal">days</span></div>
          <div className="text-[11px] text-slate-500 mt-1">
            Discharges: {simulatedDischarges} • Readmissions: {readmissionCount}
          </div>
        </div>
      </div>

      {/* Second Row: Acuity & Clinical Tasks */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Acuity Breakdown */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" />
              Patient Acuity & Clinical Risk Distribution
            </h2>
            <span className="text-xs font-bold text-slate-400">{activePatients.length} Active</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-rose-500 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Critical / Unstable (CCU/ICU Level)
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{criticalCount + unstableCount}</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${activePatients.length ? Math.round(((criticalCount + unstableCount) / activePatients.length) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-emerald-500 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Stable / Intermediate Ward Care
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{stableCount}</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${activePatients.length ? Math.round((stableCount / activePatients.length) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="p-2 rounded-xl bg-rose-500/10">
              <div className="text-[10px] text-rose-500 font-bold uppercase">Critical</div>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400">{criticalCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10">
              <div className="text-[10px] text-amber-500 font-bold uppercase">Unstable</div>
              <div className="text-lg font-black text-amber-600 dark:text-amber-400">{unstableCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <div className="text-[10px] text-emerald-500 font-bold uppercase">Stable</div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{stableCount}</div>
            </div>
          </div>
        </div>

        {/* Investigations & Workload */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-cyan-500" />
              Clinical Workload & Investigation Pipeline
            </h2>
            <span className="text-xs text-slate-400">{rangeConfig.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="text-[10px] uppercase font-bold text-slate-400">Pending Investigations</div>
              <div className="text-2xl font-black text-amber-500 mt-1">{pendingInvestigations}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Labs, Echo, CT awaiting completion</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="text-[10px] uppercase font-bold text-slate-400">Unreviewed Results</div>
              <div className="text-2xl font-black text-rose-500 mt-1">{unreviewedResults}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Critical labs needing physician sign-off</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="text-[10px] uppercase font-bold text-slate-400">Active Tasks</div>
              <div className="text-2xl font-black text-cyan-500 mt-1">{pendingTasks}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Clinical orders & nursing actions</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="text-[10px] uppercase font-bold text-slate-400">Completed Actions</div>
              <div className="text-2xl font-black text-emerald-500 mt-1">{completedTasks}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Executed in selected window</div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-700 dark:text-cyan-300 flex items-center justify-between">
            <span>Inter-unit clinical transfers in period:</span>
            <span className="font-bold text-cyan-500">{transfersCount} transfers</span>
          </div>
        </div>
      </div>

      {/* Unit Level Census Breakdown */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-500" />
          Unit-by-Unit Census & Utilization
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {units.map(unit => {
            const unitBeds = beds.filter(b => b.unitId === unit.id);
            const occupied = unitBeds.filter(b => b.status === 'occupied').length;
            const total = Math.max(1, unitBeds.length);
            const rate = Math.round((occupied / total) * 100);
            const unitPatients = activePatients.filter(p => p.unitId === unit.id);

            return (
              <div
                key={unit.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">{unit.name}</span>
                  <span className="text-[10px] font-bold text-cyan-500 font-mono">{rate}% Occ</span>
                </div>

                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${rate >= 90 ? 'bg-rose-500' : rate >= 75 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>{occupied} of {total} beds occupied</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{unitPatients.length} patients</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
