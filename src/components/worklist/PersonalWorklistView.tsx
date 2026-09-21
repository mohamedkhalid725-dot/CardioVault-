import React, { useState } from 'react';
import {
  ClipboardList,
  CheckSquare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Plus,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClinicalWorkflowService } from '../../services/clinicalWorkflowService';
import { AuthorizationService } from '../../services/authorizationService';
import { ClinicalTask } from '../../types/clinical';

export const PersonalWorklistView: React.FC = () => {
  const { currentUser, patients, beds, setCurrentPatientId, setCurrentView, showToast } = useApp();
  const [tasks, setTasks] = useState<ClinicalTask[]>(() => ClinicalWorkflowService.getTasks());
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [newTaskPatientId, setNewTaskPatientId] = useState('');

  const authorizedPatients = AuthorizationService.filterAuthorizedPatients(
    patients.filter(p => !p.isArchived),
    currentUser
  );

  const myTasks = tasks.filter(t => {
    if (taskFilter !== 'all' && t.status !== taskFilter) return false;
    // Filter to tasks relevant to user's assigned units or role
    if (currentUser.role === 'department_admin' || currentUser.role === 'consultant') return true;
    if (t.assignedRole && t.assignedRole === currentUser.role) return true;
    if (t.assignedTo && t.assignedTo === currentUser.userId) return true;
    if (t.unitId && currentUser.assignedUnitIds.includes(t.unitId)) return true;
    return false;
  });

  const handleToggleTask = (taskId: string, currentStatus: ClinicalTask['status']) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    ClinicalWorkflowService.updateTaskStatus(taskId, newStatus, currentUser);
    setTasks(ClinicalWorkflowService.getTasks());
    showToast(`Task marked as ${newStatus}`, 'info');
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const patient = patients.find(p => p.id === newTaskPatientId);
    ClinicalWorkflowService.addTask({
      patientId: patient?.id,
      patientName: patient?.fullName,
      unitId: patient?.unitId || currentUser.assignedUnitIds[0] || 'unit-ccu-1',
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      createdBy: currentUser.name,
      assignedRole: currentUser.role,
      status: 'pending',
    });

    setTasks(ClinicalWorkflowService.getTasks());
    setNewTaskTitle('');
    setIsNewTaskModalOpen(false);
    showToast('Task created successfully', 'success');
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500">
            Personal Clinical Workspace
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Personal Worklist
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Assigned patients, tasks, and pending items for <strong>{currentUser.name}</strong> ({currentUser.role.toUpperCase()})
          </p>
        </div>

        <button
          onClick={() => setIsNewTaskModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition shadow-md shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      </div>

      {/* Tabs / Metric Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Scoped Patients</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {authorizedPatients.length}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Pending Tasks</div>
          <div className="text-2xl font-black text-cyan-500 mt-1">
            {tasks.filter(t => t.status === 'pending').length}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Critical In Scope</div>
          <div className="text-2xl font-black text-rose-500 mt-1">
            {authorizedPatients.filter(p => p.status === 'Critical').length}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Unreviewed Labs</div>
          <div className="text-2xl font-black text-amber-500 mt-1">
            {authorizedPatients.reduce(
              (acc, p) => acc + (p.investigations || []).filter(i => i.status === 'available').length,
              0
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Tasks Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-cyan-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Clinical Tasks</h2>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
              {(['pending', 'completed', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg capitalize transition ${
                    taskFilter === f
                      ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {myTasks.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No {taskFilter} tasks in your clinical scope.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {myTasks.map(task => (
                <div
                  key={task.id}
                  className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition ${
                    task.status === 'completed'
                      ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-60'
                      : task.priority === 'stat'
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      onClick={() => handleToggleTask(task.id, task.status)}
                      className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition shrink-0 ${
                        task.status === 'completed'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 hover:border-cyan-500'
                      }`}
                    >
                      {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                    <div>
                      <div
                        className={`text-xs font-bold ${
                          task.status === 'completed'
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                        {task.patientName && (
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {task.patientName}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            task.priority === 'stat'
                              ? 'bg-rose-500/10 text-rose-500'
                              : task.priority === 'urgent'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {task.priority}
                        </span>
                        <span>Added by {task.createdBy}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Scoped Patients */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                My Patients ({authorizedPatients.length})
              </h2>
            </div>
            <button
              onClick={() => setCurrentView('patients')}
              className="text-[11px] font-bold text-cyan-500 hover:underline flex items-center gap-1"
            >
              All Directory <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {authorizedPatients.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No patients admitted in your assigned units.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {authorizedPatients.map(patient => {
                const bed = beds.find(b => b.id === patient.bedId);
                return (
                  <button
                    key={patient.id}
                    onClick={() => {
                      setCurrentPatientId(patient.id);
                      setCurrentView('patient');
                    }}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {patient.fullName}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          MRN {patient.mrn} • {bed?.bedNumber || 'Bed —'} • {patient.age}yo {patient.sex}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          patient.status === 'Critical'
                            ? 'bg-rose-500/10 text-rose-500'
                            : patient.status === 'Unstable'
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}
                      >
                        {patient.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {patient.primaryDiagnosis}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Task Modal */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create Clinical Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Check repeat potassium at 14:00"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Associated Patient
                </label>
                <select
                  value={newTaskPatientId}
                  onChange={e => setNewTaskPatientId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                >
                  <option value="">General Unit Task (No patient)</option>
                  {authorizedPatients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} (MRN {p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={newTaskPriority}
                  onChange={e => setNewTaskPriority(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT / Immediate</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-cyan-500 text-slate-950 rounded-xl hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
