// lib/utils/model-pricing.ts
//
// Approximate $ / 1M tokens for the models Evergreen talks to. We store
// one blended rate per model because the `runs` table only records
// `totalTokens` — not an input/output split. The blend assumes a
// typical agent trace is ~70% input (long context, tool results, chain
// of thought) and ~30% output (the model's own text), which matches what
// we've seen in the Phase 4 logs.
//
//   blended = 0.70 * input + 0.30 * output
//
// Numbers are listed public rates as of 2026-04. Edit this file when
// pricing moves — everything else downstream just imports `estimateCostUsd`.
//
// For models we don't know, we fall back to the Nemotron self-hosted
// rate ($0) so self-hosted runs correctly contribute nothing to spend.

export type ModelRate = {
  /** $ per 1M input tokens */
  input: number;
  /** $ per 1M output tokens */
  output: number;
  /** Human-friendly label for the spend panel. */
  label: string;
  /** Marks self-hosted / local inference (zero marginal cost). */
  selfHosted?: boolean;
};

// All rates in USD per 1M tokens.
const RATES: Record<string, ModelRate> = {
  // Anthropic
  "claude-opus-4-6": { input: 15, output: 75, label: "Claude Opus 4.6" },
  "claude-sonnet-4-6": { input: 3, output: 15, label: "Claude Sonnet 4.6" },
  "claude-haiku-4-5": { input: 1, output: 5, label: "Claude Haiku 4.5" },
  "claude-haiku-4-5-20251001": {
    input: 1,
    output: 5,
    label: "Claude Haiku 4.5",
  },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10, label: "GPT-4o" },
  "gpt-4o-mini": { input: 0.15, output: 0.6, label: "GPT-4o mini" },
  "gpt-4.1": { input: 2, output: 8, label: "GPT-4.1" },

  // Nemotron (self-hosted on Framestation)
  "nemotron-3-super-120b": {
    input: 0,
    output: 0,
    label: "Nemotron 3 Super 120B",
    selfHosted: true,
  },
};

const BLEND_INPUT = 0.7;
const BLEND_OUTPUT = 0.3;

function normalize(model: string | null | undefined): string {
  if (!model) return "";
  return model.trim().toLowerCase();
}

export function getRate(model: string | null | undefined): ModelRate {
  const key = normalize(model);
  if (!key) return { input: 0, output: 0, label: "unknown" };
  // Exact match first, then loose contains (handles versioned ids like
  // "anthropic/claude-sonnet-4-6-20260301" from a gateway).
  if (RATES[key]) return RATES[key];
  for (const [k, rate] of Object.entries(RATES)) {
    if (key.includes(k)) return rate;
  }
  return { input: 0, output: 0, label: model ?? "unknown" };
}

/**
 * Blended cost estimate for a run given its totalTokens + model. Returns
 * dollars (not cents). Self-hosted models always return 0.
 */
export function estimateCostUsd(
  totalTokens: number | null | undefined,
  model: string | null | undefined
): number {
  if (!totalTokens || totalTokens <= 0) return 0;
  const rate = getRate(model);
  if (rate.selfHosted) return 0;
  const perMillion = BLEND_INPUT * rate.input + BLEND_OUTPUT * rate.output;
  return (totalTokens / 1_000_000) * perMillion;
}

/**
 * Format as a human-readable dollar string. Sub-cent costs show 3 decimals
 * so a $0.003 run doesn't collapse to $0.00 and look free when it wasn't.
 */
export function formatUsd(amount: number): string {
  if (!isFinite(amount) || amount <= 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString()}`;
}
