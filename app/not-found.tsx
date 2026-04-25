// app/not-found.tsx
//
// Caught whenever notFound() is thrown or a route doesn't resolve.

import Link from "next/link";
import { Compass, Home, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Card className="p-8 text-center">
        <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
          <Compass className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          404 — nothing here.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The URL you tried doesn&rsquo;t match any route. Might be a typo, or
          the run/task may have been deleted.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <Button asChild size="sm">
            <Link href="/">
              <Home />
              Dashboard
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/runs">
              <ListOrdered />
              All runs
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
