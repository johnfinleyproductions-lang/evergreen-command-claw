import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const automationCategoryEnum = pgEnum("automation_category", [
  "fundamentals",
  "web-apps",
  "ai-agents",
  "javascript",
  "voice-comms",
  "lead-gen",
  "make-conversions",
  "standalone",
  "other",
]);

export const automations = pgTable("automations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: automationCategoryEnum("category").notNull().default("other"),
  lessonKey: text("lesson_key"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  workflowJson: jsonb("workflow_json").$type<Record<string, unknown>>(),
  nodeCount: integer("node_count").default(0),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
