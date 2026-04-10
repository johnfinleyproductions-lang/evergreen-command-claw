import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { runs } from "./runs";

export const toolCallStatusEnum = pgEnum("tool_call_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

/**
 * Individual tool invocations within a run. The Python worker writes these as
 * it executes each tool call so the web UI can stream the progress.
 */
export const toolCalls = pgTable("tool_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  // Ordering within the run so we can replay the tool sequence deterministically.
  sequence: integer("sequence").notNull().default(0),
  toolName: text("tool_name").notNull(),
  arguments: jsonb("arguments").$type<Record<string, unknown>>(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  status: toolCallStatusEnum("status").notNull().default("pending"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
