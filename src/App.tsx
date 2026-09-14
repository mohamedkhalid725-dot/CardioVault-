import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppHeader } from './components/navigation/AppHeader';
import { BottomNav } from './components/navigation/BottomNav';
import { LoginScreen } from './components/auth/LoginScreen';
import { UnitsDashboard } from './components/home/UnitsDashboard';
import { UnitCensusView } from './components/census/UnitCensusView';
import { PatientFileView } from './components/patient/PatientFileView';
import { ArchiveView } from './components/archive/ArchiveView';
import { CalculatorsSection } from './components/patient/sections/CalculatorsSection';
import { SettingsView } from './components/settings/SettingsView';
import { HandoverView } from './components/handover/HandoverView';
import { SearchModal } from './components/search/SearchModal';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const { auth, currentView, toasts, dismissToast, currentPatient } = useApp();

  // If not authenticated or locked with PIN, show login/lock screen
  if (!auth.isAuthenticated || auth.isLocked) {
    return <LoginScreen />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'home':
        return <UnitsDashboard />;
      case 'census':
        return <UnitCensusView />;
      case 'handover':
        return <HandoverView />;
      case 'patient':
        return <PatientFileView />;
      case 'archive':
        return <ArchiveView />;
      case 'calculators':
        return (
          <div className="max-w-6xl mx-auto px-4 py-6">
            <CalculatorsSection patient={currentPatient} />
          </div>
        );
      case 'settings':
        return <SettingsView />;
      default:
        return <UnitsDashboard />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070B13] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Fixed Application Header */}
      <AppHeader />

      {/* Main View Container */}
      <main className="flex-1 w-full pb-20 md:pb-8">
        {renderCurrentView()}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />

      {/* Universal Search Modal (Cmd+K) */}
      <SearchModal />

      {/* Global Toast Notifications Stack */}
      <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-xl border text-xs backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-100'
                : 'bg-slate-900/90 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <span className="font-medium leading-tight">{toast.message}</span>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
