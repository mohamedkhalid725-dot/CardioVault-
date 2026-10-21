/**
 * The cloud copy of the clinical registry and the local copy are two snapshots
 * of the same data, and neither one is authoritative on its own:
 *
 *  - the cloud copy can be OLDER than the local one. A unit that was just
 *    created is uploaded in two steps (the unit document first, then its bed
 *    documents), and a restore that lands in that window used to replace the
 *    local state with the older cloud copy. The new unit came back with no
 *    beds at all, and the bed count the doctor typed was gone for good.
 *  - the local copy can be older than the cloud one, when another device
 *    edited the same record.
 *
 * The restore therefore merges instead of replacing: for every record id the
 * copy that carries the newer `updatedAt` wins, and a record the cloud has
 * never seen is kept.
 *
 * `hasPendingLocalChanges` tells the two cases apart. While nothing is
 * pending the cloud is authoritative and the local state is replaced outright,
 * so a record deleted on another device really disappears. While something is
 * pending the local state is the doctor's latest intent and is merged in.
 */

export interface ClinicalCollections {
  units: any[];
  beds: any[];
  patients: any[];
}

let pendingLocalChanges = false;

/** True while the local registry holds changes the cloud has not confirmed. */
export function hasPendingLocalChanges(): boolean {
  return pendingLocalChanges;
}

export function markPendingLocalChanges(): void {
  pendingLocalChanges = true;
}

export function clearPendingLocalChanges(): void {
  pendingLocalChanges = false;
}

/** Milliseconds of the record's `updatedAt`, or 0 when it was never stamped. */
const recordTime = (record: any): number => {
  const parsed = Date.parse(String(record?.updatedAt || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const byId = (records: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id || '');
    if (id) map.set(id, record);
  }
  return map;
};

/**
 * Merges a cloud snapshot with the local working state, record by record.
 *
 * `keepLocalOnly` decides what happens to a record the cloud does not have:
 * true keeps it (it is either brand new or was deleted elsewhere while local
 * changes were pending), false drops it (the cloud is authoritative).
 */
export function mergeClinicalCollections(
  cloud: ClinicalCollections,
  local: ClinicalCollections,
  options: { keepLocalOnly?: boolean } = {},
): ClinicalCollections {
  const keepLocalOnly = options.keepLocalOnly !== false;
  const merge = (cloudRecords: any[], localRecords: any[]): any[] => {
    const cloudMap = byId(cloudRecords);
    const localMap = byId(localRecords);
    const merged: any[] = [];
    for (const [id, localRecord] of localMap) {
      const cloudRecord = cloudMap.get(id);
      if (!cloudRecord) {
        if (keepLocalOnly) merged.push(localRecord);
        continue;
      }
      const localTime = recordTime(localRecord);
      const cloudTime = recordTime(cloudRecord);
      // A local copy without `updatedAt` was never uploaded, so it is the
      // newest thing known about that record. Otherwise the newer stamp wins,
      // and a tie goes to the local working state.
      if (localTime === 0 || localTime >= cloudTime) merged.push(localRecord);
      else merged.push(cloudRecord);
    }
    for (const [id, cloudRecord] of cloudMap) {
      if (!localMap.has(id)) merged.push(cloudRecord);
    }
    return merged;
  };
  return {
    units: merge(cloud.units, local.units),
    beds: merge(cloud.beds, local.beds),
    patients: merge(cloud.patients, local.patients),
  };
}
