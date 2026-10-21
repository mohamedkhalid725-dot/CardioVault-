import React, { useEffect, useState } from 'react';
import { Shield, Building, Edit3, Trash2, X, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthorizationService } from '../../services/authorizationService';
import {
  getTeamDirectoryMembers,
  updateTeamDirectoryMember,
  removeTeamDirectoryMember,
  isOwnerAccess,
  getStoredWorkspaceAccess,
  getActiveWorkspaceId,
  getMyUnits,
} from '../../services/workspaceAccess';
import { listRosterForUnits, RosterMember } from '../../services/unitRoster';
import { UserProfile, ClinicalRole } from '../../types/clinical';

const CLINICAL_ROLES: ClinicalRole[] = [
  'pending',
  'department_admin',
  'consultant',
  'specialist',
  'resident',
  'nurse',
  'viewer',
  'pharmacist',
  'lab_user',
  'radiology_user',
  'coordinator',
];

const asClinicalRole = (value: unknown): ClinicalRole => {
  const clean = String(value || '');
  return (CLINICAL_ROLES as string[]).includes(clean) ? (clean as ClinicalRole) : 'pending';
};

/**
 * One row of the Team screen, normalised from either the owner's workspace
 * directory or a unit roster, so the card and the edit dialog do not care which
 * source produced it.
 */
interface DirectoryMember {
  userId: string;
  name: string;
  /** Badge text. Owner path: clinical title. Roster path: workspace access level in that unit. */
  role: string;
  /** Starting value of the "Clinical Role" select in the edit dialog. */
  clinicalRole: ClinicalRole;
  status: 'active' | 'pending' | 'inactive';
  /** Units this person is visible in. For a non-owner this is always a subset of my units. */
  unitIds: string[];
}

const memberFromProfile = (profile: any): DirectoryMember => {
  const assigned = Array.isArray(profile?.assignedUnitIds) ? profile.assignedUnitIds.map(String) : [];
  const extra = Array.isArray(profile?.unitIds) ? profile.unitIds.map(String) : [];
  const clinicalRole = asClinicalRole(profile?.role);
  return {
    userId: String(profile?.userId || profile?.uid || ''),
    name: String(profile?.name || 'Team member'),
    role: clinicalRole,
    clinicalRole,
    status: profile?.status === 'pending' ? 'pending' : 'active',
    unitIds: Array.from(new Set([...assigned, ...extra].filter(Boolean))),
  };
};

const memberFromRoster = (entry: RosterMember): DirectoryMember => ({
  userId: String(entry.uid || ''),
  name: String(entry.name || 'Team member'),
  role: String(entry.role || 'clinical_editor'),
  clinicalRole: asClinicalRole(entry.clinicalRole || (entry.role === 'view_only' ? 'viewer' : 'pending')),
  status: entry.status === 'inactive' ? 'inactive' : 'active',
  unitIds: Array.from(new Set((entry.unitIds || []).map(String).filter(Boolean))),
});

