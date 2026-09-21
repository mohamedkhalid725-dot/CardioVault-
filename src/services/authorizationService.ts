import { ClinicalRole, UserProfile, BreakGlassLog } from '../types/clinical';
import { AuditTrailService } from './auditTrailService';

export type ClinicalAction =
  | 'view_unit'
  | 'view_patient'
  | 'edit_vitals'
  | 'edit_io'
  | 'edit_nursing_note'
  | 'document_med_administration'
  | 'edit_devices'
  | 'manage_tasks'
  | 'edit_physician_diagnosis'
  | 'edit_physician_plan'
  | 'create_medication_order'
  | 'modify_medication_order'
  | 'order_investigation'
  | 'review_investigation'
  | 'clinical_documentation'
  | 'request_consultation'
  | 'complete_consultation'
  | 'admit_patient'
  | 'transfer_patient'
  | 'discharge_patient'
  | 'shift_handover'
  | 'clinical_correction'
  | 'manage_users'
  | 'assign_role'
  | 'assign_unit'
  | 'manage_beds_units'
  | 'manage_department_settings'
  | 'view_audit_logs'
  | 'modify_audit_logs'
  | 'export_pdf';

export interface ActionContext {
  departmentId?: string;
  unitId?: string;
  patientId?: string;
  targetRole?: ClinicalRole;
}

