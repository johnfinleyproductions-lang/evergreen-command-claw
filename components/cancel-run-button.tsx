// components/cancel-run-button.tsx
//
// Phase 5.4.1 — UI cancel button. Shipped on the run detail page header.
// Phase 5.4.1 (round 2) — toast feedback.
//
// Ownership contract: this button never touches runs.status directly —
// the API route owns that transition (see ARCHITECTURE.md §4).

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";
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
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });

      if (res.status === 200) {
        toast({
          title: "Cancel requested",
          description:
            "Worker will observe the cancel within one LLM turn.",
          variant: "success",
        });
      } else if (res.status === 409) {
        toast({
          title: "Run already finished",
          description: "Nothing to cancel — status is already terminal.",
          variant: "warning",
        });
      } else {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cancel failed";
      setError(msg);
      toast({
        title: "Cancel failed",
        description: msg,
        variant: "destructive",
      });
      setPending(false);
    }
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
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
