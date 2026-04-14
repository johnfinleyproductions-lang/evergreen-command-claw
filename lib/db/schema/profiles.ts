import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

/**
 * Business profiles — reusable context blocks (think CLAUDE.md).
 *
 * At most one row can have is_active=true at a time; the constraint is
 * enforced by a partial unique index in migration 0003. The POST /api/runs
 * handler reads the active profile and prepends its content to every run
 * under a `## Context` header, so switching profile = switching the entire
 * default behaviour of the runner without touching any task template.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
