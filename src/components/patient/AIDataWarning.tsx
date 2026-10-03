import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { AI_DATA_WARNING_PLACEHOLDER, AI_TEST_DATA_ONLY } from '../../config/aiConfig';

export const AIDataWarning: React.FC<{ compact?: boolean }> = ({ compact = false }) => !AI_TEST_DATA_ONLY ? null : (
  <div className={`rounded-xl border border-amber-400/40 bg-amber-500/10 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`} role="note" aria-label="AI data warning">
    <div className="flex items-start gap-2">
      <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold text-amber-700 dark:text-amber-300">AI data-use warning</div>
        <div className="text-[10px] leading-4 text-amber-800/80 dark:text-amber-200/80">{AI_DATA_WARNING_PLACEHOLDER}</div>
      </div>
    </div>
  </div>
);
