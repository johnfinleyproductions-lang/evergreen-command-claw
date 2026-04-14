// app/page.tsx

import Link from "next/link";
import { desc, sql, gte } from "drizzle-orm";
import { ArrowRight, Plus, Sparkles, Activity } from "lucide-react";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RunRow } from "./runs/run-row";
import { ActivityHeatmap, type DayBucket } from "./activity-heatmap";
import { SpendPanel, type SpendRun } from "./spend-panel";

export const dynamic = "force-dynamic";

const HEATMAP_WEEKS = 13;
const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

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

/**
 * Build contiguous day buckets covering the last N days ending today in
 * local time. Returns the full list (zeros included) ordered oldest →
 * newest so <ActivityHeatmap> can render columns left→right.
 */
function bucketDays(
  rows: { createdAt: Date; failed: boolean }[],
  days: number
): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, total: 0, failed: 0 });
  }
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue; // outside the window; defensive
    b.total += 1;
    if (r.failed) b.failed += 1;
  }
  return Array.from(buckets.values());
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
  // Cutoff for the heatmap + spend window. We pull everything in a single
  // query, then bucket in-process so we only hit Postgres twice for the page.
  const heatmapStart = new Date();
  heatmapStart.setDate(heatmapStart.getDate() - (HEATMAP_DAYS - 1));
  heatmapStart.setHours(0, 0, 0, 0);

  const [recent, stats, windowRows] = await Promise.all([
    db.select().from(runs).orderBy(desc(runs.createdAt)).limit(8),
    loadStats(),
    db
      .select({
        id: runs.id,
        createdAt: runs.createdAt,
        status: runs.status,
        model: runs.model,
        totalTokens: runs.totalTokens,
      })
      .from(runs)
      .where(gte(runs.createdAt, heatmapStart))
      .orderBy(desc(runs.createdAt)),
  ]);

  const days = bucketDays(
    windowRows.map((r) => ({
      createdAt: r.createdAt as Date,
      failed: r.status === "failed" || r.status === "cancelled",
    })),
    HEATMAP_DAYS
  );

  const spendRuns: SpendRun[] = windowRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt as Date,
    model: r.model,
    totalTokens: r.totalTokens,
  }));

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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 mb-10">
        <Card className="p-5">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Activity</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Every run, every day. Hover a cell for counts.
          </p>
          <ActivityHeatmap days={days} weeks={HEATMAP_WEEKS} />
        </Card>
        <SpendPanel runs={spendRuns} />
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
