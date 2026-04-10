"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Download,
  FileText,
  Captions,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface CourseItem {
  id: string;
  name: string;
  chapter: string;
  section: string | null;
  fileName: string;
  fileUrl: string | null;
  contentType: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// Section color palette
const SECTION_COLORS: Record<string, string> = {
  "GOAT Foundations":          "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  "6 Figure Blueprint":        "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "30 Day Roadmap":            "bg-green-500/10 text-green-400 border-green-500/30",
  "Bonus":                     "bg-purple-500/10 text-purple-400 border-purple-500/30",
  "Whats Working in AI today": "bg-orange-500/10 text-orange-400 border-orange-500/30",
};

function sectionColor(section: string | null) {
  if (!section) return "bg-gray-500/10 text-gray-400 border-gray-500/30";
  return SECTION_COLORS[section] ?? "bg-gray-500/10 text-gray-400 border-gray-500/30";
}

function isSrt(item: CourseItem) {
  return item.fileName.toLowerCase().endsWith(".srt");
}

export function CourseContentClient() {
  const [items, setItems] = useState<CourseItem[]>([]);
  const [activeChapter, setActiveChapter] = useState("all");
  const [activeSection, setActiveSection] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/course-content");
      if (res.ok) setItems(await res.json());
    } catch (e) {
      console.error("Failed to fetch course content:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Derive unique chapters and sections
  const chapters = useMemo(() => {
    const set = new Set(items.map((i) => i.chapter));
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const sections = useMemo(() => {
    const filtered = activeChapter === "all" ? items : items.filter((i) => i.chapter === activeChapter);
    const set = new Set(filtered.map((i) => i.section ?? "Uncategorized"));
    return ["all", ...Array.from(set)];
  }, [items, activeChapter]);

  // All tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    let result = items;
    if (activeChapter !== "all") result = result.filter((i) => i.chapter === activeChapter);
    if (activeSection !== "all") result = result.filter((i) => (i.section ?? "Uncategorized") === activeSection);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.fileName.toLowerCase().includes(q) ||
          (i.section && i.section.toLowerCase().includes(q))
      );
    }
    if (activeTag) {
      result = result.filter((i) => i.tags?.some((t) => t === activeTag));
    }
    return result;
  }, [items, activeChapter, activeSection, searchQuery, activeTag]);

  // Group by section for display
  const groupedBySections = useMemo(() => {
    const map = new Map<string, CourseItem[]>();
    for (const item of filtered) {
      const sec = item.section ?? "Uncategorized";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(item);
    }
    return map;
  }, [filtered]);

  function toggleSection(sec: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  }

  function handleDownload(item: CourseItem) {
    if (item.fileUrl) {
      window.open(item.fileUrl, "_blank");
    } else {
      alert("File not yet uploaded to vault.");
    }
  }

  const totalCount = filtered.length;
  const withFiles = filtered.filter((i) => i.fileUrl).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Course Content</h2>
          <p className="text-sm text-text-dim">
            {withFiles}/{totalCount} files available
          </p>
        </div>
      </div>

      {/* Chapter tabs */}
      {chapters.length > 2 && (
        <div className="flex gap-1 flex-wrap">
          {chapters.map((ch) => (
            <button
              key={ch}
              onClick={() => { setActiveChapter(ch); setActiveSection("all"); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                activeChapter === ch
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-text-muted hover:bg-surface-2"
              )}
            >
              {ch === "all" ? "All Chapters" : ch}
            </button>
          ))}
        </div>
      )}

      {/* Section filter + search row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap shrink-0">
          {sections.map((sec) => (
            <button
              key={sec}
              onClick={() => setActiveSection(sec)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                activeSection === sec
                  ? cn("border", sec === "all" ? "bg-accent/10 text-accent border-accent/30" : sectionColor(sec))
                  : "text-text-muted hover:bg-surface-2"
              )}
            >
              {sec === "all" ? "All Sections" : sec}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-dim" />
          <input
            type="text"
            placeholder="Search lessons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 py-1.5 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Tag bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-text-dim shrink-0" />
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="flex items-center gap-1 rounded-full bg-accent/20 text-accent px-2.5 py-0.5 text-xs border border-accent/30"
            >
              {activeTag} <X className="h-3 w-3" />
            </button>
          )}
          {allTags.filter((t) => t !== activeTag).slice(0, 12).map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-text-muted hover:bg-surface-3 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-dim text-sm">Loading...</div>
      ) : groupedBySections.size === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
            <BookOpen className="h-6 w-6 text-accent" />
          </div>
          <h3 className="font-medium text-text-muted">No content found</h3>
          <p className="mt-1 text-sm text-text-dim">
            {searchQuery || activeTag ? "Nothing matches your search" : "Upload course files to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(groupedBySections.entries()).map(([sec, secItems]) => {
            const isExpanded = expandedSections.has(sec);
            const srtCount = secItems.filter(isSrt).length;
            const txtCount = secItems.filter((i) => !isSrt(i)).length;
            const readyCount = secItems.filter((i) => i.fileUrl).length;

            return (
              <div
                key={sec}
                className={cn(
                  "rounded-xl border transition-colors",
                  isExpanded ? "border-accent/30 bg-surface-1" : "border-border hover:border-border-hover"
                )}
              >
                {/* Section header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => toggleSection(sec)}
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-text-dim shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-text-dim shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-text">{sec}</h3>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] border", sectionColor(sec))}>
                        {sec}
                      </span>
                    </div>
                    {!isExpanded && (
                      <div className="flex items-center gap-3 mt-0.5">
                        {srtCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-text-dim">
                            <Captions className="h-3 w-3 text-green-400" />
                            {srtCount} transcript{srtCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {txtCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-text-dim">
                            <FileText className="h-3 w-3 text-orange-400" />
                            {txtCount} case stud{txtCount !== 1 ? "ies" : "y"}
                          </span>
                        )}
                        <span className="text-[10px] text-text-dim">{readyCount}/{secItems.length} ready</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    {secItems.map((item) => {
                      const isTranscript = isSrt(item);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-surface-2/50 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isTranscript
                              ? <Captions className="h-3.5 w-3.5 text-green-400 shrink-0" />
                              : <FileText className="h-3.5 w-3.5 text-orange-400 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm text-text truncate">{item.name}</p>
                              <p className="text-[10px] text-text-dim">
                                {isTranscript ? "Transcript (.srt)" : "Case Study (.txt)"}
                                {item.metadata?.fileSize
                                  ? ` · ${(Number(item.metadata.fileSize) / 1024).toFixed(1)} KB`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownload(item)}
                            disabled={!item.fileUrl}
                            className={cn(
                              "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors shrink-0",
                              item.fileUrl
                                ? isTranscript
                                  ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                  : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                                : "bg-surface-3 text-text-dim cursor-not-allowed"
                            )}
                          >
                            <Download className="h-3 w-3" />
                            {item.fileUrl ? "Download" : "Pending"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
