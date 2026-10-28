import { DEPARTMENT_TEAM_SCHEMA_VERSION } from '../types/departmentTeam.ts';
import type {
  AppointmentStatus,
  ClinicAppointment,
  ClinicBill,
  ClinicBillItem,
  ClinicConsultation,
  ClinicEvent,
  ClinicInvestigation,
  ClinicPrescription,
} from '../types/departmentTeam';
import type { Unit } from '../types/clinical';

/**
 * Clinic mode — local preview only.
 *
 * This module owns the clinic workflow contract (appointments, consultations and
 * billing *records*) and persists it on this device. It is deliberately pure:
 * no React, no Firebase, no networking, no payment provider.
 *
 * Product limit: a bill can only be Draft or Issued. There is no `Paid` state,
 * no price list and no currency default in this repository, so no amount or
 * currency is ever invented here.
 */

/* ─── Storage keys ────────────────────────────────────────────────────────── */

export const CLINIC_APPOINTMENTS_KEY = 'cardiovault_dt_clinic_appointments_v1';
export const CLINIC_CONSULTATIONS_KEY = 'cardiovault_dt_clinic_consultations_v1';
export const CLINIC_BILLS_KEY = 'cardiovault_dt_clinic_bills_v1';

/** The slice of the Web Storage API this module needs. Injecting it keeps tests clean. */
export interface ClinicStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryValues = new Map<string, string>();
const memoryStorage: ClinicStorage = {
  getItem: (key) => (memoryValues.has(key) ? (memoryValues.get(key) as string) : null),
  setItem: (key, value) => {
    memoryValues.set(key, value);
  },
};

/** Resolves browser storage when it exists, otherwise the in-memory fallback. */
function resolveStorage(storage?: ClinicStorage): ClinicStorage {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* private mode / blocked storage: fall through to memory */
  }
  return memoryStorage;
}

function readCollection<T>(key: string, storage?: ClinicStorage): T[] {
  try {
    const raw = resolveStorage(storage).getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Corrupt or hand-edited JSON must never break the screen.
    return [];
  }
}

function writeCollection<T>(key: string, items: T[], storage?: ClinicStorage): void {
  try {
    resolveStorage(storage).setItem(key, JSON.stringify(items));
  } catch {
    // Quota or blocked storage: the caller keeps its in-memory list.
  }
}

export function loadAppointments(storage?: ClinicStorage): ClinicAppointment[] {
  return readCollection<ClinicAppointment>(CLINIC_APPOINTMENTS_KEY, storage);
}

export function saveAppointments(items: ClinicAppointment[], storage?: ClinicStorage): void {
  writeCollection(CLINIC_APPOINTMENTS_KEY, items, storage);
}

export function loadConsultations(storage?: ClinicStorage): ClinicConsultation[] {
  return readCollection<ClinicConsultation>(CLINIC_CONSULTATIONS_KEY, storage);
}

export function saveConsultations(items: ClinicConsultation[], storage?: ClinicStorage): void {
  writeCollection(CLINIC_CONSULTATIONS_KEY, items, storage);
}

export function loadBills(storage?: ClinicStorage): ClinicBill[] {
  return readCollection<ClinicBill>(CLINIC_BILLS_KEY, storage);
}

export function saveBills(items: ClinicBill[], storage?: ClinicStorage): void {
  writeCollection(CLINIC_BILLS_KEY, items, storage);
}

/* ─── Unit enablement ─────────────────────────────────────────────────────── */

/**
 * Clinic Mode is opt-in per unit. `unit.config.capabilities.clinicMode` must be
 * exactly `true`; the legacy `unit.features` array may also carry 'clinic'.
 * A missing or malformed config means "off".
 */
export function clinicEnabledForUnit(unit: Partial<Unit> | null | undefined): boolean {
  if (!unit) return false;
  const config = unit.config as { capabilities?: { clinicMode?: unknown } } | undefined;
  if (config?.capabilities?.clinicMode === true) return true;
  const features = Array.isArray(unit.features) ? unit.features : [];
  return features.includes('clinic');
}

