import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Info,
  Plus,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { appendAuditEvent } from '../../services/localAuditLog';
import { PREVIEW_USER } from '../../config/localPreview';
import { previewNowMs } from '../../services/previewClock';
import { deleteLocalAttachment, loadLocalAttachment, saveLocalAttachment } from '../../services/localAttachmentStore';
import { assertUnitWritable, computeUnitEntitlementState, subscriptionHistoryExists } from '../../services/subscriptionRequests';
import { createWaitingEntry, loadWaitingEntries, saveWaitingEntries } from '../../services/waitingList';
import {
  OPERATION_WAITING_SCHEMA_VERSION,
  activeEntries,
  addAttachment,
  bookEntryPure,
  bookedHistory,
  createOperationEntry,
  entriesForUnit,
  loadOperationEntries,
  removeAttachment,
  saveOperationEntries,
  setMissingTests,
  setState as setEntryState,
  stateCounts,
  type OperationWaitingStorage,
} from '../../services/operationWaiting';
import {
  loadMasterFiles,
  linkOrCreateForIntake,
  maskNationalId,
  persistTimelineEvent,
  scrubProtectedFieldsForAudits,
  searchMasterFiles,
} from '../../services/masterPatientFile';
import type {
  MasterPatientFile,
  MasterFileSearchHit,
  OperationAttachment,
  OperationWaitState,
  OperationWaitingEntry,
} from '../../types/clinicArea';

/**
 * Operation waiting list — local preview.
 *
 * A SEPARATE operation-specific queue, independent of the daily clinic
 * appointments / unit waiting list. Booking a patient into a department unit
 * here does NOT touch the clinical patient record or bed census — the census
 * integration is a separate product decision owned by the lead.
 */

interface OperationWaitingViewProps {
  /**
   * Workspace scope for audits. Optional so the view stays drop-in; when
   * omitted the active workspace that Unit Access stored on this device is used.
   */
  workspaceId?: string;
}

const STATE_LABEL: Record<OperationWaitState, string> = {
  urgent: 'Urgent',
  waiting: 'Waiting',
  pending: 'Pending tests',
  preparing: 'Preparing',
};

const STATE_ORDER: OperationWaitState[] = ['urgent', 'waiting', 'pending', 'preparing'];

const STATE_BADGE: Record<OperationWaitState, string> = {
  urgent: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  waiting: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  preparing: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/30',
};

const RISK_PRESETS: { key: string; label: string }[] = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'hypertension', label: 'Hypertension' },
];

const ERROR_TEXT: Record<string, string> = {
  'unitId-required': 'No unit is active on this device.',
  'patientFileId-required': 'The master patient file could not be linked.',
  'patient-name-required': 'Enter the patient name.',
  'patient-name-short': 'The patient name must be 2 characters or more.',
  'age-invalid': 'Age must be a whole number between 0 and 130.',
  'operationName-required': 'Enter the operation name (free text).',
  'createdBy-required': 'No signed-in user was found.',
  'attachment-invalid': 'One of the attachments is missing its name or size.',
  'entry-not-found': 'This entry no longer exists on this device.',
  'entry-not-active': 'Only an active entry can be changed.',
  'invalid-state': 'That state is not valid.',
  'targetUnitId-required': 'Choose the destination unit for the booking.',
};

const describeError = (error: unknown): string => {
  const code = error instanceof Error ? error.message : '';
  if (code.startsWith('read-only-area:')) return 'This unit is read-only until its own trial or subscription is active.';
  return ERROR_TEXT[code] || 'Something went wrong. Nothing was changed.';
};

/**
 * AppContext does not expose the active workspace id, and the module that owns
 * it imports Firebase. This screen must not import Firebase, so it reads the
 * same localStorage snapshot directly and falls back to the local master id.
 */
const WORKSPACE_ACCESS_KEY = 'cardiovault_active_workspace_access_v1';
const LOCAL_WORKSPACE_FALLBACK = 'cardiovault_master_workspace';

