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
  CreditCard,
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
import type { PaymentMethodChoice, PricingLineItem, SubscriptionRequestType } from '../../types/clinicArea';
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
  validateInstitutionSetup,
  validateSetupCompanion,
  type SetupCompanionRecord,
} from '../../services/institutionSetup';
import { ReadOnlyAreaError, buildLineItems, loadRequests, submitRequest } from '../../services/subscriptionRequests';

/**
 * Local-preview institution setup wizard.
 *
 * This screen exists to prove the flow, not to provision anything: it reads and
 * writes one device-local draft (plus its subscription companion record) and
 * never calls `addUnit`, Firestore or the sync bridge. Creating the real units
 * stays an explicit, separate action so a preview cannot quietly populate a
 * live workspace.
 *
 * Agent C additions (approved plan §7/§8/§19):
 *  - STEP 'request' is the FIRST step: request type (قسم / عيادة / الاثنين
 *    معاً), contact phone, clinic extras (doctors count, services) — stored in
 *    the companion record so the read-only draft contract never changes.
 *  - The Payment step replaces the plan step: payment method choice FIRST
 *    (currency follows the method), itemized lines per area, the
 *    awaiting-confirmation pricing note, and honest InstaPay / WhatsApp /
 *    Visa-not-live blocks.
 *  - Final save submits the subscription request once (starts the 3-day
 *    trial — never a payment) and then creates the units locally. The
 *    read-only gate inside createUnitsFromDraft blocks unit creation after a
 *    trial expires / code is revoked without approval.
 *  - Per-keystroke persistence for BOTH records: a reload resumes exactly
 *    where the typing stopped (draft + companion).
 */

interface StepDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

const STEPS: StepDef[] = [
  { id: 'request', label: 'Request', icon: ClipboardList },
  { id: 'institution', label: 'Institution', icon: Building2 },
  { id: 'units', label: 'Units', icon: Layers },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
];

const REQUEST_TYPE_OPTIONS: { id: SubscriptionRequestType; label: string; hint: string }[] = [
  { id: 'department', label: 'Department', hint: 'One or more units — billed per unit' },
  { id: 'clinic', label: 'Clinic', hint: 'Clinic doctor seats — billed per doctor' },
  { id: 'both', label: 'Department and clinic', hint: 'Both areas are priced separately' },
];

