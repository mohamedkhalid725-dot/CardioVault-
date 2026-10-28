import type {
  AppointmentStatus,
  ClinicAppointment,
  ClinicConsultation,
} from '../types/departmentTeam.ts';
import {
  PREVIEW_CLINIC_ID,
  SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES,
  type MasterPatientFile,
} from '../types/clinicArea.ts';
import type { TimelineEventInput } from './masterPatientFile.ts';
import { maskNationalId } from './masterPatientFile.ts';

/**
 * Clinic dashboard — local preview only.
 *
 * Pure module (no React, no DOM, no Firebase): aggregates clinic appointments
 * and consultations into honest daily numbers, owns the doctor/secretary role
 * switch persisted on this device, and builds the timeline-event input used to
 * link a completed clinic consultation to a master patient file («الملف الأم»).
 *
 * Hard rules inherited from the clinic-area decisions:
 *  - Linkage never creates or merges files, and never happens by name alone.
 *  - Every count is computed from the records as they exist; nothing is inferred.
 *  - All day math uses LOCAL calendar days (midnight to midnight).
 */

/* ─── Role switch ─────────────────────────────────────────────────────────── */

export type ClinicRole = 'doctor' | 'secretary';

export const CLINIC_ROLE_KEY = 'cardiovault_dt_clinic_role_v1';

/** The slice of Web Storage needed here; injecting it keeps tests clean. */
export interface DashboardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryValues = new Map<string, string>();
const memoryStorage: DashboardStorage = {
  getItem: (key) => (memoryValues.has(key) ? (memoryValues.get(key) as string) : null),
  setItem: (key, value) => {
    memoryValues.set(key, value);
  },
};

function resolveStorage(storage?: DashboardStorage): DashboardStorage {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* private mode / blocked storage: fall through to memory */
  }
  return memoryStorage;
}

/**
 * Reads the persisted clinic role. Any junk (corrupt JSON, unknown value,
 * missing key) is ignored and the safe default 'doctor' is returned, so a
 * hand-edited storage entry can never silently strip clinical rights away
 * from the default session.
 */
export function loadClinicRole(storage?: DashboardStorage): ClinicRole {
  try {
    const raw = resolveStorage(storage).getItem(CLINIC_ROLE_KEY);
    if (!raw) return 'doctor';
    const parsed: unknown = JSON.parse(raw);
    const role = typeof parsed === 'object' && parsed !== null
      ? (parsed as { role?: unknown }).role
      : parsed;
    return String(role ?? '').trim() === 'secretary' ? 'secretary' : 'doctor';
  } catch {
    return 'doctor';
  }
}

/** Persists the role. Returns false when storage refused the write (quota/blocked). */
export function saveClinicRole(role: ClinicRole, storage?: DashboardStorage): boolean {
  const value: ClinicRole = role === 'secretary' ? 'secretary' : 'doctor';
  try {
    resolveStorage(storage).setItem(CLINIC_ROLE_KEY, JSON.stringify({ role: value }));
    return true;
  } catch {
    return false;
  }
}

/* ─── Role capability gates ───────────────────────────────────────────────── */

/** Booking and check-in stay available to both roles (front-desk work). */
export function canRegisterPatients(role: ClinicRole): boolean {
  return role === 'doctor' || role === 'secretary';
}

/** Clinical drafting (consultations, prescriptions, investigations) is doctor-only. */
export function canEditClinical(role: ClinicRole): boolean {
  return role !== 'secretary';
}

/**
 * OPEN PRODUCT QUESTION: whether a secretary may view clinical summaries is not
 * decided. This is deliberately a single-line delegator so the default can be
 * reversed by flipping the constant — no call site needs to change.
 */
export function canViewClinicalSummaries(role: ClinicRole): boolean {
  return role === 'secretary' ? SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES : true;
}

