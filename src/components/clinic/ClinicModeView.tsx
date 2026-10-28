import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  LayoutDashboard,
  Plus,
  Receipt,
  Stethoscope,
  Trash2,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { appendAuditEvent } from '../../services/localAuditLog';
import ClinicDashboard from './ClinicDashboard';
import {
  buildClinicVisitTimelineEvent,
  canEditClinical,
  canViewClinicalSummaries,
  type ClinicRole,
} from '../../services/clinicDashboard';
import {
  loadMasterFiles,
  linkOrCreateForIntake,
  maskNationalId,
  persistTimelineEvent,
} from '../../services/masterPatientFile';
import { previewNowMs } from '../../services/previewClock';
import { computeEntitlementState, subscriptionHistoryExists } from '../../services/subscriptionRequests';
import { PREVIEW_CLINIC_ID, type MasterPatientFile } from '../../types/clinicArea';
import {
  clinicEnabledForUnit,
  createAppointment,
  createBill,
  createConsultation,
  dailyClinicReport,
  issueBill,
  linkConsultationToAppointment,
  listAppointmentsByUnit,
  listBillsByUnit,
  listConsultationsByUnit,
  loadAppointments,
  loadBills,
  loadConsultations,
  saveAppointments,
  saveBills,
  saveConsultations,
  transitionAppointment,
} from '../../services/clinicMode';
import type {
  AppointmentStatus,
  ClinicAppointment,
  ClinicBill,
  ClinicConsultation,
} from '../../types/departmentTeam';
import type { Patient, Unit } from '../../types/clinical';

/**
 * Clinic Mode — local preview.
 *
 * Everything on this screen is stored on this device only. There is no payment
 * provider in this repository, so a bill is a record that can be Draft or
 * Issued; it is never marked paid.
 */

type TabId = 'dashboard' | 'appointments' | 'patients' | 'consultation' | 'billing' | 'reports';

interface PrescriptionRow {
  key: string;
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  durationDays: string;
}

interface InvestigationRow {
  key: string;
  name: string;
  urgent: boolean;
  status: 'ordered' | 'resulted';
}

interface BillRow {
  key: string;
  label: string;
  amount: string;
  currency: string;
}

interface ClinicPatientOption {
  id: string;
  fullName: string;
  name?: string;
  age: number;
  mrn?: string;
  nationalId?: string;
  phone?: string;
  sourcePatient?: Patient;
  masterFile?: MasterPatientFile;
}

const CARD = 'bg-white dark:bg-[#111c2e] border border-slate-200 dark:border-slate-800 rounded-2xl';
const INPUT =
  'w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40';
const LABEL = 'text-xs font-bold text-slate-600 dark:text-slate-300';
const PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-cyan-500 text-white text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed';
const GHOST =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300';

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  'checked-in': 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  completed: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'no-show': 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

/**
 * AppContext does not expose the active workspace id, and the module that owns
 * it imports Firebase. This screen must not import Firebase, so it reads the
 * same localStorage snapshot directly and falls back to the local master id.
 */
const WORKSPACE_ACCESS_KEY = 'cardiovault_active_workspace_access_v1';
const LOCAL_WORKSPACE_FALLBACK = 'cardiovault_master_workspace';

function readWorkspaceId(): string {
  try {
    const raw = localStorage.getItem(WORKSPACE_ACCESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { workspaceId?: unknown }) : null;
    const value = String(parsed?.workspaceId || '').trim();
    return value || LOCAL_WORKSPACE_FALLBACK;
  } catch {
    return LOCAL_WORKSPACE_FALLBACK;
  }
}

