// app/runs/loading.tsx
//
// Skeleton for the runs index while the server query runs. Mirrors the real
// page's chrome (header + chips row + rows) so the transition is smooth.

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RunsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-full lg:w-72" />
      </div>

      <Card className="divide-y divide-border overflow-hidden p-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-6 w-20 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0 hidden sm:block" />
          </div>
        ))}
      </Card>
    </main>
  );
}
