import { useState } from 'react';
import { Clock, Eye, EyeOff, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { describeAreaEntitlement, describeUnitEntitlement, subscriptionHistoryExists } from '../../services/subscriptionRequests';
import { CODE_VALID_DAYS, GRACE_DAYS, TRIAL_DAYS } from '../../types/clinicArea';
import {
  readClockOverrideMs,
  clearClockOverrideMs,
  writeClockOverrideMs,
  previewNowMs,
} from '../../services/previewClock';

/**
 * Small per-area entitlement banner (plan §7/§8 lifecycle display).
 *
 * Shows one line each for the department and clinic areas: trial / active /
 * grace / read-only, with the honest end date where one exists. Everything is
 * computed from the local records via the service — no network call of any
 * kind happens here.
 *
 * It also hosts a DEV-ONLY collapsible "Local preview clock" override so the
 * 3-day trial, 30-day code period and 3-day grace can be fast-forwarded for
 * lifecycle testing without waiting real days (previewClock.override).
 */

const AREA_LABEL: Record<'department' | 'clinic', string> = {
  department: 'Department summary',
  clinic: 'Clinic',
};

const STATE_LABEL: Record<string, string> = {
  trial: 'Trial',
  active: 'Active',
  grace: 'Renewal grace',
  'read-only': 'Read-only',
  demo: 'Preview access',
};

interface AreaLine {
  area: 'department' | 'clinic';
  state: string;
  detail: string;
  className: string;
}

function describeArea(area: 'department' | 'clinic', nowMs: number, subscriberId?: string): AreaLine {
  if (!subscriptionHistoryExists(undefined, subscriberId)) {
    return { area, state: 'demo', detail: 'Local preview access is open for this demo account.', className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' };
  }
  const { state, untilMs } = describeAreaEntitlement(area, nowMs, undefined, subscriberId);
  const fmt = (ms: number): string => new Date(ms).toLocaleString();
  const detail =
    state === 'trial'
      ? `Free trial for ${TRIAL_DAYS} days · ends ${untilMs ? fmt(untilMs) : '—'}`
      : state === 'active'
        ? `Active · code valid for ${CODE_VALID_DAYS} days · expires ${untilMs ? fmt(untilMs) : '—'}`
        : state === 'grace'
          ? `Expired · ${GRACE_DAYS}-day renewal grace (expired ${untilMs ? fmt(untilMs) : '—'})`
          : 'Read-only · no active code or trial; access resumes after owner approval';
  const className =
    state === 'trial'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : state === 'active'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        : state === 'grace'
          ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30'
          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30';
  return { area, state, detail, className };
}

const toLocalInputValue = (ms: number): string => {
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const EntitlementNotice = () => {
  const { currentUser, units } = useApp();
  const subscriberId = String(currentUser?.userId || '').trim() || undefined;
  const [nowMs, setNowMs] = useState<number>(() => readClockOverrideMs() ?? previewNowMs());
  const [clockOpen, setClockOpen] = useState(false);
  const [clockInput, setClockInput] = useState<string>(() => toLocalInputValue(readClockOverrideMs() ?? previewNowMs()));

  const areas: AreaLine[] = [describeArea('department', nowMs, subscriberId), describeArea('clinic', nowMs, subscriberId)];

  const applyClock = () => {
    const parsed = Date.parse(clockInput);
    if (!Number.isFinite(parsed)) return;
    writeClockOverrideMs(parsed);
    setNowMs(parsed);
  };

  const resetClock = () => {
    clearClockOverrideMs();
    setNowMs(previewNowMs());
    setClockInput(toLocalInputValue(previewNowMs()));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {areas.map((area) => (
          <div
            key={area.area}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${area.className}`}
          >
            <span className="font-semibold">
              {AREA_LABEL[area.area]} · {STATE_LABEL[area.state] || area.state}
            </span>
            <span>{area.detail}</span>
          </div>
        ))}
        {units.map((unit) => {
          const entitlement = describeUnitEntitlement(unit.id, nowMs, undefined, subscriberId);
          const hasHistory = subscriptionHistoryExists(undefined, subscriberId);
          const unitState = hasHistory ? entitlement.state : 'demo';
          return (
            <div key={unit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-300">
              <span className="font-semibold">Unit · {unit.name} · {STATE_LABEL[unitState]}</span>
              <span>{!hasHistory ? 'Local preview demo access' : entitlement.untilMs ? `Access through ${new Date(entitlement.untilMs).toLocaleString()}` : 'No active trial or subscription'}</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#111C2E]">
        <button
          type="button"
          onClick={() => setClockOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-300"
        >
          <span className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-cyan-500" />
            Local preview clock (dev only)
          </span>
          <span className="flex items-center gap-1">
            {clockOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {clockClockLabel(nowMs)}
          </span>
        </button>

        {clockOpen ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Set a simulated local time to preview the {TRIAL_DAYS}-day trial, {CODE_VALID_DAYS}-day code and
              {GRACE_DAYS}-day grace period without waiting. This control makes no network calls.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="datetime-local"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-[#0B1526] dark:text-slate-100"
                value={clockInput}
                onChange={(event) => setClockInput(event.target.value)}
              />
              <button
                type="button"
                onClick={applyClock}
                className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600"
              >
                <Clock className="h-3.5 w-3.5" />
                Set preview time
              </button>
              <button
                type="button"
                onClick={resetClock}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-400 hover:text-rose-500 dark:border-slate-700 dark:text-slate-300"
              >
                Reset time
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const clockClockLabel = (ms: number): string => new Date(ms).toLocaleString();

export default EntitlementNotice;
