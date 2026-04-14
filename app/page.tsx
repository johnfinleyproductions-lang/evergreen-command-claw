// app/page.tsx

import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RunRow } from "./runs/run-row";

export const dynamic = "force-dynamic";

async function loadStats() {
  const [totals] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      active: sql<number>`cast(count(*) filter (where status in ('pending','running')) as int)`,
      succeeded24h: sql<number>`cast(count(*) filter (where status = 'succeeded' and created_at > now() - interval '24 hours') as int)`,
      failed24h: sql<number>`cast(count(*) filter (where status in ('failed','cancelled') and created_at > now() - interval '24 hours') as int)`,
    })
    .from(runs);
  return (
    totals ?? { total: 0, active: 0, succeeded24h: 0, failed24h: 0 }
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1.5 text-3xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const [recent, stats] = await Promise.all([
    db.select().from(runs).orderBy(desc(runs.createdAt)).limit(8),
    loadStats(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Evergreen Command
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Local AI task runner ·{" "}
            <span className="font-mono text-xs">Nemotron-3-Super-120B</span>{" "}
            · Framestation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tasks">
              <Sparkles />
              Templates
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/runs/new">
              <Plus />
              New run
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard label="Total runs" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="primary" />
        <StatCard
          label="Succeeded (24h)"
          value={stats.succeeded24h}
          tone="primary"
        />
        <StatCard
          label="Failed / cancelled (24h)"
          value={stats.failed24h}
          tone={stats.failed24h > 0 ? "warning" : "default"}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Recent runs</h2>
          <Link
            href="/runs"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-foreground font-medium">No runs yet.</p>
            <p className="text-muted-foreground text-sm mt-1">
              Fire your first run to see it here.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/runs/new">
                <Plus />
                New run
              </Link>
            </Button>
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden p-0">
            {recent.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </Card>
        )}
      </section>
    </main>
  );
}
