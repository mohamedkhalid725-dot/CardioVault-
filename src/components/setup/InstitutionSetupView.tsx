import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Layers,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { InstitutionSetupDraft, InstitutionUnitDraft, UnitTypeId } from '../../types/departmentTeam';
import { BUILTIN_UNIT_TYPES, defaultBedCountFor } from '../../services/unitCatalog';
import {
  REQUIRED_STEPS,
  clearDraft,
  createUnitsFromDraft,
  emptyDraft,
  emptyUnitDraft,
  loadDraft,
  loadSetupCompanion,
  markStepCompleted,
  saveDraft,
  saveSetupCompanion,
  setupProgress,
  unitReceivesOperations,
  unitTypeLabel,
  MAX_REQUEST_UNIT_DRAFTS,
  validateInstitutionSetup,
  type SetupCompanionRecord,
} from '../../services/institutionSetup';
import { planProductionSetupUnits, runProductionSetup } from '../../services/institutionSetupProduction';
import { StorageService } from '../../services/storage';
import { isLocalPreview } from '../../config/localPreview';

/**
 * Institution setup wizard.
 *
 * Creates workspace units and beds. Unit access activation is handled
 * separately by the platform owner; this wizard has no request, trial, or
 * payment flow.
 */

interface StepDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

const STEPS: StepDef[] = [
  { id: 'institution', label: 'Institution', icon: Building2 },
  { id: 'units', label: 'Units', icon: Layers },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
];


const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-[#0B1526] dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
const cardClass = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#111C2E]';

const FieldError = ({ message }: { message?: string }) => {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
};

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
    <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-right text-sm font-medium text-slate-800 dark:text-slate-100">{value}</span>
  </div>
);

const friendlySaveError = (error: unknown): string => {
  const raw = String((error as Error)?.message || error || '').trim();
  switch (raw.split(':')[0]) {
    case 'institution-name-required': return 'Enter the institution or clinic name.';
    default: return raw || 'Could not save locally. Please try again.';
  }
};

const emptyCompanion: SetupCompanionRecord = { id: 'current', updatedAtMs: 0, schemaVersion: 1 };

interface InstitutionSetupViewProps {
  /**
   * 'standard' is the in-app wizard (the account already has workspace access).
    * 'onboarding' displays the owner-issued access-code instructions.
   */
  mode?: 'standard' | 'onboarding';
  onExit?: () => void;
}

