/**
 * Shared contracts for the approved clinic-area workstreams (local preview only).
 *
 * Scope and safety:
 *  - Everything here is LOCAL PREVIEW data: plain localStorage records,
 *    synthetic demo content only. No Firebase, no network, no real patients.
 *  - These types are the single source of truth shared by:
 *      masterPatientFile.ts (lead-owned), operationWaiting.ts (Agent B),
 *      subscriptionRequests.ts (Agent C), clinic dashboard (Agent D).
 *  - Nothing in this file may import firestore/webFirebase.
 *  - The master patient file never stores or exposes a full national ID in
 *    search results; only the LAST FOUR digits may be displayed. The full ID
 *    (if captured) is stored only inside the file record, never in logs or
 *    audit summaries.
 */

// ---------------------------------------------------------------------------
// Preview clinic identity (clinic management area)
// ---------------------------------------------------------------------------

/** The one clinic-management space in this local preview. */
export const PREVIEW_CLINIC_ID = 'clinic-preview-main';

/**
 * OPEN PRODUCT QUESTION (plan §4/§9): how much clinical history a secretary may
 * view is NOT decided. Default hides clinical summaries from secretaries; the
 * constant makes the behavior reversible without code redesign.
 */
export const SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES = false;

// ---------------------------------------------------------------------------
// Master patient file (الملف الأم)
// ---------------------------------------------------------------------------

/** Where a timeline event happened. Exactly one of the two ids must be set. */
export interface CareContext {
  /** Unit id when the event happened in a department unit. */
  unitId?: string;
  /** Clinic id when the event happened inside clinic management. */
  clinicId?: string;
}

export type TimelineEventKind =
  | 'appointment'
  | 'clinic-visit'
  | 'encounter'
  | 'operation-waiting'
  | 'unit-booking'
  | 'operation-record'
  | 'test-attachment';

export interface MasterTimelineEvent {
  id: string;
  kind: TimelineEventKind;
  /** Dated: every event carries its own timestamp. */
  atMs: number;
  title: string;
  /** Short one-line summary for the timeline row. */
  summary: string;
  /** Full openable details shown when the user taps the event. */
  detail: string;
  createdBy: string;
  /** Owning unit or clinic; used for authorization and tagging. */
  context: CareContext;
  /** Id of the originating record in the owning service (appointment id, waiting id...). */
  refId?: string;
  /** Local-only attachment metadata; file blobs stay in the browser IndexedDB. */
  attachments?: OperationAttachment[];
  schemaVersion: number;
}

export type MasterFilePermission = 'full' | 'read-only';

export interface MasterPatientFile {
  id: string;
  /** Stable identity inside the authorized scope. Never merged by name alone. */
  name: string;
  ageYears: number;
  /** Full national id if the user entered one. DISPLAY MUST ALWAYS MASK IT. */
  nationalId?: string;
  phone?: string;
  /** Stable link to the department patient's record when one exists. */
  sourcePatientIds?: string[];
  riskFactors: string[];
  history: string;
  pastOperations: string[];
  pastImaging: string[];
  /**
   * Unit/clinic ids this file has been used in. Authorization rule (approved
   * interpretation of plan §20): a doctor may see exactly the files where at
   * least one context id is inside the doctor's own authorized unit/clinic set.
   */
  contextIds: string[];
  timeline: MasterTimelineEvent[];
  createdAtMs: number;
  createdBy: string;
  updatedAtMs: number;
  schemaVersion: number;
}

/** Result of an authorized search. Only masked identifiers are exposed. */
export interface MasterFileSearchHit {
  file: MasterPatientFile;
  /** Masked national id: `****1234` or empty when unknown. */
  maskedNationalId: string;
}

export interface MasterFileSearchResult {
  hits: MasterFileSearchHit[];
  /** True when more than one file matched the same name (disambiguation shown). */
  ambiguous: boolean;
  /** Unit/clinic scopes the search was confined to. */
  searchedScopeIds: string[];
}

// ---------------------------------------------------------------------------
// Operation waiting list (قائمة انتظار العمليات)
// ---------------------------------------------------------------------------

/**
 * Small, reversible state model (plan §13/§14 left exact meanings open):
 *  - urgent  : flagged urgent by the clinician.
 *  - waiting : parked on the list.
 *  - pending : paperwork/tests pending.
 *  - preparing : being prepared for the operation.
 * The state is set by the user; the app never infers medical urgency.
 */
export type OperationWaitState = 'urgent' | 'waiting' | 'pending' | 'preparing';

