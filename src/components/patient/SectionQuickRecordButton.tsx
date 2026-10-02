import React, { useState } from 'react';
import { Mic, Sparkles } from 'lucide-react';
import { Patient } from '../../types/clinical';
import { ContextualVoiceRecorderModal, ContextualVoiceModalProps } from './ContextualVoiceRecorderModal';

export interface SectionQuickRecordButtonProps {
  patient: Patient;
  context: ContextualVoiceModalProps['context'];
  contextLabel: string;
  currentValue?: string;
  onApply: (medicalText: string, mode: 'replace' | 'append') => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'subtle' | 'badge' | 'solid';
}

export const SectionQuickRecordButton: React.FC<SectionQuickRecordButtonProps> = ({
  patient,
  context,
  contextLabel,
  currentValue = '',
  onApply,
  className = '',
  size = 'xs',
  variant = 'badge',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const sizeClasses =
    size === 'xs'
      ? 'px-2 py-1 text-[10px] gap-1'
      : size === 'sm'
        ? 'px-2.5 py-1.5 text-xs gap-1.5'
        : 'px-3 py-2 text-xs gap-2';

  const variantClasses =
    variant === 'badge'
      ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
      : variant === 'solid'
        ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center rounded-lg font-bold transition-all active:scale-95 ${sizeClasses} ${variantClasses} ${className}`}
        title={`Quick Voice Record for ${contextLabel}`}
      >
        <Mic className="w-3 h-3 text-cyan-500 shrink-0" />
        <span>Quick Record</span>
      </button>

      {isOpen && (
        <ContextualVoiceRecorderModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          patient={patient}
          context={context}
          contextLabel={contextLabel}
          currentValue={currentValue}
          onApply={onApply}
        />
      )}
    </>
  );
};
