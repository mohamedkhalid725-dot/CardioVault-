import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Info,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { appendAuditEvent } from '../../services/localAuditLog';
import { loadLocalAttachment } from '../../services/localAttachmentStore';
import { previewNowMs } from '../../services/previewClock';
import {
  loadMasterFiles,
  maskNationalId,
  createMasterFile,
  persistTimelineEvent,
  scrubProtectedFieldsForAudits,
  searchMasterFiles,
  validateMasterFileInput,
} from '../../services/masterPatientFile';
import type {
  CreateMasterFileInput,
  TimelineEventInput,
} from '../../services/masterPatientFile';
import type {
  CareContext,
  MasterPatientFile,
  MasterFileSearchResult,
  MasterTimelineEvent,
  TimelineEventKind,
  OperationAttachment,
} from '../../types/clinicArea';
import { PREVIEW_CLINIC_ID, SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES } from '../../types/clinicArea';
import { isLocalPreview, PREVIEW_WORKSPACE_ID } from '../../config/localPreview';
import { appendPatientMasterEvent, loadMasterFilesForUnits } from '../../services/masterPatientFileCloud';
import { firestoreMasterPatientFilePersistence } from '../../services/firestoreMasterPatientFilePersistence';
import { AuthorizationService } from '../../services/authorizationService';
import { isAvailableLifecycleBed } from '../../services/patientLifecycleAccess';

/**
 * Master patient file (الملف الأم) screen.
 *
 * Preview mode uses localStorage. Production unit files are loaded from the
 * active workspace through unit-filtered Firestore queries; events are append-only.
 */

// Same localStorage key/name conventions the ClinicModeView uses.
const WORKSPACE_ACCESS_KEY = 'cardiovault_active_workspace_access_v1';
const LOCAL_WORKSPACE_FALLBACK = 'cardiovault_master_workspace';

const CARD = 'bg-white dark:bg-[#111c2e] border border-slate-200 dark:border-slate-800 rounded-2xl';
const INPUT =
  'w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40';
const LABEL = 'text-xs font-bold text-slate-600 dark:text-slate-300';
const PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-cyan-500 text-white text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed';
const GHOST =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300';

const KIND_LABELS: Record<TimelineEventKind, string> = {
  'patient-admission': 'Patient admission',
  'patient-readmission': 'Patient readmission',
  'patient-transfer': 'Unit transfer',
  'patient-discharge': 'Patient discharge',
  appointment: 'Visit',
  'clinic-visit': 'Clinical visit',
  encounter: 'Clinical encounter',
  'operation-waiting': 'Operation waiting',
  'unit-booking': 'Unit booking',
  'operation-record': 'Operation record',
  'test-attachment': 'Test attachment',
};

