import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Cloud, HardDrive, KeyRound, ShieldAlert, XCircle } from 'lucide-react';
import { isLocalPreview } from '../../config/localPreview';
import { computeEntitlementState, describeUnitEntitlement, issueCode, loadCodes, loadRequests, revokeCode, setPaymentVerified } from '../../services/subscriptionRequests';
import {
  describeCloudReason,
  loadOwnerQueueFromCloud,
  localCodesForRequest,
  pushOwnerDecision,
} from '../../services/subscriptionRequestCloud';
import { getActiveWorkspaceId, isMasterAccount } from '../../services/workspaceAccess';
import { previewNowMs } from '../../services/previewClock';
import type { OwnerApprovalArea, SubscriptionCodeRecord, SubscriptionRequest, SubscriptionRequestType } from '../../types/clinicArea';

const REQUEST_TYPE_LABEL: Record<SubscriptionRequestType, string> = {
  department: 'Department',
  clinic: 'Clinic',
  both: 'Department and clinic',
};
const cardClass = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#111C2E]';
const buttonClass = 'inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition';
const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = (ms: number): string => new Date(ms).toLocaleDateString();
const formatDateTime = (ms: number): string => new Date(ms).toLocaleString();
const unitKey = (request: SubscriptionRequest, index: number): string =>
  String(request.unitDrafts[index]?.id || `${request.id}:unit-${index + 1}`);
const expiryMs = (code: SubscriptionCodeRecord): number =>
  code.expiresAtMs ?? ((code.startsAtMs ?? code.issuedAtMs) + code.validForDays * DAY_MS);
const remaining = (expiresAtMs: number, nowMs: number): string => {
  const days = Math.max(0, Math.ceil((expiresAtMs - nowMs) / DAY_MS));
  return days === 1 ? '1 day left' : `${days} days left`;
};
const codeTiming = (code: SubscriptionCodeRecord, nowMs: number): string => {
  const startsAtMs = code.startsAtMs ?? code.issuedAtMs;
  if (startsAtMs > nowMs) {
    const days = Math.max(0, Math.ceil((startsAtMs - nowMs) / DAY_MS));
    return `Starts in ${days} days · then 30 days`;
  }
  return `${remaining(expiryMs(code), nowMs)} · expires ${formatDate(expiryMs(code))}`;
};

function storedWorkspaceRole(): string {
  try {
    const raw = localStorage.getItem('cardiovault_active_workspace_access_v1');
    const access = raw ? JSON.parse(raw) : null;
    return String(access?.role || '');
  } catch {
    return '';
  }
}