const REQUEST_TYPE_LABEL: Record<SubscriptionRequestType, string> = {
  department: 'Department',
  clinic: 'Clinic',
  both: 'Department and clinic',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethodChoice, string> = {
  instapay: 'InstaPay',
  visa: 'Visa',
};

const INSTAPAY_LINK = 'https://ipn.eg/S/mohmd272/instapay/2mMDmP';
const INSTAPAY_BENEFICIARY = 'mohmd272@instapay';
const WHATSAPP_LINK = 'https://wa.me/201013040631';
const WHATSAPP_LABEL = '+201013040631';
const AWAITING_CONFIRMATION_NOTE =
  'Subscriptions renew every 30 days. Early renewal adds 30 days after the current expiry; late renewal starts on approval.';
const TRIAL_NOTICE =
  'The request is saved in this local preview and starts a 3-day trial. This does not confirm payment; the owner must approve it.';
const VISA_NOT_LIVE_NOTE = 'Visa checkout is not connected yet. Contact the owner on WhatsApp to arrange payment.';
const INSTAPAY_WARNING = 'Opening the link or sending a transfer does not verify payment. The owner confirms payment manually.';

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

const lineItemLabel = (area: PricingLineItem['area']): string =>
  area === 'department' ? 'Department (units)' : 'Clinic (doctors)';

const friendlySaveError = (error: unknown): string => {
  const raw = String((error as Error)?.message || error || '').trim();
  if (error instanceof ReadOnlyAreaError || raw.startsWith('read-only-area')) {
    return 'This area is read-only until the owner approves the request or renews the subscription.';
  }
  switch (raw.split(':')[0]) {
    case 'invalid-phone': return 'Enter a valid contact phone number (at least 7 digits).';
    case 'request-type-missing': return 'Choose a request type first.';
    case 'units-required': return 'Add at least one department unit.';
    case 'doctors-count-required': return 'Enter the clinic doctor count (1–200).';
    case 'payment-method-missing': return 'Choose a payment method first.';
    case 'institution-name-required': return 'Enter the institution or clinic name.';
    default: return raw || 'Could not save locally. Please try again.';
  }
};

const emptyCompanion: SetupCompanionRecord = { id: 'current', updatedAtMs: 0, schemaVersion: 1 };

export const InstitutionSetupView = () => {
  const { currentUser, units, addPreviewUnits } = useApp();
  const [draft, setDraft] = useState<InstitutionSetupDraft>(() => loadDraft());
  const [companion, setCompanion] = useState<SetupCompanionRecord>(() => loadSetupCompanion());
  const [stepIndex, setStepIndex] = useState(0);
  const [saved, setSaved] = useState<{ count: number; totalBeds: number } | null>(null);
  const [actionError, setActionError] = useState('');
  const [serviceInput, setServiceInput] = useState('');

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

  const requestType = companion.requestType;
  const validation = useMemo(() => validateInstitutionSetup(draft, requestType), [draft, requestType]);
  const progress = useMemo(() => setupProgress(draft, requestType), [draft, requestType]);

  // Request-step check WITHOUT the unit count: units come in a later step and
  // must not gate the very first screen.
  const companionStepCheck = useMemo(() => validateSetupCompanion(companion), [companion]);
  // Save-time check WITH the unit count + the payment method requirement.
  const companionSaveCheck = useMemo(() => {
    const check = validateSetupCompanion(companion, draft.unitDrafts.length);
    if (!companion.paymentMethod) {
      check.errors.paymentMethod = 'Choose a payment method in the Payment step.';
    }
    check.ok = Object.keys(check.errors).length === 0;
    return check;
  }, [companion, draft.unitDrafts.length]);

  // Itemized pricing preview (method drives the currency; nothing is paid here).
  const lineItems = useMemo<PricingLineItem[]>(
    () =>
      companion.paymentMethod
        ? buildLineItems(
            requestType || 'department',
            requestType === 'clinic' ? 0 : draft.unitDrafts.length,
            companion.doctorsCount || 0,
            companion.paymentMethod,
          )
        : [],
    [companion.paymentMethod, companion.doctorsCount, requestType, draft.unitDrafts.length],
  );
  const totalLine = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
  const lineCurrency = lineItems[0]?.currency || 'EGP';

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const totalBeds = validation.totalBeds;
  const unitCount = draft.unitDrafts.length;
  const requestSubmitted = !!companion.lastSubmittedRequestId;
  const canSave = validation.ok && companionSaveCheck.ok;

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

  const addService = () => {
    const label = serviceInput.trim();
    if (!label) return;
    if (companion.clinicServices?.includes(label)) {
      setServiceInput('');
      return;
    }
    updateCompanion({ clinicServices: [...(companion.clinicServices || []), label] });
    setServiceInput('');
  };

  const removeService = (label: string) => {
    updateCompanion({ clinicServices: (companion.clinicServices || []).filter((entry) => entry !== label) });
  };

  const stepIsValid = (stepId: string): boolean => {
    const errors = validation.errors;
    switch (stepId) {
      case 'request':
        return companionStepCheck.ok;
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
      case 'payment':
        return !!companion.paymentMethod;
      case 'review':
      default:
        // The payment step requires the method (above), and review is only a
        // read-back of what the other steps validated.
        return true;
    }
  };

  const goNext = () => {
    if (!stepIsValid(step.id)) return;
    if (step.id === 'payment') {
      // The payment step completes BOTH the wizard's own id and the legacy
      // required step id 'plan', so REQUIRED_STEPS validation stays satisfied.
      setDraft((previous) =>
        saveDraft(markStepCompleted(markStepCompleted(previous, 'payment'), 'plan')),
      );
    } else if (step.id === 'request') {
      setDraft((previous) => saveDraft(markStepCompleted(previous, 'request')));
    } else if ((REQUIRED_STEPS as readonly string[]).includes(step.id)) {
      setDraft((previous) => saveDraft(markStepCompleted(previous, step.id)));
    }
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  };

  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));

  const save = () => {
    setActionError('');
    if (!canSave) return;
    try {
      const previousRequest = loadRequests().find((request) => request.id === companion.lastSubmittedRequestId);
      const alreadyCreated = new Set(units.map((unit) => unit.id));
      const coveredUnitIds = new Set((previousRequest?.unitDrafts || []).map((unit) => String(unit.id || '')));
      const unrequestedUnits = draft.unitDrafts.filter(
        (unit) => !alreadyCreated.has(unit.tempId) && !coveredUnitIds.has(unit.tempId),
      );
      const isFirstRequest = !previousRequest;
      const shouldSubmit = isFirstRequest || unrequestedUnits.length > 0;

      // A follow-up request covers only newly added units, so it cannot restart
      // the trial clock for units that were already submitted or approved.
      if (shouldSubmit) {
        const requestUnits = isFirstRequest ? draft.unitDrafts : unrequestedUnits;
        const newRequestType: SubscriptionRequestType = isFirstRequest
          ? (requestType as SubscriptionRequestType)
          : 'department';
        const { request } = submitRequest({
          phone: companion.phone || '',
          requestType: newRequestType,
          institutionName: draft.institutionName,
          unitDrafts: requestUnits.map((unit) => ({
            id: unit.tempId,
            name: unit.name,
            typeLabel: unitTypeLabel(unit),
            beds: unit.beds,
            receivesOperations: unitReceivesOperations(companion, unit.tempId),
          })),
          doctorsCount: isFirstRequest && newRequestType !== 'department' ? companion.doctorsCount || 0 : 0,
          clinicServices: isFirstRequest && newRequestType !== 'department' ? companion.clinicServices || [] : [],
          chosenPaymentMethod: companion.paymentMethod as PaymentMethodChoice,
          actorUid: currentUser?.userId,
          actorName: currentUser?.name,
          actorEmail: currentUser?.email,
        });
        const updated = saveSetupCompanion({
          lastSubmittedRequestId: request.id,
          lastSubmittedAtMs: request.submittedAtMs,
        });
        setCompanion(updated);
      }

      // 2) Create preview units and beds in this browser only. The cloud sync
      //    bridge is disabled in local preview, and stable IDs keep renewal
      //    scopes attached to their unit.
      const created = createUnitsFromDraft(draft, units, undefined, currentUser?.userId);
      const createdCount = addPreviewUnits(created);
      const withSteps = REQUIRED_STEPS.reduce((acc, required) => markStepCompleted(acc, required), draft);
      setDraft(saveDraft(withSteps));
      setSaved({
        count: createdCount,
        totalBeds: created.reduce((sum, unit) => sum + (Number(unit.totalBeds) || 0), 0),
      });
    } catch (error) {
      setSaved(null);
      setActionError(friendlySaveError(error));
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

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Local preview data — saved on this device only, not synced.
        </p>
      </div>

      {requestSubmitted && (
        <div className="rounded-3xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="h-4 w-4 shrink-0" />
            {TRIAL_NOTICE}
          </p>
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Institution setup</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Start with a subscription request, add the institution and units, then review. Nothing is created in the cloud.
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
        {step.id === 'request' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Subscription request</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Submitting starts a 3-day local preview trial. No payment is recorded; activation requires owner approval.
              </p>
            </div>

            <div>
              <span className={labelClass}>Request type</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {REQUEST_TYPE_OPTIONS.map((option) => {
                  const selected = requestType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateCompanion({ requestType: option.id })}
                      className={`rounded-2xl border p-3 text-start transition ${
                        selected
                          ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-500/10'
                          : 'border-slate-200 hover:border-cyan-300 dark:border-slate-700'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        {option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <FieldError message={companionStepCheck.errors.requestType} />
            </div>

            <div>
              <label className={labelClass} htmlFor="setup-phone">
                Contact phone number
              </label>
              <input
                id="setup-phone"
                className={inputClass}
                value={companion.phone || ''}
                onChange={(event) => updateCompanion({ phone: event.target.value })}
                inputMode="tel"
                placeholder="e.g. 01012345678"
              />
              <FieldError message={companionStepCheck.errors.phone} />
            </div>

            {requestType === 'clinic' && (
              <div>
                <label className={labelClass} htmlFor="setup-clinic-name">
                  Clinic name
                </label>
                <input
                  id="setup-clinic-name"
                  className={inputClass}
                  value={draft.institutionName}
                  onChange={(event) => update({ institutionName: event.target.value })}
                  placeholder="e.g. Dr. Mahmoud's Clinic"
                />
              </div>
            )}

            {(requestType === 'clinic' || requestType === 'both') && (
              <>
                <div>
                  <label className={labelClass} htmlFor="setup-doctors-count">
                    Number of clinic doctors
                  </label>
                  <input
                    id="setup-doctors-count"
                    type="number"
                    min={1}
                    max={200}
                    className={inputClass}
                    value={companion.doctorsCount ?? ''}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      updateCompanion({
                        doctorsCount: Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0,
                      });
                    }}
                  />
                  <FieldError message={companionStepCheck.errors.doctorsCount} />
                </div>

                <div>
                  <label className={labelClass} htmlFor="setup-service-input">
                    Clinic services (optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="setup-service-input"
                      className={inputClass}
                      value={serviceInput}
                      onChange={(event) => setServiceInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addService();
                        }
                      }}
                      placeholder="e.g. Cardiology consultations"
                    />
                    <button
                      type="button"
                      onClick={addService}
                      className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-600"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {companion.clinicServices && companion.clinicServices.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {companion.clinicServices.map((label) => (
                        <li
                          key={label}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => removeService(label)}
                            aria-label={`remove ${label}`}
                            className="text-slate-400 transition hover:text-rose-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {(requestType === 'department' || requestType === 'both') && (
              <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Add units in the next step. Each unit is priced on its own line.
              </p>
            )}
          </div>
        )}

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
                className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-600"
              >
                <Plus className="h-4 w-4" />
                Add unit
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

                      {(requestType === 'department' || requestType === 'both') && (
                        <label className="flex items-center gap-2 self-end rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-cyan-600"
                            checked={receivesOperations}
                            onChange={(event) => toggleUnitOperations(unit.tempId, event.target.checked)}
                          />
                          Unit receives operations
                        </label>
                      )}
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

        {step.id === 'payment' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Payment method</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose a method to see the total. The 30-day price depends on the selected method.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { id: 'instapay' as const, title: 'InstaPay', hint: 'EGP 500 per unit or doctor / 30 days' },
                  { id: 'visa' as const, title: 'Visa', hint: 'USD 20 per unit or doctor / 30 days — contact the owner' },
                ]
              ).map((option) => {
                const selected = companion.paymentMethod === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateCompanion({ paymentMethod: option.id })}
                    className={`rounded-2xl border p-3 text-start transition ${
                      selected
                        ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-500/10'
                        : 'border-slate-200 hover:border-cyan-300 dark:border-slate-700'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {companion.paymentMethod ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  {AWAITING_CONFIRMATION_NOTE}
                </p>
                <ul className="space-y-1 text-sm">
                  {lineItems.length === 0 && (
                    <li className="text-xs text-slate-500 dark:text-slate-400">
                      No priced lines yet — add details in earlier steps.
                    </li>
                  )}
                  {lineItems.map((item) => (
                    <li
                      key={item.area}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                    >
                      <span className="text-slate-700 dark:text-slate-200">{lineItemLabel(item.area)}</span>
                      <span className="text-slate-800 dark:text-slate-100">
                        {item.quantity} × {item.unitPrice} {item.currency} = {item.subtotal} {item.currency}
                      </span>
                    </li>
                  ))}
                  {requestType === 'both' && lineItems.length === 2 && (
                    <li className="flex items-center justify-between rounded-xl bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-200">
                      <span>Total</span>
                      <span>
                        {totalLine} {lineCurrency}
                      </span>
                    </li>
                  )}
                </ul>

                {companion.paymentMethod === 'instapay' ? (
                  <div className="space-y-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200">
                    <p>
                      InstaPay transfer link:{' '}
                      <a
                        href={INSTAPAY_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {INSTAPAY_LINK}
                      </a>
                    </p>
                    <p>
                      Beneficiary: <b>{INSTAPAY_BENEFICIARY}</b>
                    </p>
                    <p className="font-semibold">{INSTAPAY_WARNING}</p>
                    <p>
                      For questions or alternatives, contact the owner on WhatsApp:{' '}
                      <a
                        href={WHATSAPP_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {WHATSAPP_LABEL}
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <p className="font-semibold">{VISA_NOT_LIVE_NOTE}</p>
                    <p>
                      WhatsApp:{' '}
                      <a
                        href={WHATSAPP_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {WHATSAPP_LABEL}
                      </a>
                    </p>
                    <p>No payment is processed in the app. A Visa provider is not connected in this preview.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {companionStepCheck.ok ? 'Choose a payment method to see the itemized price.' : ''}
              </p>
            )}
          </div>
        )}

        {step.id === 'review' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Review</h2>

            <div>
              <SummaryRow label="Request type" value={requestType ? REQUEST_TYPE_LABEL[requestType] : '—'} />
              <SummaryRow label="Phone" value={companion.phone || '—'} />
              <SummaryRow label="Institution" value={draft.institutionName || '—'} />
              <SummaryRow label="Admin" value={draft.adminName || '—'} />
              <SummaryRow label="Email" value={draft.adminEmail || '—'} />
              <SummaryRow label="Team size" value={String(draft.teamSize)} />
              {(requestType === 'clinic' || requestType === 'both') && (
                <SummaryRow label="Doctors" value={String(companion.doctorsCount ?? '—')} />
              )}
              {(requestType === 'clinic' || requestType === 'both') && (
                <SummaryRow
                  label="Clinic services"
                  value={companion.clinicServices?.length ? companion.clinicServices.join(', ') : '—'}
                />
              )}
              <SummaryRow
                label="Payment method"
                value={companion.paymentMethod ? PAYMENT_METHOD_LABEL[companion.paymentMethod] : '—'}
              />
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

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Itemized pricing (per chosen method)
              </p>
              <ul className="space-y-1">
                {lineItems.map((item) => (
                  <li
                    key={item.area}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                  >
                    <span className="text-slate-700 dark:text-slate-200">{lineItemLabel(item.area)}</span>
                    <span className="text-slate-800 dark:text-slate-100">
                      {item.quantity} × {item.unitPrice} {item.currency} = {item.subtotal} {item.currency}
                    </span>
                  </li>
                ))}
                {requestType === 'both' && lineItems.length === 2 && (
                  <li className="flex items-center justify-between rounded-xl bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-200">
                    <span>Total</span>
                    <span>
                      {totalLine} {lineCurrency}
                    </span>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{AWAITING_CONFIRMATION_NOTE}</p>
            </div>

            {validation.ok && companionSaveCheck.ok ? (
              <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                {requestSubmitted
                  ? 'Ready to save the units locally (request already submitted).'
                  : 'Ready to save: the request will be stored locally and a 3-day trial will start.'}
              </p>
            ) : (
              <div className="space-y-1 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {Object.entries(companionSaveCheck.errors).map(([key, message]) => (
                  <p key={`companion-${key}`} className="flex items-start gap-1">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {message}
                  </p>
                ))}
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

        {step.id !== 'request' && step.id !== 'review' && Object.entries(companionStepCheck.errors).length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="mb-1 flex items-center gap-1 font-semibold">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              The subscription request is incomplete. Return to the first step:
            </p>
            {Object.entries(companionStepCheck.errors).map(([key, message]) => (
              <p key={`companion-banner-${key}`}>
                {REQUEST_ERROR_LABEL[key] || 'Subscription request'}: {message}
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
              Setup saved locally — {saved.count} {saved.count === 1 ? 'unit' : 'units'} and {saved.totalBeds} beds are now available in this preview.
            </span>
          )}
          {saved && requestSubmitted && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <ClipboardList className="h-4 w-4" />
              {TRIAL_NOTICE}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Check className="h-4 w-4" />
            {requestSubmitted ? 'Save setup' : 'Submit request and save setup'}
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

const REQUEST_ERROR_LABEL: Record<string, string> = {
  requestType: 'Request type',
  phone: 'Contact phone',
  doctorsCount: 'Doctor count',
  units: 'Units',
  paymentMethod: 'Payment method',
};

export default InstitutionSetupView;
