// app/runs/[id]/loading.tsx
//
// Run detail skeleton. Matches the real layout: header + meta chips,
// two-column input/output cards, logs panel.

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RunDetailLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-24" />
          ))}
        </div>
      </header>

      <Card className="p-5 mb-4">
        <Skeleton className="h-4 w-20 mb-3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6 mt-2" />
        <Skeleton className="h-4 w-4/6 mt-2" />
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <Skeleton className="h-4 w-20 mb-3" />
        <Skeleton className="h-32 w-full" />
      </Card>
    </main>
  );
}
