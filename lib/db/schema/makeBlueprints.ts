import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const makeCategoryEnum = pgEnum("make_category", [
  "social-media",
  "lead-gen",
  "content-creation",
  "voice-sales",
  "ai-agents",
  "saas-tools",
  "other",
]);

export const makeBlueprints = pgTable("make_blueprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: makeCategoryEnum("category").notNull().default("other"),
  lessonKey: text("lesson_key"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  blueprintJson: jsonb("blueprint_json").$type<Record<string, unknown>>(),
  moduleCount: integer("module_count").default(0),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MakeBlueprint = typeof makeBlueprints.$inferSelect;
export type NewMakeBlueprint = typeof makeBlueprints.$inferInsert;
