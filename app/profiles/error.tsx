"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[profiles]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <h1 className="text-lg font-semibold">Profiles failed to load</h1>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            {error.digest && (
              <p className="text-[11px] text-muted-foreground font-mono">
                digest: {error.digest}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
