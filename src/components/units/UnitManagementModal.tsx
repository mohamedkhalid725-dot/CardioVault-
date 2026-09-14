import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Building2,
  BedDouble,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Unit } from '../../types/clinical';

interface UnitManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnitManagementModal: React.FC<UnitManagementModalProps> = ({ isOpen, onClose }) => {
  const { units, beds, patients, addUnit, updateUnit, deleteUnit, showToast } = useApp();

  const [isAdding, setIsAdding] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitType, setNewUnitType] = useState('Intensive Care');
  const [newUnitBeds, setNewUnitBeds] = useState(6);

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');

  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<Unit | null>(null);

  if (!isOpen) return null;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    addUnit(newUnitName.trim(), newUnitType, newUnitBeds);
    setNewUnitName('');
    setIsAdding(false);
  };

  const handleStartEdit = (unit: Unit) => {
    setEditingUnitId(unit.id);
    setEditName(unit.name);
    setEditType(unit.type);
  };

  const handleSaveEdit = (unitId: string) => {
    if (!editName.trim()) return;
    updateUnit(unitId, editName.trim(), editType);
    setEditingUnitId(null);
  };

  const getUnitActivePatients = (unitId: string) => {
    return patients.filter((p) => !p.isArchived && p.unitId === unitId);
  };

  const handleDeleteClick = (unit: Unit) => {
    setConfirmDeleteUnit(unit);
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteUnit) return;
    const active = getUnitActivePatients(confirmDeleteUnit.id);
    if (active.length > 0) {
      showToast(
        `Cannot delete unit "${confirmDeleteUnit.name}". Please transfer or discharge ${active.length} active patient(s) first.`,
        'error'
      );
      return;
    }
    deleteUnit(confirmDeleteUnit.id);
    setConfirmDeleteUnit(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Clinical Unit Management
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure departments, manage bed capacities, and monitor unit allocations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add Unit Accordion / Button */}
        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-dashed border-cyan-500/50 hover:border-cyan-500 bg-cyan-50/20 dark:bg-cyan-950/20 text-cyan-600 dark:text-cyan-400 text-xs font-bold flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Add New Clinical Unit
          </button>
        ) : (
          <form
            onSubmit={handleAddSubmit}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Create New Unit
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coronary Care Unit (CCU), Pediatric ICU"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Initial Bed Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={newUnitBeds}
                  onChange={(e) => setNewUnitBeds(parseInt(e.target.value) || 4)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Specialty Type
              </label>
              <select
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Intensive Care">Intensive Care Unit (ICU)</option>
                <option value="Coronary Care">Coronary Care Unit (CCU)</option>
                <option value="Cardiothoracic Surgery">Cardiothoracic Surgery (CTSU)</option>
                <option value="Step-Down / High Dependency">High Dependency Unit (HDU)</option>
                <option value="Pediatric ICU">Pediatric ICU (PICU)</option>
                <option value="Neuro ICU">Neuro Intensive Care (NICU)</option>
                <option value="General Inpatient">General Medical / Cardiology Ward</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Save Unit
              </button>
            </div>
          </form>
        )}

        {/* Existing Units List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Existing Units ({units.length})
          </h3>

          <div className="space-y-2.5">
            {units.map((unit) => {
              const unitBeds = beds.filter((b) => b.unitId === unit.id);
              const activePatients = getUnitActivePatients(unit.id);
              const isEditing = editingUnitId === unit.id;

              return (
                <div
                  key={unit.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {unit.name}
                        </h4>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                          {unit.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <BedDouble className="w-3.5 h-3.5 text-cyan-500" />
                          {unitBeds.length} Beds
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                          {activePatients.length} Admitted Patient(s)
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(unit.id)}
                          className="p-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 text-xs font-bold transition-colors"
                          title="Save changes"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUnitId(null)}
                          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(unit)}
                          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors"
                          title="Rename Unit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(unit)}
                          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                          title="Delete Unit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {confirmDeleteUnit && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                  Delete Unit: &quot;{confirmDeleteUnit.name}&quot;?
                </h4>
                {getUnitActivePatients(confirmDeleteUnit.id).length > 0 ? (
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    <strong>Action Blocked:</strong> This unit currently contains{' '}
                    {getUnitActivePatients(confirmDeleteUnit.id).length} active patient(s). To protect
                    clinical data integrity, you must transfer or discharge these patients before the unit
                    can be deleted.
                  </p>
                ) : (
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    This unit has no active patients. Deleting it will permanently remove the unit and its
                    associated empty beds. Are you sure?
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDeleteUnit(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
              >
                Cancel
              </button>
              {getUnitActivePatients(confirmDeleteUnit.id).length === 0 && (
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
                >
                  Confirm Delete Unit
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
