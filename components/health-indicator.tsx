// components/health-indicator.tsx
//
// Tiny liveness dot rendered in the TopNav. Polls GET /api/health on a
// 30s interval (with a faster 5s retry after a failure) and displays:
//   - green pulse    → ok, dbLatencyMs under the warn threshold
//   - amber pulse    → ok, dbLatencyMs over the warn threshold (slow DB)
//   - red no-pulse   → last probe failed (503 / network error)
//   - gray           → haven't probed yet / window is background
//
// Hover (or focus, for a11y) reveals a small card with latency + last
// check time. We pause polling when the document is hidden to avoid
// burning queries while the tab is backgrounded.
//
// No imperative toasts on transitions — that would be noisy for
// intermittent blips. If you want loud alerting, layer it above.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

const POLL_INTERVAL_MS = 30_000;
const RETRY_INTERVAL_MS = 5_000;
const WARN_LATENCY_MS = 500;

type Health =
  | { kind: "unknown" }
  | { kind: "ok"; dbLatencyMs: number; checkedAt: string }
  | { kind: "slow"; dbLatencyMs: number; checkedAt: string }
  | { kind: "down"; error: string; checkedAt: string };

function formatRel(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (delta < 1000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}

export function HealthIndicator() {
  const [health, setHealth] = useState<Health>({ kind: "unknown" });
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const probe = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        dbLatencyMs?: number;
        error?: string;
        checkedAt?: string;
      };
      const checkedAt = data.checkedAt ?? new Date().toISOString();
      if (res.ok && data.ok && typeof data.dbLatencyMs === "number") {
        setHealth({
          kind: data.dbLatencyMs > WARN_LATENCY_MS ? "slow" : "ok",
          dbLatencyMs: data.dbLatencyMs,
          checkedAt,
        });
        return true;
      }
      setHealth({
        kind: "down",
        error: data.error ?? `HTTP ${res.status}`,
        checkedAt,
      });
      return false;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return true;
      setHealth({
        kind: "down",
        error: err instanceof Error ? err.message : "Network error",
        checkedAt: new Date().toISOString(),
      });
      return false;
    }
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      timerRef.current = setTimeout(async () => {
        if (document.hidden) {
          schedule(delay);
          return;
        }
        const ok = await probe();
        schedule(ok ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS);
      }, delay);
    },
    [probe]
  );

  useEffect(() => {
    // Kick off an immediate probe, then schedule the cadence loop.
    probe().then((ok) => schedule(ok ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS));

    // Re-probe immediately when the tab comes back to the foreground.
    const onVisible = () => {
      if (!document.hidden) {
        probe().then((ok) =>
          schedule(ok ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS)
        );
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimer();
      abortRef.current?.abort();
    };
  }, [probe, schedule]);

  const color =
    health.kind === "ok"
      ? "bg-emerald-500"
      : health.kind === "slow"
        ? "bg-amber-500"
        : health.kind === "down"
          ? "bg-destructive"
          : "bg-muted-foreground";

  const pulse =
    health.kind === "ok" || health.kind === "slow"
      ? "animate-pulse"
      : "";

  const label =
    health.kind === "ok"
      ? "Healthy"
      : health.kind === "slow"
        ? "Slow DB"
        : health.kind === "down"
          ? "Degraded"
          : "Checking…";

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground font-mono uppercase tracking-wider transition-colors"
        aria-label={`System status: ${label}`}
      >
        <span className="relative inline-flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-60",
              pulse,
              color
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              color
            )}
          />
        </span>
        <span className="hidden lg:inline">{label}</span>
      </button>

      {open && health.kind !== "unknown" && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-2 w-60 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg z-50"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{label}</span>
            <span className="text-muted-foreground">
              {formatRel(health.checkedAt)}
            </span>
          </div>
          {(health.kind === "ok" || health.kind === "slow") && (
            <div className="mt-1.5 text-muted-foreground font-mono">
              db{" "}
              <span
                className={cn(
                  "tabular-nums",
                  health.kind === "slow" ? "text-amber-500" : "text-foreground"
                )}
              >
                {health.dbLatencyMs}ms
              </span>
              {health.kind === "slow" && (
                <span className="block mt-1 text-amber-500">
                  Latency over {WARN_LATENCY_MS}ms — queries may feel
                  sluggish.
                </span>
              )}
            </div>
          )}
          {health.kind === "down" && (
            <div className="mt-1.5 text-destructive font-mono break-words">
              {health.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
