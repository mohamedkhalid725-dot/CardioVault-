import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Info,
  PauseCircle,
  Plus,
  Search,
  Stethoscope,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { appendAuditEvent } from '../../services/localAuditLog';
import { assertUnitWritable, computeUnitEntitlementState, subscriptionHistoryExists } from '../../services/subscriptionRequests';
import type { WaitingEntry, WaitingStatus } from '../../types/departmentTeam';
import {
  SERVICE_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  activeEntries,
  convertWaitingToAdmission,
  createWaitingEntry,
  entriesForUnit,
  loadWaitingEntries,
  saveWaitingEntries,
  statusCounts,
  transitionWaitingEntry,
  unitSupportsWaitingList,
} from '../../services/waitingList';

/**
 * Unit waiting list — local preview.
 *
 * Deliberately has no priority / urgency / triage control: the repository has
 * no clinical priority model, so the queue is ordered by arrival time only.
 * Nothing here reads or writes Firebase; entries live in localStorage.
 */

interface WaitingListViewProps {
  /**
   * Workspace scope for new entries. Optional so the view stays drop-in; when
   * omitted the active workspace that Unit Access stored on this device is used.
   */
  workspaceId?: string;
}

const STATUS_LABEL: Record<WaitingStatus, string> = {
  waiting: 'Waiting',
  ready: 'Ready',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
  admitted: 'Admitted',
};

const STATUS_ORDER: WaitingStatus[] = ['waiting', 'ready', 'deferred', 'cancelled', 'admitted'];

const STATUS_BADGE: Record<WaitingStatus, string> = {
  waiting: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  deferred: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  admitted: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/30',
};

const ERROR_TEXT: Record<string, string> = {
  'workspaceId-required': 'No workspace is active on this device.',
  'unitId-required': 'Select a unit first.',
  'patientId-required': 'Select a patient first.',
  'patientName-required': 'The selected patient has no name.',
  'service-required': 'Enter the service the patient is waiting for.',
  'service-too-long': `The service must be ${SERVICE_MAX_LENGTH} characters or fewer.`,
  'notes-too-long': `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`,
  'createdBy-required': 'No signed-in user was found.',
  'reason-required': 'A reason is required for this action.',
  'invalid-transition': 'That action is not allowed from the current status.',
  'encounterId-required': 'The encounter id is missing.',
};

const describeError = (error: unknown): string => {
  const code = error instanceof Error ? error.message : '';
  if (code.startsWith('read-only-area:')) return 'This unit is read-only until its own trial or subscription is active.';
  return ERROR_TEXT[code] || 'Something went wrong. Nothing was changed.';
};

const formatTime = (ms: number): string => {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
};

/** Reads the workspace id the app already stores locally; no Firebase import. */
function resolveWorkspaceId(explicit?: string): string {
  const given = String(explicit || '').trim();
  if (given) return given;
  try {
    const raw = localStorage.getItem('cardiovault_active_workspace_access_v1');
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const stored =
      parsed && typeof parsed === 'object'
        ? String((parsed as { workspaceId?: unknown }).workspaceId || '').trim()
        : '';
    if (stored) return stored;
  } catch {
    /* A blocked or empty store simply means no workspace was recorded. */
  }
  return 'local-workspace';
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1322] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40';
const labelClass = 'block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1';

