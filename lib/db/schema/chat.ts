import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { resources } from "./resources";

export const chatRoleEnum = pgEnum("chat_role", [
  "user",
  "assistant",
  "system",
]);

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").default("New Chat"),
  model: text("model").default("qwen3.5:9b"),
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<
    Array<{
      resourceId: string;
      resourceName: string;
      chunk: string;
      page?: number;
      similarity: number;
    }>
  >(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatResourceLinks = pgTable(
  "chat_resource_links",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").default(true),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.resourceId] })]
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
