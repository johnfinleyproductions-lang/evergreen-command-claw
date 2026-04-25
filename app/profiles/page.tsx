// app/profiles/page.tsx
//
// Server entrypoint for the profiles page. Loads all profiles in one query
// ordered active-first, then hands off to the client island for drag-drop +
// mutations. The list is small enough (expected <50) that no pagination
// needed.

import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { ProfilesManager } from "./profiles-manager";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const rows = await db
    .select()
    .from(profiles)
    .orderBy(desc(profiles.isActive), desc(profiles.updatedAt));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <ProfilesManager initialProfiles={rows} />
    </main>
  );
}
