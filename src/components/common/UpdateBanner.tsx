import React, { useEffect, useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { checkForUpdate, dismissUpdate, isUpdateDismissed, openUpdateUrl, UpdateAvailable } from '../../services/updateService';
import { isLocalPreview } from '../../config/localPreview';

/**
 * Top-of-app "new version available" notice. Mounted once by App.tsx inside the
 * signed-in shell. The check is best-effort: it never blocks rendering and never
 * surfaces an error.
 */
export const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<UpdateAvailable | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // The isolated local preview must never read the 'appConfig/release' document:
    // there is no cloud session in the preview by design.
    if (isLocalPreview()) return;
    let active = true;
    const run = async () => {
      const found = await checkForUpdate();
      if (!active || !found) return;
      setUpdate(found);
      setDismissed(isUpdateDismissed(found));
    };
    void run().catch(() => { /* never surface update-check failures */ });
    return () => { active = false; };
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="w-full bg-cyan-50 dark:bg-[#0B1B2B] border-b border-cyan-200 dark:border-cyan-500/30">
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-2 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">
            A new version is available
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
            Version {update.latestVersionName}{update.notes ? ` • ${update.notes}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openUpdateUrl(update.url)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Update
        </button>
        {!update.mandatory && (
          <button
            type="button"
            aria-label="Dismiss update notice"
            onClick={() => { dismissUpdate(update); setDismissed(true); }}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-500/10"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
