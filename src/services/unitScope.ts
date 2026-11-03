/**
 * Unit scope resolution shared by the dashboard and the authorization filters.
 *
 * A member who enrols with a Unit Access Code gets a workspace membership; the
 * cached clinical profile may still carry an empty roster. Firestore rules are
 * the enforcement point — this module only keeps the UI in step with the
 * membership the account actually holds, so the dashboard does not render
 * 0 units / 0 beds while the unit census is fully populated.
 */

export const WORKSPACE_ACCESS_KEY = 'cardiovault_active_workspace_access_v1';

function readStoredAccess(): any {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_ACCESS_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Units granted by the active workspace membership (empty when none is stored). */
export function workspaceScopeUnitIds(): string[] {
  const state = readStoredAccess();
  if (!state?.workspaceId) return [];
  const ids = Array.isArray(state.unitIds) && state.unitIds.length
    ? state.unitIds
    : state.unitId
      ? [state.unitId]
      : [];
  return ids.map(id => String(id).trim()).filter(Boolean);
}

/** The active workspace access state, or null when it is missing/malformed. */
export function storedWorkspaceAccess(): any {
  const state = readStoredAccess();
  return state?.workspaceId ? state : null;
}

/**
 * Effective unit scope: the explicit roster when it lists units, otherwise the
 * units granted by the active workspace membership.
 */
export function scopeUnitIds(roster: unknown): string[] {
  const explicit = Array.isArray(roster) ? roster.map(id => String(id).trim()).filter(Boolean) : [];
  return explicit.length ? explicit : workspaceScopeUnitIds();
}
