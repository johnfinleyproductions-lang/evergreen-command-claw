// app/tasks/[id]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";
import { runs } from "@/lib/db/schema/runs";
import { RunRow } from "@/app/runs/run-row";

export const dynamic = "force-dynamic";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_SHAPE.test(id)) notFound();

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!task) notFound();

  const taskRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.taskId, id))
    .orderBy(desc(runs.createdAt))
    .limit(50);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-text">{task.name}</h1>
            {task.description && (
              <p className="text-text-muted mt-1">{task.description}</p>
            )}
            {task.tags && task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-gray-800 text-text-muted rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link
            href={`/runs/new?taskId=${task.id}`}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-white text-sm font-medium transition-colors shrink-0"
          >
            + Run this Task
          </Link>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-text-muted mb-2">Prompt Template</h2>
        <pre className="rounded-lg border border-gray-800 bg-black/50 p-4 text-sm text-text whitespace-pre-wrap font-mono overflow-auto max-h-96">
          {task.prompt}
        </pre>
      </section>

      {task.systemPrompt && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-text-muted mb-2">System Prompt</h2>
          <pre className="rounded-lg border border-gray-800 bg-black/50 p-4 text-sm text-text whitespace-pre-wrap font-mono overflow-auto max-h-64">
            {task.systemPrompt}
          </pre>
        </section>
      )}

      {task.toolsAllowed && task.toolsAllowed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-text-muted mb-2">Tools Allowed</h2>
          <div className="flex flex-wrap gap-2">
            {task.toolsAllowed.map((tool) => (
              <span
                key={tool}
                className="px-3 py-1 text-sm bg-gray-800 text-text rounded font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-text mb-3">Run History</h2>
        {taskRuns.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-surface/50 p-6 text-center">
            <p className="text-text-muted">No runs yet for this task.</p>
            <Link
              href={`/runs/new?taskId=${task.id}`}
              className="inline-block mt-3 text-emerald-500 hover:text-emerald-400"
            >
              Fire the first run →
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-surface/50 divide-y divide-gray-800 overflow-hidden">
            {taskRuns.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
