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
  Download,
  Bot,
  Copy,
  Check,
  Eye,
  EyeOff,
  FileText,
  RefreshCw,
  XCircle,
  CheckCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Skill {
  id: string;
  name: string;
  fileName: string;
  fileUrl: string | null;
  type: string;
  indexStatus: string;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface SectionGroup {
  sectionSlug: string;
  sectionLabel: string;
  skills: Skill[];
}

// ── Section display config ────────────────────────────────────────────────────
const SECTION_META: Record<string, { label: string; color: string }> = {
  "vibe-coding-live-frontend-fixes": {
    label: "🎯 Vibe Coding",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
  "improvised-intelligence-my-25k-agent-skill": {
    label: "🎷 Improvised Intelligence",
    color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  },
  "3d-websites": {
    label: "🧑‍💻 3D Websites",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  },
  "seo-optimiser": {
    label: "📈 SEO Optimiser",
    color: "bg-green-500/10 text-green-400 border-green-500/30",
  },
  "n8n-workflow-reviewer-claude-code-skill": {
    label: "🔍 n8n Workflow Reviewer",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  },
  other: {
    label: "📁 Other",
    color: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  },
};

const INDEX_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  ready:      { icon: CheckCircle, color: "text-green-400",  label: "Ready" },
  processing: { icon: Loader2,     color: "text-amber-400",  label: "Indexing" },
  pending:    { icon: Clock,       color: "text-text-dim",   label: "Pending" },
  failed:     { icon: XCircle,     color: "text-red-400",    label: "Failed" },
};

function getSectionSlug(tags: string[] | null): string {
  if (!tags) return "other";
  const tag = tags.find((t) => t.startsWith("section:"));
  return tag ? tag.replace("section:", "") : "other";
}

function getSectionMeta(slug: string) {
  return SECTION_META[slug] ?? { label: `📁 ${slug}`, color: SECTION_META.other.color };
}

function isTextFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["md", "skill", "txt", "html", "json"].includes(ext ?? "");
}

