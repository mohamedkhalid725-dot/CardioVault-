/**
 * Shared contracts for the Department Team roadmap.
 *
 * These types are the single source of truth for every new module added in the
 * local preview. They are additive and optional on the existing documents, so
 * older records keep working unchanged.
 *
 * Ownership: the lead agent owns this file. Feature agents must import from it
 * and must not edit it.
 */

export const DEPARTMENT_TEAM_SCHEMA_VERSION = 1;

/* ─── 1. Unit types and configuration ─────────────────────────────────────── */

export type UnitTypeId =
  | 'cardiology'
  | 'ccu'
  | 'icu'
  | 'surgery'
  | 'inpatient-ward'
  | 'cath-lab'
  | 'dialysis'
  | 'endoscopy'
  | 'custom';

export interface UnitCapabilities {
  /** The unit holds physical beds and can admit patients. */
  beds: boolean;
  /** A separate waiting list is offered for this unit. */
  waitingList: boolean;
  /** The unit runs outpatient clinic appointments. */
  clinicMode: boolean;
}

export interface UnitSettings {
  /** Bed count proposed when the unit is created. Never a capacity limit. */
  defaultBedCount?: number;
  /** Free-text clinical function of the unit, chosen by the owner. */
  functionName?: string;
  /** Unit-level notes shown on the unit card. */
  notes?: string;
}

export interface UnitConfig {
  typeId: UnitTypeId;
  /** Only used when typeId === 'custom'. */
  customTypeName?: string;
  capabilities: UnitCapabilities;
  settings: UnitSettings;
  schemaVersion: number;
}

/* ─── 5/6. Unit-specific waiting list ─────────────────────────────────────── */

export type WaitingStatus = 'waiting' | 'ready' | 'deferred' | 'cancelled' | 'admitted';

export interface WaitingEvent {
  atMs: number;
  actorUid: string;
  actorName?: string;
  from: WaitingStatus | null;
  to: WaitingStatus;
  reason?: string;
}

export interface WaitingEntry {
  id: string;
  workspaceId: string;
  unitId: string;
  /** Master patient identity. Never a copy of the demographics. */
  patientId: string;
  patientName: string;
  /** Service or ward the patient is waiting for, inside this unit. */
  service: string;
  status: WaitingStatus;
  createdAtMs: number;
  updatedAtMs: number;
  createdBy: string;
  createdByName?: string;
  referredBy?: string;
  notes?: string;
  /** Set when the entry is converted to a real admission. */
  admittedEncounterId?: string;
  admittedBedId?: string;
  /** Operation-list intake that was routed into this unit queue. */
  sourceOperationEntryId?: string;
  /** Reason is mandatory for these two terminal/intermediate states. */
  cancelledReason?: string;
  deferredReason?: string;
  history: WaitingEvent[];
  schemaVersion: number;
}

/* ─── 4. Encounters / stays ───────────────────────────────────────────────── */

export type EncounterKind = 'admission' | 'transfer' | 'clinic-visit';

export interface PatientEncounter {
  id: string;
  workspaceId: string;
  patientId: string;
  unitId: string;
  bedId?: string;
  kind: EncounterKind;
  startedAtMs: number;
  endedAtMs?: number;
  /** Set when the encounter is the destination of a transfer. */
  fromUnitId?: string;
  /** Waiting entry that produced this admission, when applicable. */
  sourceWaitingEntryId?: string;
  createdBy: string;
  createdAtMs: number;
  schemaVersion: number;
}

/* ─── 8. Clinic mode ──────────────────────────────────────────────────────── */

export type AppointmentStatus = 'scheduled' | 'checked-in' | 'completed' | 'cancelled' | 'no-show';

export interface ClinicEvent {
  atMs: number;
  actorUid: string;
  from: AppointmentStatus | null;
  to: AppointmentStatus;
  reason?: string;
}

export interface ClinicAppointment {
  id: string;
  workspaceId: string;
  /** The clinic unit this appointment belongs to. */
  unitId: string;
  patientId: string;
  patientName: string;
  scheduledAtMs: number;
  durationMinutes: number;
  reason?: string;
  status: AppointmentStatus;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  consultationId?: string;
  history: ClinicEvent[];
  schemaVersion: number;
}

