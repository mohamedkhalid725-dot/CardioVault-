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
  | 'propose_medication'
  | 'approve_medication_proposal'
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
  /** Role of the member being managed (used to block touching department_admin). */
  targetUserRole?: ClinicalRole;
}

/** Single master account allowed to hold/grant department_admin. Mirrors workspaceAccess MASTER_ACCOUNT_EMAIL. */
export const MASTER_ADMIN_EMAIL = 'mohamedkhalid725@gmail.com';

export const PRESET_USERS: UserProfile[] = [];


const USER_STORAGE_KEY = 'cardiovault_current_user_profile_v2';
const ALL_USERS_KEY = 'cardiovault_all_users_v2';
const BREAK_GLASS_KEY = 'cardiovault_active_break_glass_v2';

export const ACCESS_DENIED_MESSAGE = 'ACCESS RESTRICTED: You do not have permission to perform this action.';

const normalizeUserProfile = (user: any): UserProfile => ({
  ...user,
  userId: String(user?.userId || ''),
  name: String(user?.name || user?.email?.split('@')?.[0] || 'Clinician'),
  email: String(user?.email || '').trim().toLowerCase(),
  role: user?.role || 'pending',
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
        if (Array.isArray(parsed) && parsed.length > 0) { const clean=parsed.map(normalizeUserProfile).filter((u:UserProfile)=>!String(u.userId).startsWith('user-') && !String(u.email).endsWith('@cardiovault.org')); if(clean.length!==parsed.length) this.saveUsers(clean); return clean; }
      }
    } catch {}
    return [];
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
    return { userId: '', name: 'Clinician', email: '', role: 'pending', departmentId: 'dept-cardiology', assignedUnitIds: [], status: 'pending', permissions: [], createdAt: new Date().toISOString() };
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
    const isMaster = cleanEmail === MASTER_ADMIN_EMAIL;

    // Check if owner — ONLY the master email ever resolves to department_admin.
    if (isMaster) {
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

    // Check if existing user by email or uid.
    // Never auto-elevate: a stored department_admin role is only honoured for
    // the master email; any other account holding it (stale/legacy data) is
    // demoted to resident until the master re-grants a proper role.
    const existing = users.find(u => (cleanEmail && u.email.toLowerCase() === cleanEmail) || u.userId === firebaseUser.uid);
    if (existing) {
      const stored = normalizeUserProfile(existing);
      const safeRole: UserProfile['role'] =
        stored.role === 'department_admin' && !isMaster ? 'resident' : stored.role;
      if (safeRole !== stored.role) {
        const repaired = users.map(u => (u.userId === stored.userId || (cleanEmail && u.email.toLowerCase() === cleanEmail)) ? { ...u, role: safeRole } : u);
        this.saveUsers(repaired);
      }
      const updated: UserProfile = normalizeUserProfile({ ...existing, role: safeRole, userId: firebaseUser.uid, name: firebaseUser.displayName || existing.name });
      this.setCurrentUser(updated);
      return updated;
    }

    // New authenticated clinician account
    const newProfile: UserProfile = {
      userId: firebaseUser.uid,
      name: firebaseUser.displayName || cleanEmail.split('@')[0] || 'Clinician',
      email: cleanEmail,
      role: 'pending',
      departmentId: 'dept-cardiology',
      assignedUnitIds: [],
      status: 'pending',
      permissions: [],
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

    // 3. Unit Scope Check — ONLY department_admin sees all units implicitly.
    // Consultant/specialist/resident/nurse/viewer must hold the unit (or a
    // valid temporary assignment / active break-glass override).
    if (context.unitId) {
      const isUnitAssigned = user.assignedUnitIds.includes(context.unitId);
      const isTempAssigned = this.hasValidTemporaryUnit(user, context.unitId);
      const isBreakGlass = !!this.hasActiveBreakGlass(context.unitId, context.patientId);
      const isAdmin = user.role === 'department_admin';

      if (!isUnitAssigned && !isTempAssigned && !isBreakGlass && !isAdmin) {
        return false;
      }
    }

    // 3b. department_admin grant guard: only the master account may grant
    // department_admin (or touch an existing admin). Mirrors workspaceAccess.
    if ((action === 'assign_role' || action === 'manage_users') && context.targetRole === 'department_admin') {
      return user.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
    }
    if ((action === 'assign_role' || action === 'assign_unit' || action === 'manage_users') && context.targetUserRole === 'department_admin') {
      return user.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
    }

    // 4. Role-specific rules
    switch (user.role) {
      case 'viewer':
        // Viewer is strictly read-only
        return action === 'view_unit' || action === 'view_patient' || action === 'export_pdf' || action === 'view_audit_logs';

      case 'nurse':
        // Nurse permissions:
        // ALLOW: Vitals, I/O, Nursing Note, Medication Administration, Device,
        //   Task, Handover, View, PROPOSE medication (goes to doctor approval queue).
        // DENY: direct medication orders (create/modify → must propose),
        //   physician diagnosis/plan, user management, audit modification.
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
          case 'propose_medication':
            return true;
          case 'approve_medication_proposal':
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
        // Resident = daily clinical work inside own units. Can approve nurse
        // medication proposals. CANNOT manage members (no assign_role/assign_unit).
        switch (action) {
          case 'manage_users':
          case 'assign_role':
          case 'assign_unit':
          case 'manage_department_settings':
            return false;
          case 'approve_medication_proposal':
            return true;
          default:
            return true;
        }

      case 'specialist':
        // Specialist = resident + can close consults / review critical results.
        // Still NO member management (reserved for consultant-in-own-units + admin).
        if (action === 'manage_users' || action === 'assign_role' || action === 'assign_unit' || action === 'manage_department_settings') {
          return false;
        }
        return true;

      case 'consultant':
        // Consultant = specialist + member management INSIDE OWN ASSIGNED UNITS:
        // may accept members, set their role (never department_admin), and
        // assign/remove unit membership — only for units the consultant holds.
        // Cannot grant units they don't have; cannot touch department_admin.
        if (action === 'manage_department_settings') {
          return false;
        }
        if (action === 'manage_users' && !context.unitId) {
          return false;
        }
        if (action === 'assign_role' || action === 'assign_unit') {
          if (context.targetRole === 'department_admin') return false;
          if (context.targetUserRole === 'department_admin') return false;
          if (!context.unitId) return false;
          if (!user.assignedUnitIds.includes(context.unitId)) return false;
          return true;
        }
        if (action === 'manage_users') {
          if (!context.unitId) return false;
          return user.assignedUnitIds.includes(context.unitId);
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
   * ONLY department_admin sees all units; consultant and all other roles see
   * only assigned units (+ valid temporary assignment / break-glass).
   */
  filterAuthorizedUnits<T extends { id: string }>(units: T[], user: UserProfile): T[] {
    if (user.role === 'department_admin') {
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
   * ONLY department_admin sees all patients; all other roles (including
   * consultant) are scoped to assigned units (+ temp / break-glass).
   */
  filterAuthorizedPatients<T extends { unitId: string; id: string }>(patients: T[], user: UserProfile): T[] {
    if (user.role === 'department_admin') {
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
