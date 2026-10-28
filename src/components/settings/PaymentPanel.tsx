import { useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, ExternalLink, MessageCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { buildLineItems, loadRequests, submitRequest } from '../../services/subscriptionRequests';
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
  const { currentUser, setCurrentView } = useApp();
  const subscriberId = String(currentUser?.userId || '').trim();
  const [requests, setRequests] = useState<SubscriptionRequest[]>(() => loadRequests());
  const [scopeKey, setScopeKey] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice | ''>('');
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const memberRequests = useMemo(
    () => requests.filter((request) => request.createdBy === subscriberId),
    [requests, subscriberId],
  );
  const renewalScopes = useMemo<RenewalScope[]>(() => {
    const byUnit = new Map<string, RenewalScope>();
    for (const request of memberRequests) {
      if (request.requestType === 'clinic') continue;
      request.unitDrafts.forEach((unit, index) => {
        const id = String(unit.id || `${request.id}:unit-${index + 1}`);
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
    const clinicRequest = [...memberRequests].reverse().find((request) => request.requestType !== 'department');
    const scopes = [...byUnit.values()];
    if (clinicRequest) {
      scopes.push({
        key: 'clinic',
        area: 'clinic',
        label: `Clinic · ${clinicRequest.institutionName}`,
        institutionName: clinicRequest.institutionName,
        doctorsCount: clinicRequest.doctorsCount,
        clinicServices: clinicRequest.clinicServices,
      });
    }
    return scopes;
  }, [memberRequests]);

  useEffect(() => {
    if (!renewalScopes.some((scope) => scope.key === scopeKey)) setScopeKey(renewalScopes[0]?.key || '');
  }, [renewalScopes, scopeKey]);
  useEffect(() => {
    if (!phone.trim()) setPhone(memberRequests.at(-1)?.phone || '');
  }, [memberRequests, phone]);

  const selectedScope = renewalScopes.find((scope) => scope.key === scopeKey) || null;
  const lineItems = selectedScope && paymentMethod
    ? buildLineItems(
        selectedScope.area,
        selectedScope.area === 'department' ? 1 : 0,
        selectedScope.area === 'clinic' ? selectedScope.doctorsCount : 0,
        paymentMethod,
      )
    : [];
  const due = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
  const currency = lineItems[0]?.currency || '';

  const submitRenewal = (event: React.FormEvent): void => {
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
        doctorsCount: selectedScope.area === 'clinic' ? selectedScope.doctorsCount : 0,
        clinicServices: selectedScope.clinicServices,
        chosenPaymentMethod: paymentMethod,
        actorUid: subscriberId,
        actorName: currentUser?.name,
        actorEmail: currentUser?.email,
        startTrial: false,
        isRenewal: true,
      });
      setRequests(loadRequests());
      setNotice(`Renewal request saved locally for ${selectedScope.label}. The owner must confirm payment manually before issuing a new 30-day code.${submitted.persisted ? '' : ' Browser storage could not save this request.'}`);
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
          </div>
        </div>

        {renewalScopes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No previous subscription scope is linked to this local preview account.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Start from Institution Setup to submit a department or clinic request.</p>
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
                    : `${selectedScope.doctorsCount} clinic doctor(s) · EGP 500 or USD 20 per doctor.`}
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
              </div>
            )}
            {notice && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{notice}</p>}
            <button type="submit" disabled={busy || !paymentMethod} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900">
              {busy ? 'Saving request…' : 'Submit renewal request'}
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          This local preview does not verify transfers, collect card details, or activate a subscription. Renewal requests do not start another free trial. The owner must check payment manually and issue a new scope-specific 30-day code. Requests stay in this browser and cannot reach the owner on another device.
        </p>
      </section>
    </div>
  );
};

export default PaymentPanel;
