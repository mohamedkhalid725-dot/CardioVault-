import { useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, ExternalLink, MessageCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { buildLineItems, loadRequests, submitRequest } from '../../services/subscriptionRequests';
import { clinicEnabledForUnit } from '../../services/clinicMode';
import { getStoredWorkspaceAccess } from '../../services/workspaceAccess';
import {
  describeCloudReason,
  mirrorSubscriptionRequest,
  syncMemberSubscriptionFromCloud,
} from '../../services/subscriptionRequestCloud';
import type { PaymentMethodChoice, SubscriptionRequest } from '../../types/clinicArea';

const INSTAPAY_LINK = 'https://ipn.eg/S/mohmd272/instapay/2mMDmP';
const INSTAPAY_BENEFICIARY = 'mohmd272@instapay';
const WHATSAPP_LINK = 'https://wa.me/201013040631';
const WHATSAPP_NUMBER = '+201013040631';
const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#111C2E]';
const INPUT = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

interface RenewalScope {
  key: string;
  area: 'department' | 'clinic';
  label: string;
  institutionName: string;
  unitDraft?: SubscriptionRequest['unitDrafts'][number];
  doctorsCount: number;
  clinicServices: string[];
}

export const PaymentPanel = () => {
  const { currentUser, units, setCurrentView } = useApp();
  const subscriberId = String(currentUser?.userId || '').trim();
  const [requests, setRequests] = useState<SubscriptionRequest[]>(() => loadRequests());
  const [scopeKey, setScopeKey] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice | ''>('');
  const [phone, setPhone] = useState('');
  const [clinicDoctors, setClinicDoctors] = useState('1');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [cloudQueue, setCloudQueue] = useState(false);

  // Units this account really belongs to. The security rules accept a request
  // only for `memberUnits(workspaceId)`, so offering anything else would be a
  // guaranteed denial.
  const memberUnitIds = useMemo(() => {
    const access = getStoredWorkspaceAccess();
    const ids = new Set<string>();
    const primary = String(access?.unitId || '').trim();
    if (primary) ids.add(primary);
    for (const id of access?.unitIds || []) {
      const value = String(id || '').trim();
      if (value) ids.add(value);
    }
    return ids;
  }, [units, requests]);

  const clinicUnit = useMemo(
    () => units.find((unit) => memberUnitIds.has(unit.id) && clinicEnabledForUnit(unit)) || null,
    [units, memberUnitIds],
  );

  const memberRequests = useMemo(
    () => requests.filter((request) => request.createdBy === subscriberId),
    [requests, subscriberId],
  );

  const renewalScopes = useMemo<RenewalScope[]>(() => {
    const byUnit = new Map<string, RenewalScope>();

    // 1. Every department unit of this membership. This is what makes the panel
    //    usable on a brand-new device that has no local request history yet.
    for (const unit of units) {
      if (!memberUnitIds.has(unit.id) || clinicEnabledForUnit(unit)) continue;
      const previous = memberRequests
        .filter((request) => request.requestType !== 'clinic')
        .flatMap((request) => request.unitDrafts.map((draft, index) => ({
          request,
          id: String(draft.id || `${request.id}:unit-${index + 1}`),
          draft,
        })))
        .find((entry) => entry.id === unit.id);
      byUnit.set(unit.id, {
        key: `department:${unit.id}`,
        area: 'department',
        label: `Department · ${unit.name}`,
        institutionName: previous?.request.institutionName || unit.name,
        unitDraft: {
          id: unit.id,
          name: unit.name,
          typeLabel: String(unit.type || 'Unit'),
          beds: Math.max(0, Math.trunc(Number(unit.totalBeds) || 0)),
          receivesOperations: previous?.draft.receivesOperations ?? false,
        },
        doctorsCount: 0,
        clinicServices: [],
      });
    }

    // 2. Scopes that only exist in this device's history (older unit ids, or a
    //    clinic request stored before the clinic unit was provisioned).
    for (const request of memberRequests) {
      if (request.requestType === 'clinic') continue;
      request.unitDrafts.forEach((unit, index) => {
        const id = String(unit.id || `${request.id}:unit-${index + 1}`);
        if (byUnit.has(id)) return;
        byUnit.set(id, {
          key: `department:${id}`,
          area: 'department',
          label: `Department · ${unit.name || `Unit ${index + 1}`}`,
          institutionName: request.institutionName,
          unitDraft: { ...unit, id },
          doctorsCount: 0,
          clinicServices: [],
        });
      });
    }

    const scopes = [...byUnit.values()];
    const clinicRequest = [...memberRequests].reverse().find((request) => request.requestType !== 'department');
    const clinicDoctorsCount = clinicRequest?.doctorsCount || Math.max(1, Math.trunc(Number(clinicDoctors) || 1));
    if (clinicUnit || clinicRequest) {
      scopes.push({
        key: clinicUnit ? `clinic:${clinicUnit.id}` : 'clinic',
        area: 'clinic',
        label: `Clinic · ${clinicUnit?.name || clinicRequest?.institutionName || 'Clinic'}`,
        institutionName: clinicRequest?.institutionName || clinicUnit?.name || 'Clinic',
        unitDraft: clinicUnit
          ? {
              id: clinicUnit.id,
              name: clinicUnit.name,
              typeLabel: 'Clinic',
              beds: Math.max(0, Math.trunc(Number(clinicUnit.totalBeds) || 0)),
              receivesOperations: false,
            }
          : undefined,
        doctorsCount: clinicDoctorsCount,
        clinicServices: clinicRequest?.clinicServices || [],
      });
    }
    return scopes;
  }, [units, memberUnitIds, memberRequests, clinicUnit, clinicDoctors]);

  useEffect(() => {
    if (!renewalScopes.some((scope) => scope.key === scopeKey)) setScopeKey(renewalScopes[0]?.key || '');
  }, [renewalScopes, scopeKey]);
  useEffect(() => {
    if (!phone.trim()) setPhone(memberRequests.at(-1)?.phone || '');
  }, [memberRequests, phone]);

  // Owner approvals and codes arrive here, not on the device that submitted
  // them. One pull on open is enough; the shell repeats it periodically.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await syncMemberSubscriptionFromCloud({ subscriberId });
        if (!alive) return;
        if (result.ok && result.fetched > 0) {
          setRequests(loadRequests());
          setCloudQueue(true);
        }
      } catch {
        /* the device cache stays authoritative */
      } finally {
        if (alive) setSyncing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [subscriberId]);

  const selectedScope = renewalScopes.find((scope) => scope.key === scopeKey) || null;

  // A clinic scope created from a membership unit has no stored doctor count, so
  // the member states it here instead of guessing.
  const selectedDoctors = selectedScope
    ? selectedScope.area === 'clinic'
      ? selectedScope.doctorsCount || Math.max(1, Math.trunc(Number(clinicDoctors) || 1))
      : 0
    : 0;

  const lineItems = selectedScope && paymentMethod
    ? buildLineItems(
        selectedScope.area,
        selectedScope.area === 'department' ? 1 : 0,
        selectedScope.area === 'clinic' ? selectedDoctors : 0,
        paymentMethod,
      )
    : [];
  const due = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
  const currency = lineItems[0]?.currency || '';
  const clinicNeedsUnit = selectedScope?.area === 'clinic' && !selectedScope.unitDraft;

  const submitRenewal = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setNotice('');
    if (!selectedScope || !paymentMethod) {
      setNotice('Select a subscription scope and payment method first.');
      return;
    }
    setBusy(true);
    try {
      const submitted = submitRequest({
        phone,
        requestType: selectedScope.area,
        institutionName: selectedScope.institutionName,
        unitDrafts: selectedScope.unitDraft ? [selectedScope.unitDraft] : [],
        doctorsCount: selectedScope.area === 'clinic' ? selectedDoctors : 0,
        clinicServices: selectedScope.clinicServices,
        chosenPaymentMethod: paymentMethod,
        actorUid: subscriberId,
        actorName: currentUser?.name,
        actorEmail: currentUser?.email,
        startTrial: false,
        isRenewal: true,
      });
      setRequests(loadRequests());

      const mirror = await mirrorSubscriptionRequest(submitted.request, { subscriberId });
      if (mirror.ok) {
        setCloudQueue(true);
        setNotice(
          `Renewal request for ${selectedScope.label} was delivered to the owner and is visible from any signed-in device. ` +
            'The owner must confirm payment manually before issuing a new 30-day code.' +
            (submitted.persisted ? '' : ' This browser could not keep a local copy, but the owner copy exists.'),
        );
      } else {
        setNotice(
          `Renewal request for ${selectedScope.label} is saved on this device only. ` +
            `${describeCloudReason(mirror.reason)} ` +
            'The owner must confirm payment manually before issuing a new 30-day code.',
        );
      }
    } catch (error) {
      setNotice(String((error as Error)?.message || 'Could not save the renewal request.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className={CARD}>
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-cyan-500" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Subscription and payment</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose the exact scope to renew, then select a payment method to see the amount for the next 30 days.</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {syncing ? 'Checking the owner queue…' : cloudQueue ? 'Cloud delivery is active for this account.' : 'Showing this device copy.'}
            </p>
          </div>
        </div>

        {renewalScopes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No subscribed unit or clinic is linked to this account yet.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Join a unit with its access code, or start from Institution Setup to submit a department or clinic request.</p>
            <button type="button" onClick={() => setCurrentView('institution-setup')} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-white">
              <Building2 className="h-3.5 w-3.5" /> Open Institution Setup
            </button>
          </div>
        ) : (
          <form onSubmit={submitRenewal} className="mt-4 space-y-3">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Subscription to renew
              <select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)} className={INPUT}>
                {renewalScopes.map((scope) => <option key={scope.key} value={scope.key}>{scope.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Payment method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodChoice | '')} className={INPUT}>
                <option value="">Choose InstaPay or Visa</option>
                <option value="instapay">InstaPay · EGP</option>
                <option value="visa">Visa · USD</option>
              </select>
            </label>
            {selectedScope?.area === 'clinic' && (
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Clinic doctor seats
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={selectedScope.doctorsCount || clinicDoctors}
                  disabled={selectedScope.doctorsCount > 0}
                  onChange={(event) => setClinicDoctors(event.target.value)}
                  className={INPUT}
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  {selectedScope.doctorsCount > 0
                    ? 'Taken from the clinic request already on this account.'
                    : 'How many doctors this clinic subscription covers.'}
                </span>
              </label>
            )}
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Contact phone
              <input required inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 01012345678" className={INPUT} />
            </label>
            {selectedScope && paymentMethod && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Amount for this 30-day period</p>
                <p className="mt-1 text-2xl font-black text-cyan-700 dark:text-cyan-300">{due} {currency}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedScope.area === 'department'
                    ? 'One selected department unit · EGP 500 or USD 20 per unit.'
                    : `${selectedDoctors} clinic doctor(s) · EGP 500 or USD 20 per doctor.`}
                </p>
                {paymentMethod === 'instapay' ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Beneficiary: <b>{INSTAPAY_BENEFICIARY}</b></p>
                    <a href={INSTAPAY_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-600">Open InstaPay <ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Visa checkout is not connected yet. Contact the owner to arrange payment.</p>
                    <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Contact on WhatsApp · {WHATSAPP_NUMBER} <MessageCircle className="h-3.5 w-3.5" /></a>
                  </div>
                )}
                {clinicNeedsUnit && (
                  <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    This account has no clinic unit in its membership. A clinic-only request without a unit cannot be delivered to the owner, so it will stay on this device.
                  </p>
                )}
              </div>
            )}
            {notice && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{notice}</p>}
            <button type="submit" disabled={busy || !paymentMethod} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900">
              {busy ? 'Sending request…' : 'Submit renewal request'}
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          The app never verifies a transfer, never collects card details and never activates a subscription by itself. Renewal requests do not start another free trial. The owner checks the payment manually and then issues a new scope-specific 30-day code. Requests are delivered through the workspace database when this account is signed in; a request the security rules cannot accept is kept on this device and labelled as such.
        </p>
      </section>
    </div>
  );
};

export default PaymentPanel;
