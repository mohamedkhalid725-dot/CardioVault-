import { StorageService } from '../services/storage';
import { createEmptyPatientShape } from '../services/admissionEpisode';
import type { Bed, Patient, Unit } from '../types/clinical';
import { DEPARTMENT_TEAM_SCHEMA_VERSION } from '../types/departmentTeam';
import { PREVIEW_WORKSPACE_ID } from './localPreview';

/**
 * Deterministic demo data for the isolated local preview.
 *
 * Written straight into the existing local StorageService so every existing
 * screen keeps working. Nothing here touches Firebase: the preview boot branch
 * in AppContext never calls the cloud bootstrap.
 */

const SEED_KEY = 'cardiovault_dt_preview_seed_v1';
const CUSTOM_UNITS_KEY = 'cardiovault_dt_preview_custom_units_v1';

export function loadPreviewCreatedUnits(): Unit[] {
  try {
    const raw = localStorage.getItem(CUSTOM_UNITS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((unit): unit is Unit => !!unit && typeof unit.id === 'string' && typeof unit.name === 'string' && Number.isFinite(Number(unit.totalBeds)))
      : [];
  } catch {
    return [];
  }
}

export function savePreviewCreatedUnits(units: Unit[]): void {
  try {
    localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify(units));
  } catch (error) {
    console.warn('Preview units could not be persisted on this browser.', error);
  }
}

const demoUnits = (): Unit[] => [
  {
    id: 'unit-preview-cardiology',
    name: 'Cardiology Ward (preview)',
    type: 'Cardiology',
    totalBeds: 4,
    unitTypeId: 'cardiology',
    createdBy: 'preview-doctor-uid',
    consultantUid: 'preview-doctor-uid',
    createdAtMs: Date.UTC(2026, 9, 1),
    capacityLocked: true,
    config: {
      typeId: 'cardiology',
      capabilities: { beds: true, waitingList: false, clinicMode: true },
      settings: { defaultBedCount: 4, functionName: 'Inpatient cardiology' },
      schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
    },
  },
  {
    id: 'unit-preview-ccu',
    name: 'CCU-1 (preview)',
    type: 'Critical Care / CCU',
    totalBeds: 2,
    unitTypeId: 'ccu',
    createdBy: 'preview-doctor-uid',
    consultantUid: 'preview-doctor-uid',
    createdAtMs: Date.UTC(2026, 9, 1),
    capacityLocked: true,
    config: {
      typeId: 'ccu',
      capabilities: { beds: true, waitingList: false, clinicMode: false },
      settings: { defaultBedCount: 2, functionName: 'Coronary care' },
      schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
    },
  },
  {
    id: 'unit-preview-endoscopy',
    name: 'Endoscopy Suite (preview)',
    type: 'Endoscopy',
    totalBeds: 0,
    unitTypeId: 'endoscopy',
    createdBy: 'preview-doctor-uid',
    consultantUid: 'preview-doctor-uid',
    createdAtMs: Date.UTC(2026, 9, 1),
    capacityLocked: true,
    config: {
      typeId: 'endoscopy',
      capabilities: { beds: false, waitingList: true, clinicMode: false },
      settings: { defaultBedCount: 0, functionName: 'Diagnostic endoscopy' },
      schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
    },
  },
];

const demoBeds = (): Bed[] => [
  { id: 'bed-preview-card-1', unitId: 'unit-preview-cardiology', bedNumber: '1', status: 'Stable', patientId: 'patient-preview-1' },
  { id: 'bed-preview-card-2', unitId: 'unit-preview-cardiology', bedNumber: '2', status: 'Empty' },
  { id: 'bed-preview-card-3', unitId: 'unit-preview-cardiology', bedNumber: '3', status: 'Empty' },
  { id: 'bed-preview-card-4', unitId: 'unit-preview-cardiology', bedNumber: '4', status: 'Empty' },
  { id: 'bed-preview-ccu-1', unitId: 'unit-preview-ccu', bedNumber: '1', status: 'Critical', patientId: 'patient-preview-2' },
  { id: 'bed-preview-ccu-2', unitId: 'unit-preview-ccu', bedNumber: '2', status: 'Empty' },
];

