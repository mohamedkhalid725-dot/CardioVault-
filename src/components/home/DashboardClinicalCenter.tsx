import React, { useMemo } from 'react';
import {
  ArrowRight,
  Cloud,
  Users,
  BedDouble,
  ChevronRight,
  ClipboardCheck,
  AlertTriangle,
  HeartPulse,
  FileText,
  RefreshCw,
  Zap,
  CheckSquare,
  Clock,
  FlaskConical,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DepartmentPulse } from './DepartmentPulse';
import { AuthorizationService } from '../../services/authorizationService';
import { ClinicalWorkflowService } from '../../services/clinicalWorkflowService';

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}
  >
    {children}
  </div>
);

const SectionHead: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <div className="min-w-0">
      <h2 className="text-sm font-black flex items-center gap-2">
        <span className="text-cyan-500">{icon}</span>
        {title}
      </h2>
      {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type ClinicalAlert = { label: string; value: string; timestamp: string; severity: 'critical' | 'warning' };
const getAlerts = (p: any): ClinicalAlert[] => {
  const latestVital = (p.vitalsHistory || [])
    .slice()
    .sort(
      (a: any, b: any) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    )[0];
  const latestLab = (p.labs || [])
    .slice()
    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
  const f: ClinicalAlert[] = [];
  const hr = num(latestVital?.hr),
    sbp = num(latestVital?.sbp),
    spo2 = num(latestVital?.spo2),
    k = num(latestLab?.k),
    lact = num(latestLab?.lactate);
  const vt = latestVital?.timestamp || '';
  const lt = latestLab?.date || '';
  if (spo2 !== null && spo2 < 90) f.push({ label: 'Low SpO₂', value: `${spo2}%`, timestamp: vt, severity: 'critical' });
  if (sbp !== null && sbp < 90) f.push({ label: 'Hypotension', value: `${sbp} mmHg`, timestamp: vt, severity: 'critical' });
  if (hr !== null && hr > 100) f.push({ label: 'Tachycardia', value: `${hr} bpm`, timestamp: vt, severity: 'warning' });
  if (k !== null && k > 5.5) f.push({ label: 'Hyperkalemia', value: `${k} mmol/L`, timestamp: lt, severity: 'critical' });
  if (lact !== null && lact >= 2) f.push({ label: 'Elevated Lactate', value: `${lact} mmol/L`, timestamp: lt, severity: 'critical' });
  if (p.status === 'Critical') f.push({ label: 'Critical patient status', value: 'Critical', timestamp: vt || p.admissionDate, severity: 'critical' });
  return f;
};

const alertTime = (v: string) => {
  if (!v) return 'Latest documented value';
  const d = new Date(v);
  return v.includes('T') && !Number.isNaN(d.getTime()) ? d.toLocaleString() : v;
};

export const DashboardClinicalCenter: React.FC = () => {
  const {
    patients,
    beds,
    units,
    setCurrentPatientId,
    setCurrentView,
    isSyncing,
    lastSyncTime,
    syncNow,
    setCurrentUnitId,
    currentUser,
    privacySafeMonitor,
  } = useApp();

  const activeAll = patients.filter(p => !p.isArchived);
  const scopedActive = useMemo(
    () => AuthorizationService.filterAuthorizedPatients(activeAll, currentUser),
    [activeAll, currentUser]
  );
  const scopedUnits = useMemo(
    () => AuthorizationService.filterAuthorizedUnits(units, currentUser),
    [units, currentUser]
  );

  const activeIds = new Set(scopedActive.map(p => p.id));
  const scopedBeds = useMemo(() => {
    if (currentUser.role === 'department_admin' || currentUser.role === 'consultant') return beds;
    return beds.filter(b => currentUser.assignedUnitIds.includes(b.unitId));
  }, [beds, currentUser]);

  const occupied = scopedBeds.filter(b => !!b.patientId && activeIds.has(b.patientId)).length;
  const empty = Math.max(0, scopedBeds.length - occupied);
  const critical = scopedActive.filter(p => p.status === 'Critical');
  const unstable = scopedActive.filter(p => p.status === 'Unstable');

  // Attention board items (from clinical service)
  const attentionItems = useMemo(
    () => ClinicalWorkflowService.buildAttentionBoard(scopedActive, scopedBeds, currentUser),
    [scopedActive, scopedBeds, currentUser]
  );

  const patientAlerts = useMemo(
    () =>
      scopedActive
        .map(p => ({ patient: p, alerts: getAlerts(p) }))
        .filter(x => x.alerts.length > 0)
        .sort((a, b) => b.alerts.length - a.alerts.length),
    [scopedActive]
  );

  const formatName = (p: any) => {
    if (privacySafeMonitor) {
      return `${p.fullName?.charAt(0) || 'P'}. (${p.age || '—'}y ${p.sex || '—'})`;
    }
    return p.fullName;
  };

  const formatMrn = (mrn: string) => {
    if (privacySafeMonitor) {
      return '••••••';
    }
    return mrn;
  };

  const unitStats = (unitId: string) => {
    const unitBeds = scopedBeds.filter(b => b.unitId === unitId);
    const occupiedUnit = unitBeds.filter(b => b.patientId && activeIds.has(b.patientId));
    return {
      total: unitBeds.length,
      occupied: occupiedUnit.length,
      critical: occupiedUnit.filter(b => scopedActive.find(p => p.id === b.patientId)?.status === 'Critical').length,
      unstable: occupiedUnit.filter(b => scopedActive.find(p => p.id === b.patientId)?.status === 'Unstable').length,
    };
  };

  const openUnit = (id: string) => {
    setCurrentUnitId(id);
    setCurrentView('census');
  };

  const syncText = isSyncing ? 'Syncing…' : lastSyncTime ? 'Cloud synced' : 'Cloud sync pending';

  return (
    <div className="space-y-4 pb-4">
      <DepartmentPulse />

      {/* Title & Cloud status */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-cyan-500">
            Clinical Command Center
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-0.5">Today at a glance</h1>
          <p className="text-xs text-slate-400 mt-1">
            Live view of authorized patients, acute flags, unit status, and attention queues.
          </p>
        </div>
        <button
          onClick={() => void syncNow()}
          disabled={isSyncing}
          className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] px-3 py-2 text-[10px] font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-500 ${isSyncing ? 'animate-spin' : ''}`} />
          {syncText}
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <Panel className="p-3">
          <div className="text-[9px] font-black uppercase text-slate-400">Scoped patients</div>
          <div className="text-2xl font-black mt-1">{scopedActive.length}</div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[9px] font-black uppercase text-slate-400">Occupied beds</div>
          <div className="text-2xl font-black mt-1">
            {occupied}
            <span className="text-xs text-slate-400"> / {scopedBeds.length}</span>
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[9px] font-black uppercase text-slate-400">Empty beds</div>
          <div className="text-2xl font-black mt-1">{empty}</div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[9px] font-black uppercase text-slate-400">Critical</div>
          <div className="text-2xl font-black mt-1 text-rose-500">{critical.length}</div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[9px] font-black uppercase text-slate-400">Unstable</div>
          <div className="text-2xl font-black mt-1 text-amber-500">{unstable.length}</div>
        </Panel>
      </div>

      {/* Attention Board (Section 11) */}
      <Panel className="p-4">
        <SectionHead
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Patients Needing Attention (Live Board)"
          subtitle="Acuity flags, new presentations today, and pending critical clinical actions."
          action={
            <button
              onClick={() => setCurrentView('patients')}
              className="text-[10px] font-bold text-cyan-500"
            >
              All patients <ArrowRight className="inline w-3 h-3" />
            </button>
          }
        />
        {attentionItems.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {attentionItems.slice(0, 6).map(({ patient: p, reasons, severity }) => {
              const bed = beds.find(b => b.id === p.bedId);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentPatientId(p.id);
                    setCurrentView('patient');
                  }}
                  className={`text-left rounded-xl border p-3 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-200 ${
                    severity === 'critical'
                      ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                      />
                      <span className="font-bold text-xs truncate">{formatName(p)}</span>
                    </div>
                    <span
                      className={`text-[9px] font-black uppercase shrink-0 ${
                        severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 mt-1.5">
                    MRN {formatMrn(p.mrn)} • Bed {bed?.bedNumber || '—'}
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {reasons.map((r, i) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          severity === 'critical'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-xs text-slate-400 flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-emerald-500" />
            No patients currently require urgent clinical attention.
          </div>
        )}
      </Panel>

      {/* Units in Scope */}
      <Panel className="p-4">
        <SectionHead
          icon={<Users className="w-4 h-4" />}
          title="Clinical Units in Scope"
          subtitle="Live bed status for units you are authorized to view."
          action={<span className="text-[10px] text-slate-400">{scopedUnits.length} units</span>}
        />
        {scopedUnits.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {scopedUnits.map(unit => {
              const s = unitStats(unit.id);
              return (
                <button
                  key={unit.id}
                  onClick={() => openUnit(unit.id)}
                  className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate">{unit.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                        <BedDouble className="w-3 h-3" />
                        {s.occupied}/{s.total} occupied
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className="text-emerald-500">
                      ● {Math.max(0, s.occupied - s.critical - s.unstable)} stable
                    </span>
                    <span className="text-amber-500">● {s.unstable} unstable</span>
                    <span className="text-rose-500">● {s.critical} critical</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-5 text-center">
            No clinical units in scope for your current role.
          </div>
        )}
      </Panel>

      {/* Quick Navigation Cards */}
      <Panel className="p-4">
        <SectionHead icon={<Zap className="w-4 h-4" />} title="Workspaces & Quick Access" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => setCurrentView('my-worklist')}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
          >
            <div className="text-cyan-500 mb-2">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold">Personal Worklist</div>
            <div className="text-[10px] text-slate-400 mt-0.5">My tasks & reviews</div>
          </button>

          <button
            onClick={() => setCurrentView('team')}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
          >
            <div className="text-indigo-500 mb-2">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold">Team Directory</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Staff & coverage</div>
          </button>

          <button
            onClick={() => setCurrentView('protocols')}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
          >
            <div className="text-emerald-500 mb-2">
              <FileText className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold">Protocol Library</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Clinical pathways</div>
          </button>

          <button
            onClick={() => setCurrentView('statistics')}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
          >
            <div className="text-purple-500 mb-2">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold">Department Stats</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Census & metrics</div>
          </button>
        </div>
      </Panel>

      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 px-1">
        <span className="flex items-center gap-1">
          <Cloud className="w-3 h-3 text-cyan-500" />
          {syncText}
          {lastSyncTime && <> • {lastSyncTime}</>}
        </span>
        <span>
          {scopedUnits.length} authorized units • {scopedActive.length} patients in scope
        </span>
      </div>
    </div>
  );
};
