// app/runs/runs-browser.tsx
//
// Client-side filter + search over the last 100 runs. The server still
// does one cheap query (page.tsx), then hands a lean, serializable list
// here. Status chips + prompt text search, both URL-synced so filters are
// shareable and survive a reload.

"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Search, X, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunStatusBadge } from "@/components/run-status-badge";
import { formatRelativeTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

export type RunListItem = {
  id: string;
  status: string;
  createdAt: string;
  prompt: string;
  model: string | null;
  totalTokens: number | null;
};

const STATUS_CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "pending", label: "Pending" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function RunsBrowser({ runs }: { runs: RunListItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStatus = searchParams.get("status") ?? "all";
  const initialQuery = searchParams.get("q") ?? "";

  const [status, setStatus] = useState<string>(initialStatus);
  const [query, setQuery] = useState<string>(initialQuery);
  const debouncedQuery = useDebounced(query, 150);

  // Sync filter state → URL (shareable). Replace, not push, to avoid
  // polluting browser history with every keystroke.
  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (status && status !== "all") params.set("status", status);
    else params.delete("status");
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/runs?${qs}` : "/runs", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedQuery]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return runs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (q && !r.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, status, debouncedQuery]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: runs.length };
    for (const r of runs) acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, [runs]);

  const clear = useCallback(() => {
    setStatus("all");
    setQuery("");
  }, []);

  const anyFilter = status !== "all" || query.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((chip) => {
            const active = status === chip.key;
            const count = counts[chip.key] ?? 0;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatus(chip.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                  active
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-secondary/40 text-muted-foreground ring-border hover:bg-secondary/70 hover:text-foreground"
                )}
                aria-pressed={active}
              >
                {chip.label}
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

        <div className="relative w-full lg:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="pl-8 pr-8"
            aria-label="Search prompts"
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
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-foreground font-medium">
            {anyFilter ? "No runs match these filters." : "No runs yet."}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {anyFilter
              ? "Try a different status or clear the search."
              : "Once you fire a run, it’ll show up here."}
          </p>
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={clear}
            >
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing <Badge variant="muted" className="font-mono">{filtered.length}</Badge>{" "}
              of <span className="font-mono">{runs.length}</span>
            </span>
            {anyFilter && (
              <button
                type="button"
                onClick={clear}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>

          <Card className="divide-y divide-border overflow-hidden p-0">
            {filtered.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors"
              >
                <RunStatusBadge status={run.status} size="sm" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {run.prompt.length > 160
                      ? run.prompt.slice(0, 160) + "…"
                      : run.prompt}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    <span
                      className="font-mono"
                      title={new Date(run.createdAt).toISOString()}
                    >
                      {formatRelativeTime(run.createdAt)}
                    </span>
                    {run.model && <span className="font-mono">{run.model}</span>}
                    {run.totalTokens != null && run.totalTokens > 0 && (
                      <span className="tabular-nums">
                        {run.totalTokens.toLocaleString()} tok
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums shrink-0 font-mono hidden sm:inline">
                  {run.id.slice(0, 8)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
