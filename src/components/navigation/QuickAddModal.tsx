import React from 'react';
import {
  Activity,
  Droplet,
  FileText,
  Pill,
  Cpu,
  CheckSquare,
  UserPlus,
  Stethoscope,
  FlaskConical,
  MessageSquare,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthorizationService, ACCESS_DENIED_MESSAGE } from '../../services/authorizationService';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: string) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose, onSelectAction }) => {
  const { currentUser, showToast } = useApp();

  if (!isOpen) return null;

  if (currentUser.role === 'viewer') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Quick Add Disabled</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {ACCESS_DENIED_MESSAGE} Viewers have read-only access.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const isNurse = currentUser.role === 'nurse';

  const nurseActions = [
    { id: 'quick-vitals', label: 'Vitals Entry', icon: Activity, color: 'text-rose-500 bg-rose-500/10' },
    { id: 'quick-io', label: 'Intake & Output', icon: Droplet, color: 'text-sky-500 bg-sky-500/10' },
    { id: 'quick-nursing-note', label: 'Nursing Note', icon: FileText, color: 'text-emerald-500 bg-emerald-500/10' },
    { id: 'quick-med-admin', label: 'Med Administration', icon: Pill, color: 'text-amber-500 bg-amber-500/10' },
    { id: 'quick-device', label: 'Device / Line', icon: Cpu, color: 'text-purple-500 bg-purple-500/10' },
    { id: 'quick-task', label: 'Clinical Task', icon: CheckSquare, color: 'text-cyan-500 bg-cyan-500/10' },
  ];

  const physicianActions = [
    { id: 'quick-admission', label: 'Admit Patient', icon: UserPlus, color: 'text-cyan-500 bg-cyan-500/10' },
    { id: 'quick-progress-note', label: 'Clinical Progress Note', icon: Stethoscope, color: 'text-emerald-500 bg-emerald-500/10' },
    { id: 'quick-med-order', label: 'Medication Order', icon: Pill, color: 'text-indigo-500 bg-indigo-500/10' },
    { id: 'quick-investigation', label: 'Order Investigation', icon: FlaskConical, color: 'text-amber-500 bg-amber-500/10' },
    { id: 'quick-consultation', label: 'Request Consultation', icon: MessageSquare, color: 'text-rose-500 bg-rose-500/10' },
    { id: 'quick-task', label: 'Assign Clinical Task', icon: CheckSquare, color: 'text-purple-500 bg-purple-500/10' },
  ];

  const actions = isNurse ? nurseActions : physicianActions;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl p-5 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-cyan-600 dark:text-cyan-400">
              {currentUser.role.replace('_', ' ').toUpperCase()} WORKFLOW
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Quick Add Action</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 py-4">
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => {
                  onSelectAction(action.id);
                  onClose();
                }}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-cyan-500 hover:bg-cyan-500/5 transition text-left"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${action.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                    {action.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
