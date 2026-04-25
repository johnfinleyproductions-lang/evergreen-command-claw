// app/runs/new/page.tsx
//
// Phase 5.4.1 — accepts ?taskId= and ?prompt= for one-click re-run from
// the run detail RunActionsMenu.

import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string; prompt?: string }>;
}) {
  const { taskId, prompt } = await searchParams;
  const allTasks = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">New run</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pick a task template or write a free-form prompt.
        </p>
      </header>
      <NewRunForm
        tasks={allTasks}
        initialTaskId={taskId}
        initialPrompt={prompt}
      />
    </main>
  );
}