function resolveWorkspaceId(explicit?: string): string {
  const given = String(explicit || '').trim();
  if (given) return given;
  try {
    const raw = localStorage.getItem(WORKSPACE_ACCESS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const stored =
      parsed && typeof parsed === 'object'
        ? String((parsed as { workspaceId?: unknown }).workspaceId || '').trim()
        : '';
    if (stored) return stored;
  } catch {
    /* A blocked or empty store simply means no workspace was recorded. */
  }
  return LOCAL_WORKSPACE_FALLBACK;
}

let draftRowSequence = 0;
const nextDraftKey = (): string => {
  draftRowSequence += 1;
  return `draft-${Date.now()}-${draftRowSequence}`;
};

const formatTime = (ms: number): string => {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fieldClass =
  'w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1322] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40';
const labelClass = 'block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1';
const buttonClass =
  'inline-flex items-center justify-center gap-1.5 min-h-9 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed';
const ghostButtonClass =
  'inline-flex items-center gap-1 min-h-8 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300';

interface DraftAttachment extends OperationAttachment {}

/**
 * Drops the raw national id from a display string. The master file keeps it
 * internally; the screen (and any audit summary) must only ever show it masked.
 */
const safeAuditText = (text: string): string => scrubProtectedFieldsForAudits(text);

export const OperationWaitingView: React.FC<OperationWaitingViewProps> = ({ workspaceId: workspaceIdProp }) => {
  const { currentUser, units } = useApp();

  // ── Scope ──
  const workspaceId = useMemo(() => resolveWorkspaceId(workspaceIdProp), [workspaceIdProp]);
  // Audits carry the fixed preview identity by contract (this is a local
  // preview build; currentUser is only used for the display name).
  const actorUid = PREVIEW_USER.uid;
  const actorName = String(currentUser?.name || '').trim() || PREVIEW_USER.name;
  const subscriberId = String(currentUser?.userId || '').trim() || actorUid;

  // Active unit resolved exactly like ClinicModeView: a local selection that
  // falls back to the first unit of the user.
  const [unitSelection, setUnitSelection] = useState('');
  const activeUnitId = units.some((unit) => unit.id === unitSelection) ? unitSelection : units[0]?.id || '';
  const activeUnitName = units.find((unit) => unit.id === activeUnitId)?.name || '';
  const unitReadOnly = !!activeUnitId && subscriptionHistoryExists(undefined, subscriberId) && computeUnitEntitlementState(activeUnitId, undefined, undefined, subscriberId) === 'read-only';
  // Operation-list intake must recall master files from the selected unit only;
  // another unit with a same-name patient must not appear in this search.
  const authorizedContextIds = useMemo(() => activeUnitId ? [activeUnitId] : [], [activeUnitId]);

  // ── Data ──
  const [entries, setEntries] = useState<OperationWaitingEntry[]>(() => loadOperationEntries());
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [auditUnsynced, setAuditUnsynced] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [notice, setNotice] = useState('');

  // ── Intake form ──
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [history, setHistory] = useState('');
  const [riskPresetDiabetes, setRiskPresetDiabetes] = useState(false);
  const [riskPresetHypertension, setRiskPresetHypertension] = useState(false);
  const [riskCustom, setRiskCustom] = useState('');
  const [complaint, setComplaint] = useState('');
  const [operationName, setOperationName] = useState('');
  const [stateDraft, setStateDraft] = useState<OperationWaitState>('waiting');
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [missingTestsDraft, setMissingTestsDraft] = useState<string[]>([]);
  const [missingTestInput, setMissingTestInput] = useState('');
  const [testsCompleteDraft, setTestsCompleteDraft] = useState(false);
  const [ambiguous, setAmbiguous] = useState<MasterFileSearchHit[] | null>(null);

  // ── Per-card panels ──
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingTarget, setBookingTarget] = useState('');
  const [testsEditorId, setTestsEditorId] = useState<string | null>(null);
  const [testsEditList, setTestsEditList] = useState<string[]>([]);
  const [testsEditComplete, setTestsEditComplete] = useState(false);
  const [testsEditInput, setTestsEditInput] = useState('');
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);
  const [removeDraftId, setRemoveDraftId] = useState<string | null>(null);
  const [bookedOpen, setBookedOpen] = useState(false);

  const unitEntries = useMemo(() => entriesForUnit(entries, activeUnitId), [entries, activeUnitId]);
  const activeList = useMemo(() => activeEntries(unitEntries), [unitEntries]);
  const historyList = useMemo(() => bookedHistory(unitEntries), [unitEntries]);
  const counts = useMemo(() => stateCounts(activeList), [activeList]);

  const persist = (next: OperationWaitingEntry[]): boolean => {
    const saved = saveOperationEntries(next);
    setEntries(next);
    if (!saved) setStorageFailed(true);
    return saved;
  };

  // Unit-scoped, append-only audit. A failed local write is surfaced as
  // "unsynced" instead of pretending the event was recorded. Summaries are
  // scrubbed so a full national id can never reach the audit log.
  const audit = (unitId: string, action: string, summary: string, entityId: string): void => {
    const result = appendAuditEvent({
      workspaceId,
      unitId,
      actorUid,
      actorName,
      action,
      entityType: 'operation-waiting-entry',
      entityId,
      result: 'success',
      summary: safeAuditText(summary),
      nowMs: previewNowMs(),
      meta: { schemaVersion: OPERATION_WAITING_SCHEMA_VERSION },
    });
    if (!result.persisted) setAuditUnsynced(true);
  };

  // ── Intake ──

  const resetForm = (): void => {
    setName('');
    setAgeText('');
    setNationalId('');
    setHistory('');
    setRiskPresetDiabetes(false);
    setRiskPresetHypertension(false);
    setRiskCustom('');
    setComplaint('');
    setOperationName('');
    setStateDraft('waiting');
    setDraftAttachments([]);
    setMissingTestsDraft([]);
    setMissingTestInput('');
    setTestsCompleteDraft(false);
    setAmbiguous(null);
    setFormError('');
  };

  const buildDraftRiskFactors = (): string[] => {
    const items: string[] = [];
    if (riskPresetDiabetes) items.push('diabetes');
    if (riskPresetHypertension) items.push('hypertension');
    const custom = riskCustom
      .split(/[,،\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return [...items, ...custom];
  };

  const handleDraftFiles = async (input: HTMLInputElement | null): Promise<void> => {
    if (!input?.files?.length) return;
    for (const file of Array.from(input.files)) {
      const id = nextDraftKey();
      try {
        await saveLocalAttachment(id, file);
        setDraftAttachments((previous) => [...previous, {
          id,
          blobKey: id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          metadataOnly: false,
        }]);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Could not save this file on the device.');
      }
    }
    input.value = '';
  };

  const openAttachment = async (attachment: OperationAttachment): Promise<void> => {
    try {
      const blob = attachment.blobKey
        ? await loadLocalAttachment(attachment.blobKey)
        : attachment.dataUrl
          ? await fetch(attachment.dataUrl).then((response) => response.blob())
          : null;
      if (!blob) throw new Error('The file content is not available on this device.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = attachment.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not open the local file.');
    }
  };

  const removeDraftAttachment = async (attachment: OperationAttachment): Promise<void> => {
    try {
      if (attachment.blobKey) await deleteLocalAttachment(attachment.blobKey);
      setDraftAttachments((list) => list.filter((candidate) => candidate.id !== attachment.id));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not remove the local file.');
    }
  };

  const submitIntake = (pickedFile?: MasterPatientFile): void => {
    setFormError('');
    if (!activeUnitId) {
      setFormError('No unit is active on this device.');
      return;
    }
    const ageYears = Math.trunc(Number(ageText));
    if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 130) {
      setFormError(ERROR_TEXT['age-invalid']);
      return;
    }

    try {
      assertUnitWritable(activeUnitId, undefined, subscriberId);
      let file: MasterPatientFile | undefined = pickedFile;
      const intakeRiskFactors = buildDraftRiskFactors();
      if (!file) {
        // Master-file linkage: find-or-create inside the authorized scope,
        // matched by name AND (age or national id). Ambiguity is shown to the
        // user — never merged by name alone.
        const linkage = linkOrCreateForIntake({
          identity: {
            name,
            ageYears,
            nationalId: nationalId.trim() || undefined,
            riskFactors: intakeRiskFactors,
            history,
          },
          authorizedContextIds,
          defaultContextId: activeUnitId,
          createdBy: actorUid,
        });
        if ('error' in linkage) {
          const search = searchMasterFiles({
            query: name,
            authorizedContextIds,
            files: loadMasterFiles(),
          });
          setAmbiguous(search.hits.length ? search.hits : []);
          return;
        }
        file = linkage.file;
      }

      const entry = createOperationEntry(
        {
          unitId: activeUnitId,
          patientFileId: file.id,
          patientName: file.name,
          ageYears: file.ageYears,
          operationName,
          createdBy: actorUid,
          history,
          riskFactors: intakeRiskFactors,
          complaint,
          attachments: draftAttachments,
          missingTests: testsCompleteDraft ? [] : missingTestsDraft,
          testsComplete: testsCompleteDraft,
          state: stateDraft,
        },
        entries,
        previewNowMs()
      );

      persist([entry, ...entries]);
      const timeline = persistTimelineEvent(entry.patientFileId, {
        kind: 'operation-waiting',
        title: 'Added to operation waiting list',
        summary: `${entry.operationName} · ${STATE_LABEL[entry.state]}`,
        detail: [
          `Complaint: ${entry.complaint || 'Not recorded'}`,
          `Medical history: ${entry.history || 'Not recorded'}`,
          `Risk factors: ${entry.riskFactors.join(', ') || 'None recorded'}`,
          `Missing tests: ${entry.missingTests.join(', ') || 'None'}`,
          `Status: ${STATE_LABEL[entry.state]}`,
        ].join('\n'),
        createdBy: actorUid,
        context: { unitId: activeUnitId },
        atMs: entry.createdAtMs,
        refId: entry.id,
        attachments: entry.attachments,
      });
      if (!timeline.saved) setAuditUnsynced(true);
      audit(
        activeUnitId,
        'op_waiting.created',
        `Operation waiting entry created: ${operationName} — ${file.name}, ${file.ageYears}y` +
          ` (file ${file.id}, id ${maskNationalId(file)})`,
        entry.id
      );
      setAmbiguous(null);
      resetForm();
      setFormOpen(false);
    } catch (error) {
      setFormError(describeError(error));
    }
  };

  // ── State change ──

  const changeState = (entry: OperationWaitingEntry, to: OperationWaitState): void => {
    setActionError('');
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      const { entries: next } = setEntryState(entries, entry.id, to, previewNowMs());
      persist(next);
      persistTimelineEvent(entry.patientFileId, {
        kind: 'operation-waiting',
        title: 'Operation waiting status updated',
        summary: `${entry.operationName} · ${STATE_LABEL[entry.state]} → ${STATE_LABEL[to]}`,
        detail: `Status changed from ${STATE_LABEL[entry.state]} to ${STATE_LABEL[to]}.`,
        createdBy: actorUid,
        context: { unitId: entry.unitId },
        atMs: previewNowMs(),
        refId: entry.id,
      });
      audit(entry.unitId, 'op_waiting.state_changed', `Operation state ${entry.state} → ${to} — ${entry.patientName}`, entry.id);
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  // ── Missing tests on a card ──

  const openTestsEditor = (entry: OperationWaitingEntry): void => {
    setTestsEditorId(entry.id);
    setTestsEditList(entry.missingTests);
    setTestsEditComplete(entry.testsComplete);
    setTestsEditInput('');
    setActionError('');
  };

  const applyTestsEditor = (entry: OperationWaitingEntry): void => {
    setActionError('');
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      const finalTests = testsEditComplete ? [] : testsEditList.map((item) => item.trim()).filter(Boolean);
      const { entries: next } = setMissingTests(entries, entry.id, finalTests, testsEditComplete, previewNowMs());
      persist(next);
      persistTimelineEvent(entry.patientFileId, {
        kind: 'operation-waiting',
        title: 'Required tests updated',
        summary: testsEditComplete ? 'All required tests are marked complete.' : `${finalTests.length} test(s) remain pending.`,
        detail: testsEditComplete ? 'All required tests were marked complete.' : `Missing tests: ${finalTests.join(', ')}`,
        createdBy: actorUid,
        context: { unitId: entry.unitId },
        atMs: previewNowMs(),
        refId: entry.id,
      });
      audit(
        entry.unitId,
        'op_waiting.tests_updated',
        `Tests ${testsEditComplete ? 'complete' : 'pending'} for ${entry.patientName}` +
          (finalTests.length ? ` (missing: ${finalTests.join(', ')})` : ''),
        entry.id
      );
      setTestsEditorId(null);
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  // ── Attachments on a card ──

  const handleCardFiles = async (entry: OperationWaitingEntry, input: HTMLInputElement | null): Promise<void> => {
    setActionError('');
    if (!input?.files?.length) return;
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      let working = entries;
      const addedAttachments: OperationAttachment[] = [];
      for (const file of Array.from(input.files)) {
        const id = nextDraftKey();
        await saveLocalAttachment(id, file);
        const attachment: OperationAttachment = {
          id,
          blobKey: id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          metadataOnly: false,
        };
        addedAttachments.push(attachment);
        const { entries: next } = addAttachment(working, entry.id, attachment, previewNowMs());
        working = next;
      audit(
          entry.unitId,
          'op_waiting.attachment_added',
        `Attachment added to ${entry.patientName}: ${file.name} (${formatBytes(file.size)})`,
          entry.id
        );
      }
      persist(working);
      const updatedEntry = working.find((candidate) => candidate.id === entry.id);
      if (updatedEntry) {
        const event = persistTimelineEvent(entry.patientFileId, {
          kind: 'test-attachment',
          title: 'Tests or documents attached',
          summary: addedAttachments.map((attachment) => attachment.name).join(', '),
          detail: `Added ${addedAttachments.length} file(s): ${addedAttachments.map((attachment) => `${attachment.name} (${formatBytes(attachment.sizeBytes)})`).join(', ')}.`,
          createdBy: actorUid,
          context: { unitId: entry.unitId },
          atMs: previewNowMs(),
          refId: entry.id,
          attachments: addedAttachments,
        });
        if (!event.saved) setAuditUnsynced(true);
      }
    } catch (error) {
      setActionError(describeError(error));
    }
    input.value = '';
    setAttachTargetId(null);
  };

  const removeEntryAttachment = async (entry: OperationWaitingEntry, attachmentId: string): Promise<void> => {
    setActionError('');
    try {
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      const attachment = entry.attachments.find((candidate) => candidate.id === attachmentId);
      const { entries: next } = removeAttachment(entries, entry.id, attachmentId, previewNowMs());
      persist(next);
      const timeline = persistTimelineEvent(entry.patientFileId, {
        kind: 'test-attachment',
        title: 'Attachment removed from active operation queue',
        summary: attachment?.name || attachmentId,
        detail: 'The attachment remains available in the append-only patient-file history.',
        createdBy: actorUid,
        context: { unitId: entry.unitId },
        atMs: previewNowMs(),
        refId: entry.id,
        attachments: attachment ? [attachment] : [],
      });
      if (!timeline.saved) setAuditUnsynced(true);
      audit(
        entry.unitId,
        'op_waiting.attachment_removed',
        `Attachment removed from ${entry.patientName}: ${attachment?.name || attachmentId}`,
        entry.id
      );
      setRemoveDraftId(null);
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  // ── Booking ──

  const eligibleUnits = useMemo(() => units.filter((unit) => {
    const id = String(unit.id || '').trim();
    if (!id) return false;
    if (!subscriptionHistoryExists(undefined, subscriberId)) return true;
    return computeUnitEntitlementState(id, undefined, undefined, subscriberId) !== 'read-only';
  }), [units, subscriberId]);

  const openBookingPanel = (entry: OperationWaitingEntry): void => {
    setBookingId(entry.id);
    setActionError('');
    // Valid destinations are the user's own units. When exactly one unit
    // exists it is preselected and the panel asks for explicit confirmation.
    setBookingTarget(eligibleUnits.length === 1 ? eligibleUnits[0].id : eligibleUnits[0]?.id || '');
  };

  const bookingUnitName = units.find((unit) => unit.id === bookingTarget)?.name || bookingTarget;

  const confirmBooking = (entry: OperationWaitingEntry): void => {
    setActionError('');
    try {
      const nowMs = previewNowMs();
      if (!bookingTarget) throw new Error('targetUnitId-required');
      assertUnitWritable(entry.unitId, undefined, subscriberId);
      assertUnitWritable(bookingTarget, undefined, subscriberId);
      const { entries: next, entry: updated, alreadyBooked } = bookEntryPure(
        entries,
        entry.id,
        bookingTarget,
        nowMs,
        actorUid
      );
      const unitQueue = loadWaitingEntries();
      if (!unitQueue.some((candidate) => candidate.sourceOperationEntryId === entry.id)) {
        const queueEntry = createWaitingEntry({
          workspaceId,
          unitId: bookingTarget,
          patientId: entry.patientFileId,
          patientName: entry.patientName,
          service: entry.operationName,
          createdBy: actorUid,
          createdByName: actorName,
          notes: [entry.complaint, entry.history].filter(Boolean).join(' — ').slice(0, 500),
          sourceOperationEntryId: entry.id,
        }, unitQueue, nowMs).entry;
        if (!saveWaitingEntries([queueEntry, ...unitQueue])) {
          throw new Error('Could not save the patient to the destination unit waiting queue.');
        }
      }
      if (alreadyBooked) {
        // An earlier operation booking may have succeeded before unit routing.
        // The origin id keeps retries from creating duplicate unit entries.
        setNotice(`${entry.patientName} is already booked into ${bookingUnitName}; the destination unit queue is up to date.`);
        setBookingId(null);
        return;
      }
      const saved = saveOperationEntries(next);
      setEntries(next);
      if (!saved) setStorageFailed(true);

      audit(
        updated.unitId,
        'op_waiting.booked',
        `Booked ${updated.patientName} into department unit '${bookingUnitName}' (operation: ${updated.operationName})`,
        updated.id
      );

      // Master-file timeline on the target unit's context. Failing to persist
      // this never blocks the booking; it is surfaced as an unsynced notice.
      const timeline = persistTimelineEvent(updated.patientFileId, {
        kind: 'unit-booking',
        title: 'Patient booked into a department unit',
        summary: safeAuditText(`${updated.patientName} → ${bookingUnitName} (${updated.operationName})`),
        detail: safeAuditText(
          `Operation: ${updated.operationName}. Booked from the operation waiting list of unit ${updated.unitId}` +
            ` at ${formatTime(updated.booking?.atMs ?? nowMs)} by ${actorName}.`
        ),
        createdBy: actorUid,
        context: { unitId: bookingTarget },
        atMs: updated.booking?.atMs,
        refId: updated.id,
      });
      if (!timeline.saved) setAuditUnsynced(true);

      setNotice(`${updated.patientName} was added to the ${bookingUnitName} unit queue. Assign a bed from the unit census when one is available.`);
      setBookingId(null);
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  const cardFor = (entry: OperationWaitingEntry, isHistory: boolean) => {
    const expanded = bookingId === entry.id;
    return (
      <li
        key={`${isHistory ? 'booked' : 'active'}-${entry.id}`}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.patientName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {entry.ageYears} years · {entry.operationName}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATE_BADGE[entry.state]}`}>
            {STATE_LABEL[entry.state]}
          </span>
        </div>

        {entry.complaint && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300 break-words">Complaint: {entry.complaint}</p>
        )}
        {entry.history && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300 break-words">History: {entry.history}</p>
        )}
        {entry.riskFactors.length > 0 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Risk factors: {entry.riskFactors.join(', ')}</p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Added {formatTime(entry.createdAtMs)}
          </span>
          <span>{entry.attachments.length} attachments</span>
          <span>
            {entry.testsComplete
              ? 'Tests complete'
              : entry.missingTests.length
                ? `Missing tests (${entry.missingTests.length})`
                : 'Tests complete'}
          </span>
          {entry.attachments.some((attachment) => attachment.metadataOnly) && <span>Attachment unavailable on this device</span>}
        </div>

        {isHistory && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
            <p className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
              <Building2 className="w-3.5 h-3.5" />
              {units.find((unit) => unit.id === entry.booking?.unitId)?.name || entry.booking?.unitId || '—'}
            </p>
            <p>Booked: {formatTime(entry.booking?.atMs ?? 0)}</p>
            <p>By: {entry.booking?.bookedBy || entry.createdBy}</p>
          </div>
        )}

        {!isHistory && (
          <>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <select
                aria-label="Change operation state"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1322] px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                value={entry.state}
                onChange={(event) => changeState(entry, event.target.value as OperationWaitState)}
              >
                {STATE_ORDER.map((state) => (
                  <option key={state} value={state}>{STATE_LABEL[state]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => openTestsEditor(entry)}
                className={ghostButtonClass}
              >
                Edit required tests
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachTargetId(attachTargetId === entry.id ? null : entry.id);
                  setActionError('');
                }}
                className={ghostButtonClass}
              >
                <Upload className="w-3.5 h-3.5" />
                Attach file
              </button>
              <button
                type="button"
                onClick={() => openBookingPanel(entry)}
                className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300"
              >
                <Building2 className="w-3.5 h-3.5" />
                Book patient into a unit
              </button>
            </div>

            {attachTargetId === entry.id && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-2.5 space-y-2">
                <input
                  type="file"
                  multiple
                  className="text-[11px] text-slate-600 dark:text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-2 file:py-1 file:text-[11px] file:text-white"
                  onChange={(event) => handleCardFiles(entry, event.currentTarget)}
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Files of any size are stored as local files in this browser. They are not uploaded or shared with other devices.
                </p>
              </div>
            )}

            {entry.attachments.length > 0 && (
              <ul className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {entry.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                    <span className="min-w-0 truncate">
                      {attachment.name} · {formatBytes(attachment.sizeBytes)}
                      {attachment.metadataOnly ? ' · file unavailable on this device' : ''}
                    </span>
                    {!attachment.metadataOnly && <button type="button" onClick={() => void openAttachment(attachment)} className="shrink-0 text-cyan-600 underline dark:text-cyan-300">Open</button>}
                    {removeDraftId === attachment.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => removeEntryAttachment(entry, attachment.id)}
                          className="rounded-lg bg-rose-500 px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          Confirm removal
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveDraftId(null)}
                          className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-[10px]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoveDraftId(attachment.id)}
                        className="shrink-0 text-rose-600 dark:text-rose-300 underline text-[10px]"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {testsEditorId === entry.id && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2.5 space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                  <input
                    type="checkbox"
                    checked={testsEditComplete}
                    onChange={(event) => setTestsEditComplete(event.target.checked)}
                  />
                  Tests complete (clear list)
                </label>
                {!testsEditComplete && (
                  <>
                    {testsEditList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {testsEditList.map((test, index) => (
                          <span
                            key={`${test}-${index}`}
                            className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px]"
                          >
                            {test}
                            <button
                              type="button"
                              aria-label={`Remove ${test}`}
                              onClick={() => setTestsEditList((list) => list.filter((_, at) => at !== index))}
                              className="text-slate-500 hover:text-rose-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <input
                        className={fieldClass}
                        placeholder="Missing test, for example: prothrombin level"
                        value={testsEditInput}
                        onChange={(event) => setTestsEditInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            if (testsEditInput.trim()) {
                              setTestsEditList((list) => [...list, testsEditInput.trim()]);
                              setTestsEditInput('');
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (testsEditInput.trim()) {
                            setTestsEditList((list) => [...list, testsEditInput.trim()]);
                            setTestsEditInput('');
                          }
                        }}
                        className={ghostButtonClass}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </>
                )}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyTestsEditor(entry)}
                    className="inline-flex items-center gap-1 min-h-8 rounded-lg bg-cyan-500 px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button type="button" onClick={() => setTestsEditorId(null)} className={ghostButtonClass}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {expanded && (
              <div className="rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/60 dark:bg-cyan-500/5 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Choose destination unit</p>
                <div className="space-y-1">
                  {eligibleUnits.map((unit) => (
                    <label key={unit.id} className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                      <input
                        type="radio"
                        name={`booking-target-${entry.id}`}
                        value={unit.id}
                        checked={bookingTarget === unit.id}
                        onChange={(event) => setBookingTarget(event.target.value)}
                      />
                      {unit.name}
                    </label>
                  ))}
                </div>
                {eligibleUnits.length === 0 && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-300">No destination units are available on this device.</p>
                )}
                {eligibleUnits.length === 1 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Only one destination unit is available ({eligibleUnits[0].name}); it is selected automatically. Confirm below.
                  </p>
                )}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={eligibleUnits.length === 0}
                    onClick={() => confirmBooking(entry)}
                    className="inline-flex items-center gap-1 min-h-8 rounded-lg bg-cyan-500 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm booking
                  </button>
                  <button type="button" onClick={() => setBookingId(null)} className={ghostButtonClass}>
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Booking records the event in this local preview and adds it to the master-file timeline. It does not admit the patient to a bed automatically.
                </p>
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  const noUnits = units.length === 0;

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <ClipboardList className="w-5 h-5 mt-0.5 text-cyan-500 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Patient waiting list
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review operation referrals, required tests and unit booking in one place.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Local preview data — saved on this browser only. Not synced to Firebase.</span>
        </div>
        {unitReadOnly && (
          <div className="rounded-2xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {activeUnitName || 'This unit'} is read-only. Existing records remain available, but changes require this unit’s renewal or owner approval.
          </div>
        )}
      </header>

      {noUnits ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4 text-center space-y-2">
          <ClipboardList className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-500" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No units on this device yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create a department unit first (Manage Units), then come back to this screen.
          </p>
        </div>
      ) : (
        <>
          {/* Notices: user-error (red), unsynced audit/timeline (amber), storage failure (red), success (cyan). */}
          {actionError && (
            <p className="flex items-start gap-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {actionError}
            </p>
          )}
          {auditUnsynced && (
            <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Saved locally, but an audit event or master-file event is unsynced (device storage failed).
            </p>
          )}
          {storageFailed && (
            <p className="flex items-start gap-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              The change is kept for this session only — device storage refused the write.
            </p>
          )}
          {notice && (
            <div className="flex items-start justify-between gap-2 rounded-2xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-800 dark:text-cyan-200">
              <p className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {notice}
              </p>
              <button type="button" onClick={() => setNotice('')} className="underline text-[11px] shrink-0">
                Hide
              </button>
            </div>
          )}

          {/* Unit context (resolved like ClinicModeView). */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="op-waiting-unit">Unit</label>
                <select
                  id="op-waiting-unit"
                  className={fieldClass}
                  value={activeUnitId}
                  onChange={(event) => {
                    setUnitSelection(event.target.value);
                    setActionError('');
                    setBookingId(null);
                  }}
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeList.length} active · {counts.urgent} urgent · {counts.pending} tests pending · {counts.preparing} preparing ·{' '}
                  {historyList.length} booked
                </p>
              </div>
            </div>
          </section>

          {/* Intake */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Plus className="w-4 h-4 text-cyan-500" />
                Add patient
              </h2>
              <button type="button" onClick={() => {
                setFormError('');
                setAmbiguous(null);
                setFormOpen(!formOpen);
              }} className={buttonClass}>
                {formOpen ? 'Close' : 'Add patient'}
              </button>
            </div>

            {formOpen && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitIntake();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelClass} htmlFor="op-waiting-name">Patient name</label>
                    <input
                      id="op-waiting-name"
                      className={fieldClass}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Name as shown in the patient file"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="op-waiting-age">Age</label>
                    <input
                      id="op-waiting-age"
                      type="number"
                      min={0}
                      max={130}
                      className={fieldClass}
                      value={ageText}
                      onChange={(event) => setAgeText(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="op-waiting-nid">National ID (optional)</label>
                    <input
                      id="op-waiting-nid"
                      className={fieldClass}
                      value={nationalId}
                      onChange={(event) => setNationalId(event.target.value)}
                      placeholder="Stored in the patient file and masked in the interface"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="op-waiting-history">Medical history</label>
                  <textarea
                    id="op-waiting-history"
                    className={fieldClass}
                    rows={2}
                    value={history}
                    onChange={(event) => setHistory(event.target.value)}
                  />
                </div>

                <div>
                  <span className={labelClass}>Risk factors</span>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    {RISK_PRESETS.map((preset) => {
                      const checked =
                        preset.key === 'diabetes' ? riskPresetDiabetes : riskPresetHypertension;
                      return (
                        <label key={preset.key} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              preset.key === 'diabetes'
                                ? setRiskPresetDiabetes(event.target.checked)
                                : setRiskPresetHypertension(event.target.checked)
                            }
                          />
                          {preset.label}
                        </label>
                      );
                    })}
                    <input
                      className={`${fieldClass} flex-1 min-w-[200px]`}
                      value={riskCustom}
                      onChange={(event) => setRiskCustom(event.target.value)}
                      placeholder="Other risk factors, separated by commas"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="op-waiting-complaint">Complaint</label>
                  <textarea
                    id="op-waiting-complaint"
                    className={fieldClass}
                    rows={2}
                    value={complaint}
                    onChange={(event) => setComplaint(event.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="op-waiting-operation">Operation name (free text)</label>
                    <input
                      id="op-waiting-operation"
                      className={fieldClass}
                      value={operationName}
                      onChange={(event) => setOperationName(event.target.value)}
                      placeholder="For example: diagnostic cardiac catheterization"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="op-waiting-state">Status</label>
                    <select
                      id="op-waiting-state"
                      className={fieldClass}
                      value={stateDraft}
                      onChange={(event) => setStateDraft(event.target.value as OperationWaitState)}
                    >
                      {STATE_ORDER.map((state) => (
                        <option key={state} value={state}>{STATE_LABEL[state]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="op-waiting-files">Attachments</label>
                  <input
                    id="op-waiting-files"
                    type="file"
                    multiple
                    className="text-[11px] text-slate-600 dark:text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-2 file:py-1 file:text-[11px] file:text-white"
                    onChange={(event) => handleDraftFiles(event.currentTarget)}
                  />
                  {draftAttachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {draftAttachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px]"
                        >
                          <span className="min-w-0 truncate">
                            {attachment.name} · {formatBytes(attachment.sizeBytes)}
                            {attachment.metadataOnly ? ' · file unavailable on this device' : ''}
                          </span>
                          {!attachment.metadataOnly && <button type="button" onClick={() => void openAttachment(attachment)} className="shrink-0 text-cyan-600 underline dark:text-cyan-300">Open</button>}
                          <button
                            type="button"
                            aria-label={`Remove ${attachment.name}`}
                            onClick={() =>
                              void removeDraftAttachment(attachment)
                            }
                            className="shrink-0 text-rose-600 dark:text-rose-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    Files of any size are stored as local files in this browser. They are not uploaded or shared with other devices.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={testsCompleteDraft}
                      onChange={(event) => {
                        setTestsCompleteDraft(event.target.checked);
                        if (event.target.checked) {
                          setMissingTestsDraft([]);
                          setMissingTestInput('');
                        }
                      }}
                    />
                    Tests complete (clear list)
                  </label>
                  {!testsCompleteDraft && (
                    <>
                      {missingTestsDraft.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {missingTestsDraft.map((test, index) => (
                            <span
                              key={`${test}-${index}`}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px]"
                            >
                              {test}
                              <button
                                type="button"
                                aria-label={`Remove ${test}`}
                                onClick={() => setMissingTestsDraft((list) => list.filter((_, at) => at !== index))}
                                className="text-slate-500 hover:text-rose-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          className={fieldClass}
                          value={missingTestInput}
                          onChange={(event) => setMissingTestInput(event.target.value)}
                          placeholder="Add each missing test as a separate item"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              if (missingTestInput.trim()) {
                                setMissingTestsDraft((list) => [...list, missingTestInput.trim()]);
                                setMissingTestInput('');
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (missingTestInput.trim()) {
                              setMissingTestsDraft((list) => [...list, missingTestInput.trim()]);
                              setMissingTestInput('');
                            }
                          }}
                          className={ghostButtonClass}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Ambiguous same-name candidates: pick by age + masked id. Never auto-merged. */}
                {ambiguous && (
                  <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      More than one patient file matches this name. Choose the correct file (age and last 4 ID digits); matches are never merged automatically.
                    </p>
                    {ambiguous.length === 0 && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        Identity conflict in this unit. Update the name or matching details and try again.
                      </p>
                    )}
                    {ambiguous.map((hit) => (
                      <div key={hit.file.id} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px]">
                        <span className="min-w-0 truncate">
                          {hit.file.name} · {hit.file.ageYears} years ·{' '}
                          {hit.maskedNationalId || 'No national ID'}
                        </span>
                        <button
                          type="button"
                          onClick={() => submitIntake(hit.file)}
                          className="shrink-0 rounded-lg bg-cyan-500 px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formError && (
                  <p className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {formError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button type="submit" className={buttonClass}>
                    <Plus className="w-4 h-4" />
                    Save
                  </button>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    The patient file is linked within {activeUnitName || 'this unit'}. The full national ID is not shown in the interface or audit log.
                  </span>
                </div>
              </form>
            )}
          </section>

          {/* Active list */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Current waiting list ({activeList.length})
            </h2>
            {activeList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No patients are waiting in this unit yet.
              </div>
            ) : (
              <ul className="space-y-2">{activeList.map((entry) => cardFor(entry, false))}</ul>
            )}
          </section>

          {/* Booked history — kept forever, never deleted. */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E]">
            <button
              type="button"
              onClick={() => setBookedOpen(!bookedOpen)}
              aria-expanded={bookedOpen}
              className="flex w-full items-center justify-between gap-2 px-3 sm:px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Previously booked — {historyList.length}
              </span>
              {bookedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {bookedOpen && (
              <div className="px-3 sm:px-4 pb-3">
                {historyList.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                No booking records yet.
                  </p>
                ) : (
                  <ul className="space-y-2">{historyList.map((entry) => cardFor(entry, true))}</ul>
                )}
              </div>
            )}
          </section>

          <p className="flex items-start gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            <Info className="w-3.5 h-3.5 shrink-0" />
            The operation referral queue is separate from clinic appointments and the unit's clinical waiting list. Actions are recorded in the local audit log; booking does not assign a bed or automatically transfer the full patient record.
          </p>
        </>
      )}
    </div>
  );
};

// (Re-exported for tree-shaking safety in case the parent imports the storage
// contract type from here.)
export type { OperationWaitingStorage };
