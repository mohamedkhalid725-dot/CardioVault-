import React from 'react';
import { useApp } from '../../context/AppContext';
import { PatientFileHeader } from './PatientFileHeader';
import { PatientFileNav } from './PatientFileNav';

// Sections
import { OverviewSection } from './sections/OverviewSection';
import { HistorySection } from './sections/HistorySection';
import { ECGSection } from './sections/ECGSection';
import { VitalsSection } from './sections/VitalsSection';
import { ExaminationSection } from './sections/ExaminationSection';
import { CardiologySection } from './sections/CardiologySection';
import { MedicationSection } from './sections/MedicationSection';
import { ICUSection } from './sections/ICUSection';
import { ImagingSection } from './sections/ImagingSection';
import { LabsSection } from './sections/LabsSection';
import { ProcedureSection } from './sections/ProcedureSection';
import { CalculatorsSection } from './sections/CalculatorsSection';
import { ProgressNoteSection } from './sections/ProgressNoteSection';
import { ExportSummarySection } from './sections/ExportSummarySection';

export const PatientFileView: React.FC = () => {
  const { currentPatient, activePatientSection } = useApp();

  if (!currentPatient) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">
        No patient selected. Return to Bed Census to select a patient.
      </div>
    );
  }

  const renderSection = () => {
    switch (activePatientSection) {
      case 'overview':
        return <OverviewSection patient={currentPatient} />;
      case 'history':
        return <HistorySection patient={currentPatient} />;
      case 'ecg':
        return <ECGSection patient={currentPatient} />;
      case 'vitals':
        return <VitalsSection patient={currentPatient} />;
      case 'examination':
        return <ExaminationSection patient={currentPatient} />;
      case 'cardiology':
        return <CardiologySection patient={currentPatient} />;
      case 'medication':
        return <MedicationSection patient={currentPatient} />;
      case 'icu':
        return <ICUSection patient={currentPatient} />;
      case 'imaging':
        return <ImagingSection patient={currentPatient} />;
      case 'labs':
        return <LabsSection patient={currentPatient} />;
      case 'procedure':
        return <ProcedureSection patient={currentPatient} />;
      case 'calculators':
        return <CalculatorsSection patient={currentPatient} />;
      case 'progress':
        return <ProgressNoteSection patient={currentPatient} />;
      case 'pdf':
        return <ExportSummarySection patient={currentPatient} />;
      default:
        return <OverviewSection patient={currentPatient} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-[#0A0F1D] text-slate-900 dark:text-slate-100">
      {/* Patient Top Fixed Bar */}
      <PatientFileHeader patient={currentPatient} />

      {/* Patient 14-Section Horizontal Navigation Bar */}
      <PatientFileNav />

      {/* Main Section Content with smooth fade */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 md:pb-12">
        {renderSection()}
      </main>
    </div>
  );
};