const demoPatients = (): Patient[] => {
  const first = {
    ...createEmptyPatientShape(),
    id: 'patient-preview-1',
    mrn: 'PREVIEW-001',
    fullName: 'Demo Patient One',
    name: 'Demo Patient One',
    age: 61,
    sex: 'Male' as const,
    weight: 82,
    height: 172,
    unitId: 'unit-preview-cardiology',
    unitIds: ['unit-preview-cardiology'],
    bedId: 'bed-preview-card-1',
    bedNumber: '1',
    status: 'Stable' as const,
    admissionDate: '2026-10-20',
    admissionTime: '09:15',
    primaryDiagnosis: 'Demo data — non-ischemic cardiomyopathy',
    diagnosis: 'Demo data — non-ischemic cardiomyopathy',
    codeStatus: 'Full Code' as const,
    isArchived: false,
    pastAdmissions: [],
  };
  const second = {
    ...createEmptyPatientShape(),
    id: 'patient-preview-2',
    mrn: 'PREVIEW-002',
    fullName: 'Demo Patient Two',
    name: 'Demo Patient Two',
    age: 68,
    sex: 'Female' as const,
    weight: 70,
    height: 160,
    unitId: 'unit-preview-ccu',
    unitIds: ['unit-preview-ccu'],
    bedId: 'bed-preview-ccu-1',
    bedNumber: '1',
    status: 'Critical' as const,
    admissionDate: '2026-10-21',
    admissionTime: '18:40',
    primaryDiagnosis: 'Demo data — acute coronary syndrome',
    diagnosis: 'Demo data — acute coronary syndrome',
    codeStatus: 'Full Code' as const,
    isArchived: false,
    pastAdmissions: [],
  };
  const third = {
    ...createEmptyPatientShape(),
    id: 'patient-preview-3',
    mrn: 'PREVIEW-003',
    fullName: 'Demo Patient Three',
    name: 'Demo Patient Three',
    age: 45,
    sex: 'Female' as const,
    weight: 66,
    height: 165,
    unitId: 'unit-preview-cardiology',
    unitIds: ['unit-preview-cardiology'],
    bedId: '',
    bedNumber: '',
    status: 'Not documented' as const,
    admissionDate: '',
    admissionTime: '',
    primaryDiagnosis: 'Demo data — outpatient follow-up',
    diagnosis: 'Demo data — outpatient follow-up',
    codeStatus: 'Not documented' as const,
    isArchived: false,
    pastAdmissions: [],
  };
  return [first, second, third];
};

export function seedPreviewData(): void {
  try {
    // Clinical data lives in runtime memory (the app deliberately never persists
    // patients locally), so the localStorage marker cannot decide this: every
    // reload starts empty and must be re-seeded.
    if (StorageService.getUnits().length > 0) return;
    const customUnits = loadPreviewCreatedUnits();
    const customBeds = customUnits.flatMap((unit) =>
      Array.from({ length: Math.max(0, Math.trunc(Number(unit.totalBeds) || 0)) }, (_, index) => ({
        id: `bed-${unit.id}-${index + 1}`,
        unitId: unit.id,
        bedNumber: `Bed ${index + 1}`,
        status: 'Empty' as const,
      })),
    );
    StorageService.saveUnits([...demoUnits(), ...customUnits]);
    StorageService.saveBeds([...demoBeds(), ...customBeds]);
    StorageService.savePatients(demoPatients());
    localStorage.setItem(SEED_KEY, PREVIEW_WORKSPACE_ID);
  } catch (error) {
    console.warn('Preview seed could not be written:', error);
  }
}