// ── Main component ────────────────────────────────────────────────────────────
export function SkillsClient() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSection, setActiveSection] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [reindexing, setReindexing] = useState<Set<string>>(new Set());

  // ── Fetch skills ──────────────────────────────────────────────────────────
  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type: "skill" });
      if (searchQuery) params.set("q", searchQuery);
      if (activeTag) params.set("tag", activeTag);
      const res = await fetch(`/api/resources?${params}`);
      if (res.ok) setSkills(await res.json());
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    }
  }, [searchQuery, activeTag]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  // Auto-poll while any skills are processing/pending
  useEffect(() => {
    const hasProcessing = skills.some(
      (s) => s.indexStatus === "processing" || s.indexStatus === "pending"
    );
    if (!hasProcessing) return;
    const interval = setInterval(fetchSkills, 3000);
    return () => clearInterval(interval);
  }, [skills, fetchSkills]);

  // ── Group by section ──────────────────────────────────────────────────────
  const sectionGroups = useMemo<SectionGroup[]>(() => {
    const map = new Map<string, Skill[]>();
    for (const skill of skills) {
      const slug = getSectionSlug(skill.tags);
      if (!map.has(slug)) map.set(slug, []);
      map.get(slug)!.push(skill);
    }
    return Array.from(map.entries())
      .map(([slug, items]) => ({
        sectionSlug: slug,
        sectionLabel: getSectionMeta(slug).label,
        skills: items,
      }))
      .sort((a, b) => a.sectionLabel.localeCompare(b.sectionLabel));
  }, [skills]);

  const visibleGroups = useMemo(() => {
    if (activeSection === "all") return sectionGroups;
    return sectionGroups.filter((g) => g.sectionSlug === activeSection);
  }, [sectionGroups, activeSection]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => s.tags?.forEach((t) => {
      if (!t.startsWith("section:") && !t.startsWith("chapter:") && !t.startsWith("source:")) {
        set.add(t);
      }
    }));
    return Array.from(set).sort();
  }, [skills]);

  const failedCount = skills.filter((s) => s.indexStatus === "failed").length;
  const pendingCount = skills.filter((s) => s.indexStatus === "pending").length;

  // ── Re-index ──────────────────────────────────────────────────────────────
  async function handleReindex(skillId: string) {
    setReindexing((prev) => new Set(prev).add(skillId));
    try {
      await fetch("/api/resources/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: skillId }),
      });
    } finally {
      setReindexing((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
      fetchSkills();
    }
  }

  async function handleRetryAll() {
    const targets = skills.filter(
      (s) => s.indexStatus === "failed" || s.indexStatus === "pending"
    );
    for (const s of targets) {
      handleReindex(s.id);
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  async function loadPreview(skill: Skill) {
    if (previewId === skill.id) {
      setPreviewId(null);
      setPreviewContent(null);
      return;
    }
    setPreviewId(skill.id);
    setPreviewContent(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/resources/preview?id=${skill.id}`);
      if (res.ok) setPreviewContent(await res.text());
      else setPreviewContent("(Preview not available)");
    } catch {
      setPreviewContent("(Failed to load preview)");
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  async function copySkill(skill: Skill) {
    try {
      let content = previewContent;
      if (!content || previewId !== skill.id) {
        const res = await fetch(`/api/resources/preview?id=${skill.id}`);
        content = res.ok ? await res.text() : null;
      }
      if (content) {
        await navigator.clipboard.writeText(content);
        setCopied(skill.id);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      alert("Copy failed — try viewing the skill first.");
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function downloadSkill(skill: Skill) {
    if (skill.fileUrl) {
      window.open(skill.fileUrl, "_blank");
    } else {
      alert("Download URL not available yet.");
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteSkill(id: string) {
    if (!confirm("Delete this skill from the vault?")) return;
    await fetch("/api/resources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchSkills();
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    for (const file of uploadFiles) {
      setUploadProgress(`Uploading ${uploaded + 1}/${uploadFiles.length}: ${file.name}`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "skill");
        fd.append("tags", "source:manual,chapter:claude-skills");
        await fetch("/api/resources/upload", { method: "POST", body: fd });
        uploaded++;
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }
    setUploadProgress(`Done! Uploaded ${uploaded}/${uploadFiles.length} files.`);
    setUploadFiles([]);
    setUploading(false);
    setTimeout(() => { setShowUpload(false); setUploadProgress(""); }, 2000);
    fetchSkills();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Failed/pending banner ── */}
      {(failedCount > 0 || pendingCount > 0) && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-red-300">
              {failedCount > 0 && `${failedCount} failed`}
              {failedCount > 0 && pendingCount > 0 && ", "}
              {pendingCount > 0 && `${pendingCount} pending`}
              {" "}— not yet indexed for search
            </span>
          </div>
          <button
            onClick={handleRetryAll}
            className="flex items-center gap-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 px-3 py-1 text-xs text-red-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry All
          </button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">

          {/* Section filters */}
          <div className="flex gap-1 flex-wrap shrink-0">
            <button
              onClick={() => setActiveSection("all")}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                activeSection === "all"
                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                  : "text-text-muted hover:bg-surface-2"
              )}
            >
              All
            </button>
            {sectionGroups.map((g) => (
              <button
                key={g.sectionSlug}
                onClick={() => setActiveSection(g.sectionSlug)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                  activeSection === g.sectionSlug
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                    : "text-text-muted hover:bg-surface-2"
                )}
              >
                {g.sectionLabel}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-dim" />
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-1 py-1.5 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-purple-500/50 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors shrink-0"
        >
          <Upload className="h-4 w-4" />
          Upload Skill
        </button>
      </div>

      {/* ── Tag bar ── */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-text-dim shrink-0" />
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="flex items-center gap-1 rounded-full bg-purple-500/20 text-purple-300 px-2.5 py-0.5 text-xs border border-purple-500/30"
            >
              {activeTag}
              <X className="h-3 w-3" />
            </button>
          )}
          {allTags
            .filter((t) => t !== activeTag)
            .slice(0, 12)
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

      {/* ── Upload panel ── */}
      {showUpload && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
          <h3 className="text-sm font-medium text-text">Upload Claude Skill Files</h3>
          <p className="text-xs text-text-dim">
            Upload <code className="text-purple-400">.skill</code> or{" "}
            <code className="text-purple-400">SKILL.md</code> files. They will
            automatically be tagged and indexed for search.
          </p>
          <input
            type="file"
            multiple
            accept=".skill,.md,.txt"
            onChange={(e) =>
              setUploadFiles(e.target.files ? Array.from(e.target.files) : [])
            }
            className="text-sm text-text-muted"
          />
          {uploadFiles.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {uploadFiles.map((f, i) => (
                <p key={i} className="text-xs text-text-muted">
                  <Bot className="inline h-3 w-3 mr-1 text-purple-400" />
                  {f.name}
                </p>
              ))}
            </div>
          )}
          {uploadProgress && (
            <p className="text-xs text-purple-400 font-medium">{uploadProgress}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || uploading}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading..." : `Upload ${uploadFiles.length} file${uploadFiles.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => { setShowUpload(false); setUploadFiles([]); setUploadProgress(""); }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 mb-4">
            <Bot className="h-6 w-6 text-purple-400" />
          </div>
          <h3 className="font-medium text-text-muted">No Claude Skills yet</h3>
          <p className="mt-1 text-sm text-text-dim">
            {searchQuery || activeTag
              ? "No skills match your search"
              : "Run the upload_claude_skills_to_vault.mjs script to import skills"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map((group) => {
            const isExpanded = expandedSection === group.sectionSlug;
            const meta = getSectionMeta(group.sectionSlug);

            return (
              <div
                key={group.sectionSlug}
                className={cn(
                  "rounded-xl border transition-colors",
                  isExpanded
                    ? "border-purple-500/30 bg-surface-1"
                    : "border-border hover:border-border-hover"
                )}
              >
                {/* ── Section header ── */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedSection(isExpanded ? null : group.sectionSlug)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-dim shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-dim shrink-0" />
                  )}
                  <Bot className="h-4 w-4 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <h3 className="text-sm font-medium text-text truncate">
                      {group.sectionLabel}
                    </h3>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] border", meta.color)}>
                      {group.skills.length} skill{group.skills.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-[10px] text-text-dim shrink-0">
                    {group.skills.map((s) => (
                      <span key={s.id} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
                        {s.fileName.split(".").pop()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ── Section body ── */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-3">
                    {group.skills.map((skill) => {
                      const isPreviewOpen = previewId === skill.id;
                      const ext = skill.fileName.split(".").pop()?.toLowerCase();
                      const extColor =
                        ext === "skill" ? "text-purple-400 bg-purple-500/10" :
                        ext === "md"    ? "text-cyan-400 bg-cyan-500/10" :
                        ext === "html"  ? "text-orange-400 bg-orange-500/10" :
                                          "text-slate-400 bg-slate-500/10";
                      const statusCfg = INDEX_STATUS_CONFIG[skill.indexStatus] ?? INDEX_STATUS_CONFIG.pending;
                      const StatusIcon = statusCfg.icon;
                      const isRetrying = reindexing.has(skill.id);
                      const canRetry = skill.indexStatus === "failed" || skill.indexStatus === "pending";

                      return (
                        <div
                          key={skill.id}
                          className={cn(
                            "rounded-lg border transition-colors",
                            isPreviewOpen
                              ? "border-purple-500/40 bg-surface-2/80"
                              : "border-border bg-surface-2/40"
                          )}
                        >
                          {/* Skill row */}
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <FileText className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text truncate">{skill.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <StatusIcon className={cn("h-2.5 w-2.5", statusCfg.color, skill.indexStatus === "processing" && "animate-spin")} />
                                <p className={cn("text-[10px]", statusCfg.color)}>{statusCfg.label}</p>
                              </div>
                            </div>

                            {/* Extension badge */}
                            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono", extColor)}>
                              .{ext}
                            </span>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Re-index button for failed/pending */}
                              {canRetry && (
                                <button
                                  onClick={() => handleReindex(skill.id)}
                                  disabled={isRetrying}
                                  title="Retry indexing"
                                  className={cn(
                                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                                    isRetrying
                                      ? "bg-surface-3 text-text-dim cursor-not-allowed"
                                      : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  )}
                                >
                                  <RefreshCw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
                                  {isRetrying ? "Retrying…" : "Retry"}
                                </button>
                              )}

                              {/* Preview toggle */}
                              {isTextFile(skill.fileName) && (
                                <button
                                  onClick={() => loadPreview(skill)}
                                  className={cn(
                                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                                    isPreviewOpen
                                      ? "bg-purple-500/20 text-purple-300"
                                      : "bg-surface-3 text-text-muted hover:bg-purple-500/10 hover:text-purple-400"
                                  )}
                                  title={isPreviewOpen ? "Hide preview" : "Preview skill"}
                                >
                                  {isPreviewOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {isPreviewOpen ? "Hide" : "View"}
                                </button>
                              )}

                              {/* Copy */}
                              <button
                                onClick={() => copySkill(skill)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-surface-3 text-text-muted hover:bg-purple-500/10 hover:text-purple-400 transition-colors"
                                title="Copy skill content to clipboard"
                              >
                                {copied === skill.id ? (
                                  <Check className="h-3 w-3 text-green-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copied === skill.id ? "Copied!" : "Copy"}
                              </button>

                              {/* Download */}
                              <button
                                onClick={() => downloadSkill(skill)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-surface-3 text-text-muted hover:bg-purple-500/10 hover:text-purple-400 transition-colors"
                                title="Download file"
                              >
                                <Download className="h-3 w-3" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => deleteSkill(skill.id)}
                                className="p-1 rounded-md text-text-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {/* Preview panel */}
                          {isPreviewOpen && (
                            <div className="border-t border-border px-3 py-3">
                              {previewLoading ? (
                                <p className="text-xs text-text-dim animate-pulse">Loading preview…</p>
                              ) : (
                                <pre className="text-xs text-text-muted whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                                  {previewContent ?? "(No content)"}
                                </pre>
                              )}
                            </div>
                          )}
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
