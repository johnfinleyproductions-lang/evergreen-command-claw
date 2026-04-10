"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Zap,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Trash2,
  Tag,
  X,
  Upload,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Prompt {
  id: string;
  title: string;
  content: string;
  type: string;
  description: string | null;
  targetModel: string | null;
  variables: string[] | null;
  tags: string[] | null;
  usageCount: number | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "System Prompts", value: "system_prompt" },
  { label: "Megaprompts", value: "megaprompt" },
  { label: "Templates", value: "template" },
  { label: "Chains", value: "chain" },
];

const TYPE_COLORS: Record<string, string> = {
  system_prompt: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  megaprompt: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  template: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  chain: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

export function PromptsClient() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [activeType, setActiveType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);

  // New prompt form state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("template");
  const [newTags, setNewTags] = useState("");

  // Fetch prompts
  const fetchPrompts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeType !== "all") params.set("type", activeType);
      if (searchQuery) params.set("q", searchQuery);
      if (activeTag) params.set("tag", activeTag);

      const res = await fetch(`/api/prompts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data);
      }
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
    }
  }, [activeType, searchQuery, activeTag]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // All unique tags across prompts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    prompts.forEach((p) => p.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [prompts]);

  // Copy to clipboard
  async function handleCopy(prompt: Prompt) {
    await navigator.clipboard.writeText(prompt.content);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Delete
  async function handleDelete(id: string) {
    if (!confirm("Delete this prompt?")) return;
    await fetch("/api/prompts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setExpandedId(null);
    fetchPrompts();
  }

  // Create
  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;

    await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        content: newContent.trim(),
        type: newType,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });

    setNewTitle("");
    setNewContent("");
    setNewType("template");
    setNewTags("");
    setShowCreate(false);
    fetchPrompts();
  }

  // Import markdown files as prompts
  async function handleImport() {
    if (importFiles.length === 0) return;
    setImporting(true);

    const promptsToImport: Array<{
      title: string;
      content: string;
      tags: string[];
    }> = [];

    for (const file of importFiles) {
      const text = await file.text();
      // Use filename (minus extension) as title
      const title = file.name.replace(/\.[^.]+$/, "").trim();
      // Auto-tag based on filename patterns
      const tags: string[] = ["imported"];
      if (file.name.startsWith("[BONUS]")) tags.push("bonus");
      if (file.name.startsWith("[PGA]")) tags.push("PGA");
      if (file.name.includes("ChatGPT")) tags.push("ChatGPT");

      promptsToImport.push({ title, content: text, tags });
    }

    try {
      await fetch("/api/prompts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: promptsToImport }),
      });
    } catch (err) {
      console.error("Import failed:", err);
    }

    setImportFiles([]);
    setShowImport(false);
    setImporting(false);
    fetchPrompts();
  }

  // Simple markdown-ish rendering for prompt content
  function renderContent(text: string) {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeKey = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${codeKey++}`}
              className="my-3 rounded-lg bg-surface-1 border border-border p-4 text-sm overflow-x-auto font-mono text-text-muted"
            >
              {codeLines.join("\n")}
            </pre>
          );
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(
          <h4 key={i} className="text-sm font-semibold text-text mt-4 mb-1">
            {line.slice(4)}
          </h4>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h3 key={i} className="text-base font-semibold text-text mt-4 mb-1">
            {line.slice(3)}
          </h3>
        );
      } else if (line.startsWith("# ")) {
        elements.push(
          <h2 key={i} className="text-lg font-bold text-text mt-4 mb-2">
            {line.slice(2)}
          </h2>
        );
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        elements.push(
          <li key={i} className="text-sm text-text-muted ml-4 list-disc">
            {renderInline(line.slice(2))}
          </li>
        );
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(
          <li key={i} className="text-sm text-text-muted ml-4 list-decimal">
            {renderInline(line.replace(/^\d+\.\s/, ""))}
          </li>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(
          <p key={i} className="text-sm text-text-muted leading-relaxed">
            {renderInline(line)}
          </p>
        );
      }
    }

    // Close unclosed code block
    if (inCodeBlock && codeLines.length > 0) {
      elements.push(
        <pre
          key={`code-${codeKey}`}
          className="my-3 rounded-lg bg-surface-1 border border-border p-4 text-sm overflow-x-auto font-mono text-text-muted"
        >
          {codeLines.join("\n")}
        </pre>
      );
    }

    return elements;
  }

  function renderInline(text: string): React.ReactNode {
    // Bold
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-text">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="px-1 py-0.5 rounded bg-surface-2 text-accent text-xs font-mono"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Type filters */}
          <div className="flex gap-1 shrink-0">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveType(filter.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                  activeType === filter.value
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
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
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-1 py-1.5 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-purple-500/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setShowImport(!showImport);
              setShowCreate(false);
            }}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:bg-surface-2 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={() => {
              setShowCreate(!showCreate);
              setShowImport(false);
            }}
            className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Prompt
          </button>
        </div>
      </div>

      {/* Tag bar */}
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

      {/* Import panel */}
      {showImport && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
          <h3 className="text-sm font-medium text-text">Import Prompts</h3>
          <p className="text-xs text-text-dim">
            Select markdown (.md) or text (.txt) files. Each file becomes a
            separate prompt.
          </p>
          <input
            type="file"
            multiple
            accept=".md,.txt,.markdown"
            onChange={(e) =>
              setImportFiles(e.target.files ? Array.from(e.target.files) : [])
            }
            className="text-sm text-text-muted"
          />
          {importFiles.length > 0 && (
            <div className="space-y-1">
              {importFiles.map((f, i) => (
                <p key={i} className="text-xs text-text-muted">
                  <FileText className="inline h-3 w-3 mr-1" />
                  {f.name}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importFiles.length === 0 || importing}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              {importing
                ? "Importing..."
                : `Import ${importFiles.length} file${importFiles.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                setImportFiles([]);
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create panel */}
      {showCreate && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
          <h3 className="text-sm font-medium text-text">New Prompt</h3>

          <input
            type="text"
            placeholder="Prompt title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-purple-500/50 focus:outline-none"
          />

          <textarea
            placeholder="Prompt content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-purple-500/50 focus:outline-none font-mono resize-y"
          />

          <div className="flex gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-purple-500/50 focus:outline-none"
            >
              <option value="template">Template</option>
              <option value="system_prompt">System Prompt</option>
              <option value="megaprompt">Megaprompt</option>
              <option value="chain">Chain</option>
            </select>
            <input
              type="text"
              placeholder="Tags (comma separated)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-purple-500/50 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || !newContent.trim()}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              Create Prompt
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Prompt list */}
      {prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 mb-4">
            <Zap className="h-6 w-6 text-purple-400" />
          </div>
          <h3 className="font-medium text-text-muted">No prompts yet</h3>
          <p className="mt-1 text-sm text-text-dim">
            {searchQuery || activeTag
              ? "No prompts match your search"
              : "Create your first prompt or import from markdown files"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {prompts.map((prompt) => {
            const isExpanded = expandedId === prompt.id;
            const isCopied = copiedId === prompt.id;
            const typeColor =
              TYPE_COLORS[prompt.type] || TYPE_COLORS.template;

            return (
              <div
                key={prompt.id}
                className={cn(
                  "rounded-xl border transition-colors",
                  isExpanded
                    ? "border-purple-500/30 bg-surface-1"
                    : "border-border hover:border-border-hover"
                )}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : prompt.id)
                  }
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-dim shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-dim shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-text truncate">
                        {prompt.title}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] border",
                          typeColor
                        )}
                      >
                        {prompt.type.replace("_", " ")}
                      </span>
                    </div>
                    {!isExpanded && prompt.description && (
                      <p className="text-xs text-text-dim truncate mt-0.5">
                        {prompt.description}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {!isExpanded && prompt.tags && prompt.tags.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      {prompt.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim"
                        >
                          {tag}
                        </span>
                      ))}
                      {prompt.tags.length > 3 && (
                        <span className="text-[10px] text-text-dim">
                          +{prompt.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(prompt);
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        isCopied
                          ? "text-green-400"
                          : "text-text-dim hover:bg-surface-2 hover:text-text"
                      )}
                      title="Copy prompt"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(prompt.id);
                      }}
                      className="p-1.5 rounded-md text-text-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4">
                    {/* Tags row */}
                    {prompt.tags && prompt.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        {prompt.tags.map((tag) => (
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
                    <div className="max-h-[60vh] overflow-y-auto pr-2">
                      {renderContent(prompt.content)}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <span className="text-[10px] text-text-dim">
                        {new Date(prompt.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </span>
                      <button
                        onClick={() => handleCopy(prompt)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                          isCopied
                            ? "bg-green-500/10 text-green-400"
                            : "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                        )}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3 w-3" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy to Clipboard
                          </>
                        )}
                      </button>
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
