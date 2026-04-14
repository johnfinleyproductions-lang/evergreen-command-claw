// app/error.tsx
//
// Next 15 App Router requires a client component here — it renders when an
// uncaught exception bubbles out of a server component or a client tree
// under the root layout. Scope is everything except the root layout itself;
// for layout-level crashes there's a separate global-error.tsx below.
//
// The goal: never show a blank screen. Give the user the failure context,
// a retry button (reset()), and a way home.

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log to the console so users can copy-paste into a bug report and so
  // browser extensions like Sentry replay can pick it up.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Card className="p-8">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              Something broke.
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              An uncaught error bubbled out of this page. Your data is safe —
              this is just a render failure.
            </p>

            <pre className="mt-4 max-h-48 overflow-auto rounded-md border border-border bg-secondary/40 p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {error.message || String(error)}
              {error.digest && (
                <>
                  {"\n\n"}
                  <span className="text-foreground">digest:</span>{" "}
                  {error.digest}
                </>
              )}
            </pre>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={() => reset()} size="sm">
                <RotateCcw />
                Try again
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/">
                  <Home />
                  Dashboard
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}