/* ─── Validation helpers ──────────────────────────────────────────────────── */

function requiredText(value: unknown, field: string, maxLength?: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${field} is required.`);
  if (maxLength !== undefined && text.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function optionalText(value: unknown, field: string, maxLength?: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  if (maxLength !== undefined && text.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function requiredNumber(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} must be a valid number.`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number.`);
  return parsed;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredNumber(value, field);
}

function newId(prefix: string, nowMs: number): string {
  return `${prefix}-${Math.max(0, Math.floor(nowMs)).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/* ─── Appointments ────────────────────────────────────────────────────────── */

export interface CreateAppointmentInput {
  id?: string;
  workspaceId: string;
  unitId: string;
  patientId: string;
  patientName: string;
  scheduledAtMs: number;
  durationMinutes: number;
  reason?: string;
  createdBy: string;
}

export const APPOINTMENT_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  scheduled: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  'no-show': [],
};

export function createAppointment(input: CreateAppointmentInput, nowMs: number = Date.now()): ClinicAppointment {
  const createdAtMs = requiredNumber(nowMs, 'Now');
  const workspaceId = requiredText(input?.workspaceId, 'Workspace id');
  const unitId = requiredText(input?.unitId, 'Unit id');
  const patientId = requiredText(input?.patientId, 'Patient id');
  const patientName = requiredText(input?.patientName, 'Patient name', 200);
  const createdBy = requiredText(input?.createdBy, 'Creator');
  const scheduledAtMs = requiredNumber(input?.scheduledAtMs, 'Scheduled date and time');
  const durationMinutes = requiredNumber(input?.durationMinutes, 'Duration');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 240) {
    throw new Error('Duration must be a whole number of minutes between 5 and 240.');
  }
  const reason = optionalText(input?.reason, 'Reason', 200);
  const event: ClinicEvent = {
    atMs: createdAtMs,
    actorUid: createdBy,
    from: null,
    to: 'scheduled',
  };
  return {
    id: optionalText(input?.id, 'Appointment id') || newId('clinic-appt', createdAtMs),
    workspaceId,
    unitId,
    patientId,
    patientName,
    scheduledAtMs,
    durationMinutes,
    ...(reason ? { reason } : {}),
    status: 'scheduled',
    createdBy,
    createdAtMs,
    updatedAtMs: createdAtMs,
    history: [event],
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };
}

export interface AppointmentTransitionOptions {
  actorUid: string;
  /** Mandatory when the target status is 'cancelled'. */
  reason?: string;
  atMs?: number;
}

export function transitionAppointment(
  appointment: ClinicAppointment,
  to: AppointmentStatus,
  options: AppointmentTransitionOptions
): ClinicAppointment {
  if (!appointment?.id) throw new Error('Appointment is missing.');
  const target = String(to || '') as AppointmentStatus;
  const allowed = APPOINTMENT_TRANSITIONS[appointment.status];
  if (!allowed) throw new Error(`Unknown appointment status "${String(appointment.status)}".`);
  if (!allowed.includes(target)) {
    throw new Error(`An appointment marked "${appointment.status}" cannot become "${target}".`);
  }
  const actorUid = requiredText(options?.actorUid, 'Actor');
  const atMs = options?.atMs === undefined ? Date.now() : requiredNumber(options.atMs, 'Transition time');
  if (target === 'cancelled') {
    const reason = requiredText(options?.reason, 'Cancellation reason', 200);
    return {
      ...appointment,
      status: target,
      updatedAtMs: atMs,
      history: [
        ...(Array.isArray(appointment.history) ? appointment.history : []),
        { atMs, actorUid, from: appointment.status, to: target, reason },
      ],
    };
  }
  const reason = optionalText(options?.reason, 'Reason', 200);
  return {
    ...appointment,
    status: target,
    updatedAtMs: atMs,
    history: [
      ...(Array.isArray(appointment.history) ? appointment.history : []),
      { atMs, actorUid, from: appointment.status, to: target, ...(reason ? { reason } : {}) },
    ],
  };
}

