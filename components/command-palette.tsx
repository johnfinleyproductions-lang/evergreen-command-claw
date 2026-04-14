// components/command-palette.tsx
//
// ⌘K / Ctrl+K command palette. Self-contained Radix-Dialog implementation
// — no new runtime deps (no cmdk package). Three item groups:
//   1. Actions   — static nav + page-level actions
//   2. Runs      — fetched from /api/runs?limit=25 on open, fuzzy-searched
//   3. Tasks     — fetched from /api/tasks on open, fuzzy-searched
//
// Keybindings:
//   ⌘K / Ctrl+K   → toggle
//   ↑ / ↓         → move selection
//   Enter         → activate
//   Esc           → close
//
// Fuzzy match is the same simple scoring as Cmd-E / fzf: each query char
// must appear in order, consecutive-match bonus, prefix bonus. Fast enough
// for the list sizes we care about (< 100 items) without pulling in fuse.js.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Plus,
  FileCode2,
  Terminal,
  CornerDownLeft,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RunStatusDot } from "@/components/run-status-badge";
import { cn } from "@/lib/utils/cn";

type PaletteItem = {
  id: string;
  group: "action" | "run" | "task";
  label: string;
  hint?: string;
  // Secondary search corpus (e.g. prompt text / tags)
  extra?: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

type RunFromApi = {
  id: string;
  status: string;
  input: { prompt?: unknown } | null;
  model: string | null;
  createdAt: string;
};

type TaskFromApi = {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
};

// Lightweight fzf-style scorer. Returns -1 if not a subsequence match,
// otherwise a score where higher = better.
function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const H = haystack.toLowerCase();
  const N = needle.toLowerCase();
  let score = 0;
  let hi = 0;
  let prevMatch = -2;
  for (let ni = 0; ni < N.length; ni++) {
    const ch = N[ni];
    const found = H.indexOf(ch, hi);
    if (found === -1) return -1;
    score += 10;
    if (found === prevMatch + 1) score += 8; // consecutive bonus
    if (found === 0) score += 6; // prefix bonus
    // earlier match = better
    score -= found * 0.1;
    prevMatch = found;
    hi = found + 1;
  }
  // Shorter haystacks win the tiebreak.
  score -= H.length * 0.05;
  return score;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [runs, setRuns] = useState<RunFromApi[] | null>(null);
  const [tasks, setTasks] = useState<TaskFromApi[] | null>(null);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K global toggle
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // Reset internal state on open, refocus input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Lazy fetch runs + tasks when first opened.
  useEffect(() => {
    if (!open) return;
    if (runs !== null && tasks !== null) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/runs?limit=25", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { runs: [] }
      ),
      fetch("/api/tasks", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { tasks: [] }
      ),
    ])
      .then(([r, t]) => {
        if (cancelled) return;
        setRuns(Array.isArray(r?.runs) ? r.runs : []);
        setTasks(Array.isArray(t?.tasks) ? t.tasks : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRuns([]);
        setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, runs, tasks]);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const allItems = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: "nav:dashboard",
        group: "action",
        label: "Go to Dashboard",
        hint: "g d",
        icon: <LayoutDashboard className="h-4 w-4" />,
        onSelect: () => go("/"),
      },
      {
        id: "nav:runs",
        group: "action",
        label: "Go to Runs",
        hint: "g r",
        icon: <ListOrdered className="h-4 w-4" />,
        onSelect: () => go("/runs"),
      },
      {
        id: "nav:tasks",
        group: "action",
        label: "Go to Tasks",
        icon: <FileCode2 className="h-4 w-4" />,
        onSelect: () => go("/tasks"),
      },
      {
        id: "action:new-run",
        group: "action",
        label: "Start a new run",
        hint: "g n",
        icon: <Plus className="h-4 w-4" />,
        onSelect: () => go("/runs/new"),
      },
    ];

    const runItems: PaletteItem[] = (runs ?? []).map((r) => {
      const promptRaw =
        r.input && typeof r.input === "object" && "prompt" in r.input
          ? (r.input as { prompt?: unknown }).prompt
          : undefined;
      const prompt =
        typeof promptRaw === "string" && promptRaw.length > 0
          ? promptRaw
          : "(no prompt)";
      const preview =
        prompt.length > 90 ? prompt.slice(0, 90) + "…" : prompt;
      return {
        id: `run:${r.id}`,
        group: "run",
        label: preview,
        hint: r.status,
        extra: [r.model, r.id.slice(0, 8)].filter(Boolean).join(" "),
        icon: <RunStatusDot status={r.status} />,
        onSelect: () => go(`/runs/${r.id}`),
      };
    });

    const taskItems: PaletteItem[] = (tasks ?? []).map((t) => ({
      id: `task:${t.id}`,
      group: "task",
      label: t.name,
      hint: "Run template",
      extra: [t.description, (t.tags ?? []).join(" ")]
        .filter(Boolean)
        .join(" "),
      icon: <Terminal className="h-4 w-4 text-muted-foreground" />,
      onSelect: () => go(`/runs/new?taskId=${t.id}`),
    }));

    return [...actions, ...runItems, ...taskItems];
  }, [runs, tasks, go]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allItems;
    return allItems
      .map((item) => {
        const corpus = `${item.label} ${item.extra ?? ""} ${item.group}`;
        const score = fuzzyScore(corpus, q);
        return { item, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }, [allItems, query]);

  const groups = useMemo(() => {
    const g: Record<PaletteItem["group"], PaletteItem[]> = {
      action: [],
      run: [],
      task: [],
    };
    for (const it of filtered) g[it.group].push(it);
    return g;
  }, [filtered]);

  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered, selected]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index='${selected}']`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[selected];
      if (it) it.onSelect();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-xl p-0 gap-0 grid-rows-[auto_1fr]"
        onKeyDown={handleKey}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Navigate pages, jump to runs, and run task templates.
        </DialogDescription>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Type a command, run prompt, or task name…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            aria-label="Command palette search"
          />
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No matches."}
            </div>
          ) : (
            <ul ref={listRef} className="py-1">
              {(["action", "run", "task"] as const).map((g) => {
                const items = groups[g];
                if (items.length === 0) return null;
                return (
                  <li key={g}>
                    <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {g === "action"
                        ? "Actions"
                        : g === "run"
                          ? "Recent runs"
                          : "Task templates"}
                    </div>
                    <ul>
                      {items.map((it) => {
                        const idx = filtered.indexOf(it);
                        const active = idx === selected;
                        return (
                          <li key={it.id} data-index={idx}>
                            <button
                              type="button"
                              onMouseEnter={() => setSelected(idx)}
                              onClick={() => it.onSelect()}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
                                active
                                  ? "bg-primary/15 text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="shrink-0 flex items-center justify-center w-4 h-4">
                                {it.icon}
                              </span>
                              <span className="flex-1 truncate text-foreground">
                                {it.label}
                              </span>
                              {it.hint && (
                                <span
                                  className={cn(
                                    "text-[10px] font-mono uppercase tracking-wider shrink-0",
                                    active
                                      ? "text-primary"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {it.hint}
                                </span>
                              )}
                              {active && (
                                <CornerDownLeft className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 px-4 py-2 text-[10px] text-muted-foreground font-mono">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-background px-1">↑</kbd>
            <kbd className="rounded border border-border bg-background px-1">↓</kbd>
            move
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-background px-1">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-background px-1">⌘</kbd>
            <kbd className="rounded border border-border bg-background px-1">K</kbd>
            toggle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
