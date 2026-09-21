import React, { useMemo } from 'react';
import { Activity, AlertTriangle, BedDouble, ClipboardCheck, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredWorkspaceAccess } from '../../services/workspaceAccess';

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
    {children}
  </div>
);

const roleLabels: Record<string, string> = {
  owner: 'Workspace Owner',
  clinical_editor: 'Clinical Editor',
  view_only: 'Viewer',
};

export const DepartmentPulse: React.FC = () => {
  const { units, beds, patients } = useApp();
  const access = getStoredWorkspaceAccess();
  const activePatients = patients.filter((patient) => !patient.isArchived);
  const occupiedBeds = beds.filter((bed) => activePatients.some((patient) => patient.id === bed.patientId)).length;
  const criticalPatients = activePatients.filter((patient) => patient.status === 'Critical').length;
  const attentionPatients = activePatients.filter((patient) => patient.status === 'Unstable' || patient.status === 'Critical').length;
  const today = new Date().toISOString().slice(0, 10);
  const newAdmissions = activePatients.filter((patient) => patient.admissionDate === today).length;
  const handoverReady = useMemo(
    () => activePatients.filter((patient) => patient.handover && Object.values(patient.handover).some((value) => typeof value === 'string' && value.trim())).length,
    [activePatients],
  );

  const metrics = [
    { label: 'Active patients', value: activePatients.length, icon: Activity, color: 'text-cyan-500' },
    { label: 'New admissions', value: newAdmissions, icon: UserPlus, color: 'text-emerald-500' },
    { label: 'Needs attention', value: attentionPatients, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Critical patients', value: criticalPatients, icon: AlertTriangle, color: 'text-rose-500' },
    { label: 'Handover records', value: handoverReady, icon: ClipboardCheck, color: 'text-sky-500' },
  ];

  return (
    <Panel className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-cyan-500">Department Pulse</div>
          <h2 className="text-lg font-black mt-1">{access?.unitName || 'Clinical Department'}</h2>
          <p className="text-[10px] text-slate-400 mt-1">A focused operational view of your permitted clinical workspace.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <span className="rounded-full bg-cyan-500/10 text-cyan-500 px-2.5 py-1">{roleLabels[access?.role || ''] || 'Clinical User'}</span>
          <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {occupiedBeds}/{beds.length} beds</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <Icon className={`w-4 h-4 ${color}`} />
            <div className="text-xl font-black mt-2">{value}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mt-1">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-3 text-[10px] text-slate-400">
        <span>{units.length} clinical unit{units.length === 1 ? '' : 's'} in scope</span>
        <span>{beds.length - occupiedBeds} available bed{beds.length - occupiedBeds === 1 ? '' : 's'}</span>
      </div>
    </Panel>
  );
};
