// app/runs/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RunRow } from "./run-row";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">All runs</h1>
            <Badge variant="muted" className="font-mono">
              {rows.length === 100 ? "last 100" : `${rows.length} total`}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Every agent run, newest first.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/runs/new">
            <Plus />
            New run
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-foreground font-medium">No runs yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Once you fire a run, it’ll show up here.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {rows.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </Card>
      )}
    </main>
  );
}
