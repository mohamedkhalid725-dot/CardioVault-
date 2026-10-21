import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Edit2, Building2, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Unit } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import { isMasterAccount, getMyUnits, claimUnitConsultant, clearUnitConsultant } from '../../services/workspaceAccess';

const UNIT_TYPE_OPTIONS = ['Intensive Care', 'Coronary Care', 'HDU', 'Step-down', 'Ward', 'Emergency'];
// Bed creation/deletion is allowed to a unit consultant only during the first hour
// after the unit document is created; afterwards only the platform owner may resize it.
const PROVISIONING_WINDOW_MS = 3600000;

const resolveMyUid = (): string => {
  try {
    const stored = localStorage.getItem('cardiovault_google_uid') || '';
    if (stored) return stored;
  } catch {
    /* ignore storage failures — the cloud call will fail loudly instead */
  }
  return '';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const UnitManagementModalV2: React.FC<Props> = ({ isOpen, onClose }) => {
  const { units, beds, patients, addUnit, addBed, updateUnit, deleteUnit, finalizeUnitCreation, syncNow, showToast } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [count, setCount] = useState(6);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [myUid, setMyUid] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [myUnitIds, setMyUnitIds] = useState<string[]>([]);
  // True while a unit is being uploaded. The bed count must not be touched
  // during that window: the cloud only accepts a bed inside a unit whose
  // capacity is still open.
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMyUid(resolveMyUid());
    let active = true;
    void isMasterAccount()
      .then((owner) => {
        if (active) setIsOwner(owner);
      })
      .catch((error) => {
        console.warn('Platform owner check failed:', error);
        if (active) setIsOwner(false);
      });
    // Which units I may claim the consultant seat of. The owner lists every unit,
    // so his result is ignored here: he does not hold a clinical seat.
    void getMyUnits()
      .then((mine) => {
        if (active) setMyUnitIds(mine.map((unit) => String(unit.id)));
      })
      .catch((error) => {
        console.warn('Own unit lookup failed:', error);
        if (active) setMyUnitIds([]);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const claimConsultantSlot = async (unitId: string) => {
    try {
      await claimUnitConsultant(unitId);
      await syncNow();
      showToast('You now hold this unit’s consultant seat.', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Could not claim the consultant seat.'), 'error');
    }
  };

  const clearConsultantSlot = async (unitId: string) => {
    if (!window.confirm('Clear this unit’s consultant seat? The unit will have no consultant until it is claimed again.')) return;
    try {
      await clearUnitConsultant(unitId);
      await syncNow();
      showToast('Consultant seat cleared.', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Could not clear the consultant seat.'), 'error');
    }
  };

  if (!isOpen) return null;

  const activeOnBeds = (id: string) =>
    patients.filter((p) => !p.isArchived && p.unitId === id && beds.some((b) => b.unitId === id && b.patientId === p.id));

  const provisioningLeftMs = (unit: Unit) => (unit.createdAtMs ? unit.createdAtMs + PROVISIONING_WINDOW_MS - Date.now() : 0);
  const capacityIsLocked = (unit: Unit) => unit.capacityLocked === true || provisioningLeftMs(unit) <= 0;
  const isUnitConsultant = (unit: Unit) => !!myUid && unit.consultantUid === myUid;
  // Mirrors firestore.rules: owner always, consultant only while the window is open.
  // A unit that is still being uploaded is off limits as well: its bed
  // documents are written to the cloud right now.
  const canChangeCapacity = (unit: Unit) => !finalizing && (isOwner || (isUnitConsultant(unit) && !capacityIsLocked(unit)));
  // Mirrors firestore.rules: the consultant slot holder or the owner may rename / retype.
  const canRename = (unit: Unit) => isOwner || isUnitConsultant(unit);
  // Delete is owner-only in the rules, so the action is hidden from everybody else.
  const canDelete = isOwner;

  const saveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Enter a unit name before saving.', 'error');
      return;
    }
    if (!type) {
      showToast('Select a unit type before saving.', 'error');
      return;
    }
    const unit = addUnit(name, type, count);
    // The unit and its beds have to reach the cloud before the capacity is
    // closed: the rules refuse a bed inside a unit whose capacity is already
    // locked, so locking here used to leave the unit in the cloud with no beds
    // at all and the bed count came back as zero.
    setName('');
    setType('');
    setCount(6);
    setAdding(false);
    setFinalizing(true);
    showToast('Unit created. Uploading its beds to the cloud…', 'info');
    void finalizeUnitCreation(unit.id).finally(() => setFinalizing(false));
  };

  const addOneBed = (unit: Unit) => {
    if (!canChangeCapacity(unit)) {
      showToast('Bed count is locked. Ask the workspace owner to change it.', 'error');
      return;
    }
    addBed(unit.id);
    showToast('Bed added to this unit.', 'success');
  };

  const remove = (u: Unit) => {
    if (!canDelete) {
      showToast('Only the workspace owner can delete a unit.', 'error');
      return;
    }
    const active = activeOnBeds(u.id);
    if (active.length) {
      showToast(
        `Cannot delete ${u.name}. ${active.length} active patient(s) are still assigned to beds in this unit.`,
        'error'
      );
      return;
    }
    if (window.confirm(`Delete ${u.name}? Empty units can be deleted safely.`)) {
      if (deleteUnit(u.id)) showToast('Unit deleted.', 'success');
    }
  };

  const capacityBadge = (u: Unit) => {
    const locked = capacityIsLocked(u);
    const minutesLeft = Math.max(0, Math.ceil(provisioningLeftMs(u) / 60000));
    return (
      <span
        className={
          locked
            ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400'
            : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400'
        }
      >
        {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
        {locked ? 'Capacity locked' : `Capacity open — ${minutesLeft} min left`}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyan-500" /> Manage Units
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Create, rename and safely delete clinical units.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400">
            <X />
          </button>
        </div>

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-cyan-500/50 text-cyan-500 text-xs font-bold"
          >
            <Plus className="inline w-4 h-4 mr-1" />
            Add Unit
          </button>
        ) : (
          <form onSubmit={saveAdd} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unit name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {UNIT_TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={
                    type === t
                      ? 'px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold'
                      : 'px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold'
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">Select type</option>
                {UNIT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="40"
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Only the owner can change the number of beds after the unit is created.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-xs">
                Cancel
              </button>
              <button className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save Unit</button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {units.map((u) => {
            const unitBeds = beds.filter((b) => b.unitId === u.id);
            const active = activeOnBeds(u.id);
            const isEdit = editing === u.id;
            return (
              <div
                key={u.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    {isEdit ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-slate-800"
                      />
                    ) : (
                      <>
                        <b className="text-sm text-slate-900 dark:text-white">{u.name}</b>
                        <p className="text-xs text-slate-400">
                          {u.type || '—'} • {unitBeds.length} beds • {active.length} active patients
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => {
                            if (editName.trim()) updateUnit(u.id, editName.trim(), u.type);
                            setEditing(null);
                          }}
                          className="p-2 text-emerald-500"
                        >
                          ✓
                        </button>
                        <button onClick={() => setEditing(null)} className="p-2 text-slate-400">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      canRename(u) && (
                        <button
                          onClick={() => {
                            setEditing(u.id);
                            setEditName(u.name);
                          }}
                          className="p-2 text-cyan-500"
                          title="Rename unit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                    {canDelete && (
                      <button
                        onClick={() => remove(u)}
                        disabled={active.length > 0 || units.length <= 1}
                        className="p-2 text-rose-500 disabled:opacity-30"
                        title="Delete unit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {capacityBadge(u)}
                  {canChangeCapacity(u) && (
                    <button
                      onClick={() => addOneBed(u)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/10 text-[10px] font-bold text-cyan-600 dark:text-cyan-400"
                      title="Add one bed to this unit"
                    >
                      <Plus className="w-3 h-3" /> Bed
                    </button>
                  )}
                  {isUnitConsultant(u) && !isOwner && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <ShieldCheck className="w-3 h-3" /> Unit consultant
                    </span>
                  )}
                  {!isOwner && !u.consultantUid && myUnitIds.includes(String(u.id)) && (
                    <button
                      onClick={() => void claimConsultantSlot(u.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-500/10 text-[10px] font-bold text-violet-600 dark:text-violet-300"
                      title="This unit has no consultant yet. Claiming the seat makes you its consultant."
                    >
                      <ShieldCheck className="w-3 h-3" /> Claim consultant
                    </button>
                  )}
                  {isOwner && !!u.consultantUid && (
                    <button
                      onClick={() => void clearConsultantSlot(u.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-500/10 text-[10px] font-bold text-slate-500"
                      title="Owner only: clear the consultant seat."
                    >
                      Clear consultant
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
