// app/activity-heatmap.tsx
//
// GitHub-style activity heatmap for the last 13 weeks of runs. Renders
// server-side — no client code, no hydration. Each cell is a day; its
// color intensity reflects the run count, and the tint skews red if the
// day had failures/cancellations.
//
// Input: a pre-aggregated list of daily buckets from the server. We keep
// the SQL upstream of this component so the rendering is pure.

import { cn } from "@/lib/utils/cn";

export type DayBucket = {
  /** YYYY-MM-DD in local time */
  date: string;
  total: number;
  failed: number;
};

type Props = {
  days: DayBucket[]; // should be ordered oldest → newest, length = weeks*7
  weeks?: number;
};

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  // 4 buckets à la GitHub. Use a soft log-ish curve so a day with 1 run
  // still lights up visibly even when another day had 40.
  const ratio = count / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

export function ActivityHeatmap({ days, weeks = 13 }: Props) {
  // Slice/pad to exactly weeks*7 days so the grid is clean.
  const needed = weeks * 7;
  const trimmed =
    days.length >= needed
      ? days.slice(days.length - needed)
      : [
          ...Array.from({ length: needed - days.length }, () => ({
            date: "",
            total: 0,
            failed: 0,
          })),
          ...days,
        ];

  const max = trimmed.reduce((m, d) => Math.max(m, d.total), 0);
  const totalRuns = trimmed.reduce((sum, d) => sum + d.total, 0);
  const totalFailed = trimmed.reduce((sum, d) => sum + d.failed, 0);

  // Group into columns of 7 (Mon→Sun).
  const columns: DayBucket[][] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(trimmed.slice(w * 7, w * 7 + 7));
  }

  // Month label row: show the month whenever the first of that month falls
  // in the column, otherwise blank.
  const monthRow = columns.map((col, idx) => {
    const firstWithDate = col.find((d) => d.date);
    if (!firstWithDate) return "";
    const monthIdx = new Date(firstWithDate.date).getMonth();
    // Only label the column if it's the first week the month appears.
    const prev = columns[idx - 1]?.find((d) => d.date);
    const prevMonthIdx = prev ? new Date(prev.date).getMonth() : -1;
    return monthIdx !== prevMonthIdx ? MONTH_LABELS[monthIdx] : "";
  });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Last {weeks} weeks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="tabular-nums font-mono text-foreground">
              {totalRuns}
            </span>{" "}
            runs
            {totalFailed > 0 && (
              <>
                {" · "}
                <span className="tabular-nums font-mono text-destructive">
                  {totalFailed}
                </span>{" "}
                failed or cancelled
              </>
            )}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-sm bg-secondary/40 ring-1 ring-inset ring-border" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/45" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/70" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-[3px] pr-3">
          {/* Weekday gutter */}
          <div className="flex flex-col gap-[3px] pr-1.5 pt-[18px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="h-2.5 text-[9px] text-muted-foreground leading-[10px] tracking-wider"
              >
                {label}
              </div>
            ))}
          </div>

          <div>
            {/* Month labels row */}
            <div className="flex gap-[3px] mb-1 h-[14px]">
              {monthRow.map((m, i) => (
                <div
                  key={i}
                  className="w-2.5 text-[9px] text-muted-foreground font-mono"
                >
                  {m}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="flex gap-[3px]">
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-[3px]">
                  {col.map((d, ri) => {
                    const lvl = intensity(d.total, max);
                    const failedRatio =
                      d.total > 0 ? d.failed / d.total : 0;
                    const mostlyFailed = failedRatio >= 0.5 && d.total > 0;
                    const bg = !d.date
                      ? "bg-transparent"
                      : lvl === 0
                        ? "bg-secondary/40 ring-1 ring-inset ring-border"
                        : mostlyFailed
                          ? lvl === 1
                            ? "bg-destructive/25"
                            : lvl === 2
                              ? "bg-destructive/45"
                              : lvl === 3
                                ? "bg-destructive/70"
                                : "bg-destructive"
                          : lvl === 1
                            ? "bg-primary/20"
                            : lvl === 2
                              ? "bg-primary/45"
                              : lvl === 3
                                ? "bg-primary/70"
                                : "bg-primary";
                    const title = d.date
                      ? `${d.date} — ${d.total} run${
                          d.total === 1 ? "" : "s"
                        }${d.failed > 0 ? `, ${d.failed} failed/cancelled` : ""}`
                      : "";
                    return (
                      <div
                        key={ri}
                        title={title}
                        className={cn(
                          "h-2.5 w-2.5 rounded-sm transition-colors",
                          bg
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