export interface ClinicPrescription {
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  durationDays?: number;
  notes?: string;
}

export interface ClinicInvestigation {
  name: string;
  urgent?: boolean;
  status: 'ordered' | 'resulted';
}

export interface ClinicConsultation {
  id: string;
  workspaceId: string;
  unitId: string;
  patientId: string;
  appointmentId?: string;
  chiefComplaint: string;
  assessment: string;
  plan: string;
  followUpAtMs?: number;
  prescriptions: ClinicPrescription[];
  investigations: ClinicInvestigation[];
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  schemaVersion: number;
}

/**
 * A billing *record* only. The repository has no verified payment provider, so
 * the only allowed states are Draft and Issued. 'Paid' is deliberately absent.
 */
export type ClinicBillStatus = 'Draft' | 'Issued';

export interface ClinicBillItem {
  label: string;
  amount: number;
  currency: string;
}

export interface ClinicBill {
  id: string;
  workspaceId: string;
  unitId: string;
  patientId: string;
  consultationId?: string;
  items: ClinicBillItem[];
  total: number;
  currency: string;
  status: ClinicBillStatus;
  paymentReference?: string;
  issuedAtMs?: number;
  createdAtMs: number;
  createdBy: string;
  schemaVersion: number;
}

/* ─── 7. Institution and unit setup ───────────────────────────────────────── */

export interface InstitutionUnitDraft {
  tempId: string;
  name: string;
  typeId: UnitTypeId;
  customTypeName?: string;
  beds: number;
}

export interface InstitutionSetupDraft {
  id: 'current';
  institutionName: string;
  adminName: string;
  adminEmail: string;
  unitDrafts: InstitutionUnitDraft[];
  teamSize: number;
  /** Chosen plan id, if the product has already defined one. Never a price. */
  planId?: string;
  completedSteps: string[];
  updatedAtMs: number;
  schemaVersion: number;
}

export interface SetupValidation {
  ok: boolean;
  errors: Record<string, string>;
  totalBeds: number;
}

/* ─── 9/10. Subscription lifecycle and manual payments ────────────────────── */

export type SubscriptionLifecycleState = 'Active' | 'Expired' | 'Pending' | 'Renewal';

export type ManualPaymentMethod = 'instapay';

export type ManualPaymentStatus = 'pending' | 'verified' | 'rejected';

export interface ManualPaymentRecord {
  id: string;
  workspaceId: string;
  method: ManualPaymentMethod;
  /** Reference the payer typed on the transfer. Never card data. */
  reference: string;
  amount?: number;
  currency?: string;
  status: ManualPaymentStatus;
  submittedAtMs: number;
  submittedBy: string;
  verifiedAtMs?: number;
  verifiedBy?: string;
  note?: string;
  /** True only for the clearly labelled local demo simulator. */
  mock?: boolean;
  schemaVersion: number;
}

/**
 * Entitlements are intentionally nullable because the repository does not
 * define plan limits or prices. `null` means "not defined yet"; it must NOT be
 * read as unlimited access. Consumers keep the existing behaviour in that case
 * and surface the limit as an unresolved product decision.
 */
export interface PlanEntitlements {
  maxUnits: number | null;
  maxBedsPerUnit: number | null;
  waitingLists: boolean;
  clinicMode: boolean;
}

export interface SubscriptionLifecycleView {
  state: SubscriptionLifecycleState;
  /** Raw status from workspaces/{ws}/subscription/current. */
  sourceStatus: string;
  periodEndMs: number | null;
  daysLeft: number | null;
  entitlements: PlanEntitlements;
  pendingPayment?: ManualPaymentRecord;
  /** True when a renewal is already pending and may not be submitted again. */
  renewalBlocked: boolean;
}

/* ─── 14. Unit-scoped audit (local append-only buffer) ────────────────────── */

export interface LocalAuditEvent {
  id: string;
  atMs: number;
  workspaceId: string;
  unitId: string;
  actorUid: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  result: 'success' | 'failure';
  summary: string;
  meta?: Record<string, string | number | boolean>;
  /** True when the event is only in the local buffer because a write failed. */
  unsynced?: boolean;
  schemaVersion: number;
}
