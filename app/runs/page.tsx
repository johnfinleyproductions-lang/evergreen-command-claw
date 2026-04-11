// app/runs/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { RunRow } from "./run-row";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">All Runs</h1>
          <p className="text-text-muted text-sm mt-1">
            {rows.length === 100 ? "showing last 100" : `${rows.length} total`}
          </p>
        </div>
        <Link
          href="/runs/new"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-white font-medium transition-colors"
        >
          + New Run
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-surface/50 p-8 text-center">
          <p className="text-text-muted">No runs yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-surface/50 divide-y divide-gray-800 overflow-hidden">
          {rows.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </main>
  );
}
