import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="mb-6 rounded-xl border-2 border-dashed border-border bg-secondary/20 p-8 text-center">
        <Skeleton className="h-6 w-6 mx-auto mb-2" />
        <Skeleton className="h-4 w-52 mx-auto" />
        <Skeleton className="h-3 w-64 mx-auto mt-2" />
      </div>
      <Card className="p-0 divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-5 py-4">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
