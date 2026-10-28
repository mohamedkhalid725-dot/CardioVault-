import type { Bed } from '../types/clinical';

/**
 * Bed provisioning for a clinical unit.
 *
 * A unit and its beds are two different writes: the unit document first, then
 * one document per bed. The sync bridge used to push them as one best-effort
 * loop, so a single failed (or skipped) write left the cloud with a unit that
 * declared 20 beds and held none of them. Nothing retried it, the local copy is
 * memory-only, and the next restore showed the unit with a bed count of zero.
 *
 * This module owns the part that must be exactly right:
 *
 *  - bed ids are deterministic (`bed-<unitId>-<n>`), so repeating the work can
 *    never create a duplicate bed;
 *  - only the bed documents that are missing in the cloud are written, so an
 *    existing (possibly occupied) bed is never touched;
 *  - the result is verified against the cloud after the writes, instead of
 *    trusting that every write succeeded;
 *  - a partial failure raises {@link UnitBedsIncompleteError} carrying the
 *    missing bed numbers, which the UI turns into a retryable "Finish setup"
 *    action instead of a silent loss.
 */

export const BED_SCHEMA_VERSION = 12;
export const MAX_BED_COUNT = 200;
export const DEFAULT_BED_ATTEMPTS = 3;
export const DEFAULT_BED_CONCURRENCY = 4;
const RETRY_BASE_DELAY_MS = 300;
const PENDING_KEY = 'cardiovault_pending_unit_beds_v1';

/** One bed document as it comes back from the cloud. */
export interface CloudBedRecord {
  id: string;
  data?: Record<string, any>;
}

/** The cloud operations the provisioning needs. Injected so the logic is testable. */
export interface UnitBedsIO {
  /** Every bed document the cloud currently holds for this unit. */
  listBeds(unitId: string): Promise<CloudBedRecord[]>;
  /** Creates one bed document. Must never overwrite a bed that already exists. */
  createBed(unitId: string, bed: Bed): Promise<void>;
}

/** What the UI needs to know about a unit's capacity. */
export interface UnitSetupResult {
  ok: boolean;
  unitId: string;
  expected: number;
  present: number;
  created: number;
  missing: number[];
  message: string;
}

/** The provisioning result plus the bed records the local state should hold. */
export interface EnsureUnitBedsResult extends UnitSetupResult {
  beds: Bed[];
}

export class UnitBedsIncompleteError extends Error {
  readonly unitId: string;
  readonly expected: number;
  readonly present: number;
  readonly missing: number[];

  constructor(unitId: string, expected: number, present: number, missing: number[], cause?: string) {
    super(
      `${present} of ${expected} beds were saved for this unit. ` +
        `Missing: ${missing.length ? missing.map((index) => bedNumberFor(index)).join(', ') : 'none'}.` +
        (cause ? ` Reason: ${cause}` : ''),
    );
    this.name = 'UnitBedsIncompleteError';
    this.unitId = unitId;
    this.expected = expected;
    this.present = present;
    this.missing = missing;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Clamps anything the form or a stored record may hold to a usable bed count. */
export function normalizeBedCount(count: unknown): number {
  const value = Math.trunc(Number(count));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_BED_COUNT);
}

export function bedIdFor(unitId: string, index: number): string {
  return `bed-${String(unitId)}-${index}`;
}

export function bedNumberFor(index: number): string {
  return `Bed ${index}`;
}

/** The bed documents a unit with this capacity must own. */
export function desiredBeds(unitId: string, count: number): Bed[] {
  const total = normalizeBedCount(count);
  const beds: Bed[] = [];
  for (let index = 1; index <= total; index += 1) {
    beds.push({
      id: bedIdFor(unitId, index),
      unitId,
      bedNumber: bedNumberFor(index),
      status: 'Empty',
    });
  }
  return beds;
}

/** Bed numbers (1-based) that the cloud does not hold yet. */
export function missingBedIndexes(unitId: string, count: number, existingIds: Iterable<string>): number[] {
  const present = new Set<string>();
  for (const id of existingIds) present.add(String(id));
  const total = normalizeBedCount(count);
  const missing: number[] = [];
  for (let index = 1; index <= total; index += 1) {
    if (!present.has(bedIdFor(unitId, index))) missing.push(index);
  }
  return missing;
}

function mergeBeds(...groups: Array<Array<CloudBedRecord | Bed>>): Bed[] {
  const byId = new Map<string, Bed>();
  for (const group of groups) {
    for (const record of group) {
      const id = String((record as any)?.id || '');
      if (!id) continue;
      const data = (record as any)?.data;
      const bed = (data && typeof data === 'object' ? { ...data, id } : { ...(record as any), id }) as Bed;
      byId.set(id, bed);
    }
  }
  return Array.from(byId.values());
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function attempt<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  const total = Math.max(1, Math.trunc(attempts) || 1);
  let lastError: unknown;
  for (let index = 0; index < total; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (index < total - 1) await sleep(RETRY_BASE_DELAY_MS * 2 ** index);
    }
  }
  throw lastError;
}