export const WaitingListView: React.FC<WaitingListViewProps> = ({ workspaceId: workspaceIdProp }) => {
  const { currentUser, units, patients, beds } = useApp();

  const [entries, setEntries] = useState<WaitingEntry[]>(() => loadWaitingEntries());
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WaitingStatus>('all');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [service, setService] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [notes, setNotes] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [admittingId, setAdmittingId] = useState<string | null>(null);
  const [bedDraft, setBedDraft] = useState('');
  const [lastEncounter, setLastEncounter] = useState<{ encounterId: string; patientName: string } | null>(null);

  const workspaceId = useMemo(() => resolveWorkspaceId(workspaceIdProp), [workspaceIdProp]);
  const actorUid = String(currentUser?.userId || '').trim() || 'local-user';
  const actorName = String(currentUser?.name || '').trim() || undefined;

  const supportedUnits = useMemo(
    () => units.filter((unit) => unitSupportsWaitingList(unit) || entries.some((entry) => entry.unitId === unit.id)),
    [units, entries]
  );
  const unitId = supportedUnits.some((unit) => unit.id === selectedUnitId)
    ? selectedUnitId
    : supportedUnits[0]?.id || '';
  const subscriberId = String(currentUser?.userId || '').trim() || undefined;
  const unitReadOnly = !!unitId && subscriptionHistoryExists(undefined, subscriberId) && computeUnitEntitlementState(unitId, undefined, undefined, subscriberId) === 'read-only';

  const unitEntries = useMemo(() => entriesForUnit(entries, unitId), [entries, unitId]);
  const counts = useMemo(() => statusCounts(unitEntries), [unitEntries]);
  const visibleEntries = useMemo(() => {
    const filtered = statusFilter === 'all' ? unitEntries : unitEntries.filter((entry) => entry.status === statusFilter);
    return filtered.slice().sort((a, b) => a.createdAtMs - b.createdAtMs);
  }, [unitEntries, statusFilter]);

  const patientOptions = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    return patients
      .filter((patient) => !patient.isArchived)
      .filter((patient) => {
        if (!query) return true;
        return (
          String(patient.fullName || patient.name || '').toLowerCase().includes(query) ||
          String(patient.mrn || '').toLowerCase().includes(query)
        );
      })
      .slice()
      .sort((a, b) => String(a.fullName || a.name || '').localeCompare(String(b.fullName || b.name || '')))
      .slice(0, 100);
  }, [patients, patientQuery]);

  const freeBeds = useMemo(
    () => beds.filter((bed) => bed.unitId === unitId && !bed.patientId),
    [beds, unitId]
  );

  const persist = (next: WaitingEntry[]): boolean => {
    const saved = saveWaitingEntries(next);
    setEntries(next);
    if (!saved) setActionError('The change could not be saved on this device.');
    return saved;
  };

  // Unit-scoped, append-only audit. A failed local write is surfaced as
  // "unsynced" instead of pretending the event was recorded.
  const audit = (entry: WaitingEntry, action: string, summary: string) => {
    const result = appendAuditEvent({
      workspaceId,
      unitId: entry.unitId,
      actorUid,
      actorName,
      action,
      entityType: 'waiting-entry',
      entityId: entry.id,
      result: 'success',
      summary,
      meta: { status: entry.status },
    });
    if (!result.persisted) {
      setActionError('Saved locally, but the audit event is unsynced (device storage failed).');
    }
  };

  const resetForm = () => {
    setPatientQuery('');
    setPatientId('');
    setService('');
    setReferredBy('');
    setNotes('');
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setWarnings([]);

    const patient = patients.find((candidate) => candidate.id === patientId);
    if (!patient) {
      setFormError('Select a patient first.');
      return;
    }

    try {
      assertUnitWritable(unitId, undefined, subscriberId);
      const result = createWaitingEntry(
        {
          workspaceId,
          unitId,
          patientId: patient.id,
          patientName: String(patient.fullName || patient.name || 'Patient'),
          service,
          createdBy: actorUid,
          createdByName: actorName,
          referredBy,
          notes,
        },
        entries,
        Date.now()
      );
      persist([result.entry, ...entries]);
      audit(result.entry, 'waiting.created', `Waiting entry created for ${result.entry.service}`);
      setWarnings(result.warnings);
      resetForm();
    } catch (error) {
      setFormError(describeError(error));
    }
  };

  const runTransition = (entry: WaitingEntry, to: WaitingStatus, reason?: string) => {
    setActionError('');
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      const next = transitionWaitingEntry(entry, to, {
        actorUid,
        actorName,
        reason,
        nowMs: Date.now(),
      });
      persist(entries.map((candidate) => (candidate.id === entry.id ? next : candidate)));
      audit(next, `waiting.${to}`, `Waiting entry moved from ${entry.status} to ${to}`);
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  const askReasonThen = (entry: WaitingEntry, to: WaitingStatus, label: string) => {
    setActionError('');
    const answer = typeof window !== 'undefined' ? window.prompt(label) : null;
    if (answer === null) return;
    if (!answer.trim()) {
      setActionError(ERROR_TEXT['reason-required']);
      return;
    }
    runTransition(entry, to, answer);
  };

  const handleAdmit = (entry: WaitingEntry) => {
    setActionError('');
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      const encounterId = `enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = convertWaitingToAdmission(entry, {
        encounterId,
        bedId: bedDraft.trim() || undefined,
        actorUid,
        actorName,
        nowMs: Date.now(),
      });
      persist(entries.map((candidate) => (candidate.id === entry.id ? result.entry : candidate)));
      audit(result.entry, 'waiting.admitted', `Waiting entry admitted as ${result.encounter.id}`);
      setLastEncounter({ encounterId: result.encounter.id, patientName: entry.patientName });
      setAdmittingId(null);
      setBedDraft('');
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <ClipboardList className="w-5 h-5 mt-0.5 text-cyan-500 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Unit waiting list</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Requests waiting for a service inside one unit. Ordered by arrival time only.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Local preview data — saved on this device only. Not synced to Firebase.</span>
        </div>
      </header>

      {supportedUnits.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-center space-y-2">
          <ClipboardList className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-500" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No unit has a waiting list</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The waiting list is opt-in per unit. Open the unit settings (Manage Units) and enable it for the
            unit that needs one, then come back to this screen.
          </p>
        </div>
      ) : (
        <>
          {unitReadOnly && (
            <div className="rounded-2xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              This unit is read-only. Existing waiting records can be viewed; new requests and status changes are disabled until this unit is renewed or activated.
            </div>
          )}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="waiting-unit">Unit</label>
                <select
                  id="waiting-unit"
                  className={fieldClass}
                  value={unitId}
                  onChange={(event) => {
                    setSelectedUnitId(event.target.value);
                    setStatusFilter('all');
                    setActionError('');
                  }}
                >
                  {supportedUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeEntries(unitEntries).length} active of {unitEntries.length} entries in this unit.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Plus className="w-4 h-4 text-cyan-500" />
              Add to the waiting list
            </h2>

            <form className="space-y-3" onSubmit={handleCreate}>
              <div>
                <label className={labelClass} htmlFor="waiting-patient-search">Find patient</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="waiting-patient-search"
                    className={`${fieldClass} pl-9`}
                    placeholder="Name or MRN"
                    value={patientQuery}
                    onChange={(event) => setPatientQuery(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="waiting-patient">Patient</label>
                <select
                  id="waiting-patient"
                  className={fieldClass}
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                >
                  <option value="">Select a patient…</option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {String(patient.fullName || patient.name || 'Patient')} · {patient.mrn}
                    </option>
                  ))}
                </select>
                {patientOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    No patient matches this search on this device.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor="waiting-service">Service</label>
                <input
                  id="waiting-service"
                  className={fieldClass}
                  placeholder="e.g. CCU bed, dialysis session, cath lab slot"
                  maxLength={SERVICE_MAX_LENGTH}
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="waiting-referred">Referred by (optional)</label>
                  <input
                    id="waiting-referred"
                    className={fieldClass}
                    placeholder="Referrer name"
                    value={referredBy}
                    onChange={(event) => setReferredBy(event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="waiting-notes">Notes (optional)</label>
                  <input
                    id="waiting-notes"
                    className={fieldClass}
                    placeholder="Short note"
                    maxLength={NOTES_MAX_LENGTH}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>

              {formError && (
                <p className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {formError}
                </p>
              )}

              {warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
                  {warnings.map((warning) => (
                    <p key={warning}>
                      {warning === 'duplicate-service'
                        ? 'This patient already has an active entry for the same service in this unit. Both entries were kept.'
                        : warning}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 min-h-9 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <Plus className="w-4 h-4" />
                Add entry
              </button>
            </form>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  statusFilter === 'all'
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                All {unitEntries.length}
              </button>
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    statusFilter === status
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {STATUS_LABEL[status]} {counts[status]}
                </button>
              ))}
            </div>

            {lastEncounter && (
              <div className="rounded-2xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-800 dark:text-cyan-200 space-y-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Encounter record created locally (not synced)
                </p>
                <p className="break-all">
                  {lastEncounter.patientName} · encounter id: <span className="font-mono">{lastEncounter.encounterId}</span>
                </p>
                <button
                  type="button"
                  className="text-cyan-700 dark:text-cyan-300 underline"
                  onClick={() => setLastEncounter(null)}
                >
                  Dismiss
                </button>
              </div>
            )}

            {actionError && (
              <p className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {actionError}
              </p>
            )}

            {visibleEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {unitEntries.length === 0
                  ? 'No one is on this waiting list yet.'
                  : 'No entry matches this filter.'}
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleEntries.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const admitting = admittingId === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            <UserRound className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{entry.patientName}</span>
                          </p>
                          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                            <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{entry.service}</span>
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[entry.status]}`}>
                          {STATUS_LABEL[entry.status]}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Added {formatTime(entry.createdAtMs)}
                        </span>
                        {entry.createdByName && <span>by {entry.createdByName}</span>}
                        {entry.referredBy && <span>referred by {entry.referredBy}</span>}
                        {entry.admittedBedId && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="w-3 h-3" />
                            {entry.admittedBedId}
                          </span>
                        )}
                      </div>

                      {entry.notes && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 break-words">{entry.notes}</p>
                      )}
                      {entry.deferredReason && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Deferred: {entry.deferredReason}</p>
                      )}
                      {entry.cancelledReason && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-300">Cancelled: {entry.cancelledReason}</p>
                      )}
                      {entry.admittedEncounterId && (
                        <p className="text-[11px] text-cyan-700 dark:text-cyan-300 break-all">
                          Encounter: <span className="font-mono">{entry.admittedEncounterId}</span>
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {entry.status === 'waiting' && (
                          <button
                            type="button"
                            onClick={() => runTransition(entry, 'ready')}
                            className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark ready
                          </button>
                        )}
                        {entry.status === 'ready' && (
                          <button
                            type="button"
                            onClick={() => runTransition(entry, 'waiting')}
                            className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Back to waiting
                          </button>
                        )}
                        {(entry.status === 'waiting' || entry.status === 'ready') && (
                          <>
                            <button
                              type="button"
                              onClick={() => askReasonThen(entry, 'deferred', 'Reason for deferring this entry?')}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                              Defer
                            </button>
                            <button
                              type="button"
                              onClick={() => askReasonThen(entry, 'cancelled', 'Reason for cancelling this entry?')}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-rose-200 dark:border-rose-500/30 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAdmittingId(admitting ? null : entry.id);
                                setBedDraft('');
                                setActionError('');
                              }}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300"
                            >
                              <BedDouble className="w-3.5 h-3.5" />
                              Admit
                            </button>
                          </>
                        )}
                        {entry.status === 'deferred' && (
                          <>
                            <button
                              type="button"
                              onClick={() => runTransition(entry, 'waiting')}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-cyan-200 dark:border-cyan-500/30 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Return to waiting
                            </button>
                            <button
                              type="button"
                              onClick={() => askReasonThen(entry, 'cancelled', 'Reason for cancelling this entry?')}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-rose-200 dark:border-rose-500/30 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          History {entry.history.length}
                        </button>
                      </div>

                      {admitting && (
                        <div className="rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/60 dark:bg-cyan-500/5 p-2.5 space-y-2">
                          <label className={labelClass} htmlFor={`waiting-bed-${entry.id}`}>
                            Bed (optional)
                          </label>
                          <input
                            id={`waiting-bed-${entry.id}`}
                            className={fieldClass}
                            placeholder="Bed id or number"
                            list={`waiting-beds-${entry.id}`}
                            value={bedDraft}
                            onChange={(event) => setBedDraft(event.target.value)}
                          />
                          <datalist id={`waiting-beds-${entry.id}`}>
                            {freeBeds.map((bed) => (
                              <option key={bed.id} value={bed.id}>{bed.bedNumber}</option>
                            ))}
                          </datalist>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAdmit(entry)}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg bg-cyan-500 px-2.5 py-1 text-[11px] font-medium text-white"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirm admission
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAdmittingId(null);
                                setBedDraft('');
                              }}
                              className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                            >
                              Close
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            This creates a local encounter record only. The patient file and bed occupancy are not
                            changed here.
                          </p>
                        </div>
                      )}

                      {expanded && (
                        <ul className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                          {entry.history.length === 0 ? (
                            <li className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">No history.</li>
                          ) : (
                            entry.history.map((event, index) => (
                              <li key={`${entry.id}-${event.atMs}-${index}`} className="px-2.5 py-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-x-1.5">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {event.actorName || event.actorUid || 'Unknown user'}
                                  </span>
                                  <span className="text-slate-400 dark:text-slate-500">·</span>
                                  <span>{formatTime(event.atMs)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span>{event.from ? STATUS_LABEL[event.from] : 'Created'}</span>
                                  <ArrowRight className="w-3 h-3 text-slate-400" />
                                  <span>{STATUS_LABEL[event.to]}</span>
                                </div>
                                {event.reason && <p className="text-slate-500 dark:text-slate-400">Reason: {event.reason}</p>}
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="flex items-start gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            <Info className="w-3.5 h-3.5 shrink-0" />
            This queue has no clinical priority field by design; entries are ordered by arrival time. Actions are
            recorded in each entry&apos;s history.
          </p>
        </>
      )}
    </div>
  );
};
