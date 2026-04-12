// app/runs/new/new-run-form.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/db/schema/tasks";
import {
  extractTemplateVars,
  renderPromptTemplate,
} from "@/lib/prompt-template";

type Mode = "template" | "custom";

type Props = {
  tasks: Task[];
  initialTaskId?: string;
};

/**
 * Pull a human-readable hint for a template variable out of the task's
 * JSON-Schema-shaped inputSchema column, if one exists. Returns undefined
 * when no description is defined so callers can fall back to a generic
 * placeholder.
 */
function getVarDescription(
  inputSchema: unknown,
  varName: string,
): string | undefined {
  if (!inputSchema || typeof inputSchema !== "object") return undefined;
  const schema = inputSchema as {
    properties?: Record<string, { description?: string } | undefined>;
  };
  return schema.properties?.[varName]?.description;
}

export function NewRunForm({ tasks, initialTaskId }: Props) {
  const router = useRouter();

  const hasTemplates = tasks.length > 0;
  const preselected =
    initialTaskId && tasks.some((t) => t.id === initialTaskId)
      ? initialTaskId
      : (tasks[0]?.id ?? "");

  const [mode, setMode] = useState<Mode>(hasTemplates ? "template" : "custom");
  const [selectedTaskId, setSelectedTaskId] = useState<string>(preselected);
  const [customPrompt, setCustomPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  // Pull {{vars}} out of the selected task's prompt.
  const vars = useMemo(
    () => (selectedTask ? extractTemplateVars(selectedTask.prompt) : []),
    [selectedTask],
  );

  // One string state per variable. Reset whenever the selected task changes
  // so we don't leak inputs across templates.
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const v of vars) initial[v] = "";
    setValues(initial);
  }, [selectedTaskId, vars]);

  // Live preview of the rendered prompt as the user types.
  const preview = useMemo(() => {
    if (!selectedTask) return "";
    return renderPromptTemplate(selectedTask.prompt, values);
  }, [selectedTask, values]);

  const allVarsFilled = vars.every((v) => values[v]?.trim().length > 0);

  const canSubmit =
    !submitting &&
    ((mode === "template" &&
      selectedTaskId.length > 0 &&
      (vars.length === 0 || allVarsFilled)) ||
      (mode === "custom" && customPrompt.trim().length > 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body =
        mode === "template"
          ? { taskId: selectedTaskId, inputVars: values }
          : { prompt: customPrompt };

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const { run } = (await res.json()) as { run: { id: string } };
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("template")}
          disabled={!hasTemplates}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "template"
              ? "bg-emerald-600 text-white"
              : "bg-gray-800 text-text-muted hover:bg-gray-700"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Template
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "custom"
              ? "bg-emerald-600 text-white"
              : "bg-gray-800 text-text-muted hover:bg-gray-700"
          }`}
        >
          Custom
        </button>
      </div>

      {mode === "template" &&
        (hasTemplates ? (
          <>
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Template
              </label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text focus:outline-none focus:border-emerald-600"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTask && (
              <>
                <div className="rounded-lg border border-gray-800 bg-surface/50 p-4">
                  {selectedTask.description && (
                    <p className="text-sm text-text-muted mb-3">
                      {selectedTask.description}
                    </p>
                  )}
                  {selectedTask.toolsAllowed &&
                    selectedTask.toolsAllowed.length > 0 && (
                      <div>
                        <div className="text-xs text-text-dim mb-1">
                          Tools allowed
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {selectedTask.toolsAllowed.map((tool) => (
                            <span
                              key={tool}
                              className="px-2 py-0.5 text-xs bg-gray-800 text-text rounded"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                {vars.length > 0 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-text">
                        Inputs
                      </h3>
                      <p className="text-xs text-text-dim mt-1">
                        Fill in the {vars.length} variable
                        {vars.length === 1 ? "" : "s"} this task needs before
                        firing the run.
                      </p>
                    </div>
                    {vars.map((name) => {
                      const hint = getVarDescription(
                        selectedTask.inputSchema,
                        name,
                      );
                      return (
                        <div key={name}>
                          <label className="block text-sm font-medium text-text mb-1 font-mono">
                            {`{{${name}}}`}
                          </label>
                          {hint && (
                            <p className="text-xs text-text-dim mb-2">
                              {hint}
                            </p>
                          )}
                          <textarea
                            value={values[name] ?? ""}
                            onChange={(e) =>
                              setValues((prev) => ({
                                ...prev,
                                [name]: e.target.value,
                              }))
                            }
                            rows={4}
                            placeholder={
                              hint ?? `Value for {{${name}}}…`
                            }
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text text-sm font-mono focus:outline-none focus:border-emerald-600 resize-y"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <div className="text-xs text-text-dim mb-1">
                    {vars.length === 0 ? "Prompt" : "Preview"}
                  </div>
                  <pre className="text-xs text-text whitespace-pre-wrap font-mono bg-black/40 border border-gray-800 p-3 rounded max-h-64 overflow-auto">
                    {preview}
                  </pre>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-surface/50 p-6 text-center">
            <p className="text-text-muted">No templates yet.</p>
            <p className="text-text-dim text-sm mt-1">
              Create one via <code className="text-emerald-500">POST /api/tasks</code> or
              switch to Custom mode.
            </p>
          </div>
        ))}

      {mode === "custom" && (
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Prompt
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={10}
            placeholder="Describe what you want the agent to do…"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-text font-mono text-sm focus:outline-none focus:border-emerald-600 resize-y"
          />
          <p className="text-xs text-text-dim mt-1">
            The worker will run this through the full agent loop with all
            default tools allowed.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-md text-white font-medium transition-colors"
        >
          {submitting ? "Firing…" : "Fire Run"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 bg-transparent hover:bg-gray-900 text-text-muted rounded-md font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
