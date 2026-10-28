import React from 'react';
import { CalendarDays, Clock, Info } from 'lucide-react';
import type {
  AppointmentStatus,
  ClinicAppointment,
  ClinicConsultation,
} from '../../types/departmentTeam';
import { previewNowMs } from '../../services/previewClock';
import {
  todayAppointments,
  todayCounters,
  upcomingBookedDays,
  waitingTodayCount,
  localDayStart,
} from '../../services/clinicDashboard';

/**
 * Clinic dashboard tab — local preview.
 *
 * Presentational aggregation of the same on-device appointment/consultation
 * records Clinic Mode already stores. Nothing here mutates data; counts are
 * honest and empty states say so. The interface is English and left-to-right.
 */

interface ClinicDashboardProps {
  appointments: ClinicAppointment[];
  consultations?: ClinicConsultation[];
  /** Unit id → display name, resolved by the parent screen. */
  unitLabelById?: Record<string, string>;
  /** Injectable clock (preview override aware); defaults to previewNowMs(). */
  nowMs?: number;
}

const CARD =
  'bg-white dark:bg-[#111c2e] border border-slate-200 dark:border-slate-800 rounded-2xl';
const CHIP_COUNT =
  'text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500';

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  'checked-in': 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  completed: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'no-show': 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
};

const ClinicDashboard: React.FC<ClinicDashboardProps> = ({
  appointments,
  consultations,
  unitLabelById,
  nowMs,
}) => {
  const now = nowMs ?? previewNowMs();

  const today = React.useMemo(() => todayAppointments(appointments, now), [appointments, now]);
  const waiting = React.useMemo(() => waitingTodayCount(appointments, now), [appointments, now]);
  const upcoming = React.useMemo(() => upcomingBookedDays(appointments, now), [appointments, now]);
  const counters = React.useMemo(() => todayCounters(appointments, now), [appointments, now]);

  // Consultations recorded today (any clinic unit of this preview).
  const consultationsToday = React.useMemo(() => {
    const dayStart = localDayStart(now);
    if (!Number.isFinite(dayStart)) return 0;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return (consultations || []).filter((item) => item.createdAtMs >= dayStart && item.createdAtMs < dayEnd).length;
  }, [consultations, now]);

  const appointmentRows = today.map((row) => {
    const linkable = row.status === 'checked-in' || row.status === 'scheduled';
    return (
      <li
        key={row.id}
        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center gap-2 justify-between min-w-0"
      >
        <div className="min-w-0">
          <div className="text-sm font-black truncate">{row.patientName}</div>
          <div className="text-[11px] text-slate-500" dir="ltr">
            {row.timeLabel} · {row.durationMinutes} min
            {unitLabelById?.[row.unitId] ? ` · ${unitLabelById[row.unitId]}` : ''}
          </div>
          {linkable && (
            <div className="text-[10px] text-slate-400">
              {row.status === 'checked-in' ? 'Waiting now — complete the visit from the Consultation tab.' : 'Scheduled — check in from the Appointments tab.'}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
            STATUS_CLASS[row.status]
          }`}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </li>
    );
  });

  return (
    <div dir="ltr" className="space-y-3">
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Local preview data — saved on this device only and not synced to a server.</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className={`${CARD} p-3 sm:p-4 space-y-2 lg:col-span-2 min-w-0`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
              Today’s appointments
            </h2>
            <span className={CHIP_COUNT}>{today.length}</span>
          </div>
          {today.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No appointments today.</p>
          ) : (
            <ul className="space-y-2">{appointmentRows}</ul>
          )}
        </section>

        <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
          <h2 className="text-sm font-black flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
            Waiting today
          </h2>
          <div className="text-4xl font-black">{waiting}</div>
          <p className="text-[11px] text-slate-400">
            Today’s clinic queue only (scheduled or checked in, but not completed). It is separate from the operation waiting list.
          </p>
        </section>
      </div>

      <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
        <h2 className="text-sm font-black">Upcoming days</h2>
        {upcoming.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No appointments in the next seven days.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {upcoming.map((day) => (
              <span
                key={day.dayLabel}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 px-3 py-1 text-[11px] font-black"
                dir="ltr"
              >
                {day.dayLabel} · {day.count} appointments
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={`${CARD} p-3 sm:p-4 space-y-2`}>
        <h2 className="text-sm font-black">Today’s totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Appointments', value: counters.total },
            { label: 'Completed', value: counters.completed },
            { label: 'Cancelled', value: counters.cancelled },
            { label: 'No-show', value: counters.noShow },
            { label: 'Visits today', value: consultationsToday },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 truncate">
                {metric.label}
              </div>
              <div className="text-lg font-black">{metric.value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ClinicDashboard;
