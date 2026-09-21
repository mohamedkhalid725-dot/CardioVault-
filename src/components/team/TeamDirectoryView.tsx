import React, { useState } from 'react';
import {
  Users2,
  Shield,
  Clock,
  Plus,
  CheckCircle2,
  Building,
  UserCheck,
  Calendar,
  AlertCircle,
  Key,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthorizationService } from '../../services/authorizationService';
import { AuditTrailService } from '../../services/auditTrailService';
import { UserProfile, ClinicalRole } from '../../types/clinical';

export const TeamDirectoryView: React.FC = () => {
  const { currentUser, setCurrentUser, units, showToast } = useApp();
  const [users, setUsers] = useState<UserProfile[]>(() => AuthorizationService.getUsers());
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [isTempModalOpen, setIsTempModalOpen] = useState(false);
  const [selectedUserForTemp, setSelectedUserForTemp] = useState<UserProfile | null>(null);

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<ClinicalRole>('nurse');
  const [newUserUnitId, setNewUserUnitId] = useState(units[0]?.id || 'unit-ccu-1');

  // Temp assignment form state
  const [tempUnitId, setTempUnitId] = useState(units[0]?.id || '');
  const [tempStartDate, setTempStartDate] = useState(new Date().toISOString().slice(0, 16));
  const [tempEndDate, setTempEndDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );

  const isAdmin = currentUser.role === 'department_admin';

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('ACCESS RESTRICTED: Only Department Admins can manage users.', 'error');
      return;
    }
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    const newUser: UserProfile = {
      userId: `user-${Date.now()}`,
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      departmentId: 'dept-cardiology',
      assignedUnitIds: [newUserUnitId],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const updated = [...users, newUser];
    setUsers(updated);
    AuthorizationService.saveUsers(updated);

    AuditTrailService.logAction({
      userId: currentUser.userId,
      userName: currentUser.name,
      role: currentUser.role,
      action: `User Created: ${newUser.name} (${newUser.role}) assigned to ${newUserUnitId}`,
      departmentId: 'dept-cardiology',
      unitId: newUserUnitId,
    });

    setIsNewUserModalOpen(false);
    setNewUserName('');
    setNewUserEmail('');
    showToast(`User ${newUser.name} created.`, 'success');
  };

  const handleAssignTemporaryUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selectedUserForTemp) {
      showToast('ACCESS RESTRICTED: Only Department Admins can assign temporary coverage.', 'error');
      return;
    }

    const updatedUser: UserProfile = {
      ...selectedUserForTemp,
      temporaryAssignment: {
        unitId: tempUnitId,
        startDate: new Date(tempStartDate).toISOString(),
        endDate: new Date(tempEndDate).toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    const updated = users.map(u => (u.userId === updatedUser.userId ? updatedUser : u));
    setUsers(updated);
    AuthorizationService.saveUsers(updated);

    AuditTrailService.logAction({
      userId: currentUser.userId,
      userName: currentUser.name,
      role: currentUser.role,
      action: `Temporary Unit Assignment: ${updatedUser.name} temporarily assigned to ${tempUnitId}`,
      departmentId: 'dept-cardiology',
      unitId: tempUnitId,
      reason: `Temporary cross-coverage from ${tempStartDate} to ${tempEndDate}`,
    });

    if (currentUser.userId === updatedUser.userId) {
      setCurrentUser(updatedUser);
    }

    setIsTempModalOpen(false);
    setSelectedUserForTemp(null);
    showToast(`Temporary unit assignment saved for ${updatedUser.name}.`, 'success');
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500">
            Clinical Governance & Roles
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Team Directory & Access Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Department personnel, clinical roles, assigned units, and temporary cross-coverage
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsNewUserModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition shadow-md shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Clinician
          </button>
        )}
      </div>

      {/* Department Directory Notice */}
      <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-cyan-500 shrink-0" />
          <span className="text-slate-700 dark:text-slate-300">
            Authenticated as: <strong className="text-cyan-600 dark:text-cyan-400">{currentUser.name}</strong> (Role: <strong className="uppercase">{currentUser.role.replace('_', ' ')}</strong>)
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Departmental clinical credentials and assigned unit scopes.
        </span>
      </div>

      {/* Users Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {users.map(user => {
          const isCurrentActive = currentUser.userId === user.userId;
          const assignedUnitNames = user.assignedUnitIds
            .map(id => units.find(u => u.id === id)?.name || id)
            .join(', ');

          const hasTemp = user.temporaryAssignment && new Date(user.temporaryAssignment.endDate).getTime() > Date.now();
          const tempUnitName = hasTemp ? units.find(u => u.id === user.temporaryAssignment?.unitId)?.name : null;

          return (
            <div
              key={user.userId}
              className={`p-4 rounded-2xl border transition bg-white dark:bg-slate-900 shadow-sm space-y-3 ${
                isCurrentActive
                  ? 'border-cyan-500 ring-2 ring-cyan-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {user.name}
                    {isCurrentActive && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-500 text-slate-950">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">{user.email}</div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    user.role === 'department_admin'
                      ? 'bg-purple-500/10 text-purple-500'
                      : user.role === 'consultant' || user.role === 'specialist'
                      ? 'bg-indigo-500/10 text-indigo-500'
                      : user.role === 'resident'
                      ? 'bg-cyan-500/10 text-cyan-500'
                      : user.role === 'nurse'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-slate-500/10 text-slate-500'
                  }`}
                >
                  {user.role.replace('_', ' ')}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Department: Cardiology</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Units: {assignedUnitNames || 'None'}</span>
                </div>
                {hasTemp && (
                  <div className="flex items-center gap-2 text-amber-500 font-medium">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Temp Coverage: {tempUnitName}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <div className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 font-medium truncate">
                  Status: <span className="text-emerald-500 font-bold uppercase">Active</span>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => {
                      setSelectedUserForTemp(user);
                      setIsTempModalOpen(true);
                    }}
                    title="Assign Temporary Unit"
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New User Modal */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Clinician to Department</h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="e.g. Dr. Ahmed Taha"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Hospital Email *
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="e.g. ahmed.taha@hospital.org"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Clinical Role
                </label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                >
                  <option value="nurse">Nurse</option>
                  <option value="resident">Resident</option>
                  <option value="specialist">Specialist</option>
                  <option value="consultant">Consultant</option>
                  <option value="viewer">Viewer (Read Only)</option>
                  <option value="department_admin">Department Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Assigned Unit
                </label>
                <select
                  value={newUserUnitId}
                  onChange={e => setNewUserUnitId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-cyan-500 text-slate-950 rounded-xl hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temporary Unit Assignment Modal (Section 35) */}
      {isTempModalOpen && selectedUserForTemp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                Protocol Section 35
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Temporary Unit Assignment
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign temporary cross-coverage for {selectedUserForTemp.name}.
              </p>
            </div>

            <form onSubmit={handleAssignTemporaryUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Temporary Unit
                </label>
                <select
                  value={tempUnitId}
                  onChange={e => setTempUnitId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Start Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={tempStartDate}
                  onChange={e => setTempStartDate(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  End Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={tempEndDate}
                  onChange={e => setTempEndDate(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTempModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-amber-500 text-slate-950 rounded-xl hover:bg-amber-400 shadow-md shadow-amber-500/20"
                >
                  Confirm Temporary Coverage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