/* ─── Local calendar day helpers ──────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Midnight (00:00 local) of the local calendar day containing `ms`. */
export function localDayStart(ms: number): number {
  if (!Number.isFinite(ms)) return NaN;
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const isSameLocalDay = (ms: number, dayStart: number): boolean =>
  Number.isFinite(ms) && ms >= dayStart && ms < dayStart + DAY_MS;

const normalizeName = (value: string): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/* ─── Today's agenda ──────────────────────────────────────────────────────── */

export interface TodayAppointmentRow {
  id: string;
  /** Kept so callers can resolve a unit label for the row. */
  unitId: string;
  patientName: string;
  /** HH:MM in the local timezone, 24h. */
  timeLabel: string;
  status: AppointmentStatus;
  durationMinutes: number;
}

/**
 * Today's appointments for the local calendar day of `nowMs`, sorted by
 * scheduled time. Pure: no storage, no clock reads — the caller passes `nowMs`.
 */
export function todayAppointments(appointments: ClinicAppointment[], nowMs: number): TodayAppointmentRow[] {
  const dayStart = localDayStart(nowMs);
  if (!Number.isFinite(dayStart)) return [];
  return (Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => !!appointment?.id && isSameLocalDay(appointment.scheduledAtMs, dayStart))
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs)
    .map((appointment) => {
      const at = new Date(appointment.scheduledAtMs);
      return {
        id: appointment.id,
        unitId: appointment.unitId,
        patientName: appointment.patientName,
        timeLabel: `${pad2(at.getHours())}:${pad2(at.getMinutes())}`,
        status: appointment.status,
        durationMinutes: appointment.durationMinutes,
      };
    });
}

/**
 * Daily clinic waiting count: today's entries still 'scheduled' or 'checked-in'.
 * This is explicitly NOT the operation waiting list — it is today's clinic queue.
 */
export function waitingTodayCount(appointments: ClinicAppointment[], nowMs: number): number {
  const dayStart = localDayStart(nowMs);
  if (!Number.isFinite(dayStart)) return 0;
  return (Array.isArray(appointments) ? appointments : []).filter(
    (appointment) =>
      !!appointment?.id &&
      isSameLocalDay(appointment.scheduledAtMs, dayStart) &&
      (appointment.status === 'scheduled' || appointment.status === 'checked-in')
  ).length;
}

/** Honest counters for today: nothing is inferred beyond the records. */
export interface TodayCounters {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export function todayCounters(appointments: ClinicAppointment[], nowMs: number): TodayCounters {
  const dayStart = localDayStart(nowMs);
  const counters: TodayCounters = { total: 0, completed: 0, cancelled: 0, noShow: 0 };
  if (!Number.isFinite(dayStart)) return counters;
  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    if (!appointment?.id || !isSameLocalDay(appointment.scheduledAtMs, dayStart)) continue;
    counters.total += 1;
    if (appointment.status === 'completed') counters.completed += 1;
    else if (appointment.status === 'cancelled') counters.cancelled += 1;
    else if (appointment.status === 'no-show') counters.noShow += 1;
  }
  return counters;
}

/* ─── Upcoming booked days ────────────────────────────────────────────────── */

