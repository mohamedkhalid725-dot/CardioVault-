import React from 'react';
import {
  X,
  ClipboardList,
  Users2,
  Building2,
  Pill,
  BookOpen,
  Calculator,
  BarChart3,
  Archive,
  Settings,
  ShieldCheck,
  ChevronRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useApp, AppView } from '../../context/AppContext';

interface MoreDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoreDrawerModal: React.FC<MoreDrawerModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, setCurrentView, currentView } = useApp();

  if (!isOpen) return null;

  const navigateTo = (view: AppView) => {
    setCurrentView(view);
    onClose();
  };

  const menuItems: Array<{
    id: AppView;
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    adminOnly?: boolean;
  }> = [
    {
      id: 'ai-assistant',
      title: 'AI Clinical Assistant',
      subtitle: 'Synthesis, documentation drafts, ECG & lab assistance',
      icon: Sparkles,
      color: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      id: 'my-worklist',
      title: 'Personal Worklist',
      subtitle: 'My Patients, My Tasks, Pending Reviews',
      icon: ClipboardList,
      color: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      id: 'results-center',
      title: 'Results Center',
      subtitle: 'Pending, available, abnormal, and critical results',
      icon: FlaskConical,
      color: 'text-amber-500 bg-amber-500/10',
    },
    {
      id: 'team',
      title: 'Team Directory',
      subtitle: 'Department staff, roles, and shift coverage',
      icon: Users2,
      color: 'text-indigo-500 bg-indigo-500/10',
    },
    {
      id: 'protocols',
      title: 'Protocol Library',
      subtitle: 'Department-approved cardiology clinical pathways',
      icon: BookOpen,
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      id: 'statistics',
      title: 'Department Statistics',
      subtitle: 'Occupancy, admissions, workloads, and metrics',
      icon: BarChart3,
      color: 'text-purple-500 bg-purple-500/10',
    },
    {
      id: 'calculators',
      title: 'Calculators Hub',
      subtitle: 'Validated cardiology clinical scoring rules',
      icon: Calculator,
      color: 'text-amber-500 bg-amber-500/10',
    },
    {
      id: 'archive',
      title: 'Clinical Archive',
      subtitle: 'Discharged and historical patient records',
      icon: Archive,
      color: 'text-slate-500 bg-slate-500/10',
    },
    {
      id: 'audit-trail',
      title: 'Audit Trail & Corrections',
      subtitle: 'Immutable system audit log & correction history',
      icon: ShieldCheck,
      color: 'text-rose-500 bg-rose-500/10',
    },
    {
      id: 'settings',
      title: 'Settings & Security',
      subtitle: 'Department configuration and cloud sync',
      icon: Settings,
      color: 'text-slate-400 bg-slate-500/10',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Department Hub</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cardiology Department • More Tools</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/5'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Role: <strong className="text-cyan-500 uppercase">{currentUser.role.replace('_', ' ')}</strong></span>
            <span>CardioVault v2.1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