/**
 * Marks the appointment completed and links the consultation to it. Pure: the
 * caller decides when to persist the returned appointment.
 */
export function linkConsultationToAppointment(
  appointment: ClinicAppointment,
  consultation: ClinicConsultation
): ClinicAppointment {
  if (!appointment?.id) throw new Error('Appointment is missing.');
  if (!consultation?.id) throw new Error('Consultation is missing.');
  if (consultation.appointmentId && consultation.appointmentId !== appointment.id) {
    throw new Error('This consultation belongs to a different appointment.');
  }
  if (appointment.consultationId && appointment.consultationId !== consultation.id) {
    throw new Error('This appointment is already linked to another consultation.');
  }
  if (appointment.consultationId === consultation.id && appointment.status === 'completed') {
    return { ...appointment };
  }
  const atMs = Number.isFinite(consultation.createdAtMs) ? consultation.createdAtMs : Date.now();
  const actorUid = String(consultation.createdBy || '').trim() || appointment.createdBy;
  const alreadyCompleted = appointment.status === 'completed';
  return {
    ...appointment,
    status: 'completed',
    consultationId: consultation.id,
    updatedAtMs: atMs,
    history: alreadyCompleted
      ? [...(Array.isArray(appointment.history) ? appointment.history : [])]
      : [
          ...(Array.isArray(appointment.history) ? appointment.history : []),
          { atMs, actorUid, from: appointment.status, to: 'completed', reason: 'Consultation recorded' },
        ],
  };
}

/* ─── Consultations ───────────────────────────────────────────────────────── */

export interface CreateConsultationInput {
  id?: string;
  workspaceId: string;
  unitId: string;
  patientId: string;
  appointmentId?: string;
  chiefComplaint: string;
  assessment: string;
  plan: string;
  followUpAtMs?: number;
  prescriptions?: ClinicPrescription[];
  investigations?: ClinicInvestigation[];
  createdBy: string;
}

function normalizePrescription(raw: unknown, index: number): ClinicPrescription {
  const source = (raw || {}) as Partial<ClinicPrescription>;
  const drug = requiredText(source.drug, `Prescription ${index + 1} drug`, 200);
  const dose = requiredText(source.dose, `Prescription ${index + 1} dose`, 100);
  const route = requiredText(source.route, `Prescription ${index + 1} route`, 100);
  const frequency = requiredText(source.frequency, `Prescription ${index + 1} frequency`, 100);
  let durationDays: number | undefined;
  if (source.durationDays !== undefined && source.durationDays !== null && String(source.durationDays) !== '') {
    durationDays = requiredNumber(source.durationDays, `Prescription ${index + 1} duration`);
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      throw new Error(`Prescription ${index + 1} duration must be a whole number of days of at least 1.`);
    }
  }
  const notes = optionalText(source.notes, `Prescription ${index + 1} notes`, 300);
  return { drug, dose, route, frequency, ...(durationDays !== undefined ? { durationDays } : {}), ...(notes ? { notes } : {}) };
}

function normalizeInvestigation(raw: unknown, index: number): ClinicInvestigation {
  const source = (raw || {}) as Partial<ClinicInvestigation>;
  const name = requiredText(source.name, `Investigation ${index + 1} name`, 200);
  const status = String(source.status ?? '').trim() === '' ? 'ordered' : source.status;
  if (status !== 'ordered' && status !== 'resulted') {
    throw new Error(`Investigation ${index + 1} status must be "ordered" or "resulted".`);
  }
  return { name, urgent: source.urgent === true, status };
}

