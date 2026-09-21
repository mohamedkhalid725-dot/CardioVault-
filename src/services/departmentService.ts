import { Department, Unit, Bed, Patient, PatientStatus } from '../types/clinical';
import { StorageService } from './storage';

export const DEFAULT_DEPARTMENTS: Department[] = [
  {
    id: 'dept-cardiology',
    name: 'Cardiology',
    code: 'CARDIO',
    organizationId: 'org-cardiovault',
    unitIds: ['unit-ccu-1', 'unit-ccu-2', 'unit-cardiology-ward'],
    createdAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'dept-icu',
    name: 'Critical Care / ICU',
    code: 'ICU',
    organizationId: 'org-cardiovault',
    unitIds: ['unit-icu-1'],
    createdAt: '2026-09-01T08:00:00.000Z',
  },
];

export const INITIAL_DEPARTMENT_UNITS: Unit[] = [
  {
    id: 'unit-ccu-1',
    name: 'CCU-1 (Coronary Care Unit 1)',
    type: 'Critical Care / CCU',
    totalBeds: 4,
  },
  {
    id: 'unit-ccu-2',
    name: 'CCU-2 (Coronary Care Unit 2)',
    type: 'Critical Care / CCU',
    totalBeds: 4,
  },
  {
    id: 'unit-cardiology-ward',
    name: 'Cardiology Inpatient Ward',
    type: 'Step-Down / Inpatient',
    totalBeds: 6,
  },
  {
    id: 'unit-icu-1',
    name: 'Medical ICU',
    type: 'Intensive Care Unit',
    totalBeds: 4,
  },
];

export const INITIAL_DEPARTMENT_BEDS: Bed[] = [
  // CCU-1
  { id: 'bed-ccu1-1', unitId: 'unit-ccu-1', bedNumber: 'Bed 1', status: 'Empty' },
  { id: 'bed-ccu1-2', unitId: 'unit-ccu-1', bedNumber: 'Bed 2', status: 'Empty' },
  { id: 'bed-ccu1-3', unitId: 'unit-ccu-1', bedNumber: 'Bed 3', status: 'Empty' },
  { id: 'bed-ccu1-4', unitId: 'unit-ccu-1', bedNumber: 'Bed 4', status: 'Empty' },
  // CCU-2
  { id: 'bed-ccu2-1', unitId: 'unit-ccu-2', bedNumber: 'Bed 1', status: 'Empty' },
  { id: 'bed-ccu2-2', unitId: 'unit-ccu-2', bedNumber: 'Bed 2', status: 'Empty' },
  { id: 'bed-ccu2-3', unitId: 'unit-ccu-2', bedNumber: 'Bed 3', status: 'Empty' },
  { id: 'bed-ccu2-4', unitId: 'unit-ccu-2', bedNumber: 'Bed 4', status: 'Empty' },
  // Cardiology Ward
  { id: 'bed-ward-1', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 101', status: 'Empty' },
  { id: 'bed-ward-2', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 102', status: 'Empty' },
  { id: 'bed-ward-3', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 103', status: 'Empty' },
  { id: 'bed-ward-4', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 104', status: 'Empty' },
  { id: 'bed-ward-5', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 105', status: 'Empty' },
  { id: 'bed-ward-6', unitId: 'unit-cardiology-ward', bedNumber: 'Bed 106', status: 'Empty' },
  // Medical ICU
  { id: 'bed-icu-1', unitId: 'unit-icu-1', bedNumber: 'Bed 1', status: 'Empty' },
  { id: 'bed-icu-2', unitId: 'unit-icu-1', bedNumber: 'Bed 2', status: 'Empty' },
  { id: 'bed-icu-3', unitId: 'unit-icu-1', bedNumber: 'Bed 3', status: 'Empty' },
  { id: 'bed-icu-4', unitId: 'unit-icu-1', bedNumber: 'Bed 4', status: 'Empty' },
];

const DEPT_STORAGE_KEY = 'cardiovault_departments_v2';
const ACTIVE_DEPT_KEY = 'cardiovault_active_department_id_v2';

export const DepartmentService = {
  getDepartments(): Department[] {
    try {
      const raw = localStorage.getItem(DEPT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading departments:', e);
    }
    this.saveDepartments(DEFAULT_DEPARTMENTS);
    return DEFAULT_DEPARTMENTS;
  },

  saveDepartments(departments: Department[]): void {
    try {
      localStorage.setItem(DEPT_STORAGE_KEY, JSON.stringify(departments));
    } catch (e) {
      console.error('Error saving departments:', e);
    }
  },

  getActiveDepartmentId(): string {
    return localStorage.getItem(ACTIVE_DEPT_KEY) || 'dept-cardiology';
  },

  setActiveDepartmentId(deptId: string): void {
    localStorage.setItem(ACTIVE_DEPT_KEY, deptId);
  },

  getDepartmentForUnit(unitId: string): Department | undefined {
    const depts = this.getDepartments();
    return depts.find(d => (d.unitIds || []).includes(unitId));
  },

  /**
   * Synchronizes bed occupancy state against active patients.
   * Ensures that discharged or archived patients never occupy a bed,
   * making discharged beds IMMEDIATELY AVAILABLE and reusable without stale state.
   */
  reconcileBedsWithPatients(beds: Bed[], patients: Patient[]): Bed[] {
    const activePatients = patients.filter(p => !p.isArchived);
    const activePatientMap = new Map(activePatients.map(p => [p.id, p]));

    return beds.map(bed => {
      if (!bed.patientId) {
        return bed.status === 'Empty' ? bed : { ...bed, status: 'Empty' as PatientStatus };
      }
      const occupant = activePatientMap.get(bed.patientId);
      if (!occupant) {
        // Patient was discharged, archived, or transferred elsewhere -> Bed is immediately AVAILABLE!
        return {
          ...bed,
          patientId: undefined,
          status: 'Empty' as PatientStatus,
        };
      }
      // Reconcile status with active patient
      return {
        ...bed,
        patientId: occupant.id,
        status: occupant.status || 'Stable',
      };
    });
  },

  /**
   * Validates if a bed can be assigned to a new patient.
   */
  isBedAvailable(bed: Bed, patients: Patient[]): boolean {
    if (!bed.patientId) return true;
    const activeOccupant = patients.find(p => p.id === bed.patientId && !p.isArchived);
    return !activeOccupant;
  },
};
