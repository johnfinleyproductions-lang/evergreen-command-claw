import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const promptTypeEnum = pgEnum("prompt_type", [
  "system_prompt",
  "megaprompt",
  "template",
  "chain",
]);

export const prompts = pgTable("prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: promptTypeEnum("type").notNull().default("template"),
  description: text("description"),
  targetModel: text("target_model"),
  variables: text("variables").array().default([]),
  tags: text("tags").array().default([]),
  usageCount: integer("usage_count").default(0),
  // For chain type: ordered steps
  chainSteps: jsonb("chain_steps").$type<
    Array<{ order: number; title: string; promptContent: string }>
  >(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
