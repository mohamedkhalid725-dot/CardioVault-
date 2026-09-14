import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, LayoutDashboard } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientFileHeader } from './PatientFileHeader';
import { PatientFileNav, PATIENT_SECTIONS } from './PatientFileNav';
import { PatientEditModal } from './PatientEditModal';
import { CalculatorsHub } from '../calculators/CalculatorsHub';
import { OverviewSection } from './sections/OverviewSection';
import { HistorySection } from './sections/HistorySection';
import { ECGSection } from './sections/ECGSection';
import { VitalsSection } from './sections/VitalsSection';
import { ExaminationSection } from './sections/ExaminationSection';
import { CardiologySectionV2 } from './sections/CardiologySectionV2';
import { MedicationSection } from './sections/MedicationSection';
import { ICUSection } from './sections/ICUSection';
import { ImagingSection } from './sections/ImagingSection';
import { LabsSection } from './sections/LabsSection';
import { ProcedureSection } from './sections/ProcedureSection';
import { ProgressNoteSection } from './sections/ProgressNoteSection';
import { ExportSummarySection } from './sections/ExportSummarySection';

export const PatientFileView: React.FC = () => {
  const { currentPatient, activePatientSection, setActivePatientSection } = useApp();
  const [editing, setEditing] = useState(false);

  if (!currentPatient) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">No patient selected. Return to the active patient list.</div>;
  }

  const renderSection = () => {
    switch (activePatientSection) {
      case 'overview': return <OverviewSection patient={currentPatient}/>;
      case 'history': return <HistorySection patient={currentPatient}/>;
      case 'ecg': return <ECGSection patient={currentPatient}/>;
      case 'vitals': return <VitalsSection patient={currentPatient}/>;
      case 'examination': return <ExaminationSection patient={currentPatient}/>;
      case 'cardiology': return <CardiologySectionV2 patient={currentPatient}/>;
      case 'medication': return <MedicationSection patient={currentPatient}/>;
      case 'icu': return <ICUSection patient={currentPatient}/>;
      case 'imaging': return <ImagingSection patient={currentPatient}/>;
      case 'labs': return <LabsSection patient={currentPatient}/>;
      case 'procedure': return <ProcedureSection patient={currentPatient}/>;
      case 'calculators': return <CalculatorsHub patient={currentPatient} embedded/>;
      case 'progress': return <ProgressNoteSection patient={currentPatient}/>;
      case 'pdf': return <ExportSummarySection patient={currentPatient}/>;
      default: return <OverviewSection patient={currentPatient}/>;
    }
  };

  const activeMeta = PATIENT_SECTIONS.find(section => section.id === activePatientSection) || PATIENT_SECTIONS[0];
  const ActiveIcon = activeMeta?.icon || LayoutDashboard;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-[#0A0F1D] text-slate-900 dark:text-slate-100">
      <PatientFileHeader patient={currentPatient} onEditClick={() => setEditing(true)}/>

      {/* Keep the complete clinical navigation visible. The selected section opens directly below it. */}
      <PatientFileNav/>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pb-24 md:pb-12">
        {/* Dedicated section banner — including a real Overview banner when Overview is selected. */}
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shrink-0">
            <ActiveIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-500">Patient File</div>
            <div className="text-base font-extrabold text-slate-900 dark:text-white truncate">{activeMeta.label}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>

        {renderSection()}
      </main>

      <PatientEditModal patient={currentPatient} isOpen={editing} onClose={() => setEditing(false)}/>
    </div>
  );
};