export const PRESET_USERS: UserProfile[] = [
  {
    userId: 'user-mkhalid',
    name: 'Dr. Mohamed Khalid',
    email: 'mohamedkhalid725@gmail.com',
    role: 'department_admin',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1', 'unit-ccu-2', 'unit-cardiology-ward', 'unit-icu-1'],
    status: 'active',
    permissions: ['all'],
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
  {
    userId: 'user-sara-nurse',
    name: 'Sara Ahmed',
    email: 'sara.ahmed@cardiovault.org',
    role: 'nurse',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1'], // Sara can ONLY access CCU-1
    status: 'active',
    permissions: ['vitals', 'io', 'nursing_note', 'med_admin', 'devices', 'tasks'],
    createdAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
  {
    userId: 'user-youssef-resident',
    name: 'Dr. Youssef El-Sayed (Resident)',
    email: 'youssef.res@cardiovault.org',
    role: 'resident',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1', 'unit-ccu-2'], // Resident assigned to CCU-1 & CCU-2
    status: 'active',
    permissions: ['clinical_documentation', 'orders', 'tasks', 'handover'],
    createdAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
  {
    userId: 'user-mona-consultant',
    name: 'Dr. Mona Mansour (Consultant)',
    email: 'mona.consultant@cardiovault.org',
    role: 'consultant',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1', 'unit-ccu-2', 'unit-cardiology-ward'],
    status: 'active',
    permissions: ['clinical_all', 'oversight'],
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
  {
    userId: 'user-viewer',
    name: 'Clinical Auditor (Viewer)',
    email: 'viewer@cardiovault.org',
    role: 'viewer',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1', 'unit-ccu-2', 'unit-cardiology-ward'],
    status: 'active',
    permissions: ['read_only'],
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
];

const USER_STORAGE_KEY = 'cardiovault_current_user_profile_v2';
const ALL_USERS_KEY = 'cardiovault_all_users_v2';
const BREAK_GLASS_KEY = 'cardiovault_active_break_glass_v2';

export const ACCESS_DENIED_MESSAGE = 'ACCESS RESTRICTED: You do not have permission to perform this action.';

const normalizeUserProfile = (user: any): UserProfile => ({
  ...user,
  userId: String(user?.userId || ''),
  name: String(user?.name || user?.email?.split('@')?.[0] || 'Clinician'),
  email: String(user?.email || '').trim().toLowerCase(),
  role: user?.role || 'resident',
  departmentId: String(user?.departmentId || 'dept-cardiology'),
  assignedUnitIds: Array.isArray(user?.assignedUnitIds) ? user.assignedUnitIds.map(String) : [],
  status: user?.status || 'active',
  permissions: Array.isArray(user?.permissions) ? user.permissions : [],
});

export const AuthorizationService = {
  getUsers(): UserProfile[] {
    try {
      const raw = localStorage.getItem(ALL_USERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeUserProfile);
      }
    } catch {}
    this.saveUsers(PRESET_USERS);
    return PRESET_USERS;
  },

  saveUsers(users: UserProfile[]): void {
    try {
      localStorage.setItem(ALL_USERS_KEY, JSON.stringify(users));
    } catch {}
  },

  getCurrentUser(): UserProfile {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId && parsed?.role) return normalizeUserProfile(parsed);
      }
    } catch {}
    // Default to Dr. Mohamed Khalid (Department Admin)
    return PRESET_USERS[0];
  },

  setCurrentUser(user: UserProfile): void {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    AuditTrailService.logAction({
      userId: user.userId,
      userName: user.name,
      role: user.role,
      action: `User session active: ${user.name} (${user.role})`,
      departmentId: user.departmentId,
    });
  },

  /**
   * Resolves or creates a clinical UserProfile strictly from an authenticated Firebase user.
   * Enforces: Firebase Authentication -> Firebase UID -> UserProfile -> Role -> Department -> Unit Scope.
   */
  resolveUserForFirebaseAuth(firebaseUser: { uid: string; email?: string | null; displayName?: string | null }): UserProfile {
    const users = this.getUsers();
    const cleanEmail = (firebaseUser.email || '').trim().toLowerCase();

    // Check if owner
    if (cleanEmail === 'mohamedkhalid725@gmail.com') {
      const ownerProfile: UserProfile = {
        userId: firebaseUser.uid,
        name: firebaseUser.displayName || 'Dr. Mohamed Khalid',
        email: cleanEmail,
        role: 'department_admin',
        departmentId: 'dept-cardiology',
        assignedUnitIds: ['unit-ccu-1', 'unit-ccu-2', 'unit-cardiology-ward', 'unit-icu-1'],
        status: 'active',
        permissions: ['all'],
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };
      this.setCurrentUser(ownerProfile);
      return ownerProfile;
    }

    // Check if existing user by email or uid
    const existing = users.find(u => (cleanEmail && u.email.toLowerCase() === cleanEmail) || u.userId === firebaseUser.uid);
    if (existing) {
      const updated: UserProfile = normalizeUserProfile({ ...existing, userId: firebaseUser.uid, name: firebaseUser.displayName || existing.name });
      this.setCurrentUser(updated);
      return updated;
    }

    // New authenticated clinician account
    const newProfile: UserProfile = {
      userId: firebaseUser.uid,
      name: firebaseUser.displayName || cleanEmail.split('@')[0] || 'Clinician',
      email: cleanEmail,
      role: 'resident',
      departmentId: 'dept-cardiology',
      assignedUnitIds: ['unit-ccu-1'],
      status: 'active',
      permissions: ['clinical_documentation', 'orders', 'tasks', 'handover'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.saveUsers([...users, newProfile]);
    this.setCurrentUser(newProfile);
    return newProfile;
  },

  /**
   * Checks if a temporary unit assignment is currently valid.
   */
  hasValidTemporaryUnit(user: UserProfile, unitId: string): boolean {
    if (!user.temporaryAssignment) return false;
    if (user.temporaryAssignment.unitId !== unitId) return false;
    const now = Date.now();
    const start = new Date(user.temporaryAssignment.startDate).getTime();
    const end = new Date(user.temporaryAssignment.endDate).getTime();
    return now >= start && now <= end;
  },

  /**
   * Checks if an emergency break-glass override is active for this unit or patient.
   */
  hasActiveBreakGlass(unitId?: string, patientId?: string): BreakGlassLog | null {
    try {
      const raw = localStorage.getItem(BREAK_GLASS_KEY);
      if (!raw) return null;
      const log: BreakGlassLog = JSON.parse(raw);
      const now = Date.now();
      const created = new Date(log.timestamp).getTime();
      // Break-glass expires after 60 minutes
      if (now - created > 60 * 60 * 1000) {
        localStorage.removeItem(BREAK_GLASS_KEY);
        return null;
      }
      if (unitId && log.emergencyScope.unitId === unitId) return log;
      if (patientId && log.patientId === patientId) return log;
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Activates Emergency Break-Glass access for a clinical emergency.
   */
  activateBreakGlass(params: {
    user: UserProfile;
    patientId: string;
    patientName: string;
    unitId: string;
    reason: string;
  }): BreakGlassLog {
    const log: BreakGlassLog = {
      id: `bg-${Date.now()}`,
      userId: params.user.userId,
      userName: params.user.name,
      role: params.user.role,
      patientId: params.patientId,
      patientName: params.patientName,
      originalScope: {
        departmentId: params.user.departmentId,
        unitIds: [...params.user.assignedUnitIds],
      },
      emergencyScope: {
        unitId: params.unitId,
      },
      reason: params.reason,
      timestamp: new Date().toISOString(),
      deviceSession: `session-${Date.now().toString(36)}`,
    };

    localStorage.setItem(BREAK_GLASS_KEY, JSON.stringify(log));

    AuditTrailService.logAction({
      userId: params.user.userId,
      userName: params.user.name,
      role: params.user.role,
      action: `EMERGENCY BREAK-GLASS: ${params.reason}`,
      patientId: params.patientId,
      departmentId: params.user.departmentId,
      unitId: params.unitId,
      reason: params.reason,
    });

    return log;
  },

  /**
   * Core verification function: ROLE + SCOPE + ACTION
   */
  canPerformAction(
    user: UserProfile,
    action: ClinicalAction,
    context: ActionContext = {}
  ): boolean {
    // 1. Audit logs can NEVER be modified or deleted by anyone
    if (action === 'modify_audit_logs') {
      return false;
    }

    // 2. Department check: user can only access their department unless break glass or admin
    if (context.departmentId && context.departmentId !== user.departmentId) {
      if (user.role !== 'department_admin' && !this.hasActiveBreakGlass(context.unitId, context.patientId)) {
        return false;
      }
    }

    // 3. Unit Scope Check
    if (context.unitId) {
      const isUnitAssigned = user.assignedUnitIds.includes(context.unitId);
      const isTempAssigned = this.hasValidTemporaryUnit(user, context.unitId);
      const isBreakGlass = !!this.hasActiveBreakGlass(context.unitId, context.patientId);
      const isAdminOrConsultant = user.role === 'department_admin' || user.role === 'consultant';

      if (!isUnitAssigned && !isTempAssigned && !isBreakGlass && !isAdminOrConsultant) {
        return false;
      }
    }

    // 4. Role-specific rules
    switch (user.role) {
      case 'viewer':
        // Viewer is strictly read-only
        return action === 'view_unit' || action === 'view_patient' || action === 'export_pdf' || action === 'view_audit_logs';

      case 'nurse':
        // Nurse permissions:
        // ALLOW: Vitals, I/O, Nursing Note, Medication Administration, Device, Task, Handover, View
        // DENY: Edit physician diagnosis, Edit physician plan, Modify/Order medication, Manage users, Change roles/units, Modify audit logs
        switch (action) {
          case 'view_unit':
          case 'view_patient':
          case 'edit_vitals':
          case 'edit_io':
          case 'edit_nursing_note':
          case 'document_med_administration':
          case 'edit_devices':
          case 'manage_tasks':
          case 'shift_handover':
          case 'export_pdf':
            return true;
          case 'edit_physician_diagnosis':
          case 'edit_physician_plan':
          case 'create_medication_order':
          case 'modify_medication_order':
          case 'manage_users':
          case 'assign_role':
          case 'assign_unit':
          case 'manage_beds_units':
          case 'manage_department_settings':
          case 'clinical_correction':
          default:
            return false;
        }

      case 'resident':
        // Resident permissions:
        // ALLOW: Clinical documentation, Vitals, Labs, ABG, ECG, investigations, medications, infusions, procedures, progress notes, consultations, tasks, handover, admission/transfer/discharge
        // DENY: User/security administration
        switch (action) {
          case 'manage_users':
          case 'assign_role':
          case 'assign_unit':
          case 'manage_department_settings':
            return false;
          default:
            return true;
        }

      case 'consultant':
      case 'specialist':
        // Consultant / Specialist:
        // Broad clinical access within department. Administrative user management is reserved for Department Admin.
        if (action === 'manage_users' || action === 'assign_role' || action === 'assign_unit' || action === 'manage_department_settings') {
          return false;
        }
        return true;

      case 'department_admin':
        // Department Admin:
        // Manages users, roles, unit assignments, units, beds, templates, protocols, settings, audit trail.
        // Also has clinical review privileges.
        return true;

      default:
        return false;
    }
  },

  /**
   * Helper to filter list of units according to user scope.
   */
  filterAuthorizedUnits<T extends { id: string }>(units: T[], user: UserProfile): T[] {
    if (user.role === 'department_admin' || user.role === 'consultant') {
      return units;
    }
    return units.filter(unit => {
      if (user.assignedUnitIds.includes(unit.id)) return true;
      if (this.hasValidTemporaryUnit(user, unit.id)) return true;
      if (this.hasActiveBreakGlass(unit.id)) return true;
      return false;
    });
  },

  /**
   * Helper to filter list of patients according to user scope.
   */
  filterAuthorizedPatients<T extends { unitId: string; id: string }>(patients: T[], user: UserProfile): T[] {
    if (user.role === 'department_admin' || user.role === 'consultant') {
      return patients;
    }
    return patients.filter(patient => {
      if (user.assignedUnitIds.includes(patient.unitId)) return true;
      if (this.hasValidTemporaryUnit(user, patient.unitId)) return true;
      if (this.hasActiveBreakGlass(patient.unitId, patient.id)) return true;
      return false;
    });
  },
};
