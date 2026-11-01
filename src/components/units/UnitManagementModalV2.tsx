import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Edit2, Building2, Lock, LockOpen, ShieldCheck, RefreshCw, Home, ChevronRight, ChevronDown } from 'lucide-react';
import { Unit, Hospital } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import { isMasterAccount, getMyUnits, claimUnitConsultant, clearUnitConsultant } from '../../services/workspaceAccess';
import { AuthorizationService } from '../../services/authorizationService';
import { isUnitBedsPending } from '../../services/unitBeds';
import {
  BUILTIN_UNIT_TYPES,
  CUSTOM_UNIT_CAPABILITIES,
  buildUnitFromDraft,
  defaultBedCountFor,
  defaultCapabilitiesFor,
  validateUnitDraft,
} from '../../services/unitCatalog';
import type { UnitCapabilities, UnitTypeId } from '../../types/departmentTeam';
import { newHospitalId } from '../../services/hospitalPersistence';
import { isLocalPreview } from '../../config/localPreview';

// Unit types now come from the shared catalog (roadmap item 1): the eight
// built-in clinical types plus a fully configurable Custom unit. The catalog
// derives capabilities and validates names/beds without touching old records.
// Bed creation/deletion is allowed to a unit consultant only during the first hour
// after the unit document is created; afterwards only the platform owner may resize it.
const PROVISIONING_WINDOW_MS = 3600000;
const newUnitId = () => `unit-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

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
  const { units, beds, patients, currentUser, hospitals, addHospital, assignUnitToHospital, groupUnitsByHospital, addUnit, addBed, updateUnit, deleteUnit, finalizeUnitCreation, completeUnitSetup, syncNow, showToast } = useApp();
  const [adding, setAdding] = useState(false);
  const [addingHospital, setAddingHospital] = useState(false);
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCreateId, setHospitalCreateId] = useState('');
  const [savingHospital, setSavingHospital] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [typeId, setTypeId] = useState<UnitTypeId | ''>('');
  const [customTypeName, setCustomTypeName] = useState('');
  const [capabilities, setCapabilities] = useState<UnitCapabilities>({ ...CUSTOM_UNIT_CAPABILITIES });
  const [count, setCount] = useState(6);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | ''>('');
  const [unitCreateId, setUnitCreateId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHospitalId, setEditHospitalId] = useState<string | ''>('');
  const [myUid, setMyUid] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [myUnitIds, setMyUnitIds] = useState<string[]>([]);
  // Which hospital group (or 'unassigned') is expanded in the list.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  // True while a unit is being uploaded. The bed count must not be touched
  // during that window: the cloud only accepts a bed inside a unit whose
  // capacity is still open.
  const [finalizing, setFinalizing] = useState(false);
  // The unit whose missing beds are being uploaded right now.
  const [repairing, setRepairing] = useState<string | null>(null);

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
  // Hospital assignment is an owner-only administrative action.
  const canAssignHospital = isOwner;

  // Units this account may see, grouped by hospital. Members only see their own
  // units, so they never see hospitals they have no units in.
  const authorizedUnits = AuthorizationService.filterAuthorizedUnits(units, currentUser);
  const groups = groupUnitsByHospital(authorizedUnits);

  const saveHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingHospital) return;
    setSavingHospital(true);
    try {
      const h = await addHospital(hospitalName, hospitalCreateId || newHospitalId());
      if (!h) {
        showToast('Hospital was not saved. Check workspace access and retry.', 'error');
        return;
      }
      setHospitalName('');
      setHospitalCreateId('');
      setAddingHospital(false);
      showToast(isLocalPreview() ? `Local preview only: hospital "${h.name}" saved on this device.` : `Hospital "${h.name}" saved and verified in Firestore.`, 'success');
    } catch (error: any) {
      showToast(`Hospital was not confirmed in Firestore. ${String(error?.message || 'Retry the same form.')}`, 'error');
    } finally {
      setSavingHospital(false);
    }
  };

  const saveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenType: UnitTypeId = typeId || 'custom';
    const draft = {
      name,
      typeId: chosenType,
      customTypeName: chosenType === 'custom' ? customTypeName : undefined,
      beds: count,
      capabilities,
    };
    const validation = validateUnitDraft(draft);
    if (!validation.ok) {
      showToast(Object.values(validation.errors)[0] || 'Check the unit fields before saving.', 'error');
      return;
    }
    const built = buildUnitFromDraft(draft);
    if (finalizing) return;
    const unit = addUnit(built.name, built.type, count, {
      id: unitCreateId || newUnitId(),
      unitTypeId: built.unitTypeId,
      config: built.config,
      ...(isOwner && selectedHospitalId ? { hospitalId: selectedHospitalId } : {}),
    });
    // The unit and its beds have to reach the cloud before the capacity is
    // closed: the rules refuse a bed inside a unit whose capacity is already
    // locked, so locking here used to leave the unit in the cloud with no beds
    // at all and the bed count came back as zero.
    setName('');
    setType('');
    setTypeId('');
    setCustomTypeName('');
    setCount(6);
    setSelectedHospitalId('');
    setAdding(false);
    setFinalizing(true);
    showToast('Unit created. Uploading its beds to the cloud…', 'info');
    void finalizeUnitCreation(unit.id).finally(() => setFinalizing(false));
  };

  const pickUnitType = (id: UnitTypeId) => {
    setTypeId(id);
    setType(BUILTIN_UNIT_TYPES.find((entry) => entry.id === id)?.label || 'Custom');
    setCapabilities(defaultCapabilitiesFor(id));
    const suggested = defaultBedCountFor(id);
    if (suggested > 0) setCount(suggested);
  };

  // Retries the bed upload of a unit whose setup did not finish. Safe to run
  // any number of times: it only creates the bed documents that are missing in
  // the cloud and then verifies the whole capacity before closing it.
  const repairSetup = async (unit: Unit) => {
    if (repairing) return;
    setRepairing(unit.id);
    showToast('Checking this unit’s beds in the cloud…', 'info');
    try {
      const result = await completeUnitSetup(unit.id);
      if (result.ok) {
        showToast(result.message, 'success');
      } else {
        showToast(`Still incomplete: ${result.present} of ${result.expected} beds. ${result.message}`, 'error');
      }
    } catch (error: any) {
      showToast(String(error?.message || 'Could not finish this unit’s setup.'), 'error');
    } finally {
      setRepairing(null);
    }
  };

  const saveUnitEdit = async (unit: Unit) => {
    const cleanName = editName.trim();
    if (!cleanName) return;
    try {
      if (canAssignHospital && (editHospitalId || '') !== (unit.hospitalId || '')) {
        const saved = await assignUnitToHospital(unit.id, editHospitalId || null);
        if (!saved) return;
      }
      updateUnit(unit.id, cleanName, unit.type);
      setEditing(null);
      showToast('Unit details saved.', 'success');
    } catch (error: any) {
      showToast(`Unit details were not saved. ${String(error?.message || '')}`, 'error');
    }
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

  const unitCard = (u: Unit) => {
    const unitBeds = beds.filter((b) => b.unitId === u.id);
    const active = activeOnBeds(u.id);
    const isEdit = editing === u.id;
    // The capacity the unit declares versus the beds that really exist.
    // A mismatch means the bed upload did not finish, either because a
    // write was refused or because the cloud snapshot arrived first.
    const expectedBeds = Number(u.totalBeds) || 0;
    const missingCount = Math.max(0, expectedBeds - unitBeds.length);
    const setupIncomplete = missingCount > 0 || isUnitBedsPending(u.id);
    const assignedHospitalName = hospitals.find((hospital) => hospital.id === u.hospitalId)?.name;
    return (
      <div
        key={u.id}
        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1">
            {isEdit ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-slate-800"
                />
                {canAssignHospital && hospitals.length > 0 && (
                  <>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 mt-2">Hospital</label>
                    <select
                      value={editHospitalId}
                      onChange={(e) => setEditHospitalId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </>
            ) : (
              <>
                <b className="text-sm text-slate-900 dark:text-white">{u.name}</b>
                <p className={setupIncomplete ? 'text-xs font-semibold text-amber-600 dark:text-amber-400' : 'text-xs text-slate-400'}>
                  {u.type || '—'} • {expectedBeds > 0 ? `${unitBeds.length}/${expectedBeds}` : unitBeds.length} beds • {active.length} active patients
                  {setupIncomplete && ' • setup incomplete'}
                  {assignedHospitalName ? ` • Hospital: ${assignedHospitalName}` : ' • Hospital: Unassigned'}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-1">
            {isEdit ? (
              <>
                <button
                  onClick={() => void saveUnitEdit(u)}
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
                    setEditHospitalId(u.hospitalId || '');
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
            {canAssignHospital && !isEdit && (
              <button
                onClick={() => {
                  setEditing(u.id);
                  setEditName(u.name);
                  setEditHospitalId(u.hospitalId || '');
                }}
                className="p-2 text-violet-500"
                title="Assign this unit to a hospital"
              >
                <Building2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {capacityBadge(u)}
          {setupIncomplete && (isOwner || isUnitConsultant(u)) && (
            <button
              onClick={() => void repairSetup(u)}
              disabled={repairing !== null}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-[10px] font-bold text-amber-600 dark:text-amber-400 disabled:opacity-50"
              title="Create the missing beds in the cloud and verify the capacity. Safe to repeat."
            >
              <RefreshCw className={`w-3 h-3 ${repairing === u.id ? 'animate-spin' : ''}`} />
              {missingCount > 0 ? `Finish setup (${missingCount} missing)` : 'Finish setup'}
            </button>
          )}
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyan-500" /> Manage Units
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Create, rename and safely delete clinical units. Units can be grouped under hospitals.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400">
            <X />
          </button>
        </div>

        {addingHospital ? (
          <form onSubmit={saveHospital} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3">
            <input
              required
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="Hospital name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Owner only. Units are then created inside a hospital.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAddingHospital(false)} className="px-3 py-2 text-xs">
                Cancel
              </button>
              <button disabled={savingHospital} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-50">{savingHospital ? 'Saving…' : 'Create Hospital'}</button>
            </div>
          </form>
        ) : adding ? (
          <form onSubmit={saveAdd} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unit name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {BUILTIN_UNIT_TYPES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => pickUnitType(entry.id)}
                  className={
                    typeId === entry.id
                      ? 'px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold'
                      : 'px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold'
                  }
                >
                  {entry.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickUnitType('custom')}
                className={
                  typeId === 'custom'
                    ? 'px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold'
                    : 'px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold'
                }
              >
                Custom
              </button>
            </div>
            {typeId === 'custom' ? (
              <input
                value={customTypeName}
                onChange={(e) => setCustomTypeName(e.target.value)}
                placeholder="Custom unit name (e.g. Heart Failure Clinic)"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            ) : null}
                {canAssignHospital && hospitals.length > 0 && (
              <>
                <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">Hospital (optional)</label>
                <select
                  value={selectedHospitalId}
                  onChange={(e) => setSelectedHospitalId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                max="200"
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 0)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                placeholder="Beds"
              />
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center">
                {typeId ? 'Type and bed count are validated before saving.' : 'Pick a type first.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
              {([
                ['beds', 'Physical beds'],
                ['waitingList', 'Waiting list'],
              ] as Array<[keyof UnitCapabilities, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={capabilities[key]}
                    onChange={(e) => setCapabilities({ ...capabilities, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Only the owner can change the number of beds after the unit is created.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-xs">
                Cancel
              </button>
              <button disabled={finalizing} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-50">{finalizing ? 'Saving…' : 'Save Unit'}</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(isOwner || currentUser?.role === 'department_admin') && <button
              onClick={() => { setUnitCreateId(newUnitId()); setAdding(true); }}
              className="w-auto py-3 rounded-2xl border border-dashed border-cyan-500/50 text-cyan-500 text-xs font-bold"
            >
              <Plus className="inline w-4 h-4 mr-1" />
              Add Unit
            </button>}
            {isOwner && (
              <button
                onClick={() => { setAdding(false); setAddingHospital(true); setHospitalName(''); setHospitalCreateId(newHospitalId()); }}
                className="w-auto py-3 rounded-2xl border border-dashed border-violet-500/50 text-violet-500 text-xs font-bold"
              >
                <Plus className="inline w-4 h-4 mr-1" />
                Add Hospital
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {groups.map(({ hospital, units: groupUnits }) => {
            const groupKey = hospital?.id || 'unassigned';
            const isExpanded = expandedGroup === groupKey;
            return (
              <div
                key={groupKey}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div
                  className="flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => setExpandedGroup(isExpanded ? null : groupKey)}
                  role="button"
                  aria-expanded={isExpanded}
                >
                  {hospital ? (
                    <Building2 className="w-4 h-4 text-cyan-500" />
                  ) : (
                    <Home className="w-4 h-4 text-slate-400" />
                  )}
                  <div>
                    <b className="text-sm text-slate-900 dark:text-white">{hospital ? hospital.name : 'Unassigned'}</b>
                    <p className="text-xs text-slate-400">
                      {groupUnits.length} unit{groupUnits.length !== 1 ? 's' : ''} • {groupUnits.filter((u) => isUnitConsultant(u)).length} yours
                    </p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
                {isExpanded && groupUnits.map(unitCard)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
