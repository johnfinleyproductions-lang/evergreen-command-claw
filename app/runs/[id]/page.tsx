// app/runs/[id]/page.tsx
//
// Phase 3C — Run detail page.
// Phase 5.0 — Added right-rail <ArtifactPanel />.
// Phase 5.4.1 — UI pass: shadcn primitives, canonical RunStatusBadge,
// CancelRunButton + RunActionsMenu wired into the header.

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunStatusBadge } from "@/components/run-status-badge";
import { CancelRunButton } from "@/components/cancel-run-button";
import { RunActionsMenu } from "@/components/run-actions-menu";
import { formatDuration, formatRelativeTime } from "@/lib/utils/time";
import { RunLogPanel } from "./run-log-panel";
import { ArtifactPanel } from "./artifact-panel";

export const dynamic = "force-dynamic";

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

  const input = (run.input ?? {}) as {
    prompt?: unknown;
    taskId?: unknown;
  };
  const runPrompt =
    typeof input.prompt === "string" && input.prompt.length > 0
      ? input.prompt
      : null;
  const runTaskId =
    typeof input.taskId === "string" && input.taskId.length > 0
      ? input.taskId
      : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight truncate">
                run / {run.id.slice(0, 8)}
              </h1>
              <RunStatusBadge status={run.status} />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="muted" className="font-mono">
                {run.model ?? "—"}
              </Badge>
              {run.totalTokens != null && run.totalTokens > 0 && (
                <Badge variant="muted" className="tabular-nums">
                  {run.totalTokens.toLocaleString()} tokens
                </Badge>
              )}
              {run.tokensPerSec != null && (
                <Badge variant="muted" className="tabular-nums">
                  {run.tokensPerSec.toFixed(1)} tok/s
                </Badge>
              )}
              {durationSec != null && (
                <Badge variant="muted">{formatDuration(durationSec)}</Badge>
              )}
              <Badge variant="muted">
                created {formatRelativeTime(run.createdAt)}
              </Badge>
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <CancelRunButton runId={run.id} status={run.status} />
            <RunActionsMenu
              runId={run.id}
              prompt={runPrompt}
              taskId={runTaskId}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          {run.input != null && (
            <Card>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Input
                </h2>
              </div>
              <pre className="p-4 text-xs overflow-auto max-h-64 font-mono text-foreground/90">
                {JSON.stringify(run.input, null, 2)}
              </pre>
            </Card>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Logs
              </h2>
            </div>
            <RunLogPanel runId={run.id} />
          </section>

          {run.errorMessage && (
            <Card className="border-destructive/40 bg-destructive/5">
              <div className="px-5 py-3 border-b border-destructive/30">
                <h2 className="text-xs font-medium uppercase tracking-wider text-destructive">
                  Error
                </h2>
              </div>
              <pre className="p-4 text-xs overflow-auto max-h-64 font-mono text-destructive/90 whitespace-pre-wrap break-words">
                {run.errorMessage}
              </pre>
            </Card>
          )}

          {run.output != null && (
            <Card>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Output
                </h2>
              </div>
              <pre className="p-4 text-xs overflow-auto max-h-96 font-mono text-foreground/90">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </Card>
          )}
        </div>

        <aside className="lg:w-80 lg:shrink-0">
          <ArtifactPanel runId={run.id} runStatus={run.status} />
        </aside>
      </div>
    </main>
  );
}
