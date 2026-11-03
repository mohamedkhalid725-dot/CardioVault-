import { useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw, ShieldCheck, RotateCcw } from 'lucide-react';
import type { Unit } from '../../types/clinical';
import { getActiveWorkspaceId, isMasterAccount } from '../../services/workspaceAccess';
import { getUnitLicense, issueUnitLicenseCode, previewUnitLicenseReset, redeemUnitLicenseCode, resetEligibleUnitLicenses } from '../../services/unitLicenseCloud';
import { unitLicenseState, type UnitLicenseRecord } from '../../services/unitLicense';
import { useApp } from '../../context/AppContext';

export const UnitLicensePanel: React.FC<{ units: Unit[] }> = ({ units }) => {
  const { showToast, groupUnitsByHospital } = useApp();
  const [isOwner, setIsOwner] = useState(false);
  const [licenses, setLicenses] = useState<Record<string, UnitLicenseRecord | null>>({});
  const [busyUnit, setBusyUnit] = useState('');
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const workspaceId = getActiveWorkspaceId();

  const refresh = async () => {
    const owner = await isMasterAccount().catch(() => false);
    setIsOwner(owner);
    if (!owner) return;
    const entries = await Promise.all(units.map(async unit => [unit.id, await getUnitLicense(workspaceId, unit.id)] as const));
    setLicenses(Object.fromEntries(entries));
  };

  useEffect(() => { void refresh(); }, [workspaceId, units]);

  const issueCode = async (unit: Unit) => {
    setBusyUnit(unit.id);
    try {
      const result = await issueUnitLicenseCode(unit.id, { workspaceId });
      setIssuedCodes(previous => ({ ...previous, [unit.id]: result.code }));
      showToast(`One-use activation code for ${unit.name} created. Enter it here to activate the unit.`, 'success');
    } catch (error) {
      showToast(`Could not issue a code for ${unit.name}: ${String((error as any)?.message || error)}`, 'error');
    } finally { setBusyUnit(''); }
  };

  const redeemCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setRedeeming(true);
    try {
      const license = await redeemUnitLicenseCode(codeInput);
      setCodeInput('');
      showToast(`Unit license activated through ${new Date(license.expiresAtMs).toLocaleDateString()}. Memberships were not changed.`, 'success');
      window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));
      if (isOwner) await refresh();
    } catch (error) {
      showToast(`Could not redeem unit code: ${String((error as any)?.message || error)}`, 'error');
    } finally { setRedeeming(false); }
  };

  const resetLicenses = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const preview = await previewUnitLicenseReset();
      if (!preview.eligibleUnitIds.length && !preview.activeCodesToCancel) {
        showToast('No non-deleted units or active CVL codes were found. No licenses were changed.', 'info');
        return;
      }
      const confirmed = window.confirm(
        `Start a new 30-day license for ${preview.eligibleUnitIds.length} eligible unit(s) now, and cancel ${preview.activeCodesToCancel} unused CVL code(s)? Memberships and pending approval status will not change. This cannot be undone.`,
      );
      if (!confirmed) return;
      const result = await resetEligibleUnitLicenses(preview);
      const partial = result.failedUnitIds.length > 0 || result.failedCodeIds.length > 0;
      const detail = `${result.unitCount} unit(s) reset; ${result.cancelledCodeCount} code(s) cancelled.`;
      const failures = [result.failedUnitIds.length ? `${result.failedUnitIds.length} unit(s) failed` : '', result.failedCodeIds.length ? `${result.failedCodeIds.length} code(s) failed` : ''].filter(Boolean).join('; ');
      showToast(partial ? `Reset partially completed: ${detail} ${failures}. Refresh and retry.` : `Reset complete: ${detail}`, partial ? 'warning' : 'success');
      window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));
      await refresh();
    } catch (error) {
      showToast(`Could not reset unit licenses: ${String((error as any)?.message || error)}`, 'error');
    } finally { setResetting(false); }
  };

  return <section className="rounded-2xl border border-cyan-500/25 bg-white dark:bg-[#111c2e] p-4 space-y-3">
    <h2 className="flex items-center gap-2 font-extrabold"><KeyRound size={17} className="text-cyan-500" /> Unit licenses <span className="text-[10px] font-semibold text-slate-500">30 days · all unit members</span></h2>
    <p className="text-xs text-slate-500 dark:text-slate-400">Expired units are locked for their members without removing membership. Only the platform owner issues and activates one-use codes.</p>
    {isOwner && <form onSubmit={redeemCode} className="flex flex-wrap gap-2"><input aria-label="Unit license code" value={codeInput} onChange={event => setCodeInput(event.target.value.toUpperCase())} placeholder="CVL-…" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm font-mono dark:border-slate-700" /><button disabled={redeeming || !codeInput.trim()} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{redeeming ? 'Activating…' : 'Activate code'}</button></form>}
    {isOwner && <>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-950/15">
      <p className="text-xs text-slate-600 dark:text-slate-300">One-time reset: every non-deleted unit starts at 30 days, even if it currently has no beds. Memberships and pending status stay unchanged; unused CVL codes are cancelled.</p>
      <button type="button" disabled={resetting} onClick={() => void resetLicenses()} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 disabled:opacity-50">
        {resetting ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}{resetting ? 'Resetting…' : 'Reset eligible licenses'}
      </button>
    </div>
     {groupUnitsByHospital(units).map(group=><div key={group.hospital?.id||'unassigned'} className="space-y-2"><h3 className="pt-2 text-[11px] font-black uppercase tracking-wide text-slate-500">{group.hospital?.name||'Unassigned hospital'}</h3>{group.units.map(unit => {
      const license = licenses[unit.id];
      const state = unitLicenseState(license, Date.now());
      return <div key={unit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div><div className="font-bold text-sm">{unit.name}</div><div className="text-[11px] text-slate-500">{state === 'missing' ? 'Needs initial activation' : `${state === 'active' ? 'Active until' : 'Expired'} ${new Date(license!.expiresAtMs).toLocaleString()}`}</div></div>
        <div className="flex items-center gap-2"><button type="button" disabled={busyUnit === unit.id} onClick={() => void issueCode(unit)} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><ShieldCheck size={14} />{busyUnit === unit.id ? <RefreshCw size={13} className="animate-spin" /> : 'Issue unit code'}</button>{issuedCodes[unit.id] && <button type="button" onClick={() => { void navigator.clipboard?.writeText(issuedCodes[unit.id]); showToast('Unit code copied.', 'success'); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono dark:border-slate-700"><Copy size={13} />{issuedCodes[unit.id]}</button>}</div>
      </div>;
     })}</div>)}
    </>}
  </section>;
};
