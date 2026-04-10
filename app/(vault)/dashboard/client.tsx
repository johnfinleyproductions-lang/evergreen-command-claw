"use client";

import { Leaf, Library, Zap, FolderOpen, HardDrive, Database, FileText, Clock } from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  resources: number;
  prompts: number;
  collections: number;
  embeddings: number;
  storageBytes: number;
  storageMB: number;
}

interface RecentResource {
  id: string;
  fileName: string;
  type: string;
  indexStatus: string;
  createdAt: Date;
}

interface RecentPrompt {
  id: string;
  title: string;
  type: string;
  createdAt: Date;
}

interface DashboardClientProps {
  stats: DashboardStats;
  recent: {
    resources: RecentResource[];
    prompts: RecentPrompt[];
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function timeAgo(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

const typeColors: Record<string, string> = {
  pdf: "text-red-400",
  docx: "text-blue-400",
  markdown: "text-green-400",
  text: "text-gray-400",
  code: "text-yellow-400",
  transcript: "text-purple-400",
  other: "text-gray-400",
  system_prompt: "text-blue-400",
  megaprompt: "text-purple-400",
  template: "text-amber-400",
  chain: "text-green-400",
};

const statusColors: Record<string, string> = {
  ready: "text-green-400",
  pending: "text-yellow-400",
  processing: "text-blue-400",
  failed: "text-red-400",
};

export function DashboardClient({ stats, recent }: DashboardClientProps) {
  const statCards = [
    { label: "Total Resources", value: stats.resources.toString(), icon: Library, color: "text-accent" },
    { label: "Prompts", value: stats.prompts.toString(), icon: Zap, color: "text-purple-400" },
    { label: "Collections", value: stats.collections.toString(), icon: FolderOpen, color: "text-amber-400" },
    { label: "Storage Used", value: formatBytes(stats.storageBytes), icon: HardDrive, color: "text-blue-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">{stat.label}</p>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Embeddings stat bar */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 text-cyan-400" />
          <span className="text-sm text-text-muted">Vector Embeddings:</span>
          <span className="text-sm font-medium">{stats.embeddings.toLocaleString()} chunks indexed</span>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Resources */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-medium">Recent Resources</h3>
            </div>
            <Link href="/library" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          {recent.resources.length === 0 ? (
            <p className="text-sm text-text-dim">No resources yet</p>
          ) : (
            <div className="space-y-3">
              {recent.resources.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className={`h-3.5 w-3.5 shrink-0 ${typeColors[r.type] || "text-gray-400"}`} />
                    <span className="text-sm truncate">{r.fileName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs ${statusColors[r.indexStatus]}`}>
                      {r.indexStatus}
                    </span>
                    <span className="text-xs text-text-dim">{timeAgo(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Prompts */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-medium">Recent Prompts</h3>
            </div>
            <Link href="/prompts" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          {recent.prompts.length === 0 ? (
            <p className="text-sm text-text-dim">No prompts yet</p>
          ) : (
            <div className="space-y-3">
              {recent.prompts.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className={`h-3.5 w-3.5 shrink-0 ${typeColors[p.type] || "text-gray-400"}`} />
                    <span className="text-sm truncate">{p.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-text-dim capitalize">{p.type.replace("_", " ")}</span>
                    <span className="text-xs text-text-dim">{timeAgo(p.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Welcome Card */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Leaf className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold">Evergreen Vault</h3>
            <p className="text-sm text-text-muted">
              {stats.resources > 0
                ? `${stats.resources} resources indexed with ${stats.embeddings.toLocaleString()} vector chunks. Your knowledge base is growing.`
                : "Your centralized knowledge base is ready. Start by uploading resources to the Library or adding prompts."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