const KIND_BADGE: Record<TimelineEventKind, string> = {
  'patient-admission': 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'patient-readmission': 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'patient-transfer': 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'patient-discharge': 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  appointment: 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'clinic-visit': 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  encounter: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  'operation-waiting': 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'unit-booking': 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'operation-record': 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'test-attachment': 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

interface WorkspaceAccessSnapshot {
  workspaceId: string;
  /** Active unit id when the access snapshot pins one (preview owner: null). */
  unitId: string;
}

/**
 * AppContext does not expose the active workspace id, and the module that owns
 * it imports Firebase. Same pattern as ClinicModeView: read the localStorage
 * snapshot directly instead of importing Firebase modules.
 */
function readWorkspaceAccess(): WorkspaceAccessSnapshot {
  try {
    const raw = localStorage.getItem(WORKSPACE_ACCESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { workspaceId?: unknown; unitId?: unknown }) : null;
    const workspaceId = String(parsed?.workspaceId || '').trim() || LOCAL_WORKSPACE_FALLBACK;
    const unitId = String(parsed?.unitId || '').trim();
    return { workspaceId, unitId };
  } catch {
    return { workspaceId: LOCAL_WORKSPACE_FALLBACK, unitId: '' };
  }
}

const contextOf = (unitId: string): CareContext => ({ unitId });
const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const timelineEventKey = (event: MasterTimelineEvent, index: number): string => {
  const id = typeof event.id === 'string' ? event.id.trim() : '';
  return id ? `event:${id}` : `legacy:${event.kind}:${event.atMs}:${index}`;
};

// ---------------------------------------------------------------------------
// New master file form state
// ---------------------------------------------------------------------------

interface NewFileForm {
  name: string;
  ageYears: string;
  nationalId: string;
  phone: string;
  riskDiabetes: boolean;
  riskHypertension: boolean;
  riskCustom: string;
  riskList: string[];
  history: string;
  pastOperations: string;
  pastImaging: string;
}

const emptyNewFileForm = (): NewFileForm => ({
  name: '',
  ageYears: '',
  nationalId: '',
  phone: '',
  riskDiabetes: false,
  riskHypertension: false,
  riskCustom: '',
  riskList: [],
  history: '',
  pastOperations: '',
  pastImaging: '',
});

interface EventForm {
  kind: Extract<TimelineEventKind, 'clinic-visit' | 'encounter' | 'operation-record' | 'test-attachment'>;
  title: string;
  detail: string;
  atLocal: string;
}

const EVENT_KIND_OPTIONS: EventForm['kind'][] = ['encounter', 'operation-record', 'test-attachment'];

const splitCommaList = (value: string): string[] =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

interface AuditRow {
  type: 'success' | 'error' | 'warning';
  text: string;
}

export const MasterPatientFileView: React.FC = () => {
  const { currentUser, units, archivedPatients, beds, patients, readmitPatient, canWriteUnit, showToast, setCurrentPatientId, setCurrentView } = useApp();
  const [readmitTarget, setReadmitTarget] = useState<(typeof archivedPatients)[number] | null>(null);
  const [readmitUnitId, setReadmitUnitId] = useState('');
  const [readmitBedId, setReadmitBedId] = useState('');
  const isSecretary = currentUser?.clinicRole === 'secretary' || String(currentUser?.role || '') === 'coordinator';
  const canViewMedicalSummaries = !isSecretary || SECRETARY_CAN_VIEW_CLINICAL_SUMMARIES;
  const readmitUnits = useMemo(() => AuthorizationService.filterAuthorizedUnits(units, currentUser).filter(unit => canWriteUnit(unit.id) && AuthorizationService.canPerformAction(currentUser, 'admit_patient', { unitId: unit.id })), [units, currentUser, canWriteUnit]);
  const readmitBeds = beds.filter(bed => bed.unitId === readmitUnitId && isAvailableLifecycleBed(bed, patients));
  const beginReadmit = (patient: (typeof archivedPatients)[number]) => { const unitId = readmitUnits.find(unit => unit.id === patient.unitId)?.id || readmitUnits[0]?.id || ''; setReadmitTarget(patient); setReadmitUnitId(unitId); setReadmitBedId(beds.find(bed => bed.unitId === unitId && isAvailableLifecycleBed(bed, patients))?.id || ''); };
  const confirmMasterReadmit = async () => { if (!readmitTarget || !readmitUnitId || !readmitBedId) return; if (!(await readmitPatient(readmitTarget.id, readmitUnitId, readmitBedId))) return; const id = readmitTarget.id; setReadmitTarget(null); setCurrentPatientId(id); setCurrentView('patient'); showToast(`${readmitTarget.fullName} successfully re-admitted.`, 'success'); };

  const unitIds = useMemo(() => units.map((unit) => String(unit.id || '').trim()).filter(Boolean), [units]);
  const unitNameById = useMemo(() => new Map(units.map((unit) => [String(unit.id), String(unit.name)])), [units]);
  const workspaceAccess = readWorkspaceAccess();
  const actorUid = String(currentUser?.userId || '').trim() || 'local-user';

  // Authorized scope (plan §20 interpretation): every unit of this workspace
  // the AppContext exposes + the preview clinic area. Only files whose
  // contextIds intersect this scope are EVER listed or searched.
  const authorizedContextIds = useMemo(() => unitIds, [unitIds]);

  // Default context for new records: the pinned active unit when it is inside
  // the scope, otherwise the first authorized unit, otherwise the clinic.
  const activeUnitId = useMemo(() => {
    const pinned = workspaceAccess.unitId;
    if (pinned && unitIds.includes(pinned)) return pinned;
    return unitIds[0] || '';
  }, [workspaceAccess.unitId, unitIds]);

  const [files, setFiles] = useState<MasterPatientFile[]>([]);
  const refreshGeneration = useRef(0);
  const [query, setQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [expandedEventKeys, setExpandedEventKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<AuditRow | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<NewFileForm>(() => emptyNewFileForm());
  const [showForm, setShowForm] = useState(false);
  // Default context = the resolved active unit (falls back to the clinic).
  const [formContextId, setFormContextId] = useState('');
  const effectiveFormContext = formContextId || activeUnitId;
  const [eventForm, setEventForm] = useState<EventForm>({ kind: 'encounter', title: '', detail: '', atLocal: '' });
  const [unsynced, setUnsynced] = useState(false);

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) || null,
    [files, selectedFileId]
  );

  const authorizedFiles = useMemo(
    () =>
      files
        .filter((file) => (file.contextIds || []).some((id) => authorizedContextIds.includes(id)))
        .slice()
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [files, authorizedContextIds]
  );

  // Authorized search: the service filters internally by the scope ids.
  const searchResult: MasterFileSearchResult | null = useMemo(() => {
    if (!query.trim()) return null;
    return searchMasterFiles({ query, authorizedContextIds, files });
  }, [query, authorizedContextIds, files]);

  const audit = (input: {
    contextId: string;
    action: string;
    entityType: string;
    entityId: string;
    result: 'success' | 'failure';
    summary: string;
  }): void => {
    const outcome = appendAuditEvent({
      workspaceId: workspaceAccess.workspaceId || PREVIEW_WORKSPACE_ID,
      unitId: input.contextId || PREVIEW_CLINIC_ID,
      actorUid,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      result: input.result,
      summary: scrubProtectedFieldsForAudits(input.summary),
    });
    if (!outcome.persisted) {
      setNotice({ type: 'warning', text: 'Saved locally, but the audit event could not be stored on this device.' });
    }
  };

  const refresh = async (): Promise<void> => {
    const requestId = ++refreshGeneration.current;
    const requestedWorkspaceId = workspaceAccess.workspaceId;
    if (isLocalPreview()) {
      setFiles(loadMasterFiles());
      return;
    }
    try {
      const loaded = await loadMasterFilesForUnits(
        firestoreMasterPatientFilePersistence,
        requestedWorkspaceId,
        unitIds,
      );
      if (requestId !== refreshGeneration.current || requestedWorkspaceId !== readWorkspaceAccess().workspaceId) return;
      setFiles(loaded);
      if (selectedFileId && !loaded.some(file => file.id === selectedFileId)) setSelectedFileId('');
    } catch (error) {
      if (requestId !== refreshGeneration.current || requestedWorkspaceId !== readWorkspaceAccess().workspaceId) return;
      console.warn('Authorized master-file unit fetch failed:', error);
      setFiles([]);
      setSelectedFileId('');
      setNotice({ type: 'error', text: 'Master files could not be fetched from your authorized units. Check your connection and workspace access.' });
    }
  };

  useEffect(() => {
    refreshGeneration.current += 1;
    setFiles([]);
    setSelectedFileId('');
    setQuery('');
    void refresh();
  }, [workspaceAccess.workspaceId, unitIds]);

  const openDetail = (fileId: string): void => {
    setSelectedFileId(fileId);
    setExpandedEventKeys([]);
    setQuery('');
    setUnsynced(false);
    setEventForm({ kind: 'encounter', title: '', detail: '', atLocal: '' });
  };

  /* ── New master file form ─────────────────────────────────────────────── */

  const toggleRisk = (item: string): void => {
    setForm((current) => ({
      ...current,
      riskList: current.riskList.includes(item)
        ? current.riskList.filter((existing) => existing !== item)
        : [...current.riskList, item],
    }));
  };

  const submitNewFile = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!isLocalPreview()) {
      setNotice({ type: 'error', text: 'In the production workspace, patient files are created automatically through patient admission.' });
      return;
    }
    const contextId = effectiveFormContext;
    const ageValue = Number(form.ageYears);
    const riskFactors = [
      ...(form.riskDiabetes ? ['diabetes'] : []),
      ...(form.riskHypertension ? ['hypertension'] : []),
      ...form.riskList,
    ];
    const input: CreateMasterFileInput = {
      name: form.name,
      ageYears: Number.isFinite(ageValue) ? Math.trunc(ageValue) : NaN,
      nationalId: form.nationalId.trim() || undefined,
      phone: form.phone.trim() || undefined,
      riskFactors,
      history: form.history,
      pastOperations: splitCommaList(form.pastOperations),
      pastImaging: splitCommaList(form.pastImaging),
      contextIds: [contextId],
      createdBy: actorUid,
    };
    const errors = validateMasterFileInput(input);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setNotice({ type: 'error', text: 'Check the required fields before saving.' });
      return;
    }
    setFormErrors({});
    const saved = createMasterFile(input, previewNowMs());
    void refresh();
    audit({
      contextId,
      action: 'master_file.created',
      entityType: 'master_file',
      entityId: saved.file.id,
      result: 'success',
      summary: `Master file created for ${saved.file.name}, age ${saved.file.ageYears}`,
    });
    setNotice({
      type: saved.saved ? 'success' : 'warning',
      text: saved.saved
        ? `Patient file created for ${saved.file.name}.`
        : 'The file exists only in memory because device storage is unavailable.',
    });
    setForm(emptyNewFileForm());
    setSelectedFileId(saved.file.id);
    setShowForm(false);
  };

  /* ── Add dated timeline event ─────────────────────────────────────────── */

  const submitTimelineEvent = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selectedFile) return;
    const contextId = pickFileContext(selectedFile, activeUnitId, PREVIEW_CLINIC_ID);
    const parsedAtMs = eventForm.atLocal ? new Date(eventForm.atLocal).getTime() : NaN;
    const input: TimelineEventInput = {
      kind: eventForm.kind,
      title: eventForm.title,
      summary: eventForm.detail.trim().split('\n')[0].slice(0, 90),
      detail: eventForm.detail,
      createdBy: actorUid,
      context: contextOf(contextId),
      atMs: Number.isFinite(parsedAtMs) ? parsedAtMs : undefined,
    };
    let eventId = selectedFile.id;
    let persisted = false;
    if (isLocalPreview()) {
      const outcome = persistTimelineEvent(selectedFile.id, input);
      eventId = outcome.event?.id || selectedFile.id;
      persisted = outcome.saved;
    } else {
      try {
        const atMs = input.atMs ?? Date.now();
        const id = `manual-${atMs}-${Math.random().toString(36).slice(2, 8)}`;
        const saved = await appendPatientMasterEvent(firestoreMasterPatientFilePersistence, workspaceAccess.workspaceId, selectedFile.id, {
          ...input,
          id,
          atMs,
          refId: selectedFile.id,
          schemaVersion: 1,
        });
        eventId = saved.id;
        persisted = true;
      } catch (error) {
        console.warn('Master timeline event write failed:', error);
      }
    }
    await refresh();
    setUnsynced(!persisted);
    audit({
      contextId,
      action: 'master_file.timeline_event_added',
      entityType: 'master_file_timeline',
      entityId: eventId,
      result: persisted ? 'success' : 'failure',
      summary: `Timeline event ${input.kind} added to ${selectedFile.name}`,
    });
    if (persisted) {
      setNotice({ type: 'success', text: 'Event added to the patient timeline.' });
      setEventForm({ kind: 'encounter', title: '', detail: '', atLocal: '' });
    } else {
      setNotice({ type: 'error', text: 'Could not confirm saving the event to storage.' });
    }
  };

  const openTimelineAttachment = async (attachment: OperationAttachment): Promise<void> => {
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
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not open this local file.' });
    }
  };

  /* ── Timeline helpers ─────────────────────────────────────────────────── */

  const contextLabel = (event: MasterTimelineEvent): string => {
    const unitId = String(event.context?.unitId || '');
    if (unitId) return unitNameById.get(unitId) || unitId;
    if (event.context?.clinicId) return 'Other context';
    return '—';
  };

  const eventContextDefault: string = selectedFile
    ? pickFileContext(selectedFile, activeUnitId, PREVIEW_CLINIC_ID)
    : activeUnitId;

  /* ── Detail sub-render ────────────────────────────────────────────────── */

  const timeline: MasterTimelineEvent[] = selectedFile
    ? [...(Array.isArray(selectedFile.timeline) ? selectedFile.timeline : [])].sort((a, b) => b.atMs - a.atMs)
    : [];

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4" dir="ltr">
      <header className="space-y-1">
        <h1 className="text-lg font-extrabold flex items-center gap-2">
          <FileText size={18} className="text-cyan-500" />
          Patient File & Archive
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Local preview data is stored on this device only. It is not cloud data and contains no real patient records.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          className={[
            'text-xs font-bold rounded-xl px-3 py-2 border',
            notice.type === 'success'
              ? 'text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
              : notice.type === 'error'
                ? 'text-rose-700 dark:text-rose-300 border-rose-500/40 bg-rose-500/10'
                : 'text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10',
          ].join(' ')}
        >
          {notice.text}
        </div>
      )}

      {selectedFile ? (
        /* ══════════════════════ File detail ══════════════════════ */
        <section className="space-y-4">
          <button type="button" className={GHOST} onClick={() => setSelectedFileId('')}>
            ← Back to patient files
          </button>

          {/* Identity card */}
          <div className={`${CARD} p-4 space-y-3`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 text-sm font-extrabold">
                <User size={15} className="text-cyan-500" />
                {selectedFile.name}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Age {selectedFile.ageYears}</span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                {maskNationalId(selectedFile) || 'No national ID'}
              </span>
              {selectedFile.phone && (
                <span className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                  {selectedFile.phone}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Age {selectedFile.ageYears} · File ID: <span dir="ltr">{selectedFile.id}</span>
            </p>
            {canViewMedicalSummaries && selectedFile.riskFactors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedFile.riskFactors.map((risk) => (
                  <span
                    key={risk}
                    className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold"
                  >
                    {risk}
                  </span>
                ))}
              </div>
            )}
            {selectedFile.history && (
              canViewMedicalSummaries ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                  <span className="font-bold">Medical history: </span>
                  {selectedFile.history}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Info size={13} /> Medical history is hidden from secretary accounts.
                </p>
              )
            )}
            {canViewMedicalSummaries ? <div className="grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
              {selectedFile.pastOperations.length > 0 && (
                <p>Previous operations: {selectedFile.pastOperations.join(', ')}</p>
              )}
              {selectedFile.pastImaging.length > 0 && <p>Previous imaging: {selectedFile.pastImaging.join(', ')}</p>}
            </div> : <p className="text-xs text-slate-500 dark:text-slate-400">Medical summaries are hidden from secretary accounts.</p>}
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Contexts: {selectedFile.contextIds.map((id) => contextIdLabel(id, unitNameById)).join(' · ')}
            </p>
          </div>

          {/* Timeline (append-only, newest first) */}
          <div className={`${CARD} p-4 space-y-2`}>
            <h2 className="text-sm font-extrabold flex items-center gap-1.5">
              <Clock size={15} className="text-cyan-500" />
              Patient timeline ({timeline.length})
            </h2>
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No timeline events yet. Add the first event using the form below.</p>
            ) : (
              <ul className="space-y-2">
                {timeline.map((event, index) => {
                  const eventKey = timelineEventKey(event, index);
                  const expanded = expandedEventKeys.includes(eventKey);
                  return (
                    <li key={eventKey} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <button
                        type="button"
                        className="w-full text-right space-y-1"
                        onClick={() =>
                          setExpandedEventKeys((current) =>
                            current.includes(eventKey) ? current.filter((key) => key !== eventKey) : [...current, eventKey]
                          )
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${KIND_BADGE[event.kind]}`}>
                            {event.kind} — {KIND_LABELS[event.kind]}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{contextLabel(event)}</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                            {new Date(event.atMs).toLocaleString()}
                          </span>
                          {expanded ? <ChevronUp size={14} className="ms-auto" /> : <ChevronDown size={14} className="ms-auto" />}
                        </div>
                        {canViewMedicalSummaries ? <><p className="text-sm font-bold">{event.title}</p>{event.summary && <p className="text-xs text-slate-600 dark:text-slate-400">{event.summary}</p>}</> : <p className="text-xs text-slate-500 dark:text-slate-400">Event details are hidden from secretary accounts.</p>}
                      </button>
                      {expanded && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                          {canViewMedicalSummaries && <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{event.detail || 'No additional details.'}</p>}
                          {canViewMedicalSummaries && event.attachments?.length ? (
                            <div className="space-y-1 pt-1">
                              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Attachments</p>
                              {event.attachments.map((attachment) => (
                                <button key={attachment.id} type="button" onClick={() => void openTimelineAttachment(attachment)} className="block text-xs text-cyan-700 underline dark:text-cyan-300">
                                  {attachment.name} · {formatBytes(attachment.sizeBytes)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Add dated event form */}
          <div className={`${CARD} p-4 space-y-3`}>
            <h2 className="text-sm font-extrabold flex items-center gap-1.5">
              <Plus size={15} className="text-cyan-500" />
              Add a dated visit or event
            </h2>
            {unsynced && (
              <p className="text-xs text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1.5">
                <AlertTriangle size={13} /> This event is only in memory because device storage failed.
              </p>
            )}
            <form className="space-y-3" onSubmit={submitTimelineEvent}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Event type</span>
                  <select
                    className={INPUT}
                    value={eventForm.kind}
                    onChange={(e) => setEventForm((cur) => ({ ...cur, kind: e.target.value as EventForm['kind'] }))}
                  >
                    {EVENT_KIND_OPTIONS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind} — {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>Date and time (optional; defaults to now)</span>
                  <input
                    type="datetime-local"
                    className={INPUT}
                    value={eventForm.atLocal}
                    onChange={(e) => setEventForm((cur) => ({ ...cur, atLocal: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className={LABEL}>Title</span>
                <input
                  className={INPUT}
                  value={eventForm.title}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, title: e.target.value }))}
                  placeholder="e.g. Post-operative follow-up"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Details</span>
                <textarea
                  className={INPUT}
                  rows={3}
                  value={eventForm.detail}
                  onChange={(e) => setEventForm((cur) => ({ ...cur, detail: e.target.value }))}
                />
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Context: {contextIdLabel(eventContextDefault, unitNameById)} · Patient timeline events cannot be deleted.
              </p>
              <button type="submit" className={PRIMARY}>
                <Plus size={14} /> Add event
              </button>
            </form>
          </div>
        </section>
      ) : (
        /* ══════════════════════ List + search + new form ══════════════════════ */
        <section className="space-y-4">
          <div className={`${CARD} p-4 space-y-3`}>
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Archive size={15} className="text-amber-500" /> Clinical archive ({archivedPatients.length})
            </h2>
            {archivedPatients.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No discharged or archived unit episodes yet.</p>
            ) : (
              <ul className="space-y-2">
                {archivedPatients.map((patient) => (
                  <li key={patient.id} className={`${CARD} w-full p-3 text-left hover:border-amber-500/60`}>
                    <button type="button" onClick={() => { setCurrentPatientId(patient.id); setCurrentView('patient'); }} className="w-full text-left">
                      <span className="text-sm font-bold">{patient.fullName || patient.name || 'Patient'}</span>
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Age {patient.age} · {isSecretary ? 'Archived' : patient.archiveReason || 'Archived'}</span>
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{patient.archiveDate || patient.admissionDate} · {unitNameById.get(patient.unitId) || patient.unitId}</span>
                    </button>
                    <span className="mt-2 flex justify-end"><button type="button" disabled={!readmitUnits.length} onClick={() => beginReadmit(patient)} className={PRIMARY}><RotateCcw size={14} /> Readmit</button></span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">The archive keeps prior clinical episodes; opening a row shows its full admission history. The patient timeline below keeps dated events.</p>
          </div>
          {/* Search by name or all-digit national id (service handles both) */}
          <div className={`${CARD} p-4 space-y-2`}>
            <label className="block">
              <span className={LABEL}>Search by name or national ID (full number or last 4 digits)</span>
              <div className="relative">
                <Search size={15} className="absolute top-3.5 start-3 text-slate-400" />
                <input
                  className={INPUT}
                  value={query}
                  dir="auto"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Patient name or 2845xxxx1234"
                />
              </div>
            </label>
            {searchResult && (
              searchResult.hits.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No results in the authorized scope.</p>
              ) : (
                <div className="space-y-2">
                  {searchResult.ambiguous && (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                      <AlertTriangle size={13} /> More than one file has this name. Confirm the patient's age and last four ID digits.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {searchResult.hits.map(({ file, maskedNationalId }) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          className={`${CARD} w-full p-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-right hover:border-cyan-500/60`}
                          onClick={() => openDetail(file.id)}
                        >
                          <span className="text-sm font-extrabold">{file.name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Age {file.ageYears}</span>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                            {maskedNationalId || '—'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>

          {/* Authorized file list */}
          <div className={`${CARD} p-4 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold flex items-center gap-1.5">
                <Activity size={15} className="text-cyan-500" />
                Patient files ({authorizedFiles.length})
              </h2>
               {isLocalPreview() && <button type="button" className={GHOST} onClick={() => setShowForm((current) => !current)}>
                 {showForm ? 'Hide form' : 'New file'}
               </button>}
            </div>
            {authorizedFiles.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No patient files are visible in the authorized units yet. Files are created automatically on patient admission.
              </p>
            ) : (
              <ul className="space-y-2">
                {authorizedFiles.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className={`${CARD} w-full p-3 text-right hover:border-cyan-500/60`}
                      onClick={() => openDetail(file.id)}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-extrabold">{file.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Age {file.ageYears}</span>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                          {maskNationalId(file) || '—'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                          {new Date(file.updatedAtMs).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {file.contextIds.map((id) => contextIdLabel(id, unitNameById)).join(' · ')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* New master file form */}
          {showForm && (
            <div className={`${CARD} p-4 space-y-3`}>
              <h2 className="text-sm font-extrabold flex items-center gap-1.5">
                <Plus size={15} className="text-cyan-500" /> Create a patient file
              </h2>
              <form className="space-y-3" onSubmit={submitNewFile}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Patient name *</span>
                    <input
                      className={INPUT}
                      value={form.name}
                      onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
                    />
                    {formErrors.name && <span className="text-xs text-rose-600 dark:text-rose-400">{formErrors.name}</span>}
                  </label>
                  <label className="block">
                    <span className={LABEL}>Age (years) *</span>
                    <input
                      type="number"
                      min={0}
                      max={130}
                      className={INPUT}
                      value={form.ageYears}
                      onChange={(e) => setForm((cur) => ({ ...cur, ageYears: e.target.value }))}
                    />
                    {formErrors.ageYears && <span className="text-xs text-rose-600 dark:text-rose-400">{formErrors.ageYears}</span>}
                  </label>
                  <label className="block">
                    <span className={LABEL}>National ID (optional; always masked on screen)</span>
                    <input
                      className={INPUT}
                      inputMode="numeric"
                      dir="ltr"
                      value={form.nationalId}
                      onChange={(e) => setForm((cur) => ({ ...cur, nationalId: e.target.value.replace(/[^0-9]/g, '') }))}
                    />
                    {formErrors.nationalId && <span className="text-xs text-rose-600 dark:text-rose-400">{formErrors.nationalId}</span>}
                  </label>
                  <label className="block">
                    <span className={LABEL}>Phone (optional)</span>
                    <input
                      className={INPUT}
                      dir="ltr"
                      value={form.phone}
                      onChange={(e) => setForm((cur) => ({ ...cur, phone: e.target.value }))}
                    />
                  </label>
                </div>

                {!isSecretary && <>
                <div className="space-y-1.5">
                  <span className={LABEL}>Risk factors</span>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.riskDiabetes}
                        onChange={(e) => setForm((cur) => ({ ...cur, riskDiabetes: e.target.checked }))}
                      />
                      Diabetes
                    </label>
                    <label className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.riskHypertension}
                        onChange={(e) => setForm((cur) => ({ ...cur, riskHypertension: e.target.checked }))}
                      />
                      Hypertension
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className={INPUT}
                      value={form.riskCustom}
                      onChange={(e) => setForm((cur) => ({ ...cur, riskCustom: e.target.value }))}
                      placeholder="Add a custom risk factor"
                    />
                    <button
                      type="button"
                      className={GHOST}
                      onClick={() => {
                        const value = form.riskCustom.trim();
                        if (!value) return;
                        setForm((cur) => ({ ...cur, riskList: cur.riskList.includes(value) ? cur.riskList : [...cur.riskList, value], riskCustom: '' }));
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {form.riskList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.riskList.map((risk) => (
                        <button
                          key={risk}
                          type="button"
                          className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold"
                          onClick={() => toggleRisk(risk)}
                        >
                          {risk} ✕
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="block">
                  <span className={LABEL}>Medical history</span>
                  <textarea
                    className={INPUT}
                    rows={3}
                    value={form.history}
                    onChange={(e) => setForm((cur) => ({ ...cur, history: e.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Previous operations (comma-separated)</span>
                    <input
                      className={INPUT}
                      value={form.pastOperations}
                      onChange={(e) => setForm((cur) => ({ ...cur, pastOperations: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Previous imaging (comma-separated)</span>
                    <input
                      className={INPUT}
                      value={form.pastImaging}
                      onChange={(e) => setForm((cur) => ({ ...cur, pastImaging: e.target.value }))}
                    />
                  </label>
                </div>
                </>}

                <label className="block">
                  <span className={LABEL}>Patient context *</span>
                  <select
                    className={INPUT}
                    value={effectiveFormContext}
                    onChange={(e) => setFormContextId(e.target.value)}
                  >
                    {unitIds.map((unitId) => (
                      <option key={unitId} value={unitId}>
                        Unit: {unitNameById.get(unitId) || unitId}
                      </option>
                    ))}
                  </select>
                  {formErrors.contextIds && <span className="text-xs text-rose-600 dark:text-rose-400">{formErrors.contextIds}</span>}
                </label>

                <button type="submit" className={PRIMARY}>
                  <Stethoscope size={14} /> Create patient file
                </button>
              </form>
            </div>
          )}
        </section>
      )}
      {readmitTarget && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"><div role="dialog" aria-modal="true" aria-label={`Readmit ${readmitTarget.fullName}`} className={`${CARD} w-full max-w-md p-5 space-y-4`}><h3 className="font-bold">Readmit {readmitTarget.fullName}</h3><p className="text-xs text-amber-700 dark:text-amber-300">The prior admission remains in the patient history. A new episode will start with a fresh admission record.</p><label className={LABEL}>Unit<select className={INPUT} value={readmitUnitId} onChange={event => { setReadmitUnitId(event.target.value); setReadmitBedId(''); }}><option value="">Select unit</option>{readmitUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className={LABEL}>Available bed<select className={INPUT} value={readmitBedId} onChange={event => setReadmitBedId(event.target.value)}><option value="">Select bed</option>{readmitBeds.map(bed => <option key={bed.id} value={bed.id}>{bed.bedNumber}</option>)}</select></label><div className="flex justify-end gap-2"><button type="button" className={GHOST} onClick={() => setReadmitTarget(null)}>Cancel</button><button type="button" className={PRIMARY} disabled={!readmitBedId} onClick={confirmMasterReadmit}>Readmit</button></div></div></div>}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <Info size={12} /> The patient file is longitudinal. Timeline events are append-only and cannot be deleted from this screen.
      </p>
    </div>
  );
};

/** Pure helpers kept module-level for clarity. */
function contextIdLabel(contextId: string, unitNameById: Map<string, string>): string {
  if (contextId === PREVIEW_CLINIC_ID) return 'Other context';
  return unitNameById.get(contextId) ? `Unit: ${unitNameById.get(contextId)}` : contextId;
}

function pickFileContext(file: MasterPatientFile, activeUnitId: string, clinicId: string): string {
  if (activeUnitId && file.contextIds.includes(activeUnitId)) return activeUnitId;
  if (file.contextIds.includes(clinicId)) return clinicId;
  return file.contextIds[0] || activeUnitId || clinicId;
}

export default MasterPatientFileView;