export const OwnerRequestsPanel = () => {
  // The panel is for the platform owner (firestore.rules: adminOf == the
  // platformOwners document) and, in the isolated preview, for the fake owner.
  const [ownerOnly, setOwnerOnly] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>(() => loadRequests());
  const [codes, setCodes] = useState<SubscriptionCodeRecord[]>(() => loadCodes());
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(loadRequests().map((request) => [request.id, request.unitDrafts.map((_, index) => unitKey(request, index))])),
  );
  const [notice, setNotice] = useState('');
  const [queueState, setQueueState] = useState<'loading' | 'cloud' | 'device'>('loading');
  const [busyId, setBusyId] = useState('');
  const nowMs = previewNowMs();
  const workspaceId = getActiveWorkspaceId();

  useEffect(() => {
    let alive = true;
    void (async () => {
      let owner = false;
      if (isLocalPreview()) {
        owner = storedWorkspaceRole() === 'owner';
      } else {
        owner = await isMasterAccount().catch(() => false);
      }
      if (!alive) return;
      setOwnerOnly(owner);
      if (!owner) return;

      const result = await loadOwnerQueueFromCloud({ workspaceId }).catch(() => null);
      if (!alive) return;
      const nextRequests = loadRequests();
      setRequests(nextRequests);
      setCodes(loadCodes());
      setSelectedUnits((current) => ({
        ...Object.fromEntries(nextRequests.map((request) => [request.id, request.unitDrafts.map((_, index) => unitKey(request, index))])),
        ...current,
      }));
      setQueueState(result?.ok ? 'cloud' : 'device');
      if (result && !result.ok) setNotice(describeCloudReason(result.reason));
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const reload = () => {
    const nextRequests = loadRequests();
    setRequests(nextRequests);
    setCodes(loadCodes());
    setSelectedUnits((current) => ({
      ...Object.fromEntries(nextRequests.map((request) => [request.id, request.unitDrafts.map((_, index) => unitKey(request, index))])),
      ...current,
    }));
  };

  /** Copies the decision to Firestore and reports honestly when it failed. */
  const publish = async (request: SubscriptionRequest, patch: Record<string, any>): Promise<string> => {
    const result = await pushOwnerDecision({ requestId: request.id, workspaceId, patch }).catch(() => null);
    if (result?.ok) {
      setQueueState('cloud');
      return '';
    }
    setQueueState('device');
    return ` ${describeCloudReason(result?.reason || 'write-failed')} The member device will not see this change until it succeeds.`;
  };

  const approve = async (request: SubscriptionRequest, area: OwnerApprovalArea) => {
    setNotice('');
    setBusyId(request.id);
    try {
      const unitIds = selectedUnits[request.id] || [];
      if (area !== 'clinic' && unitIds.length === 0) throw new Error('Select at least one department unit.');
      const { codes: created, persisted } = issueCode({ requestId: request.id, area, unitIds });
      reload();
      const scopes = created.map((code) => code.unitName || (code.area === 'clinic' ? 'Clinic' : 'Department unit'));
      const cloudNote = await publish(request, {
        status: 'approved',
        approvedAtMs: Date.now(),
        codes: localCodesForRequest(request.id),
      });
      setNotice(
        `${created.length} activation code${created.length === 1 ? '' : 's'} issued for ${scopes.join(', ')}.` +
          `${persisted ? '' : ' The browser could not persist this change.'}${cloudNote}`,
      );
    } catch (error) {
      setNotice(String((error as Error)?.message || 'Could not issue the activation code.'));
    } finally {
      setBusyId('');
    }
  };

  const verifyPayment = async (request: SubscriptionRequest, verified: boolean) => {
    setNotice('');
    setBusyId(request.id);
    try {
      const result = setPaymentVerified({ requestId: request.id, verified, actorName: 'Platform owner' });
      reload();
      const cloudNote = await publish(request, {
        paymentVerified: verified,
        paymentVerifiedAtMs: verified ? result.request.paymentVerifiedAtMs || Date.now() : null,
        paymentVerifiedBy: verified ? result.request.paymentVerifiedBy || 'Platform owner' : null,
      });
      setNotice(
        (verified
          ? `Manual payment confirmation recorded for ${request.institutionName}. No provider transaction was checked by the app.`
          : `Manual payment confirmation removed for ${request.institutionName}.`) +
          `${result.persisted ? '' : ' The browser could not persist this change.'}${cloudNote}`,
      );
    } catch (error) {
      setNotice(String((error as Error)?.message || 'Could not update the manual payment confirmation.'));
    } finally {
      setBusyId('');
    }
  };

  const doRevoke = async (request: SubscriptionRequest, code: SubscriptionCodeRecord) => {
    const scope = code.unitName || (code.area === 'clinic' ? 'Clinic' : 'all department units');
    if (!window.confirm(`Revoke this ${scope} subscription now? Access to that scope becomes read-only immediately.`)) return;
    setBusyId(request.id);
    try {
      const { persisted } = revokeCode({ codeId: code.id, reason: 'owner-panel' });
      reload();
      const cloudNote = await publish(request, { codes: localCodesForRequest(request.id) });
      setNotice(`Subscription access revoked for ${scope}.${persisted ? '' : ' The browser could not persist this change.'}${cloudNote}`);
    } catch (error) {
      setNotice(String((error as Error)?.message || 'Could not revoke the code.'));
    } finally {
      setBusyId('');
    }
  };

  const statusForRequest = (request: SubscriptionRequest): string => {
    const areaStates: string[] = [];
    if (request.requestType !== 'clinic') {
      for (let index = 0; index < request.unitDrafts.length; index += 1) {
        areaStates.push(describeUnitEntitlement(unitKey(request, index), nowMs, undefined, request.createdBy).state);
      }
    }
    if (request.requestType !== 'department') areaStates.push(computeEntitlementState('clinic', nowMs, undefined, request.createdBy));
    return [...new Set(areaStates)].join(' · ') || 'No active scope';
  };

  const sortedRequests = useMemo(() => [...requests].reverse(), [requests]);

  if (ownerOnly === null) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Owner panel</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Checking platform owner access…</p>
      </div>
    );
  }

  if (!ownerOnly) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Owner panel unavailable</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          This panel is restricted to the platform owner account. Subscription requests are stored in the workspace database and only the owner may read the queue or decide it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Owner panel — subscriptions</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review the subscriber contact details, select the department units to approve or renew, and issue a 30-day code. Confirm the external payment first: codes stay disabled until you do.
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Workspace queue: {workspaceId}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold ${
            queueState === 'cloud'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
          }`}>
            {queueState === 'cloud' ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
            {queueState === 'loading' ? 'LOADING' : queueState === 'cloud' ? 'CLOUD QUEUE' : 'THIS DEVICE'}
          </span>
        </div>
        {notice ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{notice}</p> : null}
      </div>

      {sortedRequests.length === 0 ? (
        <div className={cardClass}><p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No subscription request is stored for this workspace yet.</p></div>
      ) : sortedRequests.map((request) => {
        const requestCodes = codes.filter((code) => code.requestId === request.id);
        const selected = new Set(selectedUnits[request.id] || []);
        const busy = busyId === request.id;
        return (
          <section key={request.id} className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <ClipboardList className="h-4 w-4 text-cyan-500" />
                  {request.createdByName || request.institutionName}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{REQUEST_TYPE_LABEL[request.requestType]}</span>
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{request.institutionName} · {request.phone}{request.createdByEmail ? ` · ${request.createdByEmail}` : ''}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Submitted {formatDateTime(request.submittedAtMs)} · {request.isRenewal || request.trialEligible === false ? 'Renewal request — no new trial' : `Trial started ${formatDate(request.trialStartedAtMs)}`} · Status: {statusForRequest(request)}</p>
              </div>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">{request.paymentMethod.toUpperCase()}</span>
            </div>

            <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-200">
              <p className="font-semibold">Payment is checked manually outside the app.</p>
              <p className="mt-1">{request.paymentVerifiedAtMs
                ? `Confirmed by ${request.paymentVerifiedBy || 'the owner'} on ${formatDateTime(request.paymentVerifiedAtMs)}.`
                : 'Not confirmed yet. Activation and renewal codes stay disabled until the owner records this check.'}</p>
              <button type="button" disabled={busy} onClick={() => void verifyPayment(request, !request.paymentVerifiedAtMs)} className={`${buttonClass} mt-2 disabled:opacity-40 ${request.paymentVerifiedAtMs ? 'border border-amber-500/40 bg-white text-amber-900 dark:bg-slate-900 dark:text-amber-200' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                {request.paymentVerifiedAtMs ? 'Remove payment confirmation' : 'Confirm external payment'}
              </button>
            </div>

            {request.unitDrafts.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Department units — select the units covered by this approval or renewal</p>
                {request.unitDrafts.map((unit, index) => {
                  const id = unitKey(request, index);
                  const entitlement = describeUnitEntitlement(id, nowMs, undefined, request.createdBy);
                  const unitCode = codes.filter((code) => code.area === 'department' && code.unitId === id && code.subscriberId === request.createdBy && code.status === 'active').sort((a, b) => expiryMs(b) - expiryMs(a))[0];
                  return (
                    <label key={id} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                      <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        <input type="checkbox" checked={selected.has(id)} onChange={(event) => setSelectedUnits((state) => ({ ...state, [request.id]: event.target.checked ? [...(state[request.id] || []), id] : (state[request.id] || []).filter((value) => value !== id) }))} />
                        <span>{unit.name || `Unit ${index + 1}`} · {unit.typeLabel}</span>
                        {unit.receivesOperations ? <span className="text-amber-600 dark:text-amber-300">· Operations</span> : null}
                        <span className="text-slate-500 dark:text-slate-400">· {unit.beds} beds</span>
                      </span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {unitCode ? codeTiming(unitCode, nowMs) : `${entitlement.state}${entitlement.untilMs ? ` · until ${formatDate(entitlement.untilMs)}` : ''}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {request.doctorsCount > 0 && (
              (() => {
                const clinicCode = codes.filter((code) => code.area === 'clinic' && code.subscriberId === request.createdBy && code.status === 'active').sort((a, b) => expiryMs(b) - expiryMs(a))[0];
                return <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                  Clinic · {request.doctorsCount} doctors · {request.clinicServices.length ? request.clinicServices.join(', ') : 'No services listed'} · {clinicCode ? codeTiming(clinicCode, nowMs) : computeEntitlementState('clinic', nowMs, undefined, request.createdBy)}
                </p>;
              })()
            )}

            <ul className="mt-3 space-y-1 text-xs">
              {request.lineItems.map((item) => <li key={item.area} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60"><span>{item.area === 'department' ? 'Department units' : 'Clinic doctors'}</span><span>{item.quantity} × {item.unitPrice} {item.currency} / 30 days = {item.subtotal} {item.currency}</span></li>)}
              {request.lineItems.length > 1 && <li className="flex justify-between rounded-lg bg-cyan-50 px-2.5 py-1.5 font-semibold text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-200"><span>Total / 30 days</span><span>{request.lineItems.reduce((sum, item) => sum + item.subtotal, 0)} {request.lineItems[0]?.currency}</span></li>}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              {request.unitDrafts.length > 0 && <button type="button" disabled={busy || !request.paymentVerifiedAtMs} title={!request.paymentVerifiedAtMs ? 'Confirm the external payment first.' : undefined} onClick={() => void approve(request, 'department')} className={`${buttonClass} bg-cyan-500 text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40`}><KeyRound className="h-3.5 w-3.5" />Approve selected units</button>}
              {request.doctorsCount > 0 && <button type="button" disabled={busy || !request.paymentVerifiedAtMs} title={!request.paymentVerifiedAtMs ? 'Confirm the external payment first.' : undefined} onClick={() => void approve(request, 'clinic')} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40`}><KeyRound className="h-3.5 w-3.5" />Approve / renew clinic</button>}
              {request.unitDrafts.length > 0 && request.doctorsCount > 0 && <button type="button" disabled={busy || !request.paymentVerifiedAtMs} title={!request.paymentVerifiedAtMs ? 'Confirm the external payment first.' : undefined} onClick={() => void approve(request, 'both')} className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40`}><KeyRound className="h-3.5 w-3.5" />Approve selected units and clinic</button>}
            </div>

            {requestCodes.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Activation and renewal history</p>
                {[...requestCodes].reverse().map((code) => (
                  <div key={code.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
                    <div><span className="font-mono font-bold text-slate-900 dark:text-white">{code.code}</span><span className="ml-2 text-slate-600 dark:text-slate-300">{code.unitName || (code.area === 'clinic' ? `Clinic · ${code.quantity || request.doctorsCount} doctors` : 'Department')}</span></div>
                    <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span>{code.status} · starts {formatDate(code.startsAtMs ?? code.issuedAtMs)} · expires {formatDate(expiryMs(code))}</span>
                      {code.status === 'active' ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">{codeTiming(code, nowMs)}</span> : null}
                      {code.status !== 'revoked' && <button type="button" disabled={busy} onClick={() => void doRevoke(request, code)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-500/10"><XCircle className="h-3.5 w-3.5" />Revoke scope</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Revoking a scope invalidates all active and queued codes for that scope. Requests and decisions for this workspace live in Firestore and follow the security rules: any signed-in member account can create a request for its own units, and only the platform owner can read the queue, confirm payment or issue codes. If the queue badge shows THIS DEVICE, the cloud copy could not be read and only the local records are shown.
        </p>
      </div>
      <div className="sr-only" aria-live="polite"><CheckCircle2 />{notice}</div>
    </div>
  );
};

export default OwnerRequestsPanel;
