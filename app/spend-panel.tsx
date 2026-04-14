// app/spend-panel.tsx
//
// Dashboard-level spend summary. Pure server component — takes
// pre-aggregated run rows (id, model, totalTokens, createdAt) and computes:
//   - today / 7-day / 30-day totals with trend arrows
//   - per-model breakdown (tokens, cost, run count)
//
// Costs are blended via `estimateCostUsd` in lib/utils/model-pricing.ts
// which assumes ~70% input / 30% output per run. Self-hosted models
// (Nemotron) are $ 0 by definition.

import { TrendingUp, TrendingDown, DollarSign, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  estimateCostUsd,
  formatUsd,
  getRate,
} from "@/lib/utils/model-pricing";

export type SpendRun = {
  id: string;
  createdAt: Date | string;
  model: string | null;
  totalTokens: number | null;
};

type Props = {
  runs: SpendRun[];
};

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function withinLast(run: SpendRun, hours: number, now: number): boolean {
  return now - toDate(run.createdAt).getTime() <= hours * 3_600_000;
}

function TrendArrow({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.005) {
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
  if (delta > 0) {
    return <TrendingUp className="h-3 w-3 text-amber-400" />;
  }
  return <TrendingDown className="h-3 w-3 text-primary" />;
}

export function SpendPanel({ runs }: Props) {
  const now = Date.now();

  let todayUsd = 0;
  let yesterdayUsd = 0;
  let sevenDayUsd = 0;
  let priorSevenDayUsd = 0;
  let thirtyDayUsd = 0;
  let thirtyDayRuns = 0;
  let thirtyDayTokens = 0;

  type ModelAgg = {
    model: string;
    label: string;
    selfHosted: boolean;
    tokens: number;
    cost: number;
    runs: number;
  };
  const perModel = new Map<string, ModelAgg>();

  for (const r of runs) {
    const cost = estimateCostUsd(r.totalTokens, r.model);
    const age = now - toDate(r.createdAt).getTime();
    const hours = age / 3_600_000;

    if (hours <= 24) todayUsd += cost;
    else if (hours <= 48) yesterdayUsd += cost;

    if (hours <= 24 * 7) sevenDayUsd += cost;
    else if (hours <= 24 * 14) priorSevenDayUsd += cost;

    if (hours <= 24 * 30) {
      thirtyDayUsd += cost;
      thirtyDayRuns += 1;
      thirtyDayTokens += r.totalTokens ?? 0;

      const key = (r.model ?? "unknown").toLowerCase();
      const rate = getRate(r.model);
      const agg =
        perModel.get(key) ??
        {
          model: r.model ?? "unknown",
          label: rate.label,
          selfHosted: Boolean(rate.selfHosted),
          tokens: 0,
          cost: 0,
          runs: 0,
        };
      agg.tokens += r.totalTokens ?? 0;
      agg.cost += cost;
      agg.runs += 1;
      perModel.set(key, agg);
    }
  }

  const dayDelta = todayUsd - yesterdayUsd;
  const weekDelta = sevenDayUsd - priorSevenDayUsd;

  const topModels = Array.from(perModel.values())
    .sort((a, b) => {
      // Paid models first by cost, then self-hosted by run count.
      if (a.selfHosted && !b.selfHosted) return 1;
      if (!a.selfHosted && b.selfHosted) return -1;
      if (a.selfHosted && b.selfHosted) return b.runs - a.runs;
      return b.cost - a.cost;
    })
    .slice(0, 5);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-primary" />
            Spend
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Blended estimate — 70% input / 30% output across paid models.
            Self-hosted runs don&rsquo;t count.
          </p>
        </div>
        <Badge variant="muted" className="font-mono text-[10px]">
          last 30d
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Today
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsd(todayUsd)}
            </span>
            <TrendArrow delta={dayDelta} />
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums font-mono mt-0.5">
            yday {formatUsd(yesterdayUsd)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            7 days
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsd(sevenDayUsd)}
            </span>
            <TrendArrow delta={weekDelta} />
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums font-mono mt-0.5">
            prior {formatUsd(priorSevenDayUsd)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            30 days
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsd(thirtyDayUsd)}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums font-mono mt-0.5">
            {thirtyDayTokens.toLocaleString()} tok ·{" "}
            {thirtyDayRuns.toLocaleString()} run
            {thirtyDayRuns === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {topModels.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            By model
          </div>
          <ul className="space-y-2">
            {topModels.map((m) => {
              const share =
                thirtyDayUsd > 0 ? (m.cost / thirtyDayUsd) * 100 : 0;
              return (
                <li key={m.model} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate">
                        {m.label}
                      </span>
                      {m.selfHosted && (
                        <Badge
                          variant="muted"
                          className="text-[9px] font-mono uppercase tracking-wider"
                        >
                          local
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className={
                          m.selfHosted
                            ? "h-full bg-muted-foreground/40"
                            : "h-full bg-primary"
                        }
                        style={{
                          width: m.selfHosted
                            ? `${Math.min(100, (m.runs / thirtyDayRuns) * 100)}%`
                            : `${Math.min(100, share)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">
                      {m.selfHosted ? "—" : formatUsd(m.cost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums font-mono">
                      {m.tokens.toLocaleString()} tok
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
