// app/loading.tsx
//
// Root-level loading state. Next renders this while the server components in
// app/page.tsx are fetching. Keep it quick-to-render and close to the final
// layout so the visual jump is minimal.

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Card className="divide-y divide-border overflow-hidden p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-6 w-20 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
