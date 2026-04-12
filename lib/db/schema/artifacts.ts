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

export const artifactKindEnum = pgEnum("artifact_kind", [
  "report",
  "data",
  "image",
  "code",
  "log",
  "other",
]);

/**
 * Files produced by a run — reports, generated images, CSVs, code, etc.
 *
 * Phase 5.0.1: `content` is the authoritative store for textual artifacts
 * (markdown briefs, JSON reports, etc). The worker also writes to `path`
 * on disk as a belt-and-suspenders backup, but the content route reads
 * from `content` first and only falls back to `path` for legacy rows.
 *
 * `path` is a local filesystem path on the Framestation (or an S3/MinIO URL
 * if we ever route through one). Kept NOT NULL for backwards compatibility.
 */
export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  kind: artifactKindEnum("kind").notNull().default("other"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  // Phase 5.0.1 — content stored directly in DB for text artifacts
  content: text("content"),
  contentSize: integer("content_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
