// app/runs/[id]/page.tsx
//
// Phase 3C — Run detail page. Server component that loads the run by id
// and mounts <RunLogPanel /> which streams logs via SSE.
// Phase 5.0 — Added right-rail <ArtifactPanel /> (client component, polls
// while run is non-terminal). Layout expanded from max-w-5xl single column
// to max-w-7xl flex with lg:w-80 right rail.

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { RunLogPanel } from "./run-log-panel";
import { ArtifactPanel } from "./artifact-panel";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "succeeded"
      ? "bg-green-100 text-green-800"
      : status === "failed"
      ? "bg-red-100 text-red-800"
      : status === "running"
      ? "bg-blue-100 text-blue-800 animate-pulse"
      : status === "cancelled"
      ? "bg-gray-100 text-gray-800"
      : "bg-yellow-100 text-yellow-800";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {status}
    </span>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) notFound();

  const durationSec =
    run.startedAt && run.finishedAt
      ? Math.max(0, (run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)
      : null;

  return (
    <main className="mx-auto max-w-7xl p-6 md:p-10">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            run / {run.id.slice(0, 8)}
          </h1>
          <StatusBadge status={run.status} />
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            model: <span className="font-mono">{run.model ?? "—"}</span>
          </span>
          {run.totalTokens != null && (
            <span>tokens: {run.totalTokens.toLocaleString()}</span>
          )}
          {run.tokensPerSec != null && (
            <span>{run.tokensPerSec.toFixed(1)} tok/s</span>
          )}
          {durationSec != null && <span>{durationSec.toFixed(1)}s</span>}
          <span>created: {new Date(run.createdAt).toLocaleString()}</span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          {run.input != null && (
            <section>
              <h2 className="text-sm font-medium mb-2 text-muted-foreground">
                Input
              </h2>
              <pre className="bg-muted/40 border rounded-md p-3 text-xs overflow-auto max-h-64">
                {JSON.stringify(run.input, null, 2)}
              </pre>
            </section>
          )}

          <section>
            <h2 className="text-sm font-medium mb-2 text-muted-foreground">
              Logs
            </h2>
            <RunLogPanel runId={run.id} />
          </section>

          {run.errorMessage && (
            <section>
              <h2 className="text-sm font-medium mb-2 text-red-600">Error</h2>
              <pre className="bg-red-50 text-red-900 border border-red-200 rounded-md p-3 text-xs overflow-auto max-h-64">
                {run.errorMessage}
              </pre>
            </section>
          )}

          {run.output != null && (
            <section>
              <h2 className="text-sm font-medium mb-2 text-muted-foreground">
                Output
              </h2>
              <pre className="bg-muted/40 border rounded-md p-3 text-xs overflow-auto max-h-96">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </section>
          )}
        </div>

        <aside className="lg:w-80 lg:shrink-0">
          <ArtifactPanel runId={run.id} runStatus={run.status} />
        </aside>
      </div>
    </main>
  );
}
