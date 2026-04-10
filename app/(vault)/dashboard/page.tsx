import { db } from "@/lib/db/client";
import { resources, prompts, collections, embeddings } from "@/lib/db/schema";
import { count, sum, desc } from "drizzle-orm";
import { DashboardClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    resourceCount,
    promptCount,
    collectionCount,
    embeddingCount,
    storageResult,
    recentResources,
    recentPrompts,
  ] = await Promise.all([
    db.select({ count: count() }).from(resources),
    db.select({ count: count() }).from(prompts),
    db.select({ count: count() }).from(collections),
    db.select({ count: count() }).from(embeddings),
    db.select({ total: sum(resources.fileSize) }).from(resources),
    db.select({
      id: resources.id,
      fileName: resources.fileName,
      type: resources.type,
      indexStatus: resources.indexStatus,
      createdAt: resources.createdAt,
    }).from(resources).orderBy(desc(resources.createdAt)).limit(5),
    db.select({
      id: prompts.id,
      title: prompts.title,
      type: prompts.type,
      createdAt: prompts.createdAt,
    }).from(prompts).orderBy(desc(prompts.createdAt)).limit(5),
  ]);

  const totalStorage = Number(storageResult[0]?.total ?? 0);

  const stats = {
    resources: resourceCount[0].count,
    prompts: promptCount[0].count,
    collections: collectionCount[0].count,
    embeddings: embeddingCount[0].count,
    storageBytes: totalStorage,
    storageMB: Math.round(totalStorage / 1024 / 1024 * 10) / 10,
  };

  const recent = {
    resources: recentResources,
    prompts: recentPrompts,
  };

  return <DashboardClient stats={stats} recent={recent} />;
}
