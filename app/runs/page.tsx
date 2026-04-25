// app/runs/page.tsx

import { Suspense } from "react";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema/runs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunsBrowser, type RunListItem } from "./runs-browser";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(100);

  // Trim to a serializable, client-friendly shape. Drizzle returns Date
  // objects + full jsonb blobs; we only need a preview string here.
  // Phase 5.4.2: pull out the {id, name} profile breadcrumb that
  // POST /api/runs stamps onto input.profile, so the client can filter by
  // profile without a second query.
  const items: RunListItem[] = rows.map((r) => {
    const input = (r.input ?? {}) as {
      prompt?: unknown;
      profile?: unknown;
    };
    const prompt =
      typeof input.prompt === "string" && input.prompt.length > 0
        ? input.prompt
        : "(no prompt)";
    const profileBreadcrumb =
      input.profile && typeof input.profile === "object"
        ? (input.profile as { id?: unknown; name?: unknown })
        : null;
    const profileId =
      profileBreadcrumb && typeof profileBreadcrumb.id === "string"
        ? profileBreadcrumb.id
        : null;
    const profileName =
      profileBreadcrumb && typeof profileBreadcrumb.name === "string"
        ? profileBreadcrumb.name
        : null;
    return {
      id: r.id,
      status: r.status,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      prompt,
      model: r.model ?? null,
      totalTokens: r.totalTokens ?? null,
      profileId,
      profileName,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">All runs</h1>
            <Badge variant="muted" className="font-mono">
              {rows.length === 100 ? "last 100" : `${rows.length} total`}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Every agent run, newest first. Filter by status, profile, or search
            prompts.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/runs/new">
            <Plus />
            New run
          </Link>
        </Button>
      </header>

      <Suspense fallback={null}>
        <RunsBrowser runs={items} />
      </Suspense>
    </main>
  );
}
