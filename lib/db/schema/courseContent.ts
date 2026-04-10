import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const courseContent = pgTable("course_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  chapter: text("chapter").notNull(),
  section: text("section"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  contentType: text("content_type"),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CourseContent = typeof courseContent.$inferSelect;
export type NewCourseContent = typeof courseContent.$inferInsert;
