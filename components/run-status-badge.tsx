// components/run-status-badge.tsx
//
// Canonical status chip — one definition, used by dashboard, runs index,
// run detail header, task manager. Replaces three duplicate inline impls.
//
// Colors live in globals.css as --color-status-* tokens; this component
// just picks the variant and adds a live-pulse dot for the running state.

import { cn } from "@/lib/utils/cn";

export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | string;

const STYLES: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  pending: {
    dot: "bg-zinc-400",
    text: "text-zinc-300",
    bg: "bg-zinc-500/10",
    ring: "ring-zinc-500/20",
  },
  running: {
    dot: "bg-blue-400",
    text: "text-blue-300",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/30",
  },
  succeeded: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
  },
  failed: {
    dot: "bg-red-400",
    text: "text-red-300",
    bg: "bg-red-500/10",
    ring: "ring-red-500/30",
  },
  cancelled: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
  },
};

const FALLBACK = STYLES.pending;

export function RunStatusBadge({
  status,
  className,
  size = "default",
}: {
  status: RunStatus;
  className?: string;
  size?: "default" | "sm";
}) {
  const s = STYLES[status] ?? FALLBACK;
  const isRunning = status === "running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        s.bg,
        s.text,
        s.ring,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {isRunning && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              s.dot
            )}
          />
        )}
        <span
          className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", s.dot)}
        />
      </span>
      {status}
    </span>
  );
}

/** Small status dot without the label — for dense rows. */
export function RunStatusDot({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  const s = STYLES[status] ?? FALLBACK;
  const isRunning = status === "running";
  return (
    <span
      aria-label={status}
      className={cn("relative flex h-2 w-2 shrink-0", className)}
    >
      {isRunning && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            s.dot
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", s.dot)}
      />
    </span>
  );
}
