// app/tasks/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const allTasks = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text">Task Templates</h1>
        <p className="text-text-muted text-sm mt-1">
          {allTasks.length === 0
            ? "No templates yet."
            : `${allTasks.length} template${allTasks.length === 1 ? "" : "s"}`}
        </p>
      </header>

      {allTasks.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-surface/50 p-8 text-center">
          <p className="text-text-muted">No templates yet.</p>
          <p className="text-text-dim text-sm mt-2">
            Create one via <code className="text-emerald-500">POST /api/tasks</code> or a
            direct SQL insert. UI-based task creation ships in Phase 5.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {allTasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="rounded-lg border border-gray-800 bg-surface/50 p-4 hover:border-emerald-700 transition-colors block"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-text font-medium">{task.name}</h3>
                  {task.description && (
                    <p className="text-sm text-text-muted mt-1 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
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
                <span className="text-xs text-text-dim tabular-nums shrink-0 font-mono">
                  {task.id.slice(0, 8)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
