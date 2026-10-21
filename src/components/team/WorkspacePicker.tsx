import React from 'react';
import { Building2, ArrowRight, X } from 'lucide-react';
import type { IndexedWorkspace } from '../../services/workspaceIndex';

interface WorkspacePickerProps {
  open: boolean;
  workspaces: IndexedWorkspace[];
  activeWorkspaceId?: string;
  busy?: boolean;
  onSelect: (workspaceId: string) => void;
  onClose: () => void;
}

/**
 * The team picker (B3). A doctor can work in more than one team with the same
 * Google account. The list comes from the account's own team index; opening a
 * team still needs a real membership, so the picker can never reach a team the
 * doctor does not belong to.
 */
export const WorkspacePicker: React.FC<WorkspacePickerProps> = ({
  open,
  workspaces,
  activeWorkspaceId,
  busy,
  onSelect,
  onClose,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Choose a Team</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                This account works in {workspaces.length} team{workspaces.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 space-y-2 overflow-y-auto">
          {workspaces.map((workspace) => {
            const active = workspace.workspaceId === activeWorkspaceId;
            return (
              <button
                key={workspace.workspaceId}
                disabled={busy}
                onClick={() => onSelect(workspace.workspaceId)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/5'
                    : 'border-slate-200 dark:border-slate-700 hover:border-cyan-500/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {workspace.name || workspace.workspaceId}
                  </span>
                  {active ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                      Current
                    </span>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
                {workspace.unitNames && workspace.unitNames.length ? (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {workspace.unitNames.join(' · ')}
                  </div>
                ) : null}
              </button>
            );
          })}
          {!workspaces.length ? (
            <div className="p-6 text-center text-xs text-slate-400">No teams are linked to this account yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