export const TeamDirectoryView: React.FC = () => {
  const { currentUser, units, showToast, setCurrentUser } = useApp();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
  const [editing, setEditing] = useState<DirectoryMember | null>(null);
  const [role, setRole] = useState<ClinicalRole>('resident');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [status, setStatus] = useState<DirectoryMember['status']>('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isMaster = isOwnerAccess();
  const isAdmin = currentUser.role === 'department_admin';
  const isConsultant = currentUser.role === 'consultant';
  const canManage = isMaster || isAdmin || isConsultant;
  const canRemove = isMaster || isAdmin;

  const access = getStoredWorkspaceAccess();

  // The units I am actually a member of. The stored access snapshot is the client
  // statement of membership (written when an Access Code is redeemed or the
  // session is restored), so it — not the workspace directory — decides the scope
  // of this screen. A workspace with no stored unit information yields [].
  const myUnitIds: string[] = Array.from(
    new Set(
      (
        access?.unitIds?.length
          ? access.unitIds
          : access?.unitId
            ? [access.unitId]
            : Array.isArray(currentUser?.assignedUnitIds)
              ? currentUser.assignedUnitIds
              : []
      )
        .map(String)
        .filter(Boolean)
    )
  );
  const myUnitKey = myUnitIds.slice().sort().join('|');

  // Chip and card labels only. The local unit list is normally already hydrated;
  // this read just covers a unit whose name never reached this device, so a chip
  // is never a raw document id. A failed read leaves the labels exactly as they
  // are and never blocks the screen.
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void getMyUnits()
      .then((list) => {
        if (!active) return;
        const next: Record<string, string> = {};
        (Array.isArray(list) ? list : []).forEach((unit) => {
          if (unit?.id) next[String(unit.id)] = String(unit.name || unit.id);
        });
        setUnitNames(next);
      })
      .catch((error) => console.warn('Team screen unit name lookup failed:', error));
    return () => {
      active = false;
    };
  }, [myUnitKey, access?.workspaceId]);

  useEffect(() => {
    if (!currentUser?.userId) return;
    let active = true;
    setLoading(true);
    // A stale row from the previous account/scope must never survive the reload.
    setMembers([]);
    (async () => {
      try {
        if (isMaster) {
          // Owner: the workspace directory is his to manage, so it stays whole.
          const cloud = await getTeamDirectoryMembers();
          const local = AuthorizationService.getUsers();
          const list = (cloud.length ? cloud : local).filter((u: any) => u?.userId && u.status !== 'inactive');
          if (active) setMembers(list.map(memberFromProfile).filter((m) => !!m.userId));
          return;
        }
        // HARD RULE: a non-owner's list comes from the rosters of HIS units only.
        // Nothing is read for a unit he is not in, there is no fallback to the
        // workspace directory, and there is no fallback to the local user cache.
        if (!myUnitIds.length) {
          if (active) setMembers([]);
          return;
        }
        const roster = await listRosterForUnits(getActiveWorkspaceId(), myUnitIds);
        if (active) setMembers(roster.map(memberFromRoster).filter((m) => !!m.userId));
      } catch (error) {
        console.warn('Team directory load failed:', error);
        if (active) setMembers([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // myUnitKey stands in for myUnitIds so the read only repeats when the set changes.
  }, [currentUser?.userId, isMaster, myUnitKey, access?.workspaceId]);

  // Defence in depth for the rule above: even if a roster read ever returned a row
  // belonging to a unit this account is not in, it is dropped before rendering.
  const visibleMembers = isMaster
    ? members
    : members.filter((member) => member.unitIds.some((id) => myUnitIds.includes(id)));

  const unitName = (unitId: string): string =>
    units.find((u) => u.id === unitId)?.name || unitNames[unitId] || access?.unitNames?.[unitId] || unitId;

  // Chips: the owner sees every unit present in the directory; a member sees the
  // units he belongs to and nothing else.
  const filterUnitIds: string[] = (
    isMaster
      ? Array.from(new Set(visibleMembers.flatMap((member) => member.unitIds)))
      : [...myUnitIds]
  ).sort((a, b) => unitName(a).localeCompare(unitName(b)));

  const countForUnit = (unitId: string): number =>
    visibleMembers.filter((member) => member.unitIds.includes(unitId)).length;

  const activeFilter =
    selectedUnitId === 'all' || filterUnitIds.includes(selectedUnitId) ? selectedUnitId : 'all';

  const sharedUnitIds = (member: DirectoryMember): string[] =>
    isMaster ? member.unitIds : member.unitIds.filter((id) => myUnitIds.includes(id));

  // Grouped by unit when "All" is selected: one section per unit, and a person who
  // is in several of my units appears in each of those sections.
  const sections = (activeFilter === 'all' ? filterUnitIds : [activeFilter])
    .map((unitId) => ({ unitId, rows: visibleMembers.filter((member) => member.unitIds.includes(unitId)) }))
    .filter((section) => !!section.unitId && section.rows.length > 0);

  // Owner only: a directory entry with no assigned unit has no section of its own,
  // and dropping him would hide a real person from the screen he manages.
  const unassignedRows =
    isMaster && activeFilter === 'all' ? visibleMembers.filter((member) => member.unitIds.length === 0) : [];

  const openEdit = (member: DirectoryMember) => {
    setEditing(member);
    setRole(member.clinicalRole);
    setUnitIds([...member.unitIds]);
    setStatus(member.status);
  };

  const isDirty =
    !!editing &&
    (role !== editing.clinicalRole ||
      status !== editing.status ||
      unitIds.length !== editing.unitIds.length ||
      unitIds.some((id) => !editing.unitIds.includes(id)));

  const closeEdit = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this team member?')) return;
    setEditing(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    if (!unitIds.length) {
      showToast('Assign at least one clinical unit.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTeamDirectoryMember(editing.userId, { role, assignedUnitIds: unitIds, status });
      const nextUnitIds = Array.isArray(updated?.assignedUnitIds) ? updated.assignedUnitIds.map(String) : [...unitIds];
      const nextRole = asClinicalRole(updated?.role) === 'pending' ? role : asClinicalRole(updated?.role);
      const nextStatus: DirectoryMember['status'] =
        updated?.status === 'pending' || updated?.status === 'inactive' ? updated.status : status;
      setMembers((v) =>
        v.map((member) =>
          member.userId === editing.userId
            ? { ...member, role: nextRole, clinicalRole: nextRole, unitIds: nextUnitIds, status: nextStatus }
            : member
        )
      );
      if (currentUser.userId === editing.userId) {
        setCurrentUser({ ...currentUser, role: nextRole, assignedUnitIds: nextUnitIds, status: nextStatus } as UserProfile);
      }
      setEditing(null);
      showToast('Team member updated successfully.', 'success');
    } catch (err: any) {
      showToast(
        err?.message ? `Could not update team member: ${err.message}` : 'Could not update team member. Please try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (member: DirectoryMember) => {
    if (member.userId === currentUser.userId) return;
    if (!window.confirm(`Remove ${member.name} from the department?`)) return;
    try {
      await removeTeamDirectoryMember(member.userId);
      setMembers((v) => v.filter((x) => x.userId !== member.userId));
      showToast('Team member removed.', 'success');
    } catch (err: any) {
      showToast('Could not remove team member. Please try again.', 'error');
    }
  };

  const renderCard = (key: string, member: DirectoryMember) => {
    const shared = sharedUnitIds(member).map(unitName);
    // A consultant may not promote or demote a department admin; the platform
    // owner and department admins may.
    const protectedTarget = member.role === 'department_admin' || member.clinicalRole === 'department_admin';
    return (
      <div
        key={key}
        className="min-w-0 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-sm font-bold break-words">
            {member.name}
            {member.userId === currentUser.userId ? (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-500 text-white text-[9px] align-middle">You</span>
            ) : null}
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-cyan-500/10 text-cyan-500 whitespace-nowrap">
            {member.role.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="text-xs text-slate-500 flex items-start gap-2 min-w-0">
          <Building className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {shared.length ? `Units: ${shared.join(', ')}` : 'No unit assigned'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[7rem] py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px]">
            Status:{' '}
            <span
              className={`font-bold uppercase ${
                member.status === 'active'
                  ? 'text-emerald-500'
                  : member.status === 'pending'
                    ? 'text-amber-500'
                    : 'text-slate-400'
              }`}
            >
              {member.status}
            </span>
          </div>
          {canManage && (!isConsultant || !protectedTarget) && (
            <>
              <button
                type="button"
                onClick={() => openEdit(member)}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800"
                title="Edit roles and units"
                aria-label={`Edit ${member.name}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {canRemove && member.userId !== currentUser.userId && (
                <button
                  type="button"
                  onClick={() => void remove(member)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-rose-500"
                  title="Remove from department"
                  aria-label={`Remove ${member.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const emptyState = isMaster
    ? 'No active department members yet.'
    : !myUnitIds.length
      ? 'You are not assigned to a clinical unit yet. Enter a Unit Access Code to see your colleagues.'
      : activeFilter === 'all'
        ? 'No colleagues in your units yet.'
        : `No colleagues in ${unitName(activeFilter)} yet.`;

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500">Clinical Governance & Roles</div>
        <h1 className="text-2xl font-black">Team Directory & Access Control</h1>
        <p className="text-xs text-slate-500 mt-1">
          {isMaster
            ? 'Members appear automatically after sign-in and Unit Access Code redemption.'
            : 'You see the colleagues of the units you belong to, and only those.'}
        </p>
      </div>

      <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 text-xs">
        <Shield className="inline w-4 h-4 mr-2 text-cyan-500" />
        Authenticated as <strong>{currentUser.name}</strong> • Role: <strong>{currentUser.role.replace(/_/g, ' ')}</strong>
      </div>

      {!loading && filterUnitIds.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
          {[
            { id: 'all', label: isMaster ? 'All units' : 'All my units', count: visibleMembers.length },
            ...filterUnitIds.map((id) => ({ id, label: unitName(id), count: countForUnit(id) })),
          ].map((chip) => {
            const active = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedUnitId(chip.id)}
                aria-pressed={active}
                className={`shrink-0 min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  active
                    ? 'bg-cyan-500 border-cyan-500 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span className="whitespace-nowrap max-w-[11rem] truncate">{chip.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                    active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-400">Loading department members…</div>
      ) : sections.length === 0 && unassignedRows.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-sm">
          <Users className="w-6 h-6 mx-auto mb-2 opacity-60" />
          {emptyState}
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.unitId} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building className="w-4 h-4 text-cyan-500 shrink-0" />
                  <h2 className="text-sm font-black truncate">{unitName(section.unitId)}</h2>
                </div>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {section.rows.length} {section.rows.length === 1 ? 'member' : 'members'}
                </span>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {section.rows.map((member) => renderCard(`${section.unitId}-${member.userId}`, member))}
              </div>
            </section>
          ))}
          {unassignedRows.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <h2 className="text-sm font-black truncate">No unit assigned</h2>
                </div>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {unassignedRows.length} {unassignedRows.length === 1 ? 'member' : 'members'}
                </span>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {unassignedRows.map((member) => renderCard(`unassigned-${member.userId}`, member))}
              </div>
            </section>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={closeEdit}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="min-w-0">
                <div className="text-xs text-cyan-500 font-bold">EDIT TEAM MEMBER</div>
                <h3 className="text-lg font-black truncate">{editing.name}</h3>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl"
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-1 space-y-4">
              <div>
                <label className="text-xs font-bold">Clinical Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ClinicalRole)}
                  className="w-full mt-1 rounded-xl border p-2.5 bg-white dark:bg-slate-800"
                >
                  <option value="nurse">Nurse</option>
                  <option value="resident">Resident</option>
                  <option value="specialist">Specialist</option>
                  <option value="consultant">Consultant</option>
                  <option value="viewer">Viewer</option>
                  <option value="pharmacist">Pharmacist</option>
                  <option value="lab_user">Lab User</option>
                  <option value="radiology_user">Radiology User</option>
                  <option value="coordinator">Coordinator</option>
                  {isMaster && <option value="department_admin">Department Admin</option>}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold">Assigned Units</label>
                <div className="mt-1 grid sm:grid-cols-2 gap-2">
                  {units.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-2.5 rounded-xl border text-xs">
                      <input
                        type="checkbox"
                        checked={unitIds.includes(u.id)}
                        onChange={() =>
                          setUnitIds((v) => (v.includes(u.id) ? v.filter((x) => x !== u.id) : [...v, u.id]))
                        }
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DirectoryMember['status'])}
                  className="w-full mt-1 rounded-xl border p-2.5 bg-white dark:bg-slate-800"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button type="button" onClick={closeEdit} className="px-4 py-2 text-xs min-h-[40px]">
                Cancel
              </button>
              <button
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-cyan-500 font-bold text-xs min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
