// app/tasks/page.tsx
//
// Phase 5.1: the page stays a server component for the initial fetch (zero-JS
// first paint, straight Drizzle query, no loading spinner) but renders the
// interactive task manager as a client island. All mutations — create, edit,
// delete, run — happen inside <TaskManager> and trigger router.refresh() to
// re-run this server component.

import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema/tasks";
import { TaskManager } from "./task-manager";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const allTasks = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <TaskManager initialTasks={allTasks} />
    </main>
  );
}
