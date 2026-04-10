"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Link2,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  BookOpen,
  Palette,
  HardDrive,
  Github,
  Table2,
  Users,
  Wrench,
  Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type LinkCategory =
  | "google-doc"
  | "notion"
  | "canva"
  | "google-drive"
  | "github"
  | "airtable"
  | "community"
  | "tool"
  | "other";

interface VaultLink {
  id: string;
  title: string;
  url: string;
  category: LinkCategory;
  lessonKey: string | null;
  description: string | null;
  tags: string[];
  createdAt: string;
}

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES: {
  value: LinkCategory | "all";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { value: "all",          label: "All",          icon: Globe,      color: "text-teal-400" },
  { value: "google-doc",   label: "Google Docs",  icon: FileText,   color: "text-blue-400" },
  { value: "notion",       label: "Notion",       icon: BookOpen,   color: "text-gray-300" },
  { value: "canva",        label: "Canva",        icon: Palette,    color: "text-purple-400" },
  { value: "google-drive", label: "Google Drive", icon: HardDrive,  color: "text-yellow-400" },
  { value: "github",       label: "GitHub",       icon: Github,     color: "text-orange-400" },
  { value: "airtable",     label: "Airtable",     icon: Table2,     color: "text-green-400" },
  { value: "community",    label: "Community",    icon: Users,      color: "text-pink-400" },
  { value: "tool",         label: "Tools",        icon: Wrench,     color: "text-cyan-400" },
  { value: "other",        label: "Other",        icon: Link2,      color: "text-text-dim" },
];

function getCategoryConfig(cat: LinkCategory) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

function cleanLesson(lessonKey: string | null): string {
  if (!lessonKey) return "Uncategorized";
  return lessonKey
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Lesson group component ────────────────────────────────────────────────────
function LessonGroup({
  lesson,
  items,
}: {
  lesson: string;
  items: VaultLink[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-text-dim" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-dim" />
          )}
          <span className="text-sm font-medium text-text">{lesson}</span>
          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs text-teal-400">
            {items.length}
          </span>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border">
          {items.map((link) => {
            const cat = getCategoryConfig(link.category);
            const CatIcon = cat.icon;
            return (
              <div
                key={link.id}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CatIcon className={`h-4 w-4 shrink-0 ${cat.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{link.title}</p>
                    {link.description && (
                      <p className="text-xs text-text-dim truncate">{link.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 ${cat.color}`}>
                        {cat.label}
                      </span>
                      {link.tags
                        .filter((t) => !t.startsWith("source:") && !t.startsWith("author:") && !t.startsWith("lesson:"))
                        .map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-dim"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────
export function LinksClient() {
  const [allLinks, setAllLinks] = useState<VaultLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<LinkCategory | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/links")
      .then((r) => r.json())
      .then((data) => {
        setAllLinks(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Counts per category ──
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allLinks.length };
    for (const l of allLinks) {
      map[l.category] = (map[l.category] ?? 0) + 1;
    }
    return map;
  }, [allLinks]);

  // ── Filter ──
  const filtered = useMemo(() => {
    let result = allLinks;
    if (activeCategory !== "all") {
      result = result.filter((l) => l.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q)) ||
          (l.lessonKey && l.lessonKey.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allLinks, activeCategory, search]);

  // ── Group by lesson ──
  const grouped = useMemo(() => {
    const map = new Map<string, VaultLink[]>();
    for (const l of filtered) {
      const key = cleanLesson(l.lessonKey);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10">
            <Link2 className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text">Links</h1>
            <p className="text-xs text-text-dim">
              {allLinks.length} external resources from vault lessons
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search links..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-4 text-sm text-text placeholder:text-text-dim focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
          />
        </div>

        {/* Category tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = counts[cat.value] ?? 0;
            if (cat.value !== "all" && count === 0) return null;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === cat.value
                    ? "bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30"
                    : "bg-surface-2 text-text-muted hover:text-text"
                }`}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
                <span className="rounded-full bg-black/20 px-1.5 text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-dim text-sm">
            Loading links...
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Link2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No links found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([lesson, items]) => (
              <LessonGroup key={lesson} lesson={lesson} items={items} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}