// app/api/runs/[id]/logs/route.ts
//
// Phase 3C — Server-Sent Events stream of a single run's logs.
// The client opens an EventSource, we poll `logs` every 400ms for rows newer
// than the last (created_at, id) cursor, push each row as an SSE `log` event,
// and close the stream as soon as the parent run hits a terminal status.

import { NextRequest } from "next/server";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { logs, runs } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 400;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_STREAM_DURATION_MS = 30 * 60 * 1000;
const MAX_ROWS_PER_POLL = 500;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    return new Response("Invalid run id", { status: 400 });
  }

  const existing = await db
    .select({ id: runs.id, status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (existing.length === 0) {
    return new Response("Run not found", { status: 404 });
  }

  let lastCreatedAt = new Date(0);
  let lastId = ZERO_UUID;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_INTERVAL_MS);

      const close = (reason: string) => {
        if (closed) return;
        send("done", { reason });
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", () => close("client_disconnect"));

      send("open", { runId });

      const drain = async (): Promise<number> => {
        const rows = await db
          .select()
          .from(logs)
          .where(
            and(
              eq(logs.runId, runId),
              or(
                gt(logs.createdAt, lastCreatedAt),
                and(eq(logs.createdAt, lastCreatedAt), gt(logs.id, lastId))
              )
            )
          )
          .orderBy(asc(logs.createdAt), asc(logs.id))
          .limit(MAX_ROWS_PER_POLL);

        for (const row of rows) {
          send("log", {
            id: row.id,
            runId: row.runId,
            level: row.level,
            message: row.message,
            data: row.data,
            createdAt: row.createdAt.toISOString(),
          });
          lastCreatedAt = row.createdAt;
          lastId = row.id;
        }

        return rows.length;
      };

      while (!closed) {
        if (Date.now() - startedAt > MAX_STREAM_DURATION_MS) {
          close("max_duration");
          break;
        }

        try {
          await drain();

          const [current] = await db
            .select({ status: runs.status })
            .from(runs)
            .where(eq(runs.id, runId))
            .limit(1);

          if (current && TERMINAL_STATUSES.has(current.status)) {
            await drain();
            send("status", { status: current.status });
            close(`run_${current.status}`);
            break;
          }
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : "Unknown poll error",
          });
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    },

    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
