// app/tasks/task-manager.tsx
//
// Phase 5.1 client island: the whole task list becomes interactive.
//
// State owned here:
//   - the rendered task list (hydrated from the server, re-fetched on mutation)
//   - which modal is open: none | new | edit | run
//   - which task the open modal is acting on (for edit/run)
//
// Mutations go through /api/tasks and /api/tasks/[id], then a single
// router.refresh() re-runs the server component so the list reflects the
// truth without us having to manually splice local state.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Task } from "@/lib/db/schema/tasks";
import { TaskFormDialog } from "./task-form-dialog";
import { RunTaskDialog } from "./run-task-dialog";

type ModalState =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; task: Task }
  | { kind: "run"; task: Task };

type Props = {
  initialTasks: Task[];
};

export function TaskManager({ initialTasks }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeModal = () => setModal({ kind: "none" });

  const handleDelete = async (task: Task) => {
    if (
      !confirm(
        `Delete task "${task.name}"? This cannot be undone. Existing runs for this task will be kept but will no longer link to a live template.`,
      )
    ) {
      return;
    }
    setDeletingId(task.id);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMutationSuccess = () => {
    closeModal();
    router.refresh();
  };

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Task Templates</h1>
          <p className="text-text-muted text-sm mt-1">
            {initialTasks.length === 0
              ? "No templates yet."
              : `${initialTasks.length} template${initialTasks.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ kind: "new" })}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-white text-sm font-medium transition-colors shrink-0"
        >
          + New Task
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950/50 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {initialTasks.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-surface/50 p-8 text-center">
          <p className="text-text-muted">No templates yet.</p>
          <p className="text-text-dim text-sm mt-2">
            Click <span className="text-emerald-500">+ New Task</span> to create
            your first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {initialTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-gray-800 bg-surface/50 p-4 hover:border-emerald-800 transition-colors flex items-start gap-4"
            >
              <Link
                href={`/tasks/${task.id}`}
                className="flex-1 min-w-0 -m-4 p-4 rounded-l-lg hover:bg-white/[0.02] transition-colors"
              >
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
                <span className="block text-xs text-text-dim tabular-nums font-mono mt-2">
                  {task.id.slice(0, 8)}
                </span>
              </Link>

              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setModal({ kind: "run", task })}
                  className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: "edit", task })}
                  className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-text rounded font-medium transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(task)}
                  disabled={deletingId === task.id}
                  className="px-3 py-1 text-xs bg-transparent hover:bg-red-950 text-red-400 rounded font-medium transition-colors disabled:opacity-40"
                >
                  {deletingId === task.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.kind === "new" && (
        <TaskFormDialog
          open
          mode="create"
          onClose={closeModal}
          onSuccess={handleMutationSuccess}
        />
      )}
      {modal.kind === "edit" && (
        <TaskFormDialog
          open
          mode="edit"
          task={modal.task}
          onClose={closeModal}
          onSuccess={handleMutationSuccess}
        />
      )}
      {modal.kind === "run" && (
        <RunTaskDialog
          open
          task={modal.task}
          onClose={closeModal}
        />
      )}
    </>
  );
}
