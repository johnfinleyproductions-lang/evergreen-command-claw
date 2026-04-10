import {
  pgTable,
  text,
  integer,
  uuid,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { resources } from "./resources";

// Custom pgvector type
const vector = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    const str = value as string;
    return str
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    pageNumber: integer("page_number"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("embeddings_resource_id_idx").on(table.resourceId),
  ]
);

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;
