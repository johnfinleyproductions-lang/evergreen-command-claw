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
 * `path` is a local filesystem path on the Framestation (or an S3/MinIO URL
 * if we ever route through one).
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
