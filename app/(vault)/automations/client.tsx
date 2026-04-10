"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Tag,
  X,
  Upload,
  FileJson,
  FileText,
  Download,
  Workflow,
  Boxes,
  BookOpen,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Automation {
  id: string;
  name: string;
  description: string | null;
  category: string;
  lessonKey: string | null;
  fileName: string;
  fileUrl: string | null;
  workflowJson: Record<string, unknown> | null;
  nodeCount: number | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface LessonGroup {
  lessonKey: string;
  category: string;
  workflows: Automation[];
  docs: Automation[];
  totalNodes: number;
  tags: string[];
}

const CATEGORY_FILTERS = [
  { label: "All", value: "all" },
  { label: "Fundamentals", value: "fundamentals" },
  { label: "Web Apps", value: "web-apps" },
  { label: "AI Agents", value: "ai-agents" },
  { label: "JavaScript", value: "javascript" },
  { label: "Voice & Comms", value: "voice-comms" },
  { label: "Lead Gen", value: "lead-gen" },
  { label: "Make Conversions", value: "make-conversions" },
  { label: "Standalone", value: "standalone" },
];

const CATEGORY_COLORS: Record<string, string> = {
  fundamentals: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "web-apps": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "ai-agents": "bg-purple-500/10 text-purple-400 border-purple-500/30",
  javascript: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  "voice-comms": "bg-pink-500/10 text-pink-400 border-pink-500/30",
  "lead-gen": "bg-green-500/10 text-green-400 border-green-500/30",
  "make-conversions": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  standalone: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

/** Sort lesson keys naturally: M2L1 before M2L2 before M3L1 etc. */
function lessonKeySort(a: string, b: string): number {
  const rx = /M(\d+)L(\d+)/i;
  const ma = a.match(rx);
  const mb = b.match(rx);
  if (ma && mb) {
    const modA = parseInt(ma[1]), lesA = parseInt(ma[2]);
    const modB = parseInt(mb[1]), lesB = parseInt(mb[2]);
    if (modA !== modB) return modA - modB;
    return lesA - lesB;
  }
  return a.localeCompare(b);
}

export function AutomationsClient() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Fetch automations
  const fetchAutomations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (searchQuery) params.set("q", searchQuery);
      if (activeTag) params.set("tag", activeTag);

      const res = await fetch(`/api/automations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch (error) {
      console.error("Failed to fetch automations:", error);
    }
  }, [activeCategory, searchQuery, activeTag]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  // Group automations by lessonKey
  const lessonGroups = useMemo(() => {
    const groups = new Map<string, LessonGroup>();
    let ungroupedIdx = 0;

    automations.forEach((a) => {
      const key = a.lessonKey || `__ungrouped_${ungroupedIdx++}`;
      if (!groups.has(key)) {
        groups.set(key, {
          lessonKey: key,
          category: a.category,
          workflows: [],
          docs: [],
          totalNodes: 0,
          tags: [],
        });
      }
      const group = groups.get(key)!;
      const isJson = a.fileName.toLowerCase().endsWith(".json");
      if (isJson) {
        group.workflows.push(a);
        group.totalNodes += a.nodeCount || 0;
      } else {
        group.docs.push(a);
      }
      // Merge tags
      if (a.tags) {
        a.tags.forEach((t) => {
          if (!group.tags.includes(t)) group.tags.push(t);
        });
      }
    });

    // Sort groups by lesson key
    const sorted = Array.from(groups.values()).sort((a, b) =>
      lessonKeySort(a.lessonKey, b.lessonKey)
    );

    return sorted;
  }, [automations]);

  // All unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    automations.forEach((a) => a.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [automations]);

  // Delete
  async function handleDelete(id: string) {
    if (!confirm("Delete this automation?")) return;
    await fetch("/api/automations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAutomations();
  }

  // Download JSON
  function handleDownload(automation: Automation) {
    if (automation.workflowJson) {
      const blob = new Blob([JSON.stringify(automation.workflowJson, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = automation.fileName || `${automation.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (automation.fileUrl) {
      window.open(automation.fileUrl, "_blank");
      return;
    }
    alert("No downloadable content available for this file yet.");
  }

  // Upload files
  async function handleUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);

    let uploaded = 0;
    for (const file of uploadFiles) {
      setUploadProgress(`Uploading ${uploaded + 1}/${uploadFiles.length}: ${file.name}`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tags", "source:skool-jack");

        await fetch("/api/automations/upload", {
          method: "POST",
          body: fd,
        });
        uploaded++;
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }

    setUploadProgress(`Done! Uploaded ${uploaded}/${uploadFiles.length} files.`);
    setUploadFiles([]);
    setUploading(false);
    setTimeout(() => {
      setShowUpload(false);
      setUploadProgress("");
    }, 2000);
    fetchAutomations();
  }

  // Get display title for a lesson group
  function getGroupTitle(group: LessonGroup): string {
    // Prefer the workflow name
    if (group.workflows.length > 0) {
      const main = group.workflows[0];
      // If it's a clean lesson key like M2L1, make a nice title
      if (group.workflows.length === 1) return main.name;
      return main.name;
    }
    if (group.docs.length > 0) return group.docs[0].name;
    return group.lessonKey;
  }

  // Render node list from workflow JSON
  function renderNodes(json: Record<string, unknown>) {
    const nodes = json.nodes as Array<{ name: string; type: string }> | undefined;
    if (!nodes || !Array.isArray(nodes)) return null;
    return (
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Nodes ({nodes.length})
        </h4>
        <div className="grid grid-cols-2 gap-1">
          {nodes.map((node, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1">
              <Boxes className="h-3 w-3 text-text-dim shrink-0" />
              <span className="text-xs text-text-muted truncate">{node.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Category filters */}
          <div className="flex gap-1 flex-wrap shrink-0">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveCategory(filter.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                  activeCategory === filter.value
                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
                    : "text-text-muted hover:bg-surface-2"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-dim" />
            <input
              type="text"
              placeholder="Search automations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-1 py-1.5 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-orange-500/50 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors shrink-0"
        >
          <Upload className="h-4 w-4" />
          Upload Workflows
        </button>
      </div>

      {/* Tag bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-text-dim shrink-0" />
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="flex items-center gap-1 rounded-full bg-orange-500/20 text-orange-300 px-2.5 py-0.5 text-xs border border-orange-500/30"
            >
              {activeTag}
              <X className="h-3 w-3" />
            </button>
          )}
          {allTags
            .filter((t) => t !== activeTag)
            .slice(0, 15)
            .map((tag) => (
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

      {/* Upload panel */}
      {showUpload && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
          <h3 className="text-sm font-medium text-text">Import n8n Workflows</h3>
          <p className="text-xs text-text-dim">
            Select n8n workflow JSON files and/or follow-along DOCX files.
            Categories are auto-detected from filenames.
          </p>
          <input
            type="file"
            multiple
            accept=".json,.docx"
            onChange={(e) =>
              setUploadFiles(e.target.files ? Array.from(e.target.files) : [])
            }
            className="text-sm text-text-muted"
          />
          {uploadFiles.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {uploadFiles.map((f, i) => (
                <p key={i} className="text-xs text-text-muted">
                  {f.name.endsWith(".json") ? (
                    <FileJson className="inline h-3 w-3 mr-1 text-orange-400" />
                  ) : (
                    <FileText className="inline h-3 w-3 mr-1 text-blue-400" />
                  )}
                  {f.name}
                </p>
              ))}
            </div>
          )}
          {uploadProgress && (
            <p className="text-xs text-orange-400 font-medium">{uploadProgress}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || uploading}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {uploading
                ? "Uploading..."
                : `Upload ${uploadFiles.length} file${uploadFiles.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setShowUpload(false);
                setUploadFiles([]);
                setUploadProgress("");
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Lesson groups list */}
      {lessonGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 mb-4">
            <Workflow className="h-6 w-6 text-orange-400" />
          </div>
          <h3 className="font-medium text-text-muted">No automations yet</h3>
          <p className="mt-1 text-sm text-text-dim">
            {searchQuery || activeTag
              ? "No automations match your search"
              : "Upload n8n workflow JSON files to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lessonGroups.map((group) => {
            const isExpanded = expandedKey === group.lessonKey;
            const categoryColor =
              CATEGORY_COLORS[group.category] || CATEGORY_COLORS.other;
            const title = getGroupTitle(group);
            const hasWorkflows = group.workflows.length > 0;
            const hasDocs = group.docs.length > 0;
            const isUngrouped = group.lessonKey.startsWith("__ungrouped_");
            const displayKey = isUngrouped ? null : group.lessonKey;

            return (
              <div
                key={group.lessonKey}
                className={cn(
                  "rounded-xl border transition-colors",
                  isExpanded
                    ? "border-orange-500/30 bg-surface-1"
                    : "border-border hover:border-border-hover"
                )}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() =>
                    setExpandedKey(isExpanded ? null : group.lessonKey)
                  }
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-dim shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-dim shrink-0" />
                  )}

                  <Layers className="h-4 w-4 text-orange-400 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {displayKey && (
                        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-dim">
                          {displayKey}
                        </span>
                      )}
                      <h3 className="text-sm font-medium text-text truncate">
                        {title}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] border",
                          categoryColor
                        )}
                      >
                        {group.category.replace("-", " ")}
                      </span>
                    </div>
                    {!isExpanded && (
                      <div className="flex items-center gap-3 mt-0.5">
                        {hasWorkflows && (
                          <span className="flex items-center gap-1 text-[10px] text-text-dim">
                            <FileJson className="h-3 w-3 text-orange-400" />
                            {group.workflows.length} workflow{group.workflows.length !== 1 ? "s" : ""}
                            {group.totalNodes > 0 && ` · ${group.totalNodes} nodes`}
                          </span>
                        )}
                        {hasDocs && (
                          <span className="flex items-center gap-1 text-[10px] text-text-dim">
                            <FileText className="h-3 w-3 text-blue-400" />
                            {group.docs.length} doc{group.docs.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {!isExpanded && group.tags.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      {group.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-5">
                    {/* Tags row */}
                    {group.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {group.tags.map((tag) => (
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

                    {/* Workflows section */}
                    {hasWorkflows && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <FileJson className="h-4 w-4 text-orange-400" />
                          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                            n8n Workflow{group.workflows.length !== 1 ? "s" : ""}
                          </h4>
                        </div>
                        {group.workflows.map((wf) => (
                          <div
                            key={wf.id}
                            className="rounded-lg border border-border bg-surface-2/50 p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileJson className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                                <span className="text-sm text-text truncate">{wf.name}</span>
                                {wf.nodeCount ? (
                                  <span className="shrink-0 text-[10px] text-text-dim">
                                    {wf.nodeCount} nodes
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleDownload(wf)}
                                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                                >
                                  <Download className="h-3 w-3" />
                                  JSON
                                </button>
                                <button
                                  onClick={() => handleDelete(wf.id)}
                                  className="p-1 rounded-md text-text-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            {/* Node list */}
                            {wf.workflowJson && renderNodes(wf.workflowJson)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Documentation section */}
                    {hasDocs && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-blue-400" />
                          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                            Documentation
                          </h4>
                        </div>
                        {group.docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-surface-2/50 p-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              <span className="text-sm text-text truncate">{doc.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleDownload(doc)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                              >
                                <Download className="h-3 w-3" />
                                DOCX
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="p-1 rounded-md text-text-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-4 text-[10px] text-text-dim">
                        <span>{group.workflows.length + group.docs.length} file{group.workflows.length + group.docs.length !== 1 ? "s" : ""}</span>
                        {group.totalNodes > 0 && <span>{group.totalNodes} total nodes</span>}
                        <span className="capitalize">{group.category.replace("-", " ")}</span>
                      </div>
                    </div>
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
