// app/tasks/task-form-dialog.tsx
//
// Phase 5.1 create/edit form, rendered inside a Radix Dialog.
//
// One component handles both modes — `mode: "create"` maps to POST /api/tasks,
// `mode: "edit"` maps to PATCH /api/tasks/[id] with the original task passed
// in as `task`. Fields:
//
//   - name            required, non-empty
//   - description     optional
//   - prompt          required, non-empty (supports {{vars}})
//   - systemPrompt    optional
//   - toolsAllowed    comma-separated string → string[] on submit
//   - tags            comma-separated string → string[] on submit
//   - inputSchema     raw JSON textarea, parsed on submit, optional
//
// The inputSchema JSON textarea is the scope concession from the planning
// questions: it's the simplest thing that works, and power users can paste
// a real JSON Schema in without fighting the UI. If it ever becomes a pain
// point a structured key/value builder can replace it without touching the
// API contract.

"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/db/schema/tasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props =
  | {
      open: boolean;
      mode: "create";
      task?: undefined;
      onClose: () => void;
      onSuccess: () => void;
    }
  | {
      open: boolean;
      mode: "edit";
      task: Task;
      onClose: () => void;
      onSuccess: () => void;
    };

function arrayToCsv(xs: string[] | null | undefined): string {
  return (xs ?? []).join(", ");
}

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function TaskFormDialog(props: Props) {
  const { open, mode, onClose, onSuccess } = props;
  const existing = mode === "edit" ? props.task : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    existing?.systemPrompt ?? "",
  );
  const [toolsAllowedCsv, setToolsAllowedCsv] = useState(
    arrayToCsv(existing?.toolsAllowed ?? []),
  );
  const [tagsCsv, setTagsCsv] = useState(arrayToCsv(existing?.tags ?? []));
  const [inputSchemaText, setInputSchemaText] = useState(
    existing?.inputSchema
      ? JSON.stringify(existing.inputSchema, null, 2)
      : "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the dialog re-opens on a different task in edit mode, reseed state.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setPrompt(existing?.prompt ?? "");
    setSystemPrompt(existing?.systemPrompt ?? "");
    setToolsAllowedCsv(arrayToCsv(existing?.toolsAllowed ?? []));
    setTagsCsv(arrayToCsv(existing?.tags ?? []));
    setInputSchemaText(
      existing?.inputSchema ? JSON.stringify(existing.inputSchema, null, 2) : "",
    );
    setError(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError("Name is required.");
      return;
    }
    if (prompt.trim().length === 0) {
      setError("Prompt is required.");
      return;
    }

    let parsedInputSchema: Record<string, unknown> | null = null;
    if (inputSchemaText.trim().length > 0) {
      try {
        const parsed = JSON.parse(inputSchemaText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Input schema must be a JSON object (not array or null).");
        }
        parsedInputSchema = parsed as Record<string, unknown>;
      } catch (err) {
        setError(
          err instanceof Error
            ? `Input schema: ${err.message}`
            : "Input schema: invalid JSON.",
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        prompt: prompt.trim(),
        systemPrompt:
          systemPrompt.trim().length > 0 ? systemPrompt.trim() : null,
        toolsAllowed: csvToArray(toolsAllowedCsv),
        tags: csvToArray(tagsCsv),
        inputSchema: parsedInputSchema,
      };

      const url =
        mode === "create"
          ? "/api/tasks"
          : `/api/tasks/${existing!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-gray-800 bg-background">
        <DialogHeader className="border-gray-800 bg-surface/30">
          <DialogTitle className="text-text">
            {mode === "create" ? "New Task Template" : `Edit: ${existing!.name}`}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            Reusable prompt blueprints. Use <code>{`{{variable}}`}</code> in the
            prompt to collect input at run time.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto px-5 py-4 space-y-4"
          id="task-form"
        >
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research brief on <topic>"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm focus:outline-none focus:border-emerald-600"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional one-liner explaining what this task does"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Prompt <span className="text-red-400">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder="Write a research brief about {{topic}}. Use {{style}} tone."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm font-mono focus:outline-none focus:border-emerald-600 resize-y"
            />
            <p className="text-xs text-text-dim mt-1">
              Variables like <code>{`{{topic}}`}</code> become form inputs when
              you click Run.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              placeholder="Optional. Overrides the default agent system prompt for runs of this task."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm font-mono focus:outline-none focus:border-emerald-600 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Tools Allowed
              </label>
              <input
                type="text"
                value={toolsAllowedCsv}
                onChange={(e) => setToolsAllowedCsv(e.target.value)}
                placeholder="web_search, fetch_url, write_brief"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm focus:outline-none focus:border-emerald-600"
              />
              <p className="text-xs text-text-dim mt-1">Comma-separated.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Tags
              </label>
              <input
                type="text"
                value={tagsCsv}
                onChange={(e) => setTagsCsv(e.target.value)}
                placeholder="research, brief, internal"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm focus:outline-none focus:border-emerald-600"
              />
              <p className="text-xs text-text-dim mt-1">Comma-separated.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Input Schema (JSON, optional)
            </label>
            <textarea
              value={inputSchemaText}
              onChange={(e) => setInputSchemaText(e.target.value)}
              rows={6}
              placeholder={'{\n  "type": "object",\n  "properties": {\n    "topic": { "type": "string" }\n  }\n}'}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-xs font-mono focus:outline-none focus:border-emerald-600 resize-y"
            />
            <p className="text-xs text-text-dim mt-1">
              JSON Schema describing the expected inputVars. Leave blank to
              skip. Validated on submit.
            </p>
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
            form="task-form"
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium transition-colors"
          >
            {submitting
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create Task"
                : "Save Changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
