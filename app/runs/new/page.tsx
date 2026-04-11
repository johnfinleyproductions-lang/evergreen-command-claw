// app/runs/new/page.tsx

import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { taskId } = await searchParams;
  const allTasks = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text">New Run</h1>
        <p className="text-text-muted text-sm mt-1">
          Pick a task template or write a free-form prompt.
        </p>
      </header>
      <NewRunForm tasks={allTasks} initialTaskId={taskId} />
    </main>
  );
}