export interface EnsureUnitBedsOptions {
  unitId: string;
  expected: number;
  io: UnitBedsIO;
  attempts?: number;
  concurrency?: number;
  onProgress?: (created: number, total: number) => void;
}

/**
 * Creates every bed document the unit is missing and verifies the result.
 *
 * Safe to repeat: a bed that already exists is left exactly as it is, and the
 * deterministic ids make a duplicate impossible. Throws
 * {@link UnitBedsIncompleteError} when the cloud still does not hold the whole
 * capacity afterwards, so the caller can mark the unit "setup incomplete"
 * instead of locking a capacity that does not exist.
 */
export async function ensureUnitBeds(options: EnsureUnitBedsOptions): Promise<EnsureUnitBedsResult> {
  const unitId = String(options?.unitId || '').trim();
  if (!unitId) throw new Error('A unit id is required to provision its beds.');
  if (!options?.io) throw new Error('Bed provisioning needs cloud access.');
  const expected = normalizeBedCount(options.expected);
  const attempts = options.attempts ?? DEFAULT_BED_ATTEMPTS;
  const concurrency = Math.max(1, Math.trunc(options.concurrency ?? DEFAULT_BED_CONCURRENCY));

  if (expected === 0) {
    return { ok: true, unitId, expected: 0, present: 0, created: 0, missing: [], beds: [], message: 'No beds requested.' };
  }

  const before = await attempt(() => options.io.listBeds(unitId), attempts);
  const missing = missingBedIndexes(unitId, expected, before.map((record) => record.id));

  const created: Bed[] = [];
  let writeError: unknown = null;
  try {
    for (const group of chunk(missing, concurrency)) {
      const written = await Promise.all(
        group.map(async (index) => {
          const bed: Bed = {
            id: bedIdFor(unitId, index),
            unitId,
            bedNumber: bedNumberFor(index),
            status: 'Empty',
          };
          await attempt(() => options.io.createBed(unitId, bed), attempts);
          return bed;
        }),
      );
      created.push(...written);
      options.onProgress?.(created.length, missing.length);
    }
  } catch (error) {
    // Report the capacity, not the transport: the caller needs to know how many
    // beds are really there so it can offer a retry with the right message.
    writeError = error;
  }

  // Verify against the cloud, never against what we just tried to write.
  let after: CloudBedRecord[];
  try {
    after = await attempt(() => options.io.listBeds(unitId), attempts);
  } catch (error) {
    throw writeError || error;
  }
  const missingAfter = missingBedIndexes(unitId, expected, after.map((record) => record.id));
  const present = expected - missingAfter.length;
  if (missingAfter.length) {
    throw new UnitBedsIncompleteError(
      unitId,
      expected,
      present,
      missingAfter,
      writeError ? String((writeError as any)?.message || writeError) : undefined,
    );
  }

  return {
    ok: true,
    unitId,
    expected,
    present,
    created: created.length,
    missing: [],
    beds: mergeBeds(before, after, created),
    message: `${present} of ${expected} beds are in the cloud.`,
  };
}

/* -------------------------------------------------------------------------
 * Units whose bed upload is still owed.
 *
 * The registry survives a reload because the local clinical store does not.
 * While a unit is listed here the realtime cloud listener must not shrink its
 * bed set, and the Units screen offers "Finish setup" to try again.
 * ---------------------------------------------------------------------- */

function readPending(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [unitId, count] of Object.entries(parsed as Record<string, unknown>)) {
      const expected = normalizeBedCount(count);
      if (unitId && expected > 0) out[unitId] = expected;
    }
    return out;
  } catch {
    return {};
  }
}

function writePending(pending: Record<string, number>): void {
  try {
    if (!Object.keys(pending).length) globalThis.localStorage?.removeItem(PENDING_KEY);
    else globalThis.localStorage?.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* the registry is a safety net, never a reason to fail a clinical write */
  }
}

export function markUnitBedsPending(unitId: string, expected: number): void {
  const clean = String(unitId || '').trim();
  const total = normalizeBedCount(expected);
  if (!clean || total <= 0) return;
  const pending = readPending();
  pending[clean] = total;
  writePending(pending);
}

export function clearUnitBedsPending(unitId: string): void {
  const clean = String(unitId || '').trim();
  if (!clean) return;
  const pending = readPending();
  if (!(clean in pending)) return;
  delete pending[clean];
  writePending(pending);
}

export function pendingUnitBedCounts(): Record<string, number> {
  return readPending();
}

export function isUnitBedsPending(unitId: string): boolean {
  return String(unitId || '').trim() in readPending();
}
