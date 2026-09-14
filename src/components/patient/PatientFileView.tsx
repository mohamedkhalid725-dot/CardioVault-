import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientFileHeader } from './PatientFileHeader';
import { PatientFileNav } from './PatientFileNav';
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

  const isOverview = activePatientSection === 'overview';
  const activeLabel = activePatientSection === 'overview' ? 'Overview' : activePatientSection.replace('-', ' ');

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-[#0A0F1D] text-slate-900 dark:text-slate-100">
      <PatientFileHeader patient={currentPatient} onEditClick={() => setEditing(true)}/>

      {isOverview ? (
        <>
          <PatientFileNav/>
          <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pb-24 md:pb-12">
            {renderSection()}
          </main>
        </>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pb-24 md:pb-12">
          <div className="py-3">
            <button
              type="button"
              onClick={() => setActivePatientSection('overview')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4"/> Back to Patient File
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-500">Patient File</span>
            <span className="text-slate-400">/</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white capitalize">{activeLabel}</span>
          </div>
          {renderSection()}
        </main>
      )}

      <PatientEditModal patient={currentPatient} isOpen={editing} onClose={() => setEditing(false)}/>
    </div>
  );
};