export interface OperationAttachment {
  id: string;
  /** Original file name on the device. */
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Local data URL. Preview-only; large files are stored as metadata below. */
  dataUrl?: string;
  /** IndexedDB key for the full local Blob, including files larger than 400 KB. */
  blobKey?: string;
  /** True when only the metadata was kept (file too large for local storage). */
  metadataOnly?: boolean;
}

export type OperationWaitingStatus = 'active' | 'booked';

export interface OperationBookingRecord {
  /** Destination unit chosen by the authorized user (never auto-chosen). */
  unitId: string;
  atMs: number;
  bookedBy: string;
}

export interface OperationWaitingEntry {
  id: string;
  unitId: string;
  patientFileId: string;
  patientName: string;
  ageYears: number;
  history: string;
  /** e.g. ['diabetes','hypertension'] plus any custom risk factor text. */
  riskFactors: string[];
  complaint: string;
  /** Free-text operation name written by the clinician. */
  operationName: string;
  attachments: OperationAttachment[];
  /** Editable list of missing tests; empty + testsComplete=true means complete. */
  missingTests: string[];
  testsComplete: boolean;
  state: OperationWaitState;
  /** active = on the waiting list; booked = removed from active after booking. */
  status: OperationWaitingStatus;
  booking?: OperationBookingRecord;
  createdAtMs: number;
  createdBy: string;
  updatedAtMs: number;
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Signup request, pricing and owner approval
// ---------------------------------------------------------------------------

export type SubscriptionRequestType = 'department' | 'clinic' | 'both';
export type PaymentMethodChoice = 'instapay' | 'visa';
export type PricingArea = 'department' | 'clinic';
export type PricingCurrency = 'EGP' | 'USD';

/** Prices are recurring subscriptions billed for each 30-day period. */
export const PRICING_PERIOD: '30-days' = '30-days';

export interface PricingLineItem {
  area: PricingArea;
  /** Number of units (department) or doctors (clinic). */
  quantity: number;
  currency: PricingCurrency;
  /** Price per unit/doctor in the chosen currency. */
  unitPrice: number;
  subtotal: number;
}

export interface SubscriptionRequest {
  id: string;
  /** Required contact phone (approved decision §7). */
  phone: string;
  requestType: SubscriptionRequestType;
  /** Institution/department name as entered. */
  institutionName: string;
  /** Selected department units (only when department or both). */
  unitDrafts: { id?: string; name: string; typeLabel: string; beds: number; receivesOperations: boolean }[];
  /** Requested clinic doctor count (only when clinic or both). */
  doctorsCount: number;
  /** Chosen clinic specialties/services labels (informative only). */
  clinicServices: string[];
  /** Chosen FIRST / displayed payment method; owner confirmations happen manually. */
  paymentMethod: PaymentMethodChoice;
  lineItems: PricingLineItem[];
  submittedAtMs: number;
  /** 3-day free trial start (approved decision §7). */
  trialStartedAtMs: number;
  /** Renewal requests are not eligible for a fresh free trial. */
  trialEligible?: boolean;
  /** True when this request renews an existing unit or clinic scope. */
  isRenewal?: boolean;
  createdBy: string;
  createdByName: string;
  createdByEmail?: string;
  /** Owner's manual confirmation that payment was checked outside the app. */
  paymentVerifiedAtMs?: number;
  paymentVerifiedBy?: string;
  schemaVersion: number;
}

/** One approval action by the owner — partial or complete. */
export type OwnerApprovalArea = 'department' | 'clinic' | 'both';

export interface SubscriptionCodeRecord {
  id: string;
  /** Only a visible handle; security lives in the LOCAL record + owner approval. */
  code: string;
  requestId: string;
  /** Account owner of this subscription scope; prevents cross-member activation. */
  subscriberId?: string;
  area: OwnerApprovalArea;
  /** Department codes can be scoped to one selected unit. */
  unitId?: string;
  unitName?: string;
  /** Clinic code quantity is the number of subscribed doctors. */
  quantity?: number;
  issuedAtMs: number;
  /** Early renewals start at the previous expiry; late renewals start at issue time. */
  startsAtMs?: number;
  expiresAtMs?: number;
  validForDays: number;
  status: 'active' | 'revoked' | 'replaced';
  revokedAtMs?: number;
  schemaVersion: number;
}

/**
 * Lifecycle state of one area for one member, evaluated at `nowMs`:
 *  - trial        : 3-day free trial running.
 *  - active       : paid code valid.
 *  - grace        : code expired, 3-day renewal window running.
 *  - read-only    : after trial/grace without renewal, or owner revocation.
 */
export type AreaEntitlementState = 'trial' | 'active' | 'grace' | 'read-only';

export const TRIAL_DAYS = 3;
export const CODE_VALID_DAYS = 30;
export const GRACE_DAYS = 3;
