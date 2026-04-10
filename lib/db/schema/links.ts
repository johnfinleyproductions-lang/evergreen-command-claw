import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const linkCategoryEnum = pgEnum("link_category", [
  "google-doc",
  "notion",
  "canva",
  "google-drive",
  "github",
  "airtable",
  "community",
  "tool",
  "other",
]);

export const links = pgTable("links", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  category: linkCategoryEnum("category").notNull().default("other"),
  lessonKey: text("lesson_key"),
  description: text("description"),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;