# Team Directory — layout regression tests (manual)

Status: **manual only**. This repository has no jsdom, Testing Library, Vitest,
Jest or Playwright dependency (`package.json` verified), so DOM scrolling cannot
be asserted automatically in this environment. Nothing in this document was run
automatically, and no automated pass is claimed.

Evidence anchors in `src/components/team/TeamDirectoryView.tsx`:

| Anchor | What it is |
| --- | --- |
| line 376 | Unit chip/filter row: `flex gap-2 overflow-x-auto` |
| lines 453–457 | Edit dialog shell: `fixed inset-0 … flex items-center justify-center` + `max-h-[85vh] flex flex-col overflow-hidden` |
| line 473 | Dialog body: `flex-1 min-h-0 overflow-y-auto` |

The reusable wrapper added for future use is
`src/components/team/TeamDirectoryScrollContainer.tsx` (header shrink-0,
body `flex-1 min-h-0 overflow-y-auto overscroll-contain`, footer shrink-0).

## Test matrix

Run each width in Chrome DevTools device toolbar (or resize the desktop window),
signed in as a **non-owner member of at least two units with 12+ colleagues**.

### 320 × 568 (small phone)

1. Open Team.
2. Expected: the page header and search box stay visible.
3. Scroll the member list to the last member — the header must not move.
4. Open a member's edit dialog.
5. Expected: the dialog header (name + close X) and the Save/Cancel actions stay
   visible; only the middle section scrolls.
6. Scroll the unit chip row sideways — it scrolls, it does not wrap or clip.
7. Expected: no horizontal page scrollbar; long names wrap instead of clipping.

### 375 × 667 (phone)

Repeat steps 1–7. Expected results identical.

### 768 × 1024 (tablet)

1. Open Team and the edit dialog.
2. Expected: dialog is centred with a visible backdrop; body scrolls; header and
   actions remain fixed.
3. Expected: the chip row fits without a scrollbar when fewer than ~8 units.

### 1024 × 768 and 1280 × 800 (desktop)

1. Open Team.
2. Expected: member cards use the wider grid; the page itself does not scroll
   behind an open dialog (backdrop covers it).
3. Open the edit dialog and scroll to the bottom.
4. Expected: Save is reachable without scrolling the page behind the dialog.

## Known limitation

`TeamDirectoryView.tsx` is **not** refactored to use the new wrapper in this
preview: it already has the correct header/body split (lines 453–473), so the
wrapper is shipped unused and available for the integration step. The checklist
above is the regression check for the current implementation.
