import type { FC, ReactNode } from 'react';

export interface TeamDirectoryScrollContainerProps {
  /** Non-scrolling header (title, count, close button). */
  header: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
  /** Optional non-scrolling action bar pinned under the body. */
  footer?: ReactNode;
  /** Tailwind max-height utility for the panel. */
  maxHeightClass?: string;
  /** Accessible name for the region. */
  ariaLabel?: string;
}

/**
 * Flex-column panel with a fixed header, a scrolling body and a fixed footer.
 *
 * This mirrors the edit-dialog layout that already works in production at
 * `TeamDirectoryView.tsx` lines 453-473 — the shell `<div className="... max-h-[85vh]
 * flex flex-col overflow-hidden">` (line 457), the header block (459-472) and the
 * scroll body `<div className="flex-1 min-h-0 overflow-y-auto ...">` (line 473).
 * The footer follows the action bar at lines 523-533 (`shrink-0`).
 *
 * It is additive and currently unused: `TeamDirectoryView.tsx` keeps its own
 * inline markup until the lead mounts this wrapper. No behaviour, permission or
 * data change is implied by importing it.
 */
export const TeamDirectoryScrollContainer: FC<TeamDirectoryScrollContainerProps> = ({
  header,
  children,
  footer,
  maxHeightClass = 'max-h-[85vh]',
  ariaLabel = 'Team directory',
}) => (
  <div
    role="region"
    aria-label={ariaLabel}
    className={`flex min-h-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${maxHeightClass}`}
  >
    <div className="shrink-0">{header}</div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    {footer ? <div className="shrink-0">{footer}</div> : null}
  </div>
);