export interface UpcomingBookedDay {
  /** e.g. 'Sat 25-10' — weekday short name + DD-MM in the local timezone. */
  dayLabel: string;
  count: number;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Future days (strictly after today's local calendar day) that hold at least one
 * non-cancelled appointment, up to `horizonDays` days ahead. Past days and empty
 * days are excluded; only 'cancelled' is filtered out — completed and no-show
 * entries still belong to the day's story.
 */
export function upcomingBookedDays(
  appointments: ClinicAppointment[],
  nowMs: number,
  horizonDays: number = 7
): UpcomingBookedDay[] {
  const now = new Date(nowMs);
  if (!Number.isFinite(now.getTime())) return [];
  const horizon = Math.max(0, Math.floor(Number(horizonDays) || 0));
  if (horizon === 0) return [];
  const items = Array.isArray(appointments) ? appointments : [];

  const days: UpcomingBookedDay[] = [];
  for (let offset = 1; offset <= horizon; offset += 1) {
    // Built via the Date constructor (not `start + offset * DAY_MS`) so DST
    // shifts never skew a day boundary.
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dayStart = dayDate.getTime();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset + 1).getTime();
    const count = items.filter(
      (appointment) =>
        !!appointment?.id &&
        appointment.status !== 'cancelled' &&
        appointment.scheduledAtMs >= dayStart &&
        appointment.scheduledAtMs < dayEnd
    ).length;
    if (count > 0) {
      days.push({
        dayLabel: `${WEEKDAY_SHORT[dayDate.getDay()]} ${pad2(dayDate.getDate())}-${pad2(dayDate.getMonth() + 1)}`,
        count,
      });
    }
  }
  return days;
}

/* ─── Master-file linkage (optional, confirm-gated) ───────────────────────── */

/**
 * The exact input object for `masterPatientFile.persistTimelineEvent`. The
 * event is stamped with the PREVIEW CLINIC context and the consultation id as
 * `refId`; the caller decides whether and when it is persisted (never silent).
 */
export function buildClinicVisitTimelineEvent(
  consultation: ClinicConsultation,
  nowMs: number,
  createdBy: string
): TimelineEventInput {
  const id = String(consultation?.id || '').trim();
  const chief = String(consultation?.chiefComplaint || '').trim();
  const assessment = String(consultation?.assessment || '').trim();
  const plan = String(consultation?.plan || '').trim();
  return {
    kind: 'clinic-visit',
    title: 'Clinic visit',
    summary: chief || 'Clinic visit recorded',
    detail: assessment || plan ? `Assessment: ${assessment}\n\nPlan: ${plan}` : chief,
    createdBy: String(createdBy || '').trim() || 'local-user',
    context: { clinicId: PREVIEW_CLINIC_ID },
    refId: id,
    atMs: Math.floor(Number.isFinite(nowMs) ? nowMs : 0),
  };
}

/**
 * Outcome of matching a clinic patient against existing master files inside the
 * authorized unit/clinic scope. Matching requires the EXACT normalized name
 * AND the same age — never name alone (approved decision).
 *
 * There is deliberately no 'auto' outcome: a unique exact match is still only a
 * SUGGESTION that the user must confirm before any event is appended to the
 * file. Nothing here creates or merges files.
 */
export type MasterFileLinkDecision =
  | { decision: 'confirm'; fileId: string; fileName: string; maskedNationalId: string }
  /** No master file with that name in scope: skip silently. */
  | { decision: 'none' }
  /** Name matches exist but none resolves uniquely by name+age: never guess. */
  | { decision: 'ambiguous' };

export interface MasterFileLinkPatient {
  name: string;
  age: number;
}

export function decideMasterFileLink(
  files: MasterPatientFile[],
  patient: MasterFileLinkPatient,
  authorizedContextIds: string[]
): MasterFileLinkDecision {
  const scope = [...new Set((authorizedContextIds || []).map((id) => String(id)).filter(Boolean))];
  if (!scope.length) return { decision: 'none' };
  const nameKey = normalizeName(patient?.name || '');
  if (!nameKey) return { decision: 'none' };

  const authorized = (Array.isArray(files) ? files : []).filter(
    (file) => !!file?.id && Array.isArray(file.contextIds) && file.contextIds.some((id) => scope.includes(String(id)))
  );
  const sameName = authorized.filter((file) => normalizeName(file.name) === nameKey);
  if (sameName.length === 0) return { decision: 'none' };

  const ageMatches = sameName.filter(
    (file) => Number.isFinite(file.ageYears) && Math.trunc(file.ageYears) === Math.trunc(Number(patient.age))
  );
  if (ageMatches.length === 1) {
    const file = ageMatches[0];
    return {
      decision: 'confirm',
      fileId: file.id,
      fileName: file.name,
      maskedNationalId: maskNationalId(file),
    };
  }
  // Zero age matches (name hit, different age) or several — both are guesses
  // this module refuses to make.
  return { decision: 'ambiguous' };
}
