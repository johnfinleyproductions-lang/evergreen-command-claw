# Phase 5.4.1 — UI Pass + Cancel Button

**Branch:** `phase-5.4.1-ui`
**Date:** 2026-04-14
**Closes:** issue #6 (UI cancel button)

## What changed

### Foundation
- **`app/globals.css`** — Expanded to a full shadcn-compatible token set. The
  dark Evergreen palette is kept (`--color-bg`, `--color-surface`, `--color-text`…)
  and dual-mapped to shadcn names (`--color-background`, `--color-foreground`,
  `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-ring`,
  `--color-destructive`…). Before this commit, the run detail page + dialog
  wrapper were referencing classes like `text-muted-foreground` and
  `bg-background` that had no definition — they rendered unstyled. Now
  everything resolves.
- **Primitives** (`components/ui/`) — Added `Button`, `Badge`, `Card`, `Input`,
  `Textarea`, `Label`, `Skeleton`. Dialog was already in place.
- **Shared components** — `components/run-status-badge.tsx` (canonical
  status chip with optional live-pulse dot) replaces three duplicate
  inline implementations. `components/cancel-run-button.tsx` is the new
  client-side cancel control.
- **`lib/utils/time.ts`** — Small helpers (`formatRelativeTime`,
  `formatDuration`, `formatBytes`) de-duplicated across run-row and
  artifact-panel.

### Pages
- **`app/layout.tsx`** — Inter + JetBrains Mono preconnect, `bg-background`
  body, `#main-content` landmark for skip-to-content semantics.
- **`components/top-nav.tsx`** — Lucide Terminal icon brand mark, underline
  active-link indicator, persistent "+ New run" action on the right.
- **`app/page.tsx` (dashboard)** — Stats strip (total / active / succeeded 24h
  / failed 24h) via a single SQL `filter(where…)` aggregate, Card-based
  recent-runs list, richer empty state.
- **`app/runs/page.tsx`** — Matches dashboard aesthetic, count badge in
  the header, empty state aligned with dashboard.
- **`app/runs/run-row.tsx`** — RunStatusBadge chip, relative time, token
  count chip, mono id suffix, animated chevron on hover.
- **`app/runs/[id]/page.tsx`** — Header with RunStatusBadge +
  `<CancelRunButton />` on the right. Meta chips (model, tokens, tok/s,
  duration, created-at). Input / Logs / Output / Error wrapped in Cards.
- **`app/runs/[id]/run-log-panel.tsx`** — Card-framed terminal, new
  streaming/done/error pill, consistent color tokens.
- **`app/runs/[id]/artifact-panel.tsx`** — Wrapped in Card, uses shared
  `formatBytes` / `formatRelativeTime`, "polling 5s" surfaces as a Badge.
- **`app/runs/new/new-run-form.tsx`** — Segmented Template/Custom toggle,
  shadcn Textarea for custom prompt, Card for template preview with
  Badge chips for tools-allowed, rocket icon on submit, Loader2 spinner
  on firing state.

## Cancel button contract (Phase 5.4.1)

The `<CancelRunButton>` component renders only when `status ∈ {pending, running}`.

Flow:
1. Click → `POST /api/runs/[id]/cancel`
2. Show `<Loader2 />` + "Cancelling…" — button stays disabled.
3. `200 OK` (flipped) **or** `409 Conflict` (already terminal, race
   with worker finalize) → `router.refresh()`; button unmounts on re-render
   since status is no longer cancellable.
4. `404 / 400 / 5xx` → inline destructive-toned error, button re-enables.

**Ownership contract preserved.** The component never writes `runs.status`
directly — the API route is still the sole owner of that transition
(see ARCHITECTURE.md §4). The UI is a thin trigger.

**Cancel latency.** Still ~one LLM turn (no mid-stream interruption),
per the Phase 5.4 design in ARCHITECTURE.md §15.

## What's next

- **Phase 5.4.2 (optional)** — live-streaming status on the run detail
  page so the button unmounts without a manual refresh. Plumb into the
  existing SSE log stream rather than adding a separate poller.
- **Tasks page polish** — `app/tasks/*` was left alone in this pass;
  apply the same shadcn primitives + RunStatusBadge where relevant.
- **Login page polish** — same.
- **Command palette (⌘K)** — now that we have the primitives, adding
  Radix-based cmdk is a ~half-day job.
