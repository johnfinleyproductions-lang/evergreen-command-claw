// app/runs/new/new-run-form.tsx
//
// Phase 5.4.1 — rebuilt on shadcn primitives (Button, Textarea, Label,
// Card, Badge). Native select is styled to match Input.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Loader2 } from "lucide-react";
import type { Task } from "@/lib/db/schema/tasks";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Mode = "template" | "custom";

type Props = {
  tasks: Task[];
  initialTaskId?: string;
};

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

  const canSubmit =
    !submitting &&
    ((mode === "template" && selectedTaskId.length > 0) ||
      (mode === "custom" && customPrompt.trim().length > 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body =
        mode === "template"
          ? { taskId: selectedTaskId }
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
      {/* Segmented mode toggle */}
      <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-1">
        <button
          type="button"
          onClick={() => setMode("template")}
          disabled={!hasTemplates}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "template"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            !hasTemplates && "opacity-40 cursor-not-allowed"
          )}
        >
          Template
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "custom"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Custom
        </button>
      </div>

      {mode === "template" &&
        (hasTemplates ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-select">Template</Label>
              <select
                id="task-select"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-secondary/40 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTask && (
              <Card className="p-5 space-y-3">
                {selectedTask.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedTask.description}
                  </p>
                )}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Prompt
                  </div>
                  <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-mono bg-black/40 p-3 rounded-md max-h-48 overflow-auto border border-border">
                    {selectedTask.prompt}
                  </pre>
                </div>
                {selectedTask.toolsAllowed &&
                  selectedTask.toolsAllowed.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Tools allowed
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.toolsAllowed.map((tool) => (
                          <Badge
                            key={tool}
                            variant="muted"
                            className="font-mono text-[10px]"
                          >
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </Card>
            )}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-foreground font-medium">No templates yet.</p>
            <p className="text-muted-foreground text-sm mt-1">
              Create one from the{" "}
              <a
                href="/tasks"
                className="text-primary hover:underline underline-offset-4"
              >
                Tasks
              </a>{" "}
              page or switch to Custom mode.
            </p>
          </Card>
        ))}

      {mode === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="custom-prompt">Prompt</Label>
          <Textarea
            id="custom-prompt"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={10}
            placeholder="Describe what you want the agent to do…"
            className="font-mono text-sm min-h-[220px] resize-y"
          />
          <p className="text-xs text-muted-foreground">
            The worker will run this through the full agent loop with all
            default tools allowed.
          </p>
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Firing…
            </>
          ) : (
            <>
              <Rocket />
              Fire run
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
