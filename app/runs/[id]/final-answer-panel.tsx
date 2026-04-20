// app/runs/[id]/final-answer-panel.tsx
//
// Phase 5.2 — Renders the worker's final_answer string as the hero of the
// run detail page. Sits above logs/input so the finished output is the
// first thing the user sees. Copy button + download button, both client-
// side. If the output JSON doesn't contain a final_answer string, the
// parent page falls through to the raw JSON fallback section.

"use client";

import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";

type Props = {
  finalAnswer: string;
  runId: string;
};

export function FinalAnswerPanel({ finalAnswer, runId }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(finalAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked (e.g. http, permissions) — fall back
      // to a textarea select so the user can still grab the text.
      const ta = document.createElement("textarea");
      ta.value = finalAnswer;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const handleDownload = () => {
    const blob = new Blob([finalAnswer], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const wordCount = finalAnswer.trim().split(/\s+/).filter(Boolean).length;
  const charCount = finalAnswer.length;

  return (
    <section className="rounded-xl border border-emerald-600/40 bg-gradient-to-br from-emerald-950/30 via-background to-background shadow-lg shadow-emerald-900/10">
      <header className="flex items-center justify-between gap-3 border-b border-emerald-600/20 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60" />
          <h2 className="text-sm font-semibold text-emerald-300 tracking-wide uppercase">
            Final Answer
          </h2>
          <span className="text-xs text-text-dim">
            · {wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"} ·{" "}
            {charCount.toLocaleString()} char{charCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 hover:bg-gray-800 border border-gray-700 text-text transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 hover:bg-gray-800 border border-gray-700 text-text transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            .txt
          </button>
        </div>
      </header>

      <div className="px-5 py-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-text">
          {finalAnswer}
        </pre>
      </div>
    </section>
  );
}

/**
 * Pull a `final_answer` string out of a run.output jsonb blob. Returns null
 * when the blob is missing, not an object, or doesn't contain a non-empty
 * string at that key. Kept as a named export so the server component on
 * page.tsx can use it to decide whether to mount the panel.
 */
export function extractFinalAnswer(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const value = record.final_answer;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}
