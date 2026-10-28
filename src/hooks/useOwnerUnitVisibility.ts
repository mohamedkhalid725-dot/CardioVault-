import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeVisibilitySync,
  loadOwnerUnitVisibility,
  saveOwnerUnitVisibility,
} from '../services/ownerPreferences';
import { getHiddenUnitIds, isMasterAccount, saveHiddenUnitIds } from '../services/workspaceAccess';

/**
 * Which unit cards the platform owner hides on the home dashboard.
 *
 * The preference follows the owner account (Firestore `ownerPreferences/{uid}`)
 * and falls back to this device when the cloud copy cannot be read or written.
 * `syncState` exists so the UI can say which of the two it is showing instead of
 * pretending a device-only list is synced.
 *
 * Nothing here grants or removes access: a hidden unit stays fully readable for
 * everyone, it is only left out of the owner's own dashboard list.
 */
export type UnitVisibilitySyncState = 'loading' | 'cloud' | 'device' | 'device-unsynced';

export interface OwnerUnitVisibility {
  /** True only for the platform owner account (the only account that syncs). */
  owner: boolean;
  hiddenUnitIds: string[];
  syncState: UnitVisibilitySyncState;
  syncNote: string;
  toggle: (unitId: string, hidden: boolean) => void;
}

const readDeviceList = (): string[] => {
  try {
    return getHiddenUnitIds().map(String);
  } catch {
    return [];
  }
};

export function useOwnerUnitVisibility(): OwnerUnitVisibility {
  const [owner, setOwner] = useState(false);
  const [hiddenUnitIds, setHiddenUnitIds] = useState<string[]>(readDeviceList);
  const [syncState, setSyncState] = useState<UnitVisibilitySyncState>('loading');
  const [syncNote, setSyncNote] = useState('');

  // The ref keeps two fast clicks from racing on a stale render, and `alive`
  // stops a slow cloud reply from setting state after the screen is gone.
  const hiddenRef = useRef<string[]>(hiddenUnitIds);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void isMasterAccount()
      .then((value) => {
        if (aliveRef.current) setOwner(!!value);
      })
      .catch(() => {});

    // The owner account copy wins when it can be read; the device list is only
    // the fallback. A non-owner never syncs and keeps the device behaviour.
    void loadOwnerUnitVisibility()
      .then((result) => {
        if (!aliveRef.current) return;
        if (result.synced) {
          hiddenRef.current = result.hiddenUnitIds;
          saveHiddenUnitIds(result.hiddenUnitIds);
          setHiddenUnitIds(result.hiddenUnitIds);
          setSyncState('cloud');
          setSyncNote('');
          return;
        }
        // A missing document (first run) and a non-owner account are not
        // failures: the device list stands exactly as it did before.
        if (result.ok || result.reason === 'not-owner') {
          setSyncState('device');
          setSyncNote('');
          return;
        }
        setSyncState('device-unsynced');
        setSyncNote(describeVisibilitySync(result.reason));
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setSyncState('device-unsynced');
        setSyncNote(describeVisibilitySync('read-failed'));
      });

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const toggle = useCallback((unitId: string, hidden: boolean) => {
    const id = String(unitId || '').trim();
    if (!id) return;
    const current = hiddenRef.current;
    if (hidden === current.includes(id)) return;
    const next = hidden ? [...current, id] : current.filter((entry) => entry !== id);

    // The device copy is written first so the click survives a reload even when
    // the account write below fails (`saveHiddenUnitIds` never throws).
    hiddenRef.current = next;
    saveHiddenUnitIds(next);
    setHiddenUnitIds(next);

    void saveOwnerUnitVisibility(next)
      .then((result) => {
        if (!aliveRef.current) return;
        if (result.synced) {
          setSyncState('cloud');
          setSyncNote('');
          return;
        }
        if (result.reason === 'not-owner') {
          setSyncState('device');
          setSyncNote('');
          return;
        }
        setSyncState('device-unsynced');
        setSyncNote(describeVisibilitySync(result.reason));
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setSyncState('device-unsynced');
        setSyncNote(describeVisibilitySync('write-failed'));
      });
  }, []);

  return { owner, hiddenUnitIds, syncState, syncNote, toggle };
}
