import React from 'react';
import { Home, Archive, Calculator, Settings, Users, Plus } from 'lucide-react';
import { useApp, AppView } from '../../context/AppContext';

export const BottomNav: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const items: Array<{ id: AppView; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'patients', label: 'Patient', icon: Users },
    { id: 'calculators', label: 'Calculators', icon: Calculator },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B111E]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/80 px-1 py-1.5 shadow-lg md:flex xl:hidden">
      <div className="w-full max-w-2xl mx-auto grid grid-cols-6 items-end gap-0.5">
        {items.slice(0, 2).map(item => {
          const Icon = item.icon;
          const active = currentView === item.id || (item.id === 'home' && (currentView === 'census' || currentView === 'patient'));
          return <button key={item.id} onClick={() => setCurrentView(item.id)} className={`flex flex-col items-center justify-center py-1.5 rounded-xl ${active ? 'text-cyan-500 dark:text-cyan-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}><Icon className="w-5 h-5"/><span className="text-[10px] mt-1">{item.label}</span></button>;
        })}
        <button onClick={() => setCurrentView('patients')} className={`flex flex-col items-center justify-center py-1.5 rounded-xl ${currentView === 'patients' || currentView === 'patient' ? 'text-cyan-500 dark:text-cyan-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}><Users className="w-5 h-5"/><span className="text-[10px] mt-1">Patient</span></button>
        <button onClick={() => setCurrentView('add-patient')} className="flex items-center justify-center -mt-5"><span className="w-12 h-12 rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 border-4 border-white dark:border-[#0B111E] flex items-center justify-center"><Plus className="w-6 h-6"/></span></button>
        {items.slice(3).map(item => { const Icon = item.icon; const active = currentView === item.id; return <button key={item.id} onClick={() => setCurrentView(item.id)} className={`flex flex-col items-center justify-center py-1.5 rounded-xl ${active ? 'text-cyan-500 dark:text-cyan-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}><Icon className="w-5 h-5"/><span className="text-[10px] mt-1">{item.label}</span></button>; })}
      </div>
    </nav>
  );
};