export const InstitutionSetupView = ({ mode = 'standard', onExit }: InstitutionSetupViewProps = {}) => {
  const { currentUser, units, addUnit: createUnit, addPreviewUnits, completeUnitSetup } = useApp();
  const [draft, setDraft] = useState<InstitutionSetupDraft>(() => loadDraft());
  const [companion, setCompanion] = useState<SetupCompanionRecord>(() => loadSetupCompanion());
  const [stepIndex, setStepIndex] = useState(0);
  const [saved, setSaved] = useState<{ count: number; totalBeds: number } | null>(null);
  const [actionError, setActionError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);
  // The wizard itself is identical in both builds; only the save path and the
  // copy differ. Production writes the request to Firestore and creates real
  // units; the isolated preview keeps its device-only draft.
  const previewMode = isLocalPreview();
  // First-run onboarding (brand-new account, no membership yet): the request is
  // the whole deliverable. Unit creation stays with the owner's activation step,
  // because the rules (correctly) refuse a unit to an account without a
  // membership, and we will not weaken them.
  const onboardingMode = mode === 'onboarding' && !previewMode;

  // Suggest the signed-in name once, without overwriting anything the user typed.
  // The suggestion is persisted immediately so a reload does not lose it.
  useEffect(() => {
    const name = String(currentUser?.name || '').trim();
    if (!name) return;
    const base = loadDraft();
    if (base.adminName.trim()) return;
    const next = { ...base, adminName: name };
    setDraft(next);
    saveDraft(next);
  }, [currentUser?.name]);

  const validation = useMemo(() => validateInstitutionSetup(draft), [draft]);
  const progress = useMemo(() => setupProgress(draft), [draft]);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const totalBeds = validation.totalBeds;
  const unitCount = draft.unitDrafts.length;
  const canSave = validation.ok;

  const update = (patch: Partial<InstitutionSetupDraft>) => {
    setDraft((previous) => saveDraft({ ...previous, ...patch }));
    setSaved(null);
  };

  const updateCompanion = (patch: Partial<SetupCompanionRecord>) => {
    setCompanion(saveSetupCompanion(patch));
  };

  const updateUnit = (tempId: string, patch: Partial<InstitutionUnitDraft>) => {
    setDraft((previous) =>
      saveDraft({
        ...previous,
        unitDrafts: previous.unitDrafts.map((unit) =>
          unit.tempId === tempId ? { ...unit, ...patch } : unit,
        ),
      }),
    );
    setSaved(null);
  };

  const addUnit = () => {
    if (draft.unitDrafts.length >= MAX_REQUEST_UNIT_DRAFTS) return;
    setDraft((previous) =>
      saveDraft({ ...previous, unitDrafts: [...previous.unitDrafts, emptyUnitDraft('cardiology')] }),
    );
    setSaved(null);
  };

  const removeUnit = (tempId: string) => {
    setDraft((previous) =>
      saveDraft({
        ...previous,
        unitDrafts: previous.unitDrafts.filter((unit) => unit.tempId !== tempId),
      }),
    );
    setSaved(null);
  };

  const toggleUnitOperations = (tempId: string, checked: boolean) => {
    updateCompanion({
      receivesOperationsByUnit: {
        ...(companion.receivesOperationsByUnit || {}),
        [tempId]: checked,
      },
    });
  };

  const stepIsValid = (stepId: string): boolean => {
    const errors = validation.errors;
    switch (stepId) {
      case 'institution':
        return !errors.institutionName;
      case 'units':
        return (
          !errors.units &&
          !errors['units.duplicate'] &&
          !Object.keys(errors).some((key) => key.startsWith('unit.'))
        );
      case 'team':
        return !errors.adminName && !errors.adminEmail && !errors.teamSize;
      case 'review':
      default:
        // The payment step requires the method (above), and review is only a
        // read-back of what the other steps validated.
        return true;
    }
  };

  const goNext = () => {
    if (!stepIsValid(step.id)) return;
    if (step.id === 'team') {
      setDraft((previous) => saveDraft(markStepCompleted(markStepCompleted(previous, 'team'), 'plan')));
    } else if ((REQUIRED_STEPS as readonly string[]).includes(step.id)) {
      setDraft((previous) => saveDraft(markStepCompleted(previous, step.id)));
    }
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  };

  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));
  const save = async () => {
    if (saving) return;
    setActionError('');
    setSaveNotice('');
    if (!canSave) return;
    if (onboardingMode) {
      setActionError('A unit must first be created and activated by the platform owner. Ask the owner for a unit access code; no subscription request or payment is needed.');
      return;
    }
    setSaving(true);
    try {
      if (previewMode) {
        const created = createUnitsFromDraft(draft, units, undefined, currentUser?.userId);
        const createdCount = addPreviewUnits(created);
        const withSteps = REQUIRED_STEPS.reduce((acc, required) => markStepCompleted(acc, required), draft);
        setDraft(saveDraft(withSteps));
        setSaved({ count: createdCount, totalBeds: created.reduce((sum, unit) => sum + (Number(unit.totalBeds) || 0), 0) });
        setSaveNotice('Setup saved locally for this isolated preview.');
        return;
      }
      const plan = planProductionSetupUnits(draft, StorageService.getUnits(), currentUser?.userId);
      const outcome = await runProductionSetup({
        plan,
        createUnit: unit => createUnit(unit.name, unit.type, unit.totalBeds, { id: unit.id, unitTypeId: unit.unitTypeId, config: unit.config }),
        completeUnit: unitId => completeUnitSetup(unitId),
      });
      if (outcome.ok) {
        const withSteps = REQUIRED_STEPS.reduce((acc, required) => markStepCompleted(acc, required), draft);
        setDraft(saveDraft(withSteps));
        setSaved({ count: outcome.completed.length, totalBeds: outcome.totalBeds });
        setSaveNotice('Units and beds were created. Each unit needs a 30-day license from the platform owner before members can access it.');
        return;
      }
      setSaved(null);
      const details = outcome.failures.slice(0, 3).map(failure => `${failure.name}: ${failure.message}`).join(' ');
      const extra = outcome.failures.length > 3 ? ` (+${outcome.failures.length - 3} more)` : '';
      setActionError(`${outcome.completed.length} of ${plan.targets.length} units finished. ${details}${extra} Press Save again to retry; existing units and beds are not duplicated.`);
    } catch (error) {
      setSaved(null);
      setActionError(friendlySaveError(error));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    clearDraft();
    setDraft(emptyDraft());
    setCompanion({ ...emptyCompanion });
    setSaved(null);
    setActionError('');
    setStepIndex(0);
  };

  const unitErrors = (tempId: string) => {
    const prefix = `unit.${tempId}.`;
    return Object.entries(validation.errors)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, message]) => message);
  };

  const visibleErrors = (() => {
    const all = Object.entries(validation.errors);
    if (step.id === 'review') return all;
    if (step.id === 'units') {
      return all.filter(
        ([key]) => key === 'units' || key === 'units.duplicate' || key.startsWith('unit.'),
      );
    }
    if (step.id === 'institution') return all.filter(([key]) => key === 'institutionName');
    if (step.id === 'team') {
      return all.filter(([key]) => ['adminName', 'adminEmail', 'teamSize'].includes(key));
    }
    return [];
  })();

  if (onboardingMode) return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <section className={`${cardClass} w-full max-w-lg space-y-4`}>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Unit access required</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">The platform owner must create or activate a unit and send you its access code. Entering that code adds you to the unit; there is no subscription request, trial, or payment step.</p>
        {onExit && <button type="button" onClick={onExit} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-700"><ChevronLeft className="h-4 w-4" /> Back to access code</button>}
      </section>
    </div>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div
        className={`rounded-3xl border p-4 ${
          previewMode
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
            : 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200'
        }`}
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {previewMode
            ? 'Local preview data - saved on this device only, not synced.'
             : 'Units and beds are created in your workspace. Each unit needs its own 30-day license from the platform owner before members can access it.'}
        </p>
      </div>

      {saveNotice && (
        <div className="rounded-3xl border border-slate-300 bg-slate-50 p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
          <p className="flex items-start gap-2 text-sm">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{saveNotice}</span>
          </p>
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Institution setup</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {previewMode
                ? 'Configure the institution and units, then save to the isolated local preview. Nothing is created in the cloud.'
                : 'Configure the institution and units, then save them to your workspace. Ask the platform owner to activate each unit for 30 days.'}
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {unitCount} {unitCount === 1 ? 'unit' : 'units'}
            </span>
            <span className="rounded-full bg-cyan-50 px-3 py-1 font-medium text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              {totalBeds} beds
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">{progress}% complete</p>

        <ol className="mt-4 grid grid-cols-6 gap-1 text-center">
          {STEPS.map((entry, index) => {
            const Icon = entry.icon;
            const done = draft.completedSteps.includes(entry.id);
            const active = index === stepIndex;
            return (
              <li key={entry.id} className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                    active
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : done
                        ? 'border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300'
                        : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-[#0B1526] dark:text-slate-500'
                  }`}
                >
                  {done && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={`text-[11px] ${
                    active
                      ? 'font-semibold text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {entry.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className={cardClass}>
        {step.id === 'institution' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Institution</h2>
            <div>
              <label className={labelClass} htmlFor="setup-institution-name">
                Institution name
              </label>
              <input
                id="setup-institution-name"
                className={inputClass}
                value={draft.institutionName}
                onChange={(event) => update({ institutionName: event.target.value })}
                placeholder="e.g. Nile Cardiac Hospital"
              />
              <FieldError message={validation.errors.institutionName} />
            </div>
          </div>
        )}

        {step.id === 'units' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Units</h2>
              <button
                type="button"
                onClick={addUnit}
                disabled={draft.unitDrafts.length >= MAX_REQUEST_UNIT_DRAFTS}
                className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-600"
              >
                <Plus className="h-4 w-4" />
                {draft.unitDrafts.length >= MAX_REQUEST_UNIT_DRAFTS ? `Limit reached (${MAX_REQUEST_UNIT_DRAFTS})` : 'Add unit'}
              </button>
            </div>

            <FieldError message={validation.errors.units} />
            <FieldError message={validation.errors['units.duplicate']} />

            {draft.unitDrafts.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No units yet. Add the first unit to start the layout.
              </p>
            )}

            <div className="space-y-3">
              {draft.unitDrafts.map((unit, index) => {
                const rowErrors = unitErrors(unit.tempId);
                const receivesOperations = unitReceivesOperations(companion, unit.tempId);
                return (
                  <div
                    key={unit.tempId}
                    className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Unit {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeUnit(unit.tempId)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Name</label>
                        <input
                          className={inputClass}
                          value={unit.name}
                          onChange={(event) => updateUnit(unit.tempId, { name: event.target.value })}
                          placeholder="e.g. CCU A"
                        />
                        <FieldError message={validation.errors[`unit.${unit.tempId}.name`]} />
                      </div>
                      <div>
                        <label className={labelClass}>Type</label>
                        <select
                          className={inputClass}
                          value={unit.typeId}
                          onChange={(event) => {
                            const typeId = event.target.value as UnitTypeId;
                            updateUnit(unit.tempId, {
                              typeId,
                              ...(typeId === 'custom' ? {} : { beds: defaultBedCountFor(typeId) }),
                            });
                          }}
                        >
                          {BUILTIN_UNIT_TYPES.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.label}
                            </option>
                          ))}
                          <option value="custom">Custom…</option>
                        </select>
                        <FieldError message={validation.errors[`unit.${unit.tempId}.typeId`]} />
                      </div>

                      {unit.typeId === 'custom' && (
                        <div>
                          <label className={labelClass}>Custom type name</label>
                          <input
                            className={inputClass}
                            value={unit.customTypeName || ''}
                            onChange={(event) => updateUnit(unit.tempId, { customTypeName: event.target.value })}
                            placeholder="e.g. Bone Marrow Transplant"
                          />
                          <FieldError message={validation.errors[`unit.${unit.tempId}.customTypeName`]} />
                        </div>
                      )}

                      <div>
                        <label className={labelClass}>Beds</label>
                        <div className="relative">
                          <BedDouble className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <input
                            type="number"
                            min={0}
                            max={200}
                            className={`${inputClass} pl-9`}
                            value={unit.beds}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              updateUnit(unit.tempId, { beds: Number.isFinite(parsed) ? Math.trunc(parsed) : 0 });
                            }}
                          />
                        </div>
                        <FieldError message={validation.errors[`unit.${unit.tempId}.beds`]} />
                      </div>

                      <label className="flex items-center gap-2 self-end rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-cyan-600"
                            checked={receivesOperations}
                            onChange={(event) => toggleUnitOperations(unit.tempId, event.target.checked)}
                          />
                          Unit receives operations
                      </label>
                    </div>

                    {rowErrors.length > 0 && (
                      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                        {rowErrors.length} issue{rowErrors.length === 1 ? '' : 's'} on this unit
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step.id === 'team' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Team</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="setup-admin-name">
                  Admin name
                </label>
                <input
                  id="setup-admin-name"
                  className={inputClass}
                  value={draft.adminName}
                  onChange={(event) => update({ adminName: event.target.value })}
                  placeholder="e.g. Dr Ahmed Hassan"
                />
                <FieldError message={validation.errors.adminName} />
              </div>
              <div>
                <label className={labelClass} htmlFor="setup-admin-email">
                  Admin email
                </label>
                <input
                  id="setup-admin-email"
                  type="email"
                  className={inputClass}
                  value={draft.adminEmail}
                  onChange={(event) => update({ adminEmail: event.target.value })}
                  placeholder="admin@example.com"
                />
                <FieldError message={validation.errors.adminEmail} />
              </div>
              <div>
                <label className={labelClass} htmlFor="setup-team-size">
                  Team size
                </label>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="setup-team-size"
                    type="number"
                    min={0}
                    max={10000}
                    className={`${inputClass} pl-9`}
                    value={draft.teamSize}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      update({ teamSize: Number.isFinite(parsed) ? Math.trunc(parsed) : 0 });
                    }}
                  />
                </div>
                <FieldError message={validation.errors.teamSize} />
              </div>
            </div>
          </div>
        )}
        {step.id === 'review' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Review</h2>

            <div>
              <SummaryRow label="Institution" value={draft.institutionName || '—'} />
              <SummaryRow label="Admin" value={draft.adminName || '—'} />
              <SummaryRow label="Email" value={draft.adminEmail || '—'} />
              <SummaryRow label="Team size" value={String(draft.teamSize)} />
              {draft.planId && (
                <SummaryRow label="Plan (legacy)" value={draft.planId} />
              )}
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Units ({unitCount}) · {totalBeds} beds
              </p>
              <ul className="space-y-1">
                {draft.unitDrafts.map((unit, index) => {
                  const type = unitTypeLabel(unit);
                  return (
                    <li
                      key={unit.tempId}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                    >
                      <span className="text-slate-800 dark:text-slate-100">
                        {index + 1}. {unit.name || 'Unnamed unit'}
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{type}</span>
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {unitReceivesOperations(companion, unit.tempId) ? '✓ Receives operations · ' : ''}
                        {unit.beds} beds
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {validation.ok ? (
              <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Ready to save this institution and its unit/bed setup.
              </p>
            ) : (
              <div className="space-y-1 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {visibleErrors.map(([key, message]) => (
                  <p key={key} className="flex items-start gap-1">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {step.id !== 'review' && visibleErrors.length > 0 && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {visibleErrors.map(([key, message]) => (
              <p key={key} className="flex items-center gap-1 py-0.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {message}
              </p>
            ))}
          </div>
        )}

      </div>

      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          {!isLastStep && (
            <button
              type="button"
              onClick={goNext}
              disabled={!stepIsValid(step.id)}
              className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actionError && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle className="h-4 w-4" />
              {actionError}
            </span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {previewMode
                ? `Setup saved locally - ${saved.count} ${saved.count === 1 ? 'unit' : 'units'} and ${saved.totalBeds} beds are now available in this preview.`
                : `Setup complete - ${saved.count} ${saved.count === 1 ? 'unit' : 'units'} and ${saved.totalBeds} beds created. Only the owner can change bed counts now.`}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Check className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save setup'}
          </button>
          {saved && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="h-4 w-4" />
              Reset setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstitutionSetupView;
