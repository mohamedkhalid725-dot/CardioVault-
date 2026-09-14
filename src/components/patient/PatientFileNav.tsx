import React from 'react';
import { LayoutDashboard, Clock, Activity, HeartPulse, Stethoscope, Heart, Pill, Wind, Image as ImageIcon, FlaskConical, Syringe, Calculator, FileEdit, FileDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientSectionId } from '../../types/clinical';

export const PATIENT_SECTIONS: Array<{ id: PatientSectionId; order: number; label: string; icon: React.FC<{ className?: string }> }> = [
  { id:'overview',order:1,label:'Overview',icon:LayoutDashboard },
  { id:'history',order:2,label:'History',icon:Clock },
  { id:'ecg',order:3,label:'ECG',icon:Activity },
  { id:'vitals',order:4,label:'Vitals & Balance & Hemodynamics',icon:HeartPulse },
  { id:'examination',order:5,label:'Examination',icon:Stethoscope },
  { id:'cardiology',order:6,label:'Cardiology',icon:Heart },
  { id:'medication',order:7,label:'Medication',icon:Pill },
  { id:'icu',order:8,label:'ICU - Ventilator & ABG',icon:Wind },
  { id:'imaging',order:9,label:'Imaging',icon:ImageIcon },
  { id:'labs',order:10,label:'Labs',icon:FlaskConical },
  { id:'procedure',order:11,label:'Procedure',icon:Syringe },
  { id:'calculators',order:12,label:'Calculators',icon:Calculator },
  { id:'progress',order:13,label:'Progress Note',icon:FileEdit },
  { id:'pdf',order:14,label:'PDF',icon:FileDown },
];

interface Props { onSelect?: () => void; }
export const PatientFileNav: React.FC<Props> = ({ onSelect }) => {
  const { activePatientSection, setActivePatientSection } = useApp();
  return <nav className="w-full px-3 sm:px-4 py-2 bg-transparent">
    <div className="max-w-3xl mx-auto space-y-1">
      {PATIENT_SECTIONS.map(sec=>{
        const Icon=sec.icon;
        return <button key={sec.id} onClick={()=>{setActivePatientSection(sec.id);onSelect?.();}} className="w-full min-h-[54px] flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border bg-white/90 dark:bg-[#0E1626]/90 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-sm">
          <Icon className="w-5 h-5 shrink-0 text-cyan-500 dark:text-cyan-400" />
          <span className="font-semibold text-sm sm:text-[15px] flex-1 truncate">{sec.label}</span>
          <span className="text-lg leading-none text-slate-400">›</span>
        </button>;
      })}
    </div>
  </nav>;
};
