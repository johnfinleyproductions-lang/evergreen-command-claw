import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Tasks are reusable templates for work the command runner can execute.
 * Think of them as the blueprints — each `task` can spawn many `runs`.
 */
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  systemPrompt: text("system_prompt"),
  // Which tools the worker is allowed to call when running this task.
  toolsAllowed: text("tools_allowed").array().default([]),
  // Optional JSON Schema describing the expected input shape.
  inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
  tags: text("tags").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
