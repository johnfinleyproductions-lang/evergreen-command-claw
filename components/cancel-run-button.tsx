// components/cancel-run-button.tsx
//
// Phase 5.4.1 — UI cancel button. Shipped on the run detail page header.
//
// Design:
//   - Only renders when status ∈ {pending, running}.
//   - On click: POST /api/runs/[id]/cancel, show optimistic "Cancelling…".
//   - Because backend cancel is cooperative (one LLM turn of latency), we
//     do NOT flip the UI straight to 'cancelled' — we show the pending state
//     and let router.refresh() + artifact-panel polling do the reveal.
//   - 409 response = already terminal (race with worker); we still refresh.
//   - 404/400/500 → inline error, button re-enabled for a retry.
//
// The ARCHITECTURE.md §4 ownership contract is preserved: this button
// never touches runs.status directly — the API route owns that transition.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type Props = {
  runId: string;
  status: string;
  className?: string;
};

const CANCELLABLE = new Set(["pending", "running"]);

export function CancelRunButton({ runId, status, className }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!CANCELLABLE.has(status)) return null;

  const handleClick = async () => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // 200 = flipped to cancelled, 409 = already terminal. Either way,
      // server state has moved on — refresh the page to pick it up.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
      setPending(false);
    }
    // Note: we leave `pending` true on success so the button stays disabled
    // until the refresh swaps it out (CANCELLABLE check above).
  };

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Cancelling…
          </>
        ) : (
          <>
            <XCircle />
            Cancel run
          </>
        )}
      </Button>
      {error && (
        <span className="text-[11px] text-destructive">{error}</span>
      )}
    </div>
  );
}
