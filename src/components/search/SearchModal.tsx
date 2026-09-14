import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  User,
  Activity,
  BedDouble,
  Building2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Patient } from '../../types/clinical';

export const SearchModal: React.FC = () => {
  const {
    isSearchOpen,
    setIsSearchOpen,
    patients,
    units,
    setCurrentPatientId,
    setCurrentView,
    setCurrentUnitId,
    setActivePatientSection,
  } = useApp();

  const [query, setQuery] = useState('');

  // Handle Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const matchedPatients = query.trim()
    ? patients.filter(
        (p) =>
          p.fullName.toLowerCase().includes(query.toLowerCase()) ||
          p.mrn.toLowerCase().includes(query.toLowerCase()) ||
          p.primaryDiagnosis.toLowerCase().includes(query.toLowerCase())
      )
    : patients.slice(0, 5);

  const handleSelectPatient = (patient: Patient) => {
    setCurrentPatientId(patient.id);
    setCurrentUnitId(patient.unitId);
    setActivePatientSection('overview');
    setCurrentView('patient');
    setIsSearchOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div
        className="fixed inset-0"
        onClick={() => setIsSearchOpen(false)}
      />

      <div className="w-full max-w-xl bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 gap-3">
          <Search className="w-5 h-5 text-cyan-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients by name, MRN, diagnosis..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {query.trim() ? `Search Results (${matchedPatients.length})` : 'Recent Inpatients'}
          </div>

          {matchedPatients.map((p) => {
            const unit = units.find((u) => u.id === p.unitId);
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPatient(p)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center font-bold text-xs">
                    {p.fullName.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-cyan-500 transition-colors">
                      {p.fullName}
                    </h4>
                    <p className="text-xs text-slate-400">
                      MRN: {p.mrn} • {p.age}y {p.sex} • {unit?.name || p.unitId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      p.status === 'Critical'
                        ? 'bg-rose-500/15 text-rose-500'
                        : p.status === 'Unstable'
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-emerald-500/15 text-emerald-500'
                    }`}
                  >
                    {p.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-500" />
                </div>
              </button>
            );
          })}

          {matchedPatients.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching clinical records found.
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Navigate with ↵ or click</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
