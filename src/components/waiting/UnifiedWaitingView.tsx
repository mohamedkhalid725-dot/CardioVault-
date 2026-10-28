import { ClipboardList } from 'lucide-react';
import { OperationWaitingView } from './OperationWaitingView';
import { WaitingListView } from './WaitingListView';

/**
 * One navigation destination for operation intake and unit waiting queues.
 * The two legacy local stores stay separate for safe backward compatibility,
 * but routed operation patients are also written into the selected unit queue.
 */
export const UnifiedWaitingView = () => (
  <div className="space-y-3">
    <header className="mx-auto max-w-5xl px-3 pt-4 sm:px-6">
      <h1 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white">
        <ClipboardList className="h-5 w-5 text-cyan-500" /> Patient Waiting List
      </h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Add a patient once, track operation preparation, then route the booking into the selected unit queue. Existing unit waiting requests remain available below.
      </p>
    </header>
    <OperationWaitingView />
    <section aria-label="Unit waiting queues">
      <WaitingListView />
    </section>
  </div>
);

export default UnifiedWaitingView;
