/**
 * Unit membership helpers.
 *
 * Multi-unit membership already exists in the repository: `workspaceAccess.ts`
 * writes `members/{uid}.unitIds` as the union of every redeemed unit and
 * `unitRoster.ts` keeps one roster document per (unit, member) pair. This module
 * only adds pure list/authorization helpers around those stored shapes. It has
 * no React, no storage access and no Firebase imports on purpose: every function
 * is a deterministic transform that can be unit-tested without a browser.
 *
 * Nothing here grants a new privilege. `canManageUnit` mirrors the role model
 * that `workspaceAccess.ts` already enforces:
 *   - `canManageStructure()` (workspaceAccess.ts:493) allows the owner only.
 *   - `updateTeamDirectoryMember` / `removeTeamDirectoryMember` throw unless the
 *     caller is the platform owner.
 * The single addition is that a `department_admin` who is a member of the target
 * unit may manage that unit. `clinical_editor` and `view_only` never may.
 */

/* ─── Membership lists ────────────────────────────────────────────────────── */

const cleanUnitId = (value: unknown): string => String(value ?? '').trim();

/**
 * Union of two membership lists, trimmed and de-duplicated, order preserved.
 * The first list wins positionally, so a stored order is never reshuffled.
 */
export function mergeMemberships(
  assigned: string[] | undefined,
  extra: string[] | undefined
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const input = [
    ...(Array.isArray(assigned) ? assigned : []),
    ...(Array.isArray(extra) ? extra : []),
  ];
  for (const candidate of input) {
    const unitId = cleanUnitId(candidate);
    if (!unitId || seen.has(unitId)) continue;
    seen.add(unitId);
    merged.push(unitId);
  }
  return merged;
}

/**
 * Adds one unit to a membership list. Returns a NEW array; the argument is never
 * mutated and no other unit is ever dropped.
 */
export function addUnitMembership(current: string[], unitId: string): string[] {
  const clean = cleanUnitId(unitId);
  if (!clean) throw new Error('invalid-unit-id');
  return mergeMemberships(current, [clean]);
}

/**
 * Removes exactly one unit from a membership list. Every other unit is kept.
 * A blank id is a no-op (still a new array), because there is nothing to remove.
 */
export function removeUnitMembership(current: string[], unitId: string): string[] {
  const memberships = mergeMemberships(current, undefined);
  const clean = cleanUnitId(unitId);
  if (!clean) return memberships;
  return memberships.filter((membership) => membership !== clean);
}

/** True when the member currently holds the given unit. */
export function hasUnitMembership(current: string[], unitId: string): boolean {
  const clean = cleanUnitId(unitId);
  if (!clean) return false;
  return mergeMemberships(current, undefined).includes(clean);
}

/* ─── Active unit resolution ──────────────────────────────────────────────── */

/**
 * Picks the unit the UI should show after a membership change.
 * Preference order: the requested unit if it is still held, otherwise the
 * previously selected unit if it is still held, otherwise the first held unit.
 * Returns null for an empty membership: never a unit the member may not read.
 */
export function resolveActiveUnit(
  unitIds: string[],
  requested: string | null | undefined,
  previous: string | null | undefined
): string | null {
  const memberships = mergeMemberships(unitIds, undefined);
  if (!memberships.length) return null;

  const requestedId = cleanUnitId(requested);
  if (requestedId) {
    const match = memberships.find((unitId) => unitId === requestedId);
    if (match) return match;
  }

  const previousId = cleanUnitId(previous);
  if (previousId) {
    const match = memberships.find((unitId) => unitId === previousId);
    if (match) return match;
  }

  return memberships[0];
}

/**
 * Narrows a membership list to a single unit. Throws instead of silently
 * returning an empty list, so a caller can never mistake "no access" for
 * "nothing selected" and fall back to an unscoped read.
 */
export function scopeToUnit(unitIds: string[], targetUnitId: string): string[] {
  const memberships = mergeMemberships(unitIds, undefined);
  const target = cleanUnitId(targetUnitId);
  if (!target) throw new Error('unit-not-a-member');
  const match = memberships.find((unitId) => unitId === target);
  if (!match) throw new Error('unit-not-a-member');
  return [match];
}

/* ─── Management authority ────────────────────────────────────────────────── */

export interface CanManageUnitInput {
  role: string;
  /**
   * The unit the caller is currently viewing. Deliberately NOT an authorization
   * input: being active in unit A must never grant management of unit B.
   */
  activeUnitId: string | null;
  targetUnitId: string;
  /** Whether the caller's membership includes `targetUnitId`. */
  isMember: boolean;
}

/**
 * Management gate for a unit's team and settings.
 *
 * Mirrors the existing role model instead of widening it:
 *   - `owner` may manage any unit (today's behaviour: canManageStructure()).
 *   - `department_admin` may manage ONLY a unit they belong to.
 *   - `clinical_editor` / `view_only` (and every other role) never may.
 */
export function canManageUnit(input: CanManageUnitInput): boolean {
  const role = cleanUnitId(input?.role);
  const targetUnitId = cleanUnitId(input?.targetUnitId);
  if (!targetUnitId) return false;
  if (role === 'owner') return true;
  if (role !== 'department_admin') return false;
  return input.isMember === true;
}

/* ─── Membership summaries ────────────────────────────────────────────────── */

export interface MembershipRecord {
  uid: string;
  name?: string;
  role?: string;
  clinicalRole?: string;
  /** Legacy single-unit field, still present on older member documents. */
  unitId?: string;
  /** Current multi-unit field. */
  unitIds?: string[];
}

export interface MembershipSummaryMember {
  uid: string;
  name?: string;
  role?: string;
  clinicalRole?: string;
}

export interface UnitMembershipSummary {
  unitId: string;
  members: MembershipSummaryMember[];
}

const optionalText = (value: unknown): string | undefined => {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
};

/**
 * Groups membership records by unit for display.
 *
 * Handles both storage shapes: `unitIds` (multi-unit) and the legacy `unitId`
 * (single unit). A record that carries both belongs to both, which is the same
 * union `workspaceAccess.ts` builds in `membershipUnitIds` (line 553).
 *
 * Output is deterministic: units sorted by id, members sorted by name then uid.
 * A record without a uid is skipped; a repeated uid inside one unit is listed
 * once (first occurrence wins) so a duplicate roster document cannot double a
 * person in the UI.
 */
export function summarizeMemberships(entries: MembershipRecord[]): UnitMembershipSummary[] {
  const byUnit = new Map<string, Map<string, MembershipSummaryMember>>();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const uid = cleanUnitId(entry?.uid);
    if (!uid) continue;

    const legacyUnitId = cleanUnitId(entry?.unitId);
    const unitIds = mergeMemberships(
      Array.isArray(entry?.unitIds) ? entry.unitIds : [],
      legacyUnitId ? [legacyUnitId] : []
    );

    for (const unitId of unitIds) {
      let members = byUnit.get(unitId);
      if (!members) {
        members = new Map<string, MembershipSummaryMember>();
        byUnit.set(unitId, members);
      }
      if (members.has(uid)) continue;
      members.set(uid, {
        uid,
        name: optionalText(entry?.name),
        role: optionalText(entry?.role),
        clinicalRole: optionalText(entry?.clinicalRole),
      });
    }
  }

  return Array.from(byUnit.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((unitId) => ({
      unitId,
      members: Array.from(byUnit.get(unitId)?.values() ?? []).sort(
        (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.uid.localeCompare(b.uid)
      ),
    }));
}
