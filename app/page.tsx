// app/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { RunRow } from "./runs/run-row";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const recent = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(10);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-text">Evergreen Command</h1>
          <p className="text-text-muted mt-1">
            Local AI task runner · Nemotron-3-Super-120B · Framestation
          </p>
        </div>
        <Link
          href="/runs/new"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-white font-medium transition-colors"
        >
          + New Run
        </Link>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-text">Recent Runs</h2>
          <Link href="/runs" className="text-sm text-text-muted hover:text-text">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-surface/50 p-8 text-center">
            <p className="text-text-muted">No runs yet.</p>
            <Link
              href="/runs/new"
              className="inline-block mt-3 text-emerald-500 hover:text-emerald-400"
            >
              Fire your first run →
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-surface/50 divide-y divide-gray-800 overflow-hidden">
            {recent.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
