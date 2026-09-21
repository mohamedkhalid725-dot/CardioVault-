import React, { useState } from 'react';
import { Home, LayoutGrid, Plus, Users, Menu } from 'lucide-react';
import { useApp, AppView } from '../../context/AppContext';
import { QuickAddModal } from './QuickAddModal';
import { MoreDrawerModal } from './MoreDrawerModal';

interface BottomNavProps {
  onQuickAction?: (actionId: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAction }) => {
  const { currentView, setCurrentView, currentUnitId, setCurrentUnitId, units, beds } = useApp();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isHomeActive = currentView === 'home';
  const isUnitActive = currentView === 'census';
  const isPatientsActive = currentView === 'patients' || currentView === 'patient';
  const isMoreActive = [
    'my-worklist',
    'team',
    'protocols',
    'statistics',
    'calculators',
    'archive',
    'audit-trail',
    'settings',
  ].includes(currentView);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B111E]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/80 px-2 pt-1.5 pb-[calc(0.375rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] shadow-lg">
        <div className="w-full max-w-lg mx-auto grid grid-cols-5 items-center">
          {/* HOME */}
          <button
            id="nav-home-btn"
            onClick={() => setCurrentView('home')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              isHomeActive ? 'text-cyan-500 font-semibold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">HOME</span>
          </button>

          {/* UNIT */}
          <button
            id="nav-unit-btn"
            onClick={() => { const target=currentUnitId && beds.some(b=>b.unitId===currentUnitId) ? currentUnitId : units.find(u=>beds.some(b=>b.unitId===u.id))?.id || units[0]?.id || null; if(target)setCurrentUnitId(target); setCurrentView('census'); }}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              isUnitActive ? 'text-cyan-500 font-semibold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">UNIT</span>
          </button>

          {/* + QUICK ADD */}
          <div className="flex justify-center -mt-6">
            <button
              id="nav-quick-add-btn"
              onClick={() => setIsQuickAddOpen(true)}
              className="w-12 h-12 rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 border-4 border-white dark:border-[#0B111E] flex items-center justify-center hover:scale-105 active:scale-95 transition"
              title="Quick Add Action"
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>

          {/* PATIENTS */}
          <button
            id="nav-patients-btn"
            onClick={() => setCurrentView('patients')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              isPatientsActive ? 'text-cyan-500 font-semibold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">PATIENTS</span>
          </button>

          {/* MORE */}
          <button
            id="nav-more-btn"
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              isMoreActive ? 'text-cyan-500 font-semibold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">MORE</span>
          </button>
        </div>
      </nav>

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSelectAction={actionId => {
          if (onQuickAction) {
            onQuickAction(actionId);
          } else {
            if (actionId === 'quick-admission') setCurrentView('add-patient');
            else if (actionId === 'quick-task') setCurrentView('my-worklist');
            else setCurrentView('patients');
          }
        }}
      />

      <MoreDrawerModal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  );
};
