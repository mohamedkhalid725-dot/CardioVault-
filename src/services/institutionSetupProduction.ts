// Production half of the Institution Setup wizard.
//
// The wizard itself is a presenter. Everything that has to survive a failure -
// which units to create, which ones to finish, what a retry may repeat - lives
// here so it can be tested without a browser, a Firebase session or a React tree.
//
// Contract, in the order the product needs it:
//
//  1. The subscription request is submitted and mirrored FIRST (the caller does
//     that), so the owner can see the request even if unit creation fails.
//  2. A unit id is the draft's `tempId`. The same id is what the request listed,
//     so an owner-issued department code points at the real unit document.
//  3. Creating is idempotent: a unit that already exists is never created twice.
//  4. Finishing (membership registration + bed provisioning + capacity lock) is
//     attempted for EVERY target on EVERY run. It is the repair step, so a retry
//     fixes a half-finished previous attempt instead of starting over.
//  5. A failure is reported per unit with its own message; the caller keeps the
//     draft, so the user can press Save again and only the missing work happens.

import type { Unit } from '../types/clinical';
import type { InstitutionSetupDraft } from '../types/departmentTeam';
import { createUnitsFromDraft, type SetupStorage } from './institutionSetup.ts';
import type { UnitSetupResult } from './unitBeds.ts';

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export interface SetupUnitTarget {
  /** Stable unit id: the draft row's `tempId`. */
  id: string;
  name: string;
  beds: number;
}

export interface ProductionSetupPlan {
  /** Every unit the draft configures, in draft order. */
  targets: SetupUnitTarget[];
  /** Units that do not exist yet. Their ids are already the draft ids. */
  toCreate: Unit[];
  /** Target ids that already exist locally; they are finished, never re-created. */
  existing: string[];
  /**
   * Draft rows whose unit id had to be changed because a DIFFERENT unit already
   * owns it. They are reported instead of being silently created under a new id,
   * which would break the link to the subscription request.
   */
  unlinked: SetupUnitTarget[];
}

/**
 * Builds the creation plan without touching Firestore.
 *
 * Throws exactly what `createUnitsFromDraft` throws (invalid draft, read-only
 * unit) because those messages are already mapped by the wizard.
 */
export function planProductionSetupUnits(
  draft: InstitutionSetupDraft,
  existingUnits: Unit[] = [],
  subscriberId?: string,
  companionStorage?: SetupStorage | null,
): ProductionSetupPlan {
  const existing = Array.isArray(existingUnits) ? existingUnits : [];
  const existingIds = new Set(existing.map((unit) => clean(unit?.id)).filter(Boolean));
  const targets: SetupUnitTarget[] = (Array.isArray(draft?.unitDrafts) ? draft.unitDrafts : []).map((row, index) => ({
    id: clean(row?.tempId) || `unit-draft-missing-${index + 1}`,
    name: clean(row?.name) || `Unit ${index + 1}`,
    beds: Math.max(0, Math.trunc(Number(row?.beds) || 0)),
  }));
  const targetIds = new Set(targets.map((target) => target.id));

  // Two draft rows can share an identifier only through a hand-edited record;
  // `createUnitsFromDraft` drops the second one. Saying so is better than
  // silently provisioning one unit where the owner configured two.
  const firstIndexById = new Map<string, number>();
  const duplicateIds = new Set<string>();
  targets.forEach((target, index) => {
    if (firstIndexById.has(target.id)) duplicateIds.add(target.id);
    else firstIndexById.set(target.id, index);
  });

  const planned = createUnitsFromDraft(draft, existing, companionStorage, subscriberId);

  const toCreate = planned.filter((unit) => targetIds.has(String(unit.id)));
  const unlinked = targets.filter((target, index) => {
    if (duplicateIds.has(target.id) && firstIndexById.get(target.id) !== index) return true;
    return !existingIds.has(target.id) && !toCreate.some((unit) => String(unit.id) === target.id);
  });

  return {
    targets,
    toCreate,
    existing: targets.filter((target) => existingIds.has(target.id)).map((target) => target.id),
    unlinked,
  };
}

export type UnitSetupOutcome = Pick<UnitSetupResult, 'ok' | 'unitId' | 'expected' | 'present' | 'message'>;

export interface ProductionSetupDeps {
  plan: ProductionSetupPlan;
  /** Must be idempotent: called once per missing unit of the plan. */
  createUnit(unit: Unit): Unit | null;
  /** Registers the unit, provisions its beds and locks the capacity. */
  completeUnit(unitId: string): Promise<UnitSetupOutcome>;
}

export interface ProductionSetupOutcome {
  ok: boolean;
  /** Units created by THIS run (0 on a healthy retry). */
  createdCount: number;
  /** Targets that finished with the exact bed count the draft asked for. */
  completed: Array<{ unitId: string; name: string; expected: number; present: number }>;
  failures: Array<{ unitId: string; name: string; message: string }>;
  /** Total beds of the finished units, for the success banner. */
  totalBeds: number;
}

/**
 * Creates the missing units, then finishes every target. Never throws: each
 * problem becomes one entry in `failures`, so a partial run is never reported as
 * a success.
 */
export async function runProductionSetup(deps: ProductionSetupDeps): Promise<ProductionSetupOutcome> {
  const { plan } = deps;
  const failures: ProductionSetupOutcome['failures'] = [];
  const blockedIds = new Set<string>();
  let createdCount = 0;

  for (const unit of plan.toCreate) {
    try {
      const created = deps.createUnit(unit);
      if (created) createdCount += 1;
      else {
        blockedIds.add(String(unit?.id || ''));
        failures.push({
          unitId: String(unit?.id || ''),
          name: clean(unit?.name) || 'Unit',
          message: 'The unit was not created, so it cannot be provisioned. Its workspace may be read-only.',
        });
      }
    } catch (error) {
      blockedIds.add(String(unit?.id || ''));
      failures.push({
        unitId: String(unit?.id || ''),
        name: clean(unit?.name) || 'Unit',
        message: String((error as Error)?.message || 'The unit could not be created.'),
      });
    }
  }

  for (const target of plan.unlinked) {
    failures.push({
      unitId: target.id,
      name: target.name,
      message: 'Another unit already uses this identifier, so it was not linked to the request. Rename the unit and retry.',
    });
  }

  // An unlinked row has no unit under that id, so finishing it would only add a
  // second, confusing failure for the same row. The comparison is by identity:
  // two rows can share an id and only one of them is unlinked.
  const unlinkedRows = new Set(plan.unlinked);
  const completable = plan.targets.filter(
    (target) => !unlinkedRows.has(target) && !blockedIds.has(target.id),
  );

  const completed: ProductionSetupOutcome['completed'] = [];
  for (const target of completable) {
    try {
      const result = await deps.completeUnit(target.id);
      if (result.ok && result.present === target.beds) {
        completed.push({ unitId: target.id, name: target.name, expected: target.beds, present: result.present });
        continue;
      }
      failures.push({
        unitId: target.id,
        name: target.name,
        message: result.message || `Only ${result.present} of ${target.beds} beds were created.`,
      });
    } catch (error) {
      failures.push({
        unitId: target.id,
        name: target.name,
        message: String((error as Error)?.message || 'The unit could not be finished.'),
      });
    }
  }

  return {
    ok: failures.length === 0 && completed.length === completable.length && completable.length > 0,
    createdCount,
    completed,
    failures,
    totalBeds: completed.reduce((sum, entry) => sum + entry.expected, 0),
  };
}
