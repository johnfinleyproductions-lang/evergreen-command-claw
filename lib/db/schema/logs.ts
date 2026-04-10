import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { runs } from "./runs";

export const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
]);

/**
 * Streaming log lines. The Python worker writes these in real time, and the
 * web UI tails them via SSE filtered by `runId`. The composite index on
 * (run_id, created_at) keeps log tailing fast even with millions of rows.
 */
export const logs = pgTable(
  "logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    level: logLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("logs_run_id_created_at_idx").on(table.runId, table.createdAt),
  ]
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
