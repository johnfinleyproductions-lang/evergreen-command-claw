/**
 * Standalone database connection for the MCP server.
 * Connects directly to the same Postgres used by the Next.js app.
 * Uses the same DATABASE_URL env var.
 */

import postgres from "postgres";

let _sql: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  if (!_sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = postgres(connectionString, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}
