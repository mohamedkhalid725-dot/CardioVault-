import React from 'react';
import {
  LayoutDashboard,
  Clock,
  Activity,
  HeartPulse,
  Stethoscope,
  Heart,
  Pill,
  Wind,
  Image as ImageIcon,
  FlaskConical,
  Syringe,
  Calculator,
  FileEdit,
  FileDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientSectionId } from '../../types/clinical';

export const PATIENT_SECTIONS: Array<{
  id: PatientSectionId;
  order: number;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'overview', order: 1, label: 'Overview', icon: LayoutDashboard },
  { id: 'history', order: 2, label: 'History', icon: Clock },
  { id: 'ecg', order: 3, label: 'ECG', icon: Activity },
  { id: 'vitals', order: 4, label: 'Vitals & Balance & Hemodynamics', icon: HeartPulse },
  { id: 'examination', order: 5, label: 'Examination', icon: Stethoscope },
  { id: 'cardiology', order: 6, label: 'Cardiology', icon: Heart },
  { id: 'medication', order: 7, label: 'Medication', icon: Pill },
  { id: 'icu', order: 8, label: 'ICU — Ventilator & ABG', icon: Wind },
  { id: 'imaging', order: 9, label: 'Imaging', icon: ImageIcon },
  { id: 'labs', order: 10, label: 'Labs', icon: FlaskConical },
  { id: 'procedure', order: 11, label: 'Procedure', icon: Syringe },
  { id: 'calculators', order: 12, label: 'Calculators', icon: Calculator },
  { id: 'progress', order: 13, label: 'Progress Note', icon: FileEdit },
  { id: 'pdf', order: 14, label: 'PDF', icon: FileDown },
];

export const PatientFileNav: React.FC = () => {
  const { activePatientSection, setActivePatientSection } = useApp();

  return (
    <div className="w-full bg-slate-100 dark:bg-[#0E1626] border-b border-slate-200 dark:border-slate-800/80 px-2 py-1.5 overflow-x-auto no-scrollbar scroll-smooth">
      <div className="flex items-center gap-1.5 min-w-max mx-auto max-w-7xl px-2">
        {PATIENT_SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activePatientSection === sec.id;

          return (
            <button
              key={sec.id}
              onClick={() => setActivePatientSection(sec.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap focus:outline-none ${
                isActive
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950 stroke-[2.5]' : 'text-slate-400'}`} />
              <span>
                <span className="opacity-60 mr-1">{sec.order}.</span>
                {sec.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
