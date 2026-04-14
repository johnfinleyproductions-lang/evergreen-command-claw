// app/runs/[id]/error.tsx
//
// Route-scoped error boundary for the run detail page. Catches crashes in
// the artifact panel, log stream, or any server render of the run. Keeps
// the top nav intact; the user can still navigate away.

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function RunDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[run-detail error]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Could not load this run.
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Something threw while rendering. The run itself is unaffected —
              this is just the page.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded-md border border-border bg-secondary/40 p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {error.message || String(error)}
              {error.digest ? `\n\ndigest: ${error.digest}` : null}
            </pre>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" onClick={() => reset()}>
                <RotateCcw />
                Retry
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/runs">
                  <ArrowLeft />
                  Back to runs
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}
