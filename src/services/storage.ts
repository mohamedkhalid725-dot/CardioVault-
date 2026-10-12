import {
  Patient,
  Unit,
  Bed,
  VitalRecord,
  FluidRecord,
  ExaminationData,
  ECGRecord,
  CardiologyData,
  Medication,
  VentilatorData,
  ImagingStudy,
  LabPanel,
  ProcedureRecord,
  CalculatorResult,
  ProgressNote,
} from '../types/clinical';
import { INITIAL_DEPARTMENT_UNITS, INITIAL_DEPARTMENT_BEDS, DepartmentService } from './departmentService';
import { normalizeBedStatus, normalizePatientStatus } from '../types/clinical';

const STORAGE_KEYS = {
  UNITS: 'cardiovault_units_v2',
  BEDS: 'cardiovault_beds_v2',
  PATIENTS: 'cardiovault_patients_v2',
  THEME: 'cardiovault_theme_v2',
  AUTH: 'cardiovault_auth_v2',
  SETTINGS: 'cardiovault_settings_v2',
  LAST_SYNC: 'cardiovault_last_sync_v2',
};


// CardioVault starts with an empty workspace. Units/beds/patients are created by the physician.
// These IDs are kept only as a migration list so the old demo seed can be removed from
// existing local/cloud workspaces without touching units created by the physician.
// Do not delete workspace units by ID during cloud restore.
// Unit IDs such as unit-ccu-1 / unit-icu-1 may be real department units,
// not disposable demo data. The cloud workspace is the source of truth.
// Legacy cleanup is therefore limited to the explicitly known demo patients.
export const LEGACY_DEMO_UNIT_IDS = new Set<string>();
export const LEGACY_DEMO_PATIENT_IDS = new Set([
  'patient-2025001', 'patient-sara', 'patient-mohamed-h', 'patient-nada',
  'patient-tariq', 'patient-mona', 'patient-youssef', 'patient-layla',
  'patient-omar', 'patient-fatima', 'patient-khaled', 'patient-hassan',
  'patient-zeinab', 'patient-samir', 'patient-adam', 'patient-mariam',
  'patient-noor', 'patient-rashid', 'patient-salma', 'patient-ibrahim',
  'patient-dalia',
]);
export const INITIAL_UNITS: Unit[] = [];

export const INITIAL_BEDS: Bed[] = [];

export const INITIAL_PATIENTS: Patient[] = [];

export function stripLegacyDemoData<T extends { id?: string; unitId?: string; patientId?: string }>(
  units: T[],
  beds: T[],
  patients: T[],
): { units: T[]; beds: T[]; patients: T[] } {
  const unitsClean = units.filter(item => !LEGACY_DEMO_UNIT_IDS.has(String(item?.id || '')));
  const patientsClean = patients.filter(item => !LEGACY_DEMO_PATIENT_IDS.has(String(item?.id || '')));
  const bedsClean = beds.filter(item =>
    !LEGACY_DEMO_PATIENT_IDS.has(String(item?.patientId || ''))
  );
  return { units: unitsClean, beds: bedsClean, patients: patientsClean };
}

let runtimeAuth = {
  isAuthenticated: false,
  userEmail: '',
  userName: '',
  pinCode: '',
};

// Clinical data is cloud-authoritative.
// Units, beds and patients are kept only in runtime memory for rendering.
// They are NEVER persisted to localStorage, IndexedDB or another local database.
// The Cloud Sync Bridge writes changes to Firebase Workspace and restores them
// from Firebase on login/reconnect. This intentionally disables offline clinical
// persistence so another account/device never inherits stale clinical data.
let runtimeUnits: Unit[] = [];
let runtimeBeds: Bed[] = [];
let runtimePatients: Patient[] = [];

export const StorageService = {
  getUnits(): Unit[] {
    return runtimeUnits;
  },

  saveUnits(units: Unit[]): void {
    runtimeUnits = Array.isArray(units) ? units : [];
  },

  getBeds(): Bed[] {
    return runtimeBeds;
  },

  saveBeds(beds: Bed[]): void {
    runtimeBeds = Array.isArray(beds) ? beds.map(b => ({ ...b, status: normalizeBedStatus(b.status) })) : [];
  },

  getPatients(): Patient[] {
    return runtimePatients;
  },

  savePatients(patients: Patient[]): void {
    runtimePatients = Array.isArray(patients) ? patients.map(p => ({ ...p, status: normalizePatientStatus(p.status) })) : [];
  },

  getTheme(): 'dark' | 'light' {
    try {
      const theme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (theme === 'light' || theme === 'dark') return theme;
    } catch (e) {
      console.error('Storage getTheme error:', e);
    }
    return 'dark';
  },

  saveTheme(theme: 'dark' | 'light'): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    } catch (e) {
      console.error('Storage saveTheme error:', e);
    }
  },

  getAuth(): { isAuthenticated: boolean; userEmail: string; userName: string; pinCode: string } {
    // Firebase Authentication is the source of truth for authentication.
    // Keep only an in-memory session object here; clinical data is never persisted locally.
    return runtimeAuth;
  },

  getProfileName(): string {
    return runtimeAuth.userName || '';
  },

  saveProfileName(name: string): void {
    runtimeAuth = { ...runtimeAuth, userName: name.trim() };
  },

  saveAuth(authData: any): void {
    runtimeAuth = { ...runtimeAuth, ...(authData || {}) };
  },

  exportDatabaseBackup(): string {
    const backup = {
      version: '3.0-cloud-authoritative',
      exportedAt: new Date().toISOString(),
      units: this.getUnits(),
      beds: this.getBeds(),
      patients: this.getPatients(),
    };
    return JSON.stringify(backup, null, 2);
  },

  importDatabaseBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.units) && Array.isArray(data.beds) && Array.isArray(data.patients)) {
        // Imported clinical data is runtime-only until the Cloud Sync Bridge
        // persists it to the authenticated Firebase Workspace.
        this.saveUnits(data.units);
        this.saveBeds(data.beds);
        this.savePatients(data.patients);
        return true;
      }
    } catch (e) {
      console.error('Invalid backup JSON:', e);
    }
    return false;
  },

  resetToDefaultSeed(): void {
    runtimeUnits = [];
    runtimeBeds = [];
    runtimePatients = [];
  },
};
