import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const resourceTypeEnum = pgEnum("resource_type", [
  "pdf",
  "docx",
  "markdown",
  "text",
  "code",
  "url",
  "transcript",
  "image",
  "html",
  "skill",
  "other",
]);

export const indexStatusEnum = pgEnum("index_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const resources = pgTable("resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  type: resourceTypeEnum("type").notNull().default("other"),
  indexStatus: indexStatusEnum("index_status").notNull().default("pending"),
  contentHash: text("content_hash"),
  chunkCount: integer("chunk_count").default(0),
  pageCount: integer("page_count"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  tags: text("tags")
    .array()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