let rowSequence = 0;
const nextRowKey = (): string => {
  rowSequence += 1;
  return `row-${Date.now()}-${rowSequence}`;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const dateInputValue = (ms: number): string => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const timeInputValue = (ms: number): string => {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatDateTime = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  const date = new Date(ms);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const localDayStart = (dateValue: string): number => {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return new Date(year, month - 1, day).getTime();
};

const patientNameOf = (patient: ClinicPatientOption | undefined, fallbackId = ''): string =>
  patient ? patient.fullName || patient.name || patient.id : fallbackId;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const emptyPrescriptionRow = (): PrescriptionRow => ({
  key: nextRowKey(),
  drug: '',
  dose: '',
  route: '',
  frequency: '',
  durationDays: '',
});

const emptyInvestigationRow = (): InvestigationRow => ({
  key: nextRowKey(),
  name: '',
  urgent: false,
  status: 'ordered',
});

const emptyBillRow = (): BillRow => ({ key: nextRowKey(), label: '', amount: '', currency: '' });

const prescriptionRowHasContent = (row: PrescriptionRow): boolean =>
  Boolean(row.drug.trim() || row.dose.trim() || row.route.trim() || row.frequency.trim() || row.durationDays.trim());

const investigationRowHasContent = (row: InvestigationRow): boolean => Boolean(row.name.trim());

const billRowHasContent = (row: BillRow): boolean =>
  Boolean(row.label.trim() || row.amount.trim() || row.currency.trim());

export const ClinicModeView: React.FC = () => {
  const { currentUser, units, patients, setCurrentView } = useApp();

  const clinicUnits = useMemo(() => {
    const enabled = units.filter((unit) => clinicEnabledForUnit(unit));
    // Clinic-only subscribers need a clinic workspace even when they do not
    // own department units. This synthetic option is local preview metadata.
    return enabled.length ? enabled : [{ id: PREVIEW_CLINIC_ID, name: 'Clinic', type: 'Clinic', totalBeds: 0 } as Unit];
  }, [units]);
  const [unitSelection, setUnitSelection] = useState('');
  const activeUnitId = clinicUnits.some((unit) => unit.id === unitSelection)
    ? unitSelection
    : clinicUnits[0]?.id || '';

  const workspaceId = useMemo(() => readWorkspaceId(), []);
  const actorUid = String(currentUser?.userId || '').trim() || 'local-user';
  const activePatients = useMemo(() => patients.filter((patient) => !patient.isArchived), [patients]);
  const [masterFiles, setMasterFiles] = useState<MasterPatientFile[]>(() => loadMasterFiles());
  const clinicMasterFiles = useMemo(
    () => masterFiles.filter((file) => file.contextIds.includes(PREVIEW_CLINIC_ID)),
    [masterFiles],
  );
  const patientOptions = useMemo<ClinicPatientOption[]>(() => {
    const departmentOptions = activePatients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName || patient.name || patient.id,
      name: patient.name,
      age: patient.age,
      mrn: patient.mrn,
      sourcePatient: patient,
    }));
    const linkedSourceIds = new Set(departmentOptions.map((patient) => patient.id));
    const clinicOptions = clinicMasterFiles
      .filter((file) => !(file.sourcePatientIds || []).some((id) => linkedSourceIds.has(id)))
      .map((file) => ({ id: file.id, fullName: file.name, age: file.ageYears, nationalId: file.nationalId, phone: file.phone, masterFile: file }));
    return [...departmentOptions, ...clinicOptions];
  }, [activePatients, clinicMasterFiles]);

  const [tab, setTab] = useState<TabId>('appointments');
  const [appointments, setAppointments] = useState<ClinicAppointment[]>(() => loadAppointments());
  const [consultations, setConsultations] = useState<ClinicConsultation[]>(() => loadConsultations());
  const [bills, setBills] = useState<ClinicBill[]>(() => loadBills());
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [patientFileSearch, setPatientFileSearch] = useState('');
  const [clinicPatientName, setClinicPatientName] = useState('');
  const [clinicPatientAge, setClinicPatientAge] = useState('');
  const [clinicPatientNationalId, setClinicPatientNationalId] = useState('');
  const [clinicPatientPhone, setClinicPatientPhone] = useState('');
  const [clinicPatientRiskFactors, setClinicPatientRiskFactors] = useState('');
  const [clinicPatientHistory, setClinicPatientHistory] = useState('');

  // The account profile is the role source. Missing legacy metadata maps from
  // the account's clinical role; coordinators are front-desk secretaries.
  const clinicRole: ClinicRole = currentUser?.clinicRole ||
    (String(currentUser?.role || '') === 'coordinator' ? 'secretary' : 'doctor');
  const clinicalLocked = !canEditClinical(clinicRole);
  const canViewSummaries = canViewClinicalSummaries(clinicRole);
  const subscriberId = String(currentUser?.userId || '').trim() || undefined;
  const clinicEntitlement = computeEntitlementState('clinic', previewNowMs(), undefined, subscriberId);
  const clinicReadOnly = subscriptionHistoryExists(undefined, subscriberId) && clinicEntitlement === 'read-only';
  const requireClinicWrite = (): void => {
    if (clinicReadOnly) throw new Error('Clinic access is read-only. Renew or ask the owner to activate the clinic subscription.');
  };

  const commitAppointments = (next: ClinicAppointment[]): void => {
    setAppointments(next);
    saveAppointments(next);
  };
  const commitConsultations = (next: ClinicConsultation[]): void => {
    setConsultations(next);
    saveConsultations(next);
  };
  const commitBills = (next: ClinicBill[]): void => {
    setBills(next);
    saveBills(next);
  };

  // Unit-scoped, append-only audit. Failures are reported as unsynced rather
  // than silently dropped.
  const audit = (
    unitId: string,
    action: string,
    summary: string,
    entityType: string,
    entityId: string,
    patientId: string,
  ): void => {
    const result = appendAuditEvent({
      workspaceId,
      unitId,
      actorUid,
      action,
      entityType,
      entityId,
      result: 'success',
      summary,
      meta: { patientId },
    });
    if (!result.persisted) {
      setNotice({ type: 'error', text: 'Saved locally, but the audit event is unsynced (device storage failed).' });
    }
  };

  /* ── Appointments tab ─────────────────────────────────────────────────── */
  const [apptPatientId, setApptPatientId] = useState('');
  const [apptSearch, setApptSearch] = useState('');
  const [apptDate, setApptDate] = useState(() => dateInputValue(Date.now()));
  const [apptTime, setApptTime] = useState('09:00');
  const [apptDuration, setApptDuration] = useState('20');
  const [apptReason, setApptReason] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<string[]>([]);

  const matchingPatients = useMemo(() => {
    const query = apptSearch.trim().toLowerCase();
    if (!query) return patientOptions;
    return patientOptions.filter((patient) =>
      [patient.fullName, patient.name, patient.mrn, patient.id]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query))
    );
  }, [patientOptions, apptSearch]);

  const unitAppointments = useMemo(
    () => listAppointmentsByUnit(appointments, activeUnitId),
    [appointments, activeUnitId]
  );

  const unitLabels = useMemo(
    () => Object.fromEntries(clinicUnits.map((unit) => [unit.id, unit.name])),
    [clinicUnits]
  );

  const submitAppointment = (event: React.FormEvent): void => {
    event.preventDefault();
    try {
      requireClinicWrite();
      if (!activeUnitId) throw new Error('Select a clinic-enabled unit first.');
      const patient = patientOptions.find((item) => item.id === apptPatientId);
      if (!patient) throw new Error('Choose a patient for this appointment.');
      const scheduledAtMs = new Date(`${apptDate}T${apptTime || '09:00'}`).getTime();
      const created = createAppointment({
        workspaceId,
        unitId: activeUnitId,
        patientId: patient.id,
        patientName: patientNameOf(patient),
        scheduledAtMs,
        durationMinutes: Number(apptDuration),
        reason: apptReason,
        createdBy: actorUid,
      });
      commitAppointments([...appointments, created]);
      const masterFile = ensureClinicMasterFile(patient, created.createdAtMs);
      const timeline = masterFile ? persistTimelineEvent(masterFile.id, {
        kind: 'appointment',
        title: 'Clinic appointment scheduled',
        summary: `${formatDateTime(created.scheduledAtMs)} · ${created.durationMinutes} minutes`,
        detail: [
          `Status: ${created.status}`,
          `Reason: ${created.reason || 'Not recorded'}`,
          `Scheduled for: ${formatDateTime(created.scheduledAtMs)}`,
          `Clinic unit: ${clinicUnits.find((unit) => unit.id === created.unitId)?.name || created.unitId}`,
        ].join('\n'),
        createdBy: actorUid,
        context: { unitId: activeUnitId, clinicId: PREVIEW_CLINIC_ID },
        atMs: created.createdAtMs,
        refId: created.id,
      }) : null;
      setNotice({
        type: 'success',
        text: !masterFile
          ? `Appointment saved for ${created.patientName}. The patient file was not linked because the match was ambiguous.`
          : timeline?.saved
            ? `Appointment saved for ${created.patientName} and added to the patient file.`
            : `Appointment saved for ${created.patientName}; the patient-file timeline could not be saved on this device.`,
      });
      audit(activeUnitId, 'appointment.created', `Appointment for ${created.patientName}`, 'appointment', created.id, created.patientId);
      setApptReason('');
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  const moveAppointment = (appointmentId: string, to: AppointmentStatus, reason?: string): void => {
    try {
      requireClinicWrite();
      const moved = appointments.map((item) =>
        item.id === appointmentId ? transitionAppointment(item, to, { actorUid, reason }) : item
      );
      commitAppointments(moved);
      setCancelTargetId(null);
      setCancelReason('');
      setNotice({ type: 'success', text: `Appointment marked ${to}.` });
      const transitioned = moved.find((item) => item.id === appointmentId);
      if (transitioned) {
        // Covered here so check-in / complete / cancel / no-show all reach the
        // append-only audit log and survive even after the appointment is gone.
        audit(transitioned.unitId, `appointment.${to}`, `Appointment marked ${to}${reason ? ` (${reason})` : ''}`, 'appointment', transitioned.id, transitioned.patientId);
        const patient = patientOptions.find((item) => item.id === transitioned.patientId);
        const masterFile = patient ? ensureClinicMasterFile(patient, transitioned.updatedAtMs) : null;
        const timeline = masterFile ? persistTimelineEvent(masterFile.id, {
          kind: 'appointment',
          title: 'Clinic appointment status updated',
          summary: `Appointment marked ${to}`,
          detail: [`Status: ${to}`, reason ? `Reason: ${reason}` : '', `Scheduled for: ${formatDateTime(transitioned.scheduledAtMs)}`].filter(Boolean).join('\n'),
          createdBy: actorUid,
          context: { unitId: transitioned.unitId, clinicId: PREVIEW_CLINIC_ID },
          atMs: transitioned.updatedAtMs,
          refId: transitioned.id,
        }) : null;
        if (!masterFile || !timeline?.saved) {
          setNotice({ type: 'success', text: `Appointment marked ${to}. The patient-file timeline needs a manual review.` });
        }
      }
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  const toggleHistory = (appointmentId: string): void => {
    setExpandedHistory((current) =>
      current.includes(appointmentId) ? current.filter((id) => id !== appointmentId) : [...current, appointmentId]
    );
  };

  /* ── Consultation tab ─────────────────────────────────────────────────── */
  const [consultationAppointmentId, setConsultationAppointmentId] = useState('');
  const [consultationPatientId, setConsultationPatientId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [prescriptionRows, setPrescriptionRows] = useState<PrescriptionRow[]>([emptyPrescriptionRow()]);
  const [investigationRows, setInvestigationRows] = useState<InvestigationRow[]>([emptyInvestigationRow()]);

  const openAppointments = useMemo(
    () =>
      unitAppointments.filter(
        (appointment) => appointment.status === 'checked-in' || appointment.status === 'scheduled'
      ),
    [unitAppointments]
  );

  const selectedAppointment = openAppointments.find((item) => item.id === consultationAppointmentId);
  const consultationPatient = selectedAppointment
    ? patientOptions.find((patient) => patient.id === selectedAppointment.patientId)
    : patientOptions.find((patient) => patient.id === consultationPatientId);

  const unitConsultations = useMemo(
    () => listConsultationsByUnit(consultations, activeUnitId),
    [consultations, activeUnitId]
  );

  // Appointments and visits share the local master file. Linking is exact by
  // source patient id when available; otherwise the service requires a unique
  // name+age match and refuses ambiguous merges.
  const ensureClinicMasterFile = (patient: ClinicPatientOption, atMs = previewNowMs()): MasterPatientFile | null => {
    if (patient.masterFile?.contextIds.includes(PREVIEW_CLINIC_ID)) return patient.masterFile;
    const source = patient.sourcePatient;
    const summary = source?.clinicalSummary;
    const history = [
      summary?.chiefComplaint,
      summary?.hpi,
      ...(Array.isArray(summary?.pmh) ? summary.pmh : []),
      summary?.drugHistory ? `Medication history: ${summary.drugHistory}` : '',
    ].map((value) => String(value || '').trim()).filter(Boolean).join('\n');
    const cardiovascular = source?.cardiovascularHistory;
    const riskFactors = [
      cardiovascular?.hypertension ? 'Hypertension' : '',
      cardiovascular?.diabetes ? 'Diabetes' : '',
      cardiovascular?.dyslipidemia ? 'Dyslipidemia' : '',
      cardiovascular?.smoking ? 'Smoking' : '',
    ].filter(Boolean);
    const linkage = linkOrCreateForIntake({
      identity: {
        name: patientNameOf(patient),
        ageYears: Math.trunc(Number(patient.age) || 0),
        sourcePatientId: source?.id,
        phone: patient.phone,
        nationalId: patient.nationalId,
        riskFactors,
        history,
        pastOperations: Array.isArray(summary?.psh) ? summary.psh : [],
      },
      authorizedContextIds: [activeUnitId, PREVIEW_CLINIC_ID].filter(Boolean),
      defaultContextId: PREVIEW_CLINIC_ID,
      createdBy: actorUid,
      nowMs: atMs,
    });
    if ('error' in linkage) return null;
    setMasterFiles(loadMasterFiles());
    return linkage.file;
  };

  const addClinicPatientFile = (event: React.FormEvent): void => {
    event.preventDefault();
    try {
      requireClinicWrite();
      const name = clinicPatientName.trim();
      const ageYears = Math.trunc(Number(clinicPatientAge));
      if (name.length < 2) throw new Error('Enter a patient name with at least two characters.');
      if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 130) throw new Error('Age must be a whole number between 0 and 130.');
      const riskFactors = clinicalLocked ? [] : clinicPatientRiskFactors.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
      const linkage = linkOrCreateForIntake({
        identity: {
          name,
          ageYears,
          nationalId: clinicPatientNationalId.trim() || undefined,
          phone: clinicPatientPhone.trim() || undefined,
          riskFactors,
          history: clinicalLocked ? '' : clinicPatientHistory.trim(),
        },
        authorizedContextIds: [PREVIEW_CLINIC_ID],
        defaultContextId: PREVIEW_CLINIC_ID,
        createdBy: actorUid,
        nowMs: previewNowMs(),
      });
      if ('error' in linkage) throw new Error('A possible duplicate exists in this clinic. Search the patient list and open the existing file before adding another.');
      setMasterFiles(loadMasterFiles());
      setApptPatientId(linkage.file.id);
      setConsultationPatientId(linkage.file.id);
      setNotice({
        type: 'success',
        text: linkage.created ? 'Clinic patient file created and ready for an appointment.' : 'Existing clinic patient file recalled and updated without deleting its history.',
      });
      setClinicPatientName('');
      setClinicPatientAge('');
      setClinicPatientNationalId('');
      setClinicPatientPhone('');
      setClinicPatientRiskFactors('');
      setClinicPatientHistory('');
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  const filteredClinicFiles = useMemo(() => {
    const query = patientFileSearch.trim().toLowerCase();
    if (!query) return clinicMasterFiles;
    return clinicMasterFiles.filter((file) => [file.name, file.nationalId, file.phone]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(query)));
  }, [clinicMasterFiles, patientFileSearch]);

  const updatePrescriptionRow = (key: string, patch: Partial<PrescriptionRow>): void => {
    setPrescriptionRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const updateInvestigationRow = (key: string, patch: Partial<InvestigationRow>): void => {
    setInvestigationRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const submitConsultation = (event: React.FormEvent): void => {
    event.preventDefault();
    try {
      requireClinicWrite();
      if (clinicalLocked) throw new Error('Clinical documentation is available to doctors only.');
      if (!activeUnitId) throw new Error('Select a clinic-enabled unit first.');
      if (!consultationPatient) throw new Error('Choose an appointment or a patient.');
      const followUpAtMs =
        followUpDate.trim() === '' ? undefined : new Date(`${followUpDate}T00:00:00`).getTime();
      const created = createConsultation({
        workspaceId,
        unitId: activeUnitId,
        patientId: consultationPatient.id,
        appointmentId: selectedAppointment?.id,
        chiefComplaint,
        assessment,
        plan,
        followUpAtMs,
        prescriptions: prescriptionRows
          .filter(prescriptionRowHasContent)
          .map((row) => ({
            drug: row.drug,
            dose: row.dose,
            route: row.route,
            frequency: row.frequency,
            durationDays: row.durationDays.trim() === '' ? undefined : Number(row.durationDays),
          })),
        investigations: investigationRows.filter(investigationRowHasContent).map((row) => ({
          name: row.name,
          urgent: row.urgent,
          status: row.status,
        })),
        createdBy: actorUid,
      });
      commitConsultations([...consultations, created]);
      if (selectedAppointment) {
        const linked = linkConsultationToAppointment(selectedAppointment, created);
        commitAppointments(appointments.map((item) => (item.id === linked.id ? linked : item)));
      }
      const masterFile = ensureClinicMasterFile(consultationPatient, created.createdAtMs);
      const eventInput = {
        ...buildClinicVisitTimelineEvent(created, created.createdAtMs, actorUid),
        context: { unitId: activeUnitId, clinicId: PREVIEW_CLINIC_ID },
      };
      const timeline = masterFile ? persistTimelineEvent(masterFile.id, eventInput) : null;
      setNotice({
        type: 'success',
        text: !masterFile
          ? 'Consultation saved. The patient file was not linked because the match was ambiguous.'
          : timeline?.saved
            ? 'Consultation saved and added to the patient timeline.'
            : 'Consultation saved, but the patient-file timeline could not be saved on this device.',
      });
      audit(activeUnitId, 'consultation.created', `Consultation saved for ${created.patientId}`, 'consultation', created.id, created.patientId);
      if (selectedAppointment) {
        // The linked appointment was just completed by this consultation — record
        // that state change too, or the audit log would lose the appointment's
        // final status.
        audit(selectedAppointment.unitId, 'appointment.completed', `Appointment completed by consultation ${created.id}`, 'appointment', selectedAppointment.id, selectedAppointment.patientId);
      }
      setChiefComplaint('');
      setAssessment('');
      setPlan('');
      setFollowUpDate('');
      setConsultationAppointmentId('');
      setConsultationPatientId('');
      setPrescriptionRows([emptyPrescriptionRow()]);
      setInvestigationRows([emptyInvestigationRow()]);
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  /* ── Billing tab ──────────────────────────────────────────────────────── */
  const [billingConsultationId, setBillingConsultationId] = useState('');
  const [billingPatientId, setBillingPatientId] = useState('');
  const [billRows, setBillRows] = useState<BillRow[]>([emptyBillRow()]);

  const selectedBillingConsultation = unitConsultations.find((item) => item.id === billingConsultationId);
  const billingPatient = selectedBillingConsultation
    ? patientOptions.find((patient) => patient.id === selectedBillingConsultation.patientId)
    : patientOptions.find((patient) => patient.id === billingPatientId);

  const billPreview = useMemo(() => {
    const filled = billRows.filter(billRowHasContent);
    if (filled.length === 0) return { total: null as number | null, currency: '' };
    const currencies = Array.from(new Set(filled.map((row) => row.currency.trim().toUpperCase()).filter(Boolean)));
    const amounts = filled.map((row) => (row.amount.trim() === '' ? NaN : Number(row.amount)));
    if (currencies.length !== 1 || amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
      return { total: null as number | null, currency: currencies.length === 1 ? currencies[0] : '' };
    }
    const total = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 100) / 100;
    return { total, currency: currencies[0] };
  }, [billRows]);

  const unitBills = useMemo(() => listBillsByUnit(bills, activeUnitId), [bills, activeUnitId]);

  const updateBillRow = (key: string, patch: Partial<BillRow>): void => {
    setBillRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const submitBill = (event: React.FormEvent): void => {
    event.preventDefault();
    try {
      requireClinicWrite();
      if (clinicalLocked) throw new Error('Clinical documentation is available to doctors only.');
      if (!activeUnitId) throw new Error('Select a clinic-enabled unit first.');
      if (!billingPatient) throw new Error('Choose a consultation or a patient.');
      const created = createBill({
        workspaceId,
        unitId: activeUnitId,
        patientId: billingPatient.id,
        consultationId: selectedBillingConsultation?.id,
        items: billRows
          .filter(billRowHasContent)
          .map((row) => ({
            label: row.label,
            amount: row.amount.trim() === '' ? NaN : Number(row.amount),
            currency: row.currency,
          })),
        createdBy: actorUid,
      });
      commitBills([...bills, created]);
      setNotice({ type: 'success', text: `Draft bill saved (${created.total} ${created.currency}).` });
      audit(activeUnitId, 'clinic_bill.draft', `Draft bill ${created.id}`, 'clinic-bill', created.id, created.patientId);
      setBillRows([emptyBillRow()]);
      setBillingConsultationId('');
      setBillingPatientId('');
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  const issueStoredBill = (bill: ClinicBill): void => {
    try {
      requireClinicWrite();
      const issued = issueBill(bill);
      commitBills(bills.map((item) => (item.id === issued.id ? issued : item)));
      setNotice({ type: 'success', text: 'Bill marked Issued. It is still a record only — nothing was charged.' });
      audit(issued.unitId, 'clinic_bill.issued', `Bill ${issued.id} issued (record only)`, 'clinic-bill', issued.id, issued.patientId);
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    }
  };

  /* ── Reports tab ──────────────────────────────────────────────────────── */
  const [reportDate, setReportDate] = useState(() => dateInputValue(Date.now()));

  const report = useMemo(() => {
    const start = localDayStart(reportDate);
    const end = start + 24 * 60 * 60 * 1000;
    return dailyClinicReport(appointments, consultations, bills, activeUnitId, start, end);
  }, [appointments, consultations, bills, activeUnitId, reportDate]);

  const reportCurrencies = Object.keys(report.billedTotalByCurrency);

  const totalPrescriptionCount = unitConsultations.reduce(
    (sum, consultation) => sum + consultation.prescriptions.length,
    0
  );

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'appointments', label: 'Appointments', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'patients', label: 'Patient files', icon: <Users className="w-4 h-4" /> },
    { id: 'consultation', label: 'Consultation', icon: <Stethoscope className="w-4 h-4" /> },
    { id: 'billing', label: 'Billing', icon: <Receipt className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-3 p-3 sm:p-5 min-w-0">
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Local preview data — saved on this device only. Not synced to Firebase.</span>
      </div>
      {clinicReadOnly && (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-800 dark:text-rose-200">
          Clinic subscription is read-only. Existing records remain viewable; creating or changing clinic records is disabled until renewal or owner approval.
        </div>
      )}

      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-black">Clinic Mode</h1>
          <p className="text-xs text-slate-500">Outpatient appointments, consultations and billing records.</p>
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
          <span className={LABEL}>Signed-in account: </span>
          <strong className="text-cyan-600 dark:text-cyan-300">{clinicRole === 'doctor' ? 'Doctor' : 'Secretary'}</strong>
        </div>
        <label className="min-w-0 w-full sm:w-auto">
          <span className={LABEL}>Clinic unit</span>
          <select
            value={activeUnitId}
            onChange={(event) => setUnitSelection(event.target.value)}
            className={INPUT}
          >
            {clinicUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {notice && (
        <div
          className={`rounded-xl px-3 py-2 text-xs font-bold flex items-start gap-2 ${
            notice.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <span className="min-w-0 break-words">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto shrink-0 text-[10px] underline"
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 min-w-full sm:min-w-0">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
                tab === item.id
                  ? 'bg-white dark:bg-[#111c2e] text-cyan-600 dark:text-cyan-300 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard' && (
        <ClinicDashboard
          appointments={appointments}
          consultations={consultations}
          unitLabelById={unitLabels}
        />
      )}

      {tab === 'appointments' && (
        <div className="space-y-3">
          <form onSubmit={submitAppointment} className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <h2 className="text-sm font-black">New appointment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0">
                <span className={LABEL}>Find patient</span>
                <input
                  value={apptSearch}
                  onChange={(event) => setApptSearch(event.target.value)}
                  placeholder="Name or MRN"
                  className={INPUT}
                />
              </label>
              <label className="min-w-0">
                <span className={LABEL}>Patient</span>
                <select
                  value={apptPatientId}
                  onChange={(event) => setApptPatientId(event.target.value)}
                  className={INPUT}
                >
                  <option value="">Select patient</option>
                  {matchingPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientNameOf(patient)}
                      {patient.mrn ? ` · ${patient.mrn}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0">
                <span className={LABEL}>Date</span>
                <input
                  type="date"
                  value={apptDate}
                  onChange={(event) => setApptDate(event.target.value)}
                  className={INPUT}
                />
              </label>
              <label className="min-w-0">
                <span className={LABEL}>Time</span>
                <input
                  type="time"
                  value={apptTime}
                  onChange={(event) => setApptTime(event.target.value)}
                  className={INPUT}
                />
              </label>
              <label className="min-w-0">
                <span className={LABEL}>Duration (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={apptDuration}
                  onChange={(event) => setApptDuration(event.target.value)}
                  className={INPUT}
                />
              </label>
              <label className="min-w-0">
                <span className={LABEL}>Reason (optional)</span>
                <input
                  value={apptReason}
                  maxLength={200}
                  onChange={(event) => setApptReason(event.target.value)}
                  placeholder="Follow-up, new referral…"
                  className={INPUT}
                />
              </label>
            </div>
            <button type="submit" className={PRIMARY}>
              <Plus className="w-4 h-4" />
              Save appointment
            </button>
          </form>

          <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black">Appointments</h2>
              <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {unitAppointments.length}
              </span>
            </div>
            {unitAppointments.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No appointments for this unit yet.</p>
            ) : (
              <ul className="space-y-2">
                {unitAppointments.map((appointment) => {
                  const isOpen = expandedHistory.includes(appointment.id);
                  return (
                    <li
                      key={appointment.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 min-w-0"
                    >
                      <div className="flex flex-wrap items-start gap-2 justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-black truncate">{appointment.patientName}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatDateTime(appointment.scheduledAtMs)} · {appointment.durationMinutes} min
                          </div>
                          {appointment.reason && (
                            <div className="text-[11px] text-slate-500 break-words">{appointment.reason}</div>
                          )}
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            STATUS_CLASS[appointment.status]
                          }`}
                        >
                          {appointment.status}
                        </span>
                      </div>

                      {appointment.status !== 'completed' &&
                        appointment.status !== 'cancelled' &&
                        appointment.status !== 'no-show' && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {appointment.status === 'scheduled' && (
                              <button
                                type="button"
                                onClick={() => moveAppointment(appointment.id, 'checked-in')}
                                className={PRIMARY}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Check in
                              </button>
                            )}
                            {appointment.status === 'checked-in' && (
                              <button
                                type="button"
                                onClick={() => moveAppointment(appointment.id, 'completed')}
                                className={PRIMARY}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Complete
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTargetId(appointment.id);
                                setCancelReason('');
                              }}
                              className={`${GHOST} text-rose-600 dark:text-rose-300`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                            {appointment.status === 'scheduled' && (
                              <button
                                type="button"
                                onClick={() => moveAppointment(appointment.id, 'no-show')}
                                className={GHOST}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                No-show
                              </button>
                            )}
                          </div>
                        )}

                      {cancelTargetId === appointment.id && (
                        <div className="mt-2 rounded-xl border border-rose-200 dark:border-rose-500/30 p-2 space-y-2">
                          <label className="block min-w-0">
                            <span className={LABEL}>Cancellation reason (required)</span>
                            <input
                              value={cancelReason}
                              maxLength={200}
                              onChange={(event) => setCancelReason(event.target.value)}
                              className={INPUT}
                              placeholder="Why is this appointment cancelled?"
                            />
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => moveAppointment(appointment.id, 'cancelled', cancelReason)}
                              className={`${PRIMARY} bg-rose-500`}
                            >
                              Confirm cancel
                            </button>
                            <button type="button" onClick={() => setCancelTargetId(null)} className={GHOST}>
                              Keep appointment
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleHistory(appointment.id)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500"
                      >
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        History ({appointment.history?.length || 0})
                      </button>
                      {isOpen && (
                        <ul className="mt-1 space-y-1">
                          {(appointment.history || []).map((entry, index) => (
                            <li key={`${appointment.id}-event-${index}`} className="text-[11px] text-slate-500 flex gap-1.5">
                              <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                              <span className="min-w-0 break-words">
                                {formatDateTime(entry.atMs)} · {entry.from || 'new'} → {entry.to}
                                {entry.reason ? ` · ${entry.reason}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'patients' && (
        <div className="space-y-3">
          <section className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <div>
              <h2 className="text-sm font-black">Clinic patient files</h2>
              <p className="mt-1 text-[11px] text-slate-500">Files are scoped to this clinic. A returning patient is matched by national ID or name and age, and existing history is kept.</p>
            </div>
            {clinicalLocked && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Secretary accounts can register patient identity only. Medical history and risk factors are hidden.</p>}
            <form onSubmit={addClinicPatientFile} className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0"><span className={LABEL}>Full name</span><input required minLength={2} value={clinicPatientName} onChange={(event) => setClinicPatientName(event.target.value)} className={INPUT} /></label>
              <label className="min-w-0"><span className={LABEL}>Age</span><input required type="number" min={0} max={130} value={clinicPatientAge} onChange={(event) => setClinicPatientAge(event.target.value)} className={INPUT} /></label>
              <label className="min-w-0"><span className={LABEL}>National ID (optional)</span><input inputMode="numeric" value={clinicPatientNationalId} onChange={(event) => setClinicPatientNationalId(event.target.value)} className={INPUT} /></label>
              <label className="min-w-0"><span className={LABEL}>Contact phone (optional)</span><input inputMode="tel" value={clinicPatientPhone} onChange={(event) => setClinicPatientPhone(event.target.value)} className={INPUT} /></label>
              {!clinicalLocked && <>
                <label className="min-w-0 sm:col-span-2"><span className={LABEL}>Risk factors (comma separated)</span><input value={clinicPatientRiskFactors} onChange={(event) => setClinicPatientRiskFactors(event.target.value)} placeholder="Diabetes, hypertension…" className={INPUT} /></label>
                <label className="min-w-0 sm:col-span-2"><span className={LABEL}>Medical history</span><textarea rows={3} value={clinicPatientHistory} onChange={(event) => setClinicPatientHistory(event.target.value)} className={INPUT} /></label>
              </>}
              <div className="sm:col-span-2"><button type="submit" disabled={clinicReadOnly} className={PRIMARY}><Plus className="h-4 w-4" />Save or recall patient file</button></div>
            </form>
          </section>

          <section className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black">Patients in this clinic · {clinicMasterFiles.length}</h2>
              <button type="button" onClick={() => setCurrentView('master-file')} className={GHOST}>Open combined patient file and archive</button>
            </div>
            <label className="block"><span className={LABEL}>Search by name, national ID, or phone</span><input value={patientFileSearch} onChange={(event) => setPatientFileSearch(event.target.value)} className={INPUT} /></label>
            {filteredClinicFiles.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">No matching clinic patient files.</p> : (
              <ul className="space-y-2">
                {filteredClinicFiles.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                    <div className="min-w-0"><div className="font-bold text-slate-900 dark:text-white">{file.name}</div><div className="mt-0.5 text-slate-500">Age {file.ageYears}{maskNationalId(file) ? ` · ID ${maskNationalId(file)}` : ''}{file.phone ? ` · ${file.phone}` : ''}</div>{canViewSummaries && file.riskFactors.length > 0 ? <div className="mt-1 text-slate-500">Risk factors: {file.riskFactors.join(', ')}</div> : null}</div>
                    <button type="button" onClick={() => { setApptPatientId(file.id); setConsultationPatientId(file.id); setCurrentView('master-file'); }} className={GHOST}>Open patient file</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'consultation' && (
        <div className="space-y-3">
          <form onSubmit={submitConsultation} className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <h2 className="text-sm font-black">New consultation</h2>
            {clinicalLocked && (
              <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                Clinical documentation is available to doctors only.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0">
                <span className={LABEL}>Appointment (checked-in first)</span>
                <select
                  value={consultationAppointmentId}
                  onChange={(event) => {
                    setConsultationAppointmentId(event.target.value);
                    if (event.target.value) setConsultationPatientId('');
                  }}
                  className={INPUT}
                >
                  <option value="">No appointment</option>
                  {openAppointments
                    .slice()
                    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'checked-in' ? -1 : 1))
                    .map((appointment) => (
                      <option key={appointment.id} value={appointment.id}>
                        {appointment.status === 'checked-in' ? '✓ ' : ''}
                        {appointment.patientName} · {formatDateTime(appointment.scheduledAtMs)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="min-w-0">
                <span className={LABEL}>…or patient</span>
                <select
                  value={consultationPatientId}
                  onChange={(event) => {
                    setConsultationPatientId(event.target.value);
                    if (event.target.value) setConsultationAppointmentId('');
                  }}
                  disabled={Boolean(selectedAppointment)}
                  className={`${INPUT} disabled:opacity-60`}
                >
                  <option value="">Select patient</option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientNameOf(patient)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {consultationPatient && (
              <p className="text-[11px] font-bold text-cyan-600 dark:text-cyan-300">
                Recording for {patientNameOf(consultationPatient)}
              </p>
            )}
            <label className="block min-w-0">
              <span className={LABEL}>Chief complaint</span>
              <textarea
                value={chiefComplaint}
                onChange={(event) => setChiefComplaint(event.target.value)}
                rows={2}
                disabled={clinicalLocked}
                className={`${INPUT} disabled:opacity-60`}
              />
            </label>
            <label className="block min-w-0">
              <span className={LABEL}>Assessment</span>
              <textarea
                value={assessment}
                onChange={(event) => setAssessment(event.target.value)}
                rows={3}
                disabled={clinicalLocked}
                className={`${INPUT} disabled:opacity-60`}
              />
            </label>
            <label className="block min-w-0">
              <span className={LABEL}>Plan</span>
              <textarea
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                rows={3}
                disabled={clinicalLocked}
                className={`${INPUT} disabled:opacity-60`}
              />
            </label>
            <label className="block min-w-0 sm:max-w-xs">
              <span className={LABEL}>Follow-up date (optional)</span>
              <input
                type="date"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
                disabled={clinicalLocked}
                className={`${INPUT} disabled:opacity-60`}
              />
            </label>

            <fieldset
              disabled={clinicalLocked}
              className={clinicalLocked ? 'space-y-2 opacity-60 pointer-events-none' : 'space-y-2'}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Prescriptions</h3>
                <button
                  type="button"
                  onClick={() => setPrescriptionRows((rows) => [...rows, emptyPrescriptionRow()])}
                  className={GHOST}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add drug
                </button>
              </div>
              {prescriptionRows.map((row, index) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 grid gap-2 sm:grid-cols-2"
                >
                  <label className="min-w-0">
                    <span className={LABEL}>Drug {index + 1}</span>
                    <input
                      value={row.drug}
                      onChange={(event) => updatePrescriptionRow(row.key, { drug: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Dose</span>
                    <input
                      value={row.dose}
                      onChange={(event) => updatePrescriptionRow(row.key, { dose: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Route</span>
                    <input
                      value={row.route}
                      onChange={(event) => updatePrescriptionRow(row.key, { route: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Frequency</span>
                    <input
                      value={row.frequency}
                      onChange={(event) => updatePrescriptionRow(row.key, { frequency: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Duration (days)</span>
                    <input
                      type="number"
                      min={1}
                      value={row.durationDays}
                      onChange={(event) => updatePrescriptionRow(row.key, { durationDays: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() =>
                        setPrescriptionRows((rows) =>
                          rows.length === 1 ? [emptyPrescriptionRow()] : rows.filter((item) => item.key !== row.key)
                        )
                      }
                      className={`${GHOST} text-rose-600 dark:text-rose-300`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </fieldset>

            <fieldset
              disabled={clinicalLocked}
              className={clinicalLocked ? 'space-y-2 opacity-60 pointer-events-none' : 'space-y-2'}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Investigations</h3>
                <button
                  type="button"
                  onClick={() => setInvestigationRows((rows) => [...rows, emptyInvestigationRow()])}
                  className={GHOST}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add test
                </button>
              </div>
              {investigationRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 grid gap-2 sm:grid-cols-2"
                >
                  <label className="min-w-0">
                    <span className={LABEL}>Investigation</span>
                    <input
                      value={row.name}
                      onChange={(event) => updateInvestigationRow(row.key, { name: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Status</span>
                    <select
                      value={row.status}
                      onChange={(event) =>
                        updateInvestigationRow(row.key, {
                          status: event.target.value === 'resulted' ? 'resulted' : 'ordered',
                        })
                      }
                      className={INPUT}
                    >
                      <option value="ordered">Ordered</option>
                      <option value="resulted">Resulted</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={row.urgent}
                      onChange={(event) => updateInvestigationRow(row.key, { urgent: event.target.checked })}
                    />
                    Urgent
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() =>
                        setInvestigationRows((rows) =>
                          rows.length === 1 ? [emptyInvestigationRow()] : rows.filter((item) => item.key !== row.key)
                        )
                      }
                      className={`${GHOST} text-rose-600 dark:text-rose-300`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </fieldset>

            <button
              type="submit"
              className={PRIMARY}
              disabled={clinicalLocked}
            >
              <Stethoscope className="w-4 h-4" />
              Save consultation
            </button>
            <p className="text-[11px] text-slate-400">
              Saving with an appointment selected marks that appointment completed and links the consultation to it.
            </p>
          </form>

          <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black">Recent consultations</h2>
              <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {unitConsultations.length} · {totalPrescriptionCount} prescriptions
              </span>
            </div>
            {unitConsultations.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No consultations recorded for this unit yet.</p>
            ) : (
              <ul className="space-y-2">
                {unitConsultations
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((consultation) => {
                    const patient = patientOptions.find((item) => item.id === consultation.patientId);
                    return (
                      <li
                        key={consultation.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 min-w-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-black truncate">
                            {patient ? patientNameOf(patient) : consultation.patientId}
                          </span>
                          <span className="text-[11px] text-slate-500">{formatDateTime(consultation.createdAtMs)}</span>
                        </div>
                        {canViewSummaries ? (
                          <p className="mt-1 text-[11px] text-slate-500 break-words">{consultation.chiefComplaint}</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-400 break-words">
                            Medical summaries are hidden from secretary accounts.
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {consultation.prescriptions.length} drugs · {consultation.investigations.length} investigations
                          {consultation.followUpAtMs ? ` · follow-up ${formatDateTime(consultation.followUpAtMs)}` : ''}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Billing record only — no payment provider is connected; a bill is never marked paid.
            </span>
          </div>

          <form onSubmit={submitBill} className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <h2 className="text-sm font-black">New bill</h2>
            {clinicalLocked && (
              <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                Clinical documentation is available to doctors only.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0">
                <span className={LABEL}>Consultation (optional)</span>
                <select
                  value={billingConsultationId}
                  onChange={(event) => {
                    setBillingConsultationId(event.target.value);
                    if (event.target.value) setBillingPatientId('');
                  }}
                  disabled={clinicalLocked}
                  className={`${INPUT} disabled:opacity-60`}
                >
                  <option value="">No consultation</option>
                  {unitConsultations
                    .slice()
                    .reverse()
                    .map((consultation) => {
                      const patient = patientOptions.find((item) => item.id === consultation.patientId);
                      return (
                        <option key={consultation.id} value={consultation.id}>
                          {patient ? patientNameOf(patient) : consultation.patientId} ·{' '}
                          {formatDateTime(consultation.createdAtMs)}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label className="min-w-0">
                <span className={LABEL}>…or patient</span>
                <select
                  value={billingPatientId}
                  onChange={(event) => {
                    setBillingPatientId(event.target.value);
                    if (event.target.value) setBillingConsultationId('');
                  }}
                  disabled={clinicalLocked || Boolean(selectedBillingConsultation)}
                  className={`${INPUT} disabled:opacity-60`}
                >
                  <option value="">Select patient</option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientNameOf(patient)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset
              disabled={clinicalLocked}
              className={clinicalLocked ? 'space-y-2 opacity-60 pointer-events-none' : 'space-y-2'}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Line items</h3>
                <button
                  type="button"
                  onClick={() => setBillRows((rows) => [...rows, emptyBillRow()])}
                  className={GHOST}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add item
                </button>
              </div>
              {billRows.map((row, index) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 grid gap-2 sm:grid-cols-4"
                >
                  <label className="min-w-0 sm:col-span-2">
                    <span className={LABEL}>Label {index + 1}</span>
                    <input
                      value={row.label}
                      onChange={(event) => updateBillRow(row.key, { label: event.target.value })}
                      placeholder="Consultation fee, procedure…"
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Amount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.amount}
                      onChange={(event) => updateBillRow(row.key, { amount: event.target.value })}
                      className={INPUT}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={LABEL}>Currency</span>
                    <input
                      value={row.currency}
                      maxLength={3}
                      onChange={(event) => updateBillRow(row.key, { currency: event.target.value.toUpperCase() })}
                      placeholder="XXX"
                      className={`${INPUT} uppercase`}
                    />
                  </label>
                  <div className="flex items-end sm:col-span-4">
                    <button
                      type="button"
                      onClick={() =>
                        setBillRows((rows) =>
                          rows.length === 1 ? [emptyBillRow()] : rows.filter((item) => item.key !== row.key)
                        )
                      }
                      className={`${GHOST} text-rose-600 dark:text-rose-300`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-500">Computed total (items must share one currency)</span>
              <span className="text-base font-black">
                {billPreview.total === null ? '—' : `${billPreview.total} ${billPreview.currency}`}
              </span>
            </div>

            <button
              type="submit"
              className={PRIMARY}
              disabled={clinicalLocked}
            >
              <Receipt className="w-4 h-4" />
              Save draft bill
            </button>
          </form>

          <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black">Bills</h2>
              <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {unitBills.length}
              </span>
            </div>
            {unitBills.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No bills recorded for this unit yet.</p>
            ) : (
              <ul className="space-y-2">
                {unitBills
                  .slice()
                  .reverse()
                  .map((bill) => {
                    const patient = patientOptions.find((item) => item.id === bill.patientId);
                    return (
                      <li
                        key={bill.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 min-w-0 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-black truncate">
                              {patient ? patientNameOf(patient) : bill.patientId}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {bill.total} {bill.currency} · created {formatDateTime(bill.createdAtMs)}
                              {bill.issuedAtMs ? ` · issued ${formatDateTime(bill.issuedAtMs)}` : ''}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                              bill.status === 'Issued'
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {bill.status}
                          </span>
                        </div>
                        <ul className="text-[11px] text-slate-500 space-y-0.5">
                          {bill.items.map((item, index) => (
                            <li key={`${bill.id}-item-${index}`} className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">{item.label}</span>
                              <span className="shrink-0">
                                {item.amount} {item.currency}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {bill.status === 'Draft' && (
                          <button type="button" onClick={() => issueStoredBill(bill)} className={PRIMARY}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Issue bill
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          <div className={`${CARD} p-3 sm:p-4 space-y-3`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-black">Daily clinic report</h2>
                <p className="text-[11px] text-slate-500">Appointments by scheduled time; consultations and bills by record time.</p>
              </div>
              <label className="min-w-0">
                <span className={LABEL}>Day</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className={INPUT}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { label: 'Appointments', value: report.appointments },
                { label: 'Completed', value: report.completed },
                { label: 'Cancelled', value: report.cancelled },
                { label: 'No-show', value: report.noShow },
                { label: 'Consultations', value: report.consultations },
                { label: 'Investigations', value: report.investigationsOrdered },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 truncate">
                    {metric.label}
                  </div>
                  <div className="text-lg font-black">{metric.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Bills issued</h3>
                <span className="text-lg font-black">{report.billsIssued}</span>
              </div>
              {reportCurrencies.length === 0 ? (
                <p className="text-[11px] text-slate-400">No issued bills for this day.</p>
              ) : (
                <ul className="space-y-1">
                  {reportCurrencies.map((currency) => (
                    <li key={currency} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-500">{currency}</span>
                      <span className="font-black">{report.billedTotalByCurrency[currency]}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-slate-400">
                Totals stay per currency; nothing is converted. Drafts are not counted.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