export function createConsultation(input: CreateConsultationInput, nowMs: number = Date.now()): ClinicConsultation {
  const createdAtMs = requiredNumber(nowMs, 'Now');
  const workspaceId = requiredText(input?.workspaceId, 'Workspace id');
  const unitId = requiredText(input?.unitId, 'Unit id');
  const patientId = requiredText(input?.patientId, 'Patient id');
  const createdBy = requiredText(input?.createdBy, 'Creator');
  const chiefComplaint = requiredText(input?.chiefComplaint, 'Chief complaint', 1000);
  const assessment = requiredText(input?.assessment, 'Assessment', 4000);
  const plan = requiredText(input?.plan, 'Plan', 4000);
  const appointmentId = optionalText(input?.appointmentId, 'Appointment id');
  const followUpAtMs = optionalNumber(input?.followUpAtMs, 'Follow-up date');
  const rawPrescriptions = input?.prescriptions === undefined ? [] : input.prescriptions;
  const rawInvestigations = input?.investigations === undefined ? [] : input.investigations;
  if (!Array.isArray(rawPrescriptions)) throw new Error('Prescriptions must be a list.');
  if (!Array.isArray(rawInvestigations)) throw new Error('Investigations must be a list.');
  return {
    id: optionalText(input?.id, 'Consultation id') || newId('clinic-consult', createdAtMs),
    workspaceId,
    unitId,
    patientId,
    ...(appointmentId ? { appointmentId } : {}),
    chiefComplaint,
    assessment,
    plan,
    ...(followUpAtMs !== undefined ? { followUpAtMs } : {}),
    prescriptions: rawPrescriptions.map(normalizePrescription),
    investigations: rawInvestigations.map(normalizeInvestigation),
    createdBy,
    createdAtMs,
    updatedAtMs: createdAtMs,
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };
}

/* ─── Billing records ─────────────────────────────────────────────────────── */

export interface CreateBillInput {
  id?: string;
  workspaceId: string;
  unitId: string;
  patientId: string;
  consultationId?: string;
  /** No `total` here on purpose: the total is always computed from the items. */
  items: ClinicBillItem[];
  createdBy: string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createBill(input: CreateBillInput, nowMs: number = Date.now()): ClinicBill {
  const createdAtMs = requiredNumber(nowMs, 'Now');
  const workspaceId = requiredText(input?.workspaceId, 'Workspace id');
  const unitId = requiredText(input?.unitId, 'Unit id');
  const patientId = requiredText(input?.patientId, 'Patient id');
  const createdBy = requiredText(input?.createdBy, 'Creator');
  const consultationId = optionalText(input?.consultationId, 'Consultation id');
  const rawItems = input?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('A bill needs at least one line item.');
  }
  const items: ClinicBillItem[] = rawItems.map((raw, index) => {
    const source = (raw || {}) as Partial<ClinicBillItem>;
    const label = requiredText(source.label, `Line item ${index + 1} label`, 200);
    const amount = requiredNumber(source.amount, `Line item ${index + 1} amount`);
    if (amount < 0) throw new Error(`Line item ${index + 1} amount cannot be negative.`);
    const currency = requiredText(source.currency, `Line item ${index + 1} currency`).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error(`Line item ${index + 1} currency must be a 3 letter ISO code, e.g. EGP.`);
    }
    return { label, amount, currency };
  });
  const currency = items[0].currency;
  if (items.some((item) => item.currency !== currency)) {
    throw new Error('Every line item on a bill must use the same currency.');
  }
  const total = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  return {
    id: optionalText(input?.id, 'Bill id') || newId('clinic-bill', createdAtMs),
    workspaceId,
    unitId,
    patientId,
    ...(consultationId ? { consultationId } : {}),
    items,
    total,
    currency,
    status: 'Draft',
    createdAtMs,
    createdBy,
    schemaVersion: DEPARTMENT_TEAM_SCHEMA_VERSION,
  };
}

/**
 * Draft -> Issued, once. There is no Paid state and no payment call: issuing a
 * bill only records that the invoice was handed out.
 */
export function issueBill(bill: ClinicBill, nowMs: number = Date.now()): ClinicBill {
  if (!bill?.id) throw new Error('Bill is missing.');
  if (bill.status === 'Issued') throw new Error('This bill is already issued.');
  if (bill.status !== 'Draft') throw new Error(`Unknown bill status "${String(bill.status)}".`);
  return { ...bill, status: 'Issued', issuedAtMs: requiredNumber(nowMs, 'Issue time') };
}

/* ─── Listing helpers ─────────────────────────────────────────────────────── */

