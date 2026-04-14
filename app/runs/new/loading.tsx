// app/runs/new/loading.tsx
//
// New-run form skeleton.

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewRunLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 mt-2" />
      </header>

      <Card className="p-5">
        <Skeleton className="h-9 w-64 mb-5" />
        <div className="space-y-4">
          <div>
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-28 w-full" />
          </div>
          <div>
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </Card>
    </main>
  );
}
