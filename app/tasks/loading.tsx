// app/tasks/loading.tsx
//
// Task list skeleton. Mirrors the real TaskManager chrome.

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-80 mt-2" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-full lg:w-72" />
      </div>

      <Card className="divide-y divide-border overflow-hidden p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 px-5 py-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-1.5 pt-1">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