export function listAppointmentsByUnit(appointments: ClinicAppointment[], unitId: string): ClinicAppointment[] {
  return (Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => appointment?.unitId === unitId)
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}

export function listAppointmentsByPatient(appointments: ClinicAppointment[], patientId: string): ClinicAppointment[] {
  return (Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => appointment?.patientId === patientId)
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}

export function listConsultationsByUnit(consultations: ClinicConsultation[], unitId: string): ClinicConsultation[] {
  return (Array.isArray(consultations) ? consultations : [])
    .filter((consultation) => consultation?.unitId === unitId)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export function listConsultationsByPatient(
  consultations: ClinicConsultation[],
  patientId: string
): ClinicConsultation[] {
  return (Array.isArray(consultations) ? consultations : [])
    .filter((consultation) => consultation?.patientId === patientId)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export function listBillsByUnit(bills: ClinicBill[], unitId: string): ClinicBill[] {
  return (Array.isArray(bills) ? bills : [])
    .filter((bill) => bill?.unitId === unitId)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export function listBillsByPatient(bills: ClinicBill[], patientId: string): ClinicBill[] {
  return (Array.isArray(bills) ? bills : [])
    .filter((bill) => bill?.patientId === patientId)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/** Appointments for one unit inside a half-open window [dayStartMs, dayEndMs). */
export function appointmentsForDay(
  appointments: ClinicAppointment[],
  unitId: string,
  dayStartMs: number,
  dayEndMs: number
): ClinicAppointment[] {
  return listAppointmentsByUnit(appointments, unitId).filter(
    (appointment) => appointment.scheduledAtMs >= dayStartMs && appointment.scheduledAtMs < dayEndMs
  );
}

/* ─── Daily report ────────────────────────────────────────────────────────── */

export interface ClinicDailyReport {
  appointments: number;
  completed: number;
  cancelled: number;
  noShow: number;
  consultations: number;
  investigationsOrdered: number;
  billsIssued: number;
  /** Sum of issued bills per currency. Currencies are never converted or combined. */
  billedTotalByCurrency: Record<string, number>;
}

const inWindow = (value: number, start: number, end: number): boolean =>
  Number.isFinite(value) && value >= start && value < end;

export function dailyClinicReport(
  appointments: ClinicAppointment[],
  consultations: ClinicConsultation[],
  bills: ClinicBill[],
  unitId: string,
  dayStartMs: number,
  dayEndMs: number
): ClinicDailyReport {
  const report: ClinicDailyReport = {
    appointments: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    consultations: 0,
    investigationsOrdered: 0,
    billsIssued: 0,
    billedTotalByCurrency: {},
  };
  if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs) || dayEndMs <= dayStartMs) return report;

  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    if (!appointment || appointment.unitId !== unitId) continue;
    if (!inWindow(appointment.scheduledAtMs, dayStartMs, dayEndMs)) continue;
    report.appointments += 1;
    if (appointment.status === 'completed') report.completed += 1;
    else if (appointment.status === 'cancelled') report.cancelled += 1;
    else if (appointment.status === 'no-show') report.noShow += 1;
  }

  for (const consultation of Array.isArray(consultations) ? consultations : []) {
    if (!consultation || consultation.unitId !== unitId) continue;
    if (!inWindow(consultation.createdAtMs, dayStartMs, dayEndMs)) continue;
    report.consultations += 1;
    // Every investigation row was ordered at this visit, whatever its current status.
    report.investigationsOrdered += Array.isArray(consultation.investigations)
      ? consultation.investigations.length
      : 0;
  }

  for (const bill of Array.isArray(bills) ? bills : []) {
    if (!bill || bill.unitId !== unitId) continue;
    if (bill.status !== 'Issued') continue;
    if (!inWindow(Number(bill.issuedAtMs), dayStartMs, dayEndMs)) continue;
    report.billsIssued += 1;
    const currency = String(bill.currency || '').toUpperCase();
    if (!currency) continue;
    report.billedTotalByCurrency[currency] = roundMoney(
      (report.billedTotalByCurrency[currency] || 0) + Number(bill.total || 0)
    );
  }

  return report;
}
