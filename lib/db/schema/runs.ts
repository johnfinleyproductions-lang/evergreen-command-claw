import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * A `run` is one execution of a task (or an ad-hoc prompt with no task template).
 * Holds the live status, the input/output blobs, and telemetry from llama-server
 * so we can track generation speed over time.
 */
export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Nullable — an ad-hoc run is allowed to exist without a parent task.
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  status: runStatusEnum("status").notNull().default("pending"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  model: text("model").default("nemotron-3-super-120b-a12b"),
  errorMessage: text("error_message"),
  // llama.cpp telemetry — captured from the /completion response.
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  tokensPerSec: real("tokens_per_sec"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // Phase 5.3 — updated by the worker every HEARTBEAT_INTERVAL_SECONDS
  // while a run is in status='running'. A crash-recovery sweep on worker
  // startup flips rows where now() - last_heartbeat > stale_threshold
  // back to 'failed' so the queue doesn't wedge on ghosts.
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
