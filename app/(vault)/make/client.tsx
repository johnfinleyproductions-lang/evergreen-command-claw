"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Search, RefreshCw, GitBranch, ChevronDown, ChevronUp, Tag } from "lucide-react";

interface MakeBlueprint {
  id: string;
  name: string;
  description: string | null;
  category: string;
  lessonKey: string | null;
  fileName: string;
  fileUrl: string | null;
  moduleCount: number | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "social-media":      { label: "📱 Social Media",     color: "bg-pink-500/10 text-pink-400 border-pink-500/30" },
  "lead-gen":          { label: "🧲 Lead Gen",          color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  "content-creation":  { label: "🎬 Content Creation",  color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  "voice-sales":       { label: "🎙️ Voice & Sales",    color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  "ai-agents":         { label: "🤖 AI Agents",         color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  "saas-tools":        { label: "⚙️ SaaS Tools",       color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
  "other":             { label: "📁 Other",              color: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
};

const ALL_CATEGORIES = ["all", ...Object.keys(CATEGORY_META)];

export function MakeClient() {
  const [blueprints, setBlueprints] = useState<MakeBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const fetchBlueprints = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (search) params.set("q", search);
      if (activeTag) params.set("tag", activeTag);
      const res = await fetch(`/api/make?${params}`);
      const data = await res.json();
      setBlueprints(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search, activeTag]);

  useEffect(() => {
    const t = setTimeout(fetchBlueprints, 200);
    return () => clearTimeout(t);
  }, [fetchBlueprints]);

  // Group by lessonKey (folder)
  const grouped = blueprints.reduce<Record<string, MakeBlueprint[]>>((acc, bp) => {
    const key = bp.lessonKey || bp.name || "__ungrouped";
    if (!acc[key]) acc[key] = [];
    acc[key].push(bp);
    return acc;
  }, {});

  const allTags = [...new Set(blueprints.flatMap((b) => b.tags || []))].sort();

  const toggleLesson = (key: string) => {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
              <GitBranch className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text">Make Blueprints</h1>
              <p className="text-xs text-text-dim">{blueprints.length} blueprints</p>
            </div>
          </div>
          <button
            onClick={fetchBlueprints}
            className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blueprints..."
            className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-4 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Category tabs */}
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-text-muted hover:text-text"
              }`}
            >
              {cat === "all" ? "All" : CATEGORY_META[cat]?.label ?? cat}
            </button>
          ))}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                  activeTag === tag
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "bg-surface-2 text-text-dim border border-border hover:text-text"
                }`}
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-text-dim" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <GitBranch className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No blueprints found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([lessonKey, items]) => {
              const isExpanded = expandedLessons.has(lessonKey) || Object.keys(grouped).length <= 5;
              const firstItem = items[0];
              const catMeta = CATEGORY_META[firstItem.category] ?? CATEGORY_META.other;

              return (
                <div key={lessonKey} className="rounded-xl border border-border bg-surface overflow-hidden">
                  {/* Lesson header */}
                  <button
                    onClick={() => toggleLesson(lessonKey)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${catMeta.color}`}>
                        {catMeta.label}
                      </span>
                      <span className="text-sm font-medium text-text truncate">{lessonKey}</span>
                      <span className="shrink-0 text-xs text-text-dim">{items.length} file{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-text-dim shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-dim shrink-0" />
                    )}
                  </button>

                  {/* Blueprint rows */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {items.map((bp) => (
                        <div key={bp.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 group">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-orange-500/10">
                            <GitBranch className="h-3.5 w-3.5 text-orange-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text truncate">{bp.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {bp.moduleCount ? (
                                <span className="text-[10px] text-text-dim">{bp.moduleCount} modules</span>
                              ) : null}
                              {(bp.tags || []).filter(t => !t.startsWith('source:')).slice(0, 3).map(tag => (
                                <span key={tag} className="text-[10px] text-text-dim bg-surface-2 rounded px-1.5 py-0.5">{tag}</span>
                              ))}
                            </div>
                          </div>
                          {bp.fileUrl && (
                            <a
                              href={bp.fileUrl}
                              download={bp.fileName}
                              className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md bg-orange-500/10 px-2.5 py-1 text-xs text-orange-400 hover:bg-orange-500/20 transition-all"
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
