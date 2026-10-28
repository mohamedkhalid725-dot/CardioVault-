# Performance audit (static) — Department Team preview

Scope: loading, navigation, search and large lists in the current codebase.
**No performance measurement was executed in this environment**, and **no target
is defined by the product**. Every "Baseline" cell below is therefore
"not measured". Nothing in this document is a claim of improvement.

## What the code already does

| Area | Evidence | Current behaviour |
| --- | --- | --- |
| Patient list pagination | `src/components/patients/ActivePatientsView.tsx:8` (`PAGE_SIZE = 50`), `:15` (`visibleCount`), `:27` (`filtered.slice(0, visibleCount)`), `:29` (search resets the page) | The list renders 50 rows, then a Load more control. Filtering still runs over the full in-memory list on every keystroke. |
| Route-level splitting | `src/App.tsx:15-31` | Every view except Home is fetched through `React.lazy` on first navigation. |
| Search | `src/components/search/SearchModal.tsx:16-20` | `useMemo` per query; patients are filtered with a joined string per patient, then sliced (6/12 rows). Tasks, investigations and protocols are recomputed on each query change. |
| Sync safety | `src/services/cloudSyncBridge.ts:8` (`markPendingLocalChanges`, `hasPendingLocalChanges`, `pendingChangesGeneration`), `:25-26` (last-error keys) | Saves mark a pending generation and merge rather than replace; the last sync error is stored. A failed sync is not silent at the storage level, but there is no visible queue UI. |

## Repeatable measurement procedure (not executed here)

1. `npm run build` then `npm run start` (vite preview) on the preview copy.
2. Open Chrome DevTools → Performance → record from navigation to first
   interaction on Team, Active Patients and Search.
3. Capture LCP, INP, long tasks (> 50 ms) and total JS transferred.
4. Repeat 5 times on a throttled "Fast 4G" profile; report median, not best.
5. For list scrolling, record 10 s of scripted scroll and count long tasks.

Suggested table (fill with real numbers when measured):

| Metric | How to measure | Baseline | Target |
| --- | --- | --- | --- |
| Team first render | DevTools LCP | not measured | none defined |
| Search keystroke cost | Performance panel, input → paint | not measured | none defined |
| Patients list render (50 rows) | React Profiler commit time | not measured | none defined |
| Long tasks while scrolling | PerformanceObserver `longtask` | not measured | none defined |

## Low-risk optimisation candidates (NOT implemented in this task)

1. Debounce the patient search input (200 ms) before filtering.
2. Precompute a lowercase search blob per patient when the patient changes,
   instead of joining fields on every keystroke.
3. Virtualise the Team and Patients lists only if measurements show > 200 rows
   are actually common; pagination already caps the render at 50.
4. Move the search filter into a `useDeferredValue` so typing stays responsive.
5. Add a visible "pending changes / last sync error" banner driven by
   `hasPendingLocalChanges()` and the two error keys.

None of these were applied. They are recorded so the next change is driven by
measurements, not by assumption.
