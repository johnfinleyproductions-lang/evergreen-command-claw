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
//
// UI refresh (phase-5.4.1-ui round 3): rebuilt on shadcn primitives to match
// the rest of the app. Behavior + API contracts are unchanged.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  AlertTriangle,
  FileCode2,
  Search,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { Task } from "@/lib/db/schema/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
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
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

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

  // Union of all tags, sorted, used for the filter strip.
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of initialTasks) {
      for (const tag of t.tags ?? []) s.add(tag);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [initialTasks]);

  // Filtered view based on the search box + tag chip.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialTasks.filter((t) => {
      if (tagFilter && !(t.tags ?? []).includes(tagFilter)) return false;
      if (!q) return true;
      const hay = [
        t.name,
        t.description ?? "",
        (t.tags ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [initialTasks, query, tagFilter]);

  const anyFilter = Boolean(query.trim() || tagFilter);

  return (
    <>
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Task templates
            </h1>
            <Badge variant="muted" className="font-mono">
              {initialTasks.length === 0
                ? "none"
                : `${initialTasks.length} total`}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Parameterized prompts you can fire as runs. Edit here, run anywhere.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setModal({ kind: "new" })}
        >
          <Plus />
          New task
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Could not delete</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {initialTasks.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
            <FileCode2 className="h-5 w-5" />
          </div>
          <p className="text-foreground font-medium">No templates yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Click{" "}
            <span className="text-primary font-medium">+ New task</span> to
            create your first one.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setModal({ kind: "new" })}
          >
            <Plus />
            New task
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            {allTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTagFilter(null)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                    tagFilter === null
                      ? "bg-primary text-primary-foreground ring-primary"
                      : "bg-secondary/40 text-muted-foreground ring-border hover:bg-secondary/70 hover:text-foreground"
                  )}
                  aria-pressed={tagFilter === null}
                >
                  All
                  <span
                    className={cn(
                      "tabular-nums font-mono text-[10px]",
                      tagFilter === null ? "opacity-80" : "opacity-60"
                    )}
                  >
                    {initialTasks.length}
                  </span>
                </button>
                {allTags.map((tag) => {
                  const count = initialTasks.filter((t) =>
                    (t.tags ?? []).includes(tag)
                  ).length;
                  const active = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(active ? null : tag)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                        active
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-secondary/40 text-muted-foreground ring-border hover:bg-secondary/70 hover:text-foreground"
                      )}
                      aria-pressed={active}
                    >
                      {tag}
                      <span
                        className={cn(
                          "tabular-nums font-mono text-[10px]",
                          active ? "opacity-80" : "opacity-60"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span />
            )}

            <div className="relative w-full lg:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="pl-8 pr-8"
                aria-label="Search templates"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-foreground font-medium">
                No templates match these filters.
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Try a different tag or clear the search.
              </p>
              {anyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setQuery("");
                    setTagFilter(null);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing{" "}
                  <Badge variant="muted" className="font-mono">
                    {filtered.length}
                  </Badge>{" "}
                  of{" "}
                  <span className="font-mono">{initialTasks.length}</span>
                </span>
                {anyFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setTagFilter(null);
                    }}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <Card className="divide-y divide-border overflow-hidden p-0">
                {filtered.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-start gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors"
                  >
                    <Link
                      href={`/tasks/${task.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <h3 className="text-sm font-medium text-foreground truncate">
                          {task.name}
                        </h3>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="muted"
                                className="font-mono text-[10px]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
                          {task.id.slice(0, 8)}
                        </span>
                      </div>
                    </Link>

                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setModal({ kind: "run", task })}
                      >
                        <Play />
                        Run
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setModal({ kind: "edit", task })}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deletingId === task.id}
                        onClick={() => handleDelete(task)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {deletingId === task.id ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
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
