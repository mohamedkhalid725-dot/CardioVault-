import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, Check, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthorizationService } from '../../services/authorizationService';

interface EmergencyBreakGlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUnitId?: string;
  targetPatientId?: string;
  onSuccess?: () => void;
}

export const EmergencyBreakGlassModal: React.FC<EmergencyBreakGlassModalProps> = ({
  isOpen,
  onClose,
  targetUnitId,
  targetPatientId,
  onSuccess,
}) => {
  const { currentUser, units, patients, showToast } = useApp();
  const [selectedUnitId, setSelectedUnitId] = useState(targetUnitId || units[0]?.id || '');
  const [selectedPatientId, setSelectedPatientId] = useState(targetPatientId || '');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const targetPatient = patients.find(p => p.id === (targetPatientId || selectedPatientId));

  const handleActivate = () => {
    if (!reason.trim()) {
      showToast('Please state a valid clinical reason for emergency override.', 'warning');
      return;
    }
    if (!acknowledged) {
      showToast('Please acknowledge the clinical governance audit terms.', 'warning');
      return;
    }

    try {
      AuthorizationService.activateBreakGlass({
        user: currentUser,
        patientId: targetPatient?.id || 'unspecified',
        patientName: targetPatient?.fullName || 'Emergency Case',
        unitId: selectedUnitId,
        reason: reason.trim(),
      });

      showToast('Emergency Break-Glass access activated. Valid for 60 minutes.', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (e: any) {
      showToast(`Emergency override failed: ${e?.message || 'Unknown error'}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border-2 border-rose-500/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-rose-500/10 dark:bg-rose-950/40 p-4 border-b border-rose-500/30 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-wider uppercase text-rose-500">
              Protocol Section 36
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Emergency Break-Glass Override
            </h3>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
              Strictly for acute life-threatening situations outside your assigned unit.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              All break-glass actions are <strong>permanently logged into the immutable audit trail</strong> with your identity (<strong>{currentUser.name}</strong>), role, device session, and clinical reason.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Target Emergency Unit
            </label>
            <select
              value={selectedUnitId}
              onChange={e => setSelectedUnitId(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
            >
              {units.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Clinical Justification / Reason *
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Code Blue resuscitation, urgent cross-coverage during emergency PCI, acute decompensation..."
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-500 focus:ring-rose-500"
            />
            <span>
              I confirm this emergency access is clinically required for urgent patient care, and I accept accountability under hospital clinical governance.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleActivate}
            disabled={!reason.trim() || !acknowledged}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-500/20 flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            Confirm Break-Glass Access
          </button>
        </div>
      </div>
    </div>
  );
};
