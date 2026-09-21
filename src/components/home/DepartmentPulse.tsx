import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  ClipboardCheck,
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  Flame,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthorizationService } from '../../services/authorizationService';
import { EmergencyBreakGlassModal } from '../modals/EmergencyBreakGlassModal';
import { UserProfile } from '../../types/clinical';

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

export const DepartmentPulse: React.FC = () => {
  const {
    units,
    beds,
    patients,
    currentUser,
    setCurrentUser,
    privacySafeMonitor,
    setPrivacySafeMonitor,
    showToast,
  } = useApp();

  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

  const availableUsers = useMemo(() => AuthorizationService.getUsers(), []);

  // Filter patients and beds in user's clinical scope
  const scopedPatients = useMemo(
    () => AuthorizationService.filterAuthorizedPatients(patients.filter(p => !p.isArchived), currentUser),
    [patients, currentUser]
  );

  const scopedUnits = useMemo(
    () => AuthorizationService.filterAuthorizedUnits(units, currentUser),
    [units, currentUser]
  );

  const scopedBeds = useMemo(() => {
    if (currentUser.role === 'department_admin' || currentUser.role === 'consultant') return beds;
    return beds.filter(b => (currentUser.assignedUnitIds || []).includes(b.unitId));
  }, [beds, currentUser]);

  const occupiedBeds = scopedBeds.filter(bed =>
    scopedPatients.some(patient => patient.id === bed.patientId)
  ).length;

  const criticalPatients = scopedPatients.filter(patient => patient.status === 'Critical').length;
  const attentionPatients = scopedPatients.filter(
    patient => patient.status === 'Unstable' || patient.status === 'Critical'
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const newAdmissions = scopedPatients.filter(patient => patient.admissionDate === today).length;

  const handoverReady = useMemo(
    () =>
      scopedPatients.filter(
        patient =>
          patient.handover &&
          Object.values(patient.handover).some(value => typeof value === 'string' && value.trim())
      ).length,
    [scopedPatients]
  );

  const metrics = [
    { label: 'Scoped patients', value: scopedPatients.length, icon: Activity, color: 'text-cyan-500' },
    { label: 'New admissions', value: newAdmissions, icon: UserPlus, color: 'text-emerald-500' },
    { label: 'Needs attention', value: attentionPatients, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Critical patients', value: criticalPatients, icon: AlertTriangle, color: 'text-rose-500' },
    { label: 'Handover records', value: handoverReady, icon: ClipboardCheck, color: 'text-sky-500' },
  ];

  const handleSelectPersona = (u: UserProfile) => {
    setCurrentUser(u);
    setIsUserSwitcherOpen(false);
    showToast(`Active profile switched to ${u.name} (${u.role.toUpperCase()})`, 'info');
  };

  return (
    <>
      <Panel className="p-4">
        {/* Clinician Profile & Scope Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 mb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 p-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-left">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div>
                <div className="text-[11px] font-black text-slate-900 dark:text-white">
                  {currentUser.name}
                </div>
                <div className="text-[9px] uppercase font-bold text-cyan-600 dark:text-cyan-400">
                  {currentUser.role.replace('_', ' ')} • {scopedUnits.map(u => u.name).join(', ') || 'All Units'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Privacy-Safe Monitor Mode Toggle */}
            <button
              onClick={() => {
                setPrivacySafeMonitor(!privacySafeMonitor);
                showToast(
                  privacySafeMonitor
                    ? 'Ward Monitor Mode deactivated: Full names visible.'
                    : 'Ward Monitor Mode active: Protected patient names masked for display.',
                  'info'
                );
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                privacySafeMonitor
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="Toggle privacy-safe view for shared ward monitors or rounds"
            >
              {privacySafeMonitor ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{privacySafeMonitor ? 'Monitor Mode: MASKED' : 'Monitor Mode'}</span>
            </button>

            {/* Emergency Break-Glass Button */}
            <button
              onClick={() => setIsBreakGlassOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 transition shadow-sm"
              title="Activate emergency cross-unit override"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Break-Glass</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-cyan-500">
              Department Command Center
            </div>
            <h2 className="text-lg font-black mt-1">Cardiology Operations Pulse</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Live census, acute patients, and bed utilization filtered to your clinical authorization.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <BedDouble className="w-3.5 h-3.5 text-cyan-500" />
              {occupiedBeds}/{scopedBeds.length} beds occupied (
              {scopedBeds.length > 0 ? Math.round((occupiedBeds / scopedBeds.length) * 100) : 0}%)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white/50 dark:bg-slate-900/30"
            >
              <Icon className={`w-4 h-4 ${color}`} />
              <div className="text-xl font-black mt-2">{value}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 mt-3 text-[10px] text-slate-400">
          <span>{scopedUnits.length} authorized clinical unit{scopedUnits.length === 1 ? '' : 's'}</span>
          <span>{scopedBeds.length - occupiedBeds} available bed{scopedBeds.length - occupiedBeds === 1 ? '' : 's'}</span>
        </div>
      </Panel>

      <EmergencyBreakGlassModal
        isOpen={isBreakGlassOpen}
        onClose={() => setIsBreakGlassOpen(false)}
      />
    </>
  );
};
