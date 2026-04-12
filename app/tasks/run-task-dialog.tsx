// app/tasks/run-task-dialog.tsx
//
// Phase 5.1 "Run this task" dialog. Given a task, it:
//
//   1. Parses {{vars}} out of the task's prompt via extractTemplateVars.
//   2. Renders one input per variable (or a "ready to fire" panel if none).
//   3. Shows a live preview of the rendered prompt as the user types.
//   4. POSTs to /api/runs with {taskId, inputVars} and redirects to
//      /runs/[id] on success.
//
// Variable rendering happens on the server inside POST /api/runs — we only
// use the local renderPromptTemplate here to power the preview.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/db/schema/tasks";
import {
  extractTemplateVars,
  renderPromptTemplate,
} from "@/lib/prompt-template";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  task: Task;
  onClose: () => void;
};

export function RunTaskDialog({ open, task, onClose }: Props) {
  const router = useRouter();
  const vars = useMemo(() => extractTemplateVars(task.prompt), [task.prompt]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseed state every time the dialog is opened against a new task.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const v of vars) initial[v] = "";
    setValues(initial);
    setError(null);
    setSubmitting(false);
  }, [open, task.id, vars]);

  const preview = useMemo(
    () => renderPromptTemplate(task.prompt, values),
    [task.prompt, values],
  );

  const allFilled = vars.every((v) => values[v]?.trim().length > 0);
  const canSubmit = !submitting && (vars.length === 0 || allFilled);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          inputVars: values,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { run } = (await res.json()) as { run: { id: string } };
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fire run.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-gray-800 bg-background">
        <DialogHeader className="border-gray-800 bg-surface/30">
          <DialogTitle className="text-text">Run: {task.name}</DialogTitle>
          <DialogDescription className="text-text-dim">
            {vars.length === 0
              ? "No variables in this prompt — ready to fire."
              : `Fill in ${vars.length} variable${vars.length === 1 ? "" : "s"} to render the prompt.`}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto px-5 py-4 space-y-4"
          id="run-task-form"
        >
          {vars.length > 0 && (
            <div className="space-y-3">
              {vars.map((name) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-text mb-1 font-mono">
                    {`{{${name}}}`}
                  </label>
                  <input
                    type="text"
                    value={values[name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-xs text-text-dim mb-1">
              {vars.length === 0 ? "Prompt" : "Preview"}
            </div>
            <pre className="text-xs text-text whitespace-pre-wrap font-mono bg-black/40 border border-gray-800 p-3 rounded max-h-56 overflow-auto">
              {preview}
            </pre>
          </div>

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/50 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </form>

        <DialogFooter className="border-gray-800 bg-surface/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-transparent hover:bg-gray-900 text-text-muted rounded-md text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="run-task-form"
            disabled={!canSubmit}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium transition-colors"
          >
            {submitting ? "Firing…" : "Fire Run"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
