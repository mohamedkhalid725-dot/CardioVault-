import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, Trash2, BedDouble, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Unit } from '../../types/clinical';
import { getUnitById, isMasterAccount } from '../../services/workspaceAccess';

// A unit consultant may resize the unit only during the first hour after it is
// created and only while its capacity is not locked; afterwards the owner alone can.
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

type UnitCapacityMeta = Pick<Unit, 'consultantUid' | 'capacityLocked' | 'createdAtMs'>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BedManagementModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { units, beds, patients, addBed, removeBed, showToast } = useApp();
  const [unitId, setUnitId] = useState('');
  const [myUid, setMyUid] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [cloudUnit, setCloudUnit] = useState<UnitCapacityMeta | null>(null);

  useEffect(() => {
    if (isOpen && !unitId && units[0]?.id) setUnitId(units[0].id);
    if (isOpen && unitId && !units.some((u) => u.id === unitId)) setUnitId(units[0]?.id || '');
  }, [isOpen, units, unitId]);

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
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Read the authoritative unit document (consultant slot + capacity lock) rather
  // than trusting a possibly stale local copy.
  useEffect(() => {
    if (!isOpen || !unitId) return;
    setCloudUnit(null);
    let active = true;
    void getUnitById(unitId)
      .then((unit) => {
        if (active && unit) setCloudUnit(unit);
      })
      .catch((error) => console.warn('Unit capacity check failed:', error));
    return () => {
      active = false;
    };
  }, [isOpen, unitId]);

  if (!isOpen) return null;

  const selectedUnit = units.find((u) => u.id === unitId);
  const unitBeds = beds.filter((b) => b.unitId === unitId);
  const occupied = unitBeds.filter((b) => b.patientId || patients.some((p) => !p.isArchived && p.bedId === b.id));

  // Fall back to the local unit record while the cloud read is in flight. A unit
  // with no createdAtMs has no provisioning window, so it is treated as locked.
  const capacityMeta: UnitCapacityMeta | undefined = cloudUnit ?? selectedUnit;
  const provisioningWindowOpen =
    !!capacityMeta?.createdAtMs && Date.now() < capacityMeta.createdAtMs + PROVISIONING_WINDOW_MS;
  const capacityLocked = capacityMeta?.capacityLocked === true || !provisioningWindowOpen;
  const isUnitConsultant = !!myUid && capacityMeta?.consultantUid === myUid;
  const canChangeCapacity = isOwner || (isUnitConsultant && !capacityLocked);

  const blockIfLocked = () => {
    if (canChangeCapacity) return false;
    showToast('Bed count is locked. Ask the workspace owner to change it.', 'error');
    return true;
  };

  const add = () => {
    if (!unitId) return;
    if (blockIfLocked()) return;
    addBed(unitId);
    showToast('Bed added to this unit.', 'success');
  };

  const del = (id: string) => {
    const bed = beds.find((b) => b.id === id);
    if (!bed) return;
    if (blockIfLocked()) return;
    if (bed.patientId || patients.some((p) => !p.isArchived && p.bedId === id)) {
      showToast('This bed contains an active patient. Transfer or discharge the patient first.', 'error');
      return;
    }
    if (unitBeds.length <= 1) {
      showToast('A unit must keep at least one bed.', 'error');
      return;
    }
    if (window.confirm(`Delete ${bed.bedNumber}?`)) {
      if (removeBed(id)) showToast('Bed removed.', 'success');
    }
  };

  const decrement = () => {
    if (blockIfLocked()) return;
    const empty = [...unitBeds].reverse().find((b) => !b.patientId && !patients.some((p) => !p.isArchived && p.bedId === b.id));
    if (!empty) {
      showToast('Cannot reduce beds while all beds are occupied.', 'error');
      return;
    }
    del(empty.id);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-cyan-500" /> Manage Beds
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose any unit, then increase or decrease its bed count. Occupied beds cannot be removed.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400">
            <X />
          </button>
        </div>

        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {selectedUnit && (
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{selectedUnit.name}</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {unitBeds.length} <span className="text-sm font-semibold">beds</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {occupied.length} occupied • {Math.max(0, unitBeds.length - occupied.length)} available
                </div>
              </div>
              {canChangeCapacity && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={decrement}
                    disabled={unitBeds.length <= 1 || occupied.length === unitBeds.length}
                    className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-white disabled:opacity-30"
                    title="Remove one empty bed"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={add}
                    className="w-11 h-11 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/20"
                    title="Add one bed"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            {!canChangeCapacity && (
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                Bed count is locked. Ask the workspace owner to change it.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Beds in {selectedUnit?.name || 'Unit'}
          </span>
          {canChangeCapacity ? (
            <button onClick={add} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">
              <Plus className="inline w-4 h-4 mr-1" />
              Add Bed
            </button>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Locked
            </span>
          )}
        </div>

        <div className="space-y-2">
          {unitBeds.map((b) => {
            const patient = b.patientId
              ? patients.find((p) => p.id === b.patientId && !p.isArchived)
              : patients.find((p) => !p.isArchived && p.bedId === b.id);
            const isOccupied = !!patient;
            return (
              <div
                key={b.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
              >
                <div>
                  <b className="text-sm text-slate-900 dark:text-white">{b.bedNumber}</b>
                  <p className="text-xs text-slate-400">
                    {isOccupied ? `${patient?.fullName} • ${patient?.status}` : 'Empty'}
                  </p>
                </div>
                <button
                  disabled={isOccupied || unitBeds.length <= 1 || !canChangeCapacity}
                  onClick={() => del(b.id)}
                  className="p-2 rounded-xl text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    !canChangeCapacity
                      ? 'Bed count is locked'
                      : isOccupied
                        ? 'Occupied bed cannot be deleted'
                        : 'Delete empty bed'
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          {unitBeds.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
              No beds exist in this unit.{canChangeCapacity ? ' Use + to add the first bed.' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
