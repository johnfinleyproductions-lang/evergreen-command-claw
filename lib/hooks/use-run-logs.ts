// lib/hooks/use-run-logs.ts
//
// React hook that consumes the /api/runs/[id]/logs SSE stream.
// Appends each incoming log row to an in-memory list, tracks connection
// state, and closes cleanly on unmount or terminal status.
//
// Dedup guard: the SSE route can occasionally send the same row twice when
// the final drain pass overlaps with the last polling tick. We keep a Set
// of seen log IDs in a ref and skip duplicates before appending.

"use client";

import { useEffect, useRef, useState } from "react";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  runId: string;
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error";

export type RunLogsState = {
  logs: LogEntry[];
  status: StreamStatus;
  error: string | null;
  finalRunStatus: string | null;
};

const INITIAL_STATE: RunLogsState = {
  logs: [],
  status: "idle",
  error: null,
  finalRunStatus: null,
};

/**
 * Opens an EventSource against `/api/runs/{runId}/logs` and exposes the
 * accumulated logs plus stream status. Pass `null` to skip the connection
 * entirely (e.g., before the runId is known).
 */
export function useRunLogs(runId: string | null): RunLogsState {
  const [state, setState] = useState<RunLogsState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!runId) {
      setState(INITIAL_STATE);
      seenIdsRef.current = new Set();
      return;
    }

    // Reset dedup set every time we connect to a new run.
    seenIdsRef.current = new Set();
    setState({ ...INITIAL_STATE, status: "connecting" });

    const es = new EventSource(`/api/runs/${runId}/logs`);
    esRef.current = es;

    const handleOpen = () => {
      setState((s) => ({ ...s, status: "streaming", error: null }));
    };

    const handleLog = (event: MessageEvent) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        if (!entry?.id || seenIdsRef.current.has(entry.id)) {
          return; // drop duplicates (or malformed rows missing an id)
        }
        seenIdsRef.current.add(entry.id);
        setState((s) => ({ ...s, logs: [...s.logs, entry] }));
      } catch {
        // Ignore malformed payloads.
      }
    };

    const handleStatus = (event: MessageEvent) => {
      try {
        const { status } = JSON.parse(event.data) as { status: string };
        setState((s) => ({ ...s, finalRunStatus: status }));
      } catch {
        // Ignore.
      }
    };

    const handleDone = () => {
      setState((s) => ({ ...s, status: "done" }));
      es.close();
    };

    const handleStreamError = (event: MessageEvent) => {
      try {
        const { message } = JSON.parse(event.data) as { message: string };
        setState((s) => ({ ...s, error: message }));
      } catch {
        // Ignore.
      }
    };

    const handleNativeError = () => {
      setState((s) => ({
        ...s,
        status: s.status === "done" ? "done" : "error",
        error: s.error ?? "Connection lost",
      }));
    };

    es.addEventListener("open", handleOpen);
    es.addEventListener("log", handleLog as EventListener);
    es.addEventListener("status", handleStatus as EventListener);
    es.addEventListener("done", handleDone);
    es.addEventListener("error", handleStreamError as EventListener);
    es.onerror = handleNativeError;

    return () => {
      es.removeEventListener("open", handleOpen);
      es.removeEventListener("log", handleLog as EventListener);
      es.removeEventListener("status", handleStatus as EventListener);
      es.removeEventListener("done", handleDone);
      es.removeEventListener("error", handleStreamError as EventListener);
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  return state;
}
