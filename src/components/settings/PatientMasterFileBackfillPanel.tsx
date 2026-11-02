import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, Database, LoaderCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  type PatientMasterFileBackfillPreview,
  type PatientMasterFileBackfillProgress,
  type PatientMasterFileBackfillResult,
} from '../../services/patientMasterFileBackfill';
import {
  previewCurrentWorkspacePatientMasterFileBackfill,
  runCurrentWorkspacePatientMasterFileBackfill,
} from '../../services/patientMasterFileBackfillCloud';
import { isMasterAccount } from '../../services/workspaceAccess';

export const PatientMasterFileBackfillPanel: React.FC = () => {
  const { showToast } = useApp();
  const [isOwner, setIsOwner] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);
  const [preview, setPreview] = useState<PatientMasterFileBackfillPreview | null>(null);
  const [progress, setProgress] = useState<PatientMasterFileBackfillProgress | null>(null);
  const [result, setResult] = useState<PatientMasterFileBackfillResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let active = true;
    void isMasterAccount().then(owner => { if (active) setIsOwner(owner); }).catch(() => {
      if (active) setIsOwner(false);
    }).finally(() => { if (active) setCheckingOwner(false); });
    return () => { active = false; };
  }, []);

  const preparePreview = async () => {
    if (previewing || running) return;
    setPreviewing(true);
    setPreview(null);
    setProgress(null);
    setResult(null);
    try {
      setPreview(await previewCurrentWorkspacePatientMasterFileBackfill());
    } catch (error) {
      showToast(`Could not preview patient files: ${String((error as any)?.message || error)}`, 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const runBackfill = async () => {
    if (!preview || running || previewing) return;
    const ready = preview.candidatePatientIds.length;
    const confirmed = window.confirm(
      `Backfill ${ready} patient record(s) in this workspace? ${preview.missingMasterFiles} master file(s) are missing; ${preview.archivedPatients} archived record(s) are included. This writes master-file and unit-index documents in batches of 10. It is safe to retry, but review the preview before proceeding.`,
    );
    if (!confirmed) return;
    setRunning(true);
    setProgress({ processed: 0, total: ready, completed: 0, failed: [] });
    setResult(null);
    try {
      const completed = await runCurrentWorkspacePatientMasterFileBackfill(preview, setProgress);
      setResult(completed);
      window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));
      showToast(
        completed.failed.length
          ? `Backfill stopped with ${completed.failed.length} record failure(s). Completed records are safe to retry.`
          : `Backfill completed for ${completed.completed} patient record(s).`,
        completed.failed.length ? 'warning' : 'success',
      );
    } catch (error) {
      showToast(`Backfill could not complete: ${String((error as any)?.message || error)}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  if (checkingOwner || !isOwner) return null;
  const percent = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return <section className="rounded-2xl border border-amber-500/30 bg-white dark:bg-[#111c2e] p-4 space-y-3">
    <h2 className="flex items-center gap-2 font-extrabold"><Database size={17} className="text-amber-500" /> Legacy patient master files</h2>
    <p className="text-xs text-slate-500 dark:text-slate-400">Owner-only tool. Preview first; active and archived patient records are included. No records are changed until you confirm the preview.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={previewing || running} onClick={() => void preparePreview()} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/60 px-3 py-2 text-xs font-bold disabled:opacity-50">
        {previewing ? <LoaderCircle size={14} className="animate-spin" /> : <Archive size={14} />}{previewing ? 'Preparing preview…' : 'Preview backfill'}
      </button>
      {preview && <button type="button" disabled={running || previewing || preview.candidatePatientIds.length === 0} onClick={() => void runBackfill()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
        {running ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}{running ? 'Backfilling…' : 'Run confirmed backfill'}
      </button>}
    </div>

    {preview && <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div><strong>{preview.totalPatients}</strong><span className="ml-1 text-slate-500">patient records</span></div>
        <div><strong>{preview.archivedPatients}</strong><span className="ml-1 text-slate-500">archived included</span></div>
        <div><strong>{preview.missingMasterFiles}</strong><span className="ml-1 text-slate-500">master files missing</span></div>
        <div><strong>{preview.existingMasterFiles}</strong><span className="ml-1 text-slate-500">existing files/indexes to confirm</span></div>
        <div><strong>{preview.missingAdmissionDates}</strong><span className="ml-1 text-slate-500">original dates unavailable</span></div>
        <div><strong>{preview.skippedPatients}</strong><span className="ml-1 text-slate-500">invalid/missing unit scope</span></div>
      </div>
      {!!preview.missingAdmissionDates && <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />For records without a usable original date, the file/index can be restored but no made-up timeline event will be written; they will be listed in the result.</p>}
    </div>}

    {progress && <div className="space-y-1.5 text-xs" aria-live="polite">
      <div className="flex justify-between"><span>{running ? 'Processing in batches of 10' : 'Last run'}</span><span>{progress.processed}/{progress.total} · {percent}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-amber-500 transition-all" style={{ width: `${percent}%` }} /></div>
      <div>{progress.completed} completed · {progress.failed.length} failed</div>
    </div>}

    {result && <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 p-3 text-xs space-y-1">
      <div>{result.missingMasterFilesCreated} files created · {result.indexesRepaired} unit links added · {result.eventsCreatedOrConfirmed} admission events confirmed</div>
      {!!result.eventsWithoutOriginalDate && <div className="text-amber-700 dark:text-amber-300">{result.eventsWithoutOriginalDate} record(s) had no valid original admission date; no event was fabricated.</div>}
      {result.failed.slice(0, 10).map(failure => <div key={failure.patientId} className="break-words text-rose-600 dark:text-rose-400">Record {failure.patientId}: {failure.message}</div>)}
      {result.failed.length > 10 && <div className="text-slate-500">And {result.failed.length - 10} more failures.</div>}
    </div>}
  </section>;
};
