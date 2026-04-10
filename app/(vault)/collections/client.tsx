"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FolderOpen,
  Search,
  X,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  FileText,
  Zap,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  resourceCount: number;
  promptCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CollectionResource {
  resourceId: string;
  addedAt: string;
  fileName: string;
  type: string;
  indexStatus: string;
  fileSize: number | null;
}

interface CollectionPrompt {
  promptId: string;
  addedAt: string;
  title: string;
  type: string;
  description: string | null;
}

interface AvailableResource {
  id: string;
  fileName: string;
  type: string;
}

interface AvailablePrompt {
  id: string;
  title: string;
  type: string;
}

const ICONS = ["📁", "📚", "🧠", "💡", "🔧", "📝", "🎯", "⚡", "🌿", "🔬", "📊", "🎨", "🏗️", "💻", "📖", "🗂️"];
const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#8b5cf6"];

export function CollectionsClient() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<{
    resources: CollectionResource[];
    prompts: CollectionPrompt[];
  } | null>(null);
  const [availableResources, setAvailableResources] = useState<AvailableResource[]>([]);
  const [availablePrompts, setAvailablePrompts] = useState<AvailablePrompt[]>([]);
  const [showAddResource, setShowAddResource] = useState(false);
  const [showAddPrompt, setShowAddPrompt] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("📁");
  const [formColor, setFormColor] = useState("#22c55e");

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data);
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const fetchItems = async (collectionId: string) => {
    try {
      const res = await fetch(`/api/collections/items?collectionId=${collectionId}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);
    }
  };

  const fetchAvailable = async () => {
    try {
      const [resRes, promptRes] = await Promise.all([
        fetch("/api/resources"),
        fetch("/api/prompts"),
      ]);
      if (resRes.ok) {
        const data = await resRes.json();
        setAvailableResources(
          (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            fileName: r.fileName as string,
            type: r.type as string,
          }))
        );
      }
      if (promptRes.ok) {
        const data = await promptRes.json();
        setAvailablePrompts(
          (Array.isArray(data) ? data : []).map((p: Record<string, unknown>) => ({
            id: p.id as string,
            title: p.title as string,
            type: p.type as string,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch available items:", error);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedItems(null);
      setShowAddResource(false);
      setShowAddPrompt(false);
    } else {
      setExpandedId(id);
      setShowAddResource(false);
      setShowAddPrompt(false);
      await fetchItems(id);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormIcon("📁");
    setFormColor("#22c55e");
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          icon: formIcon,
          color: formColor,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        resetForm();
        await fetchCollections();
      }
    } catch (error) {
      console.error("Failed to create collection:", error);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch("/api/collections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: formName,
          description: formDescription,
          icon: formIcon,
          color: formColor,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        resetForm();
        await fetchCollections();
      }
    } catch (error) {
      console.error("Failed to update collection:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection? Items inside won't be deleted.")) return;
    try {
      const res = await fetch("/api/collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        if (expandedId === id) {
          setExpandedId(null);
          setExpandedItems(null);
        }
        await fetchCollections();
      }
    } catch (error) {
      console.error("Failed to delete collection:", error);
    }
  };

  const handleAddItem = async (collectionId: string, resourceId?: string, promptId?: string) => {
    try {
      const res = await fetch("/api/collections/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, resourceId, promptId }),
      });
      if (res.ok) {
        await fetchItems(collectionId);
        await fetchCollections();
        setShowAddResource(false);
        setShowAddPrompt(false);
      }
    } catch (error) {
      console.error("Failed to add item:", error);
    }
  };

  const handleRemoveItem = async (collectionId: string, resourceId?: string, promptId?: string) => {
    try {
      const res = await fetch("/api/collections/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, resourceId, promptId }),
      });
      if (res.ok) {
        await fetchItems(collectionId);
        await fetchCollections();
      }
    } catch (error) {
      console.error("Failed to remove item:", error);
    }
  };

  const startEdit = (col: Collection) => {
    setEditingId(col.id);
    setFormName(col.name);
    setFormDescription(col.description || "");
    setFormIcon(col.icon);
    setFormColor(col.color);
  };

  const filtered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // Collection form component (used for both create and edit)
  const CollectionForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-text-muted block mb-1">Name</label>
        <input
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Collection name..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent"
          autoFocus
        />
      </div>
      <div>
        <label className="text-sm text-text-muted block mb-1">Description</label>
        <input
          type="text"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Optional description..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="text-sm text-text-muted block mb-2">Icon</label>
        <div className="flex flex-wrap gap-2">
          {ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => setFormIcon(icon)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors",
                formIcon === icon
                  ? "bg-accent/20 ring-1 ring-accent"
                  : "bg-surface-2 hover:bg-surface-2/80"
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm text-text-muted block mb-2">Color</label>
        <div className="flex gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setFormColor(color)}
              className={cn(
                "h-8 w-8 rounded-lg transition-all",
                formColor === color && "ring-2 ring-white ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => {
            setShowCreate(false);
            setEditingId(null);
            resetForm();
          }}
          className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!formName.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-text-muted">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          Organize resources and prompts into themed collections
        </p>
        <button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Collection
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-accent/30 bg-surface p-5">
          <h3 className="text-sm font-medium mb-4">Create Collection</h3>
          <CollectionForm onSubmit={handleCreate} submitLabel="Create" />
        </div>
      )}

      {/* Search */}
      {collections.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-text-dim hover:text-text" />
            </button>
          )}
        </div>
      )}

      {/* Collections List */}
      {filtered.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
            <FolderOpen className="h-6 w-6 text-accent" />
          </div>
          <h3 className="font-medium text-text-muted">
            {search ? "No matching collections" : "No collections yet"}
          </h3>
          <p className="mt-1 text-sm text-text-dim">
            {search
              ? "Try a different search term"
              : "Create collections to group related resources and prompts"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((col) => (
            <div key={col.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              {/* Collection Header */}
              {editingId === col.id ? (
                <div className="p-5">
                  <h3 className="text-sm font-medium mb-4">Edit Collection</h3>
                  <CollectionForm
                    onSubmit={() => handleUpdate(col.id)}
                    submitLabel="Save"
                  />
                </div>
              ) : (
                <>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-2/50 transition-colors"
                    onClick={() => toggleExpand(col.id)}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                      style={{ backgroundColor: col.color + "20" }}
                    >
                      {col.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{col.name}</h3>
                      {col.description && (
                        <p className="text-xs text-text-dim truncate mt-0.5">
                          {col.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <FileText className="h-3.5 w-3.5" />
                        {col.resourceCount}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Zap className="h-3.5 w-3.5" />
                        {col.promptCount}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(col);
                        }}
                        className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-text-dim hover:text-text"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(col.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-text-dim hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {expandedId === col.id ? (
                        <ChevronDown className="h-4 w-4 text-text-dim" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-text-dim" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Items */}
                  {expandedId === col.id && expandedItems && (
                    <div className="border-t border-border p-4 space-y-4">
                      {/* Resources section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Resources ({expandedItems.resources.length})
                          </h4>
                          <button
                            onClick={() => {
                              if (!showAddResource) fetchAvailable();
                              setShowAddResource(!showAddResource);
                              setShowAddPrompt(false);
                            }}
                            className="text-xs text-accent hover:underline"
                          >
                            {showAddResource ? "Cancel" : "+ Add Resource"}
                          </button>
                        </div>

                        {showAddResource && (
                          <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-background p-2 space-y-1">
                            {availableResources
                              .filter(
                                (r) =>
                                  !expandedItems.resources.some(
                                    (er) => er.resourceId === r.id
                                  )
                              )
                              .map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => handleAddItem(col.id, r.id)}
                                  className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 transition-colors text-left"
                                >
                                  <FileText className="h-3.5 w-3.5 text-text-dim shrink-0" />
                                  <span className="truncate">{r.fileName}</span>
                                  <span className="text-xs text-text-dim ml-auto shrink-0">{r.type}</span>
                                </button>
                              ))}
                            {availableResources.filter(
                              (r) =>
                                !expandedItems.resources.some(
                                  (er) => er.resourceId === r.id
                                )
                            ).length === 0 && (
                              <p className="text-xs text-text-dim px-2 py-1">
                                All resources already added
                              </p>
                            )}
                          </div>
                        )}

                        {expandedItems.resources.length === 0 ? (
                          <p className="text-xs text-text-dim">No resources in this collection</p>
                        ) : (
                          <div className="space-y-1">
                            {expandedItems.resources.map((r) => (
                              <div
                                key={r.resourceId}
                                className="flex items-center justify-between rounded-lg px-3 py-2 bg-background"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-3.5 w-3.5 text-text-dim shrink-0" />
                                  <span className="text-sm truncate">{r.fileName}</span>
                                  <span className="text-xs text-text-dim shrink-0">{r.type}</span>
                                </div>
                                <button
                                  onClick={() =>
                                    handleRemoveItem(col.id, r.resourceId)
                                  }
                                  className="p-1 rounded hover:bg-red-500/10 text-text-dim hover:text-red-400 shrink-0"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Prompts section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Prompts ({expandedItems.prompts.length})
                          </h4>
                          <button
                            onClick={() => {
                              if (!showAddPrompt) fetchAvailable();
                              setShowAddPrompt(!showAddPrompt);
                              setShowAddResource(false);
                            }}
                            className="text-xs text-accent hover:underline"
                          >
                            {showAddPrompt ? "Cancel" : "+ Add Prompt"}
                          </button>
                        </div>

                        {showAddPrompt && (
                          <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-background p-2 space-y-1">
                            {availablePrompts
                              .filter(
                                (p) =>
                                  !expandedItems.prompts.some(
                                    (ep) => ep.promptId === p.id
                                  )
                              )
                              .map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() =>
                                    handleAddItem(col.id, undefined, p.id)
                                  }
                                  className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 transition-colors text-left"
                                >
                                  <Zap className="h-3.5 w-3.5 text-text-dim shrink-0" />
                                  <span className="truncate">{p.title}</span>
                                  <span className="text-xs text-text-dim ml-auto shrink-0 capitalize">
                                    {p.type.replace("_", " ")}
                                  </span>
                                </button>
                              ))}
                            {availablePrompts.filter(
                              (p) =>
                                !expandedItems.prompts.some(
                                  (ep) => ep.promptId === p.id
                                )
                            ).length === 0 && (
                              <p className="text-xs text-text-dim px-2 py-1">
                                All prompts already added
                              </p>
                            )}
                          </div>
                        )}

                        {expandedItems.prompts.length === 0 ? (
                          <p className="text-xs text-text-dim">No prompts in this collection</p>
                        ) : (
                          <div className="space-y-1">
                            {expandedItems.prompts.map((p) => (
                              <div
                                key={p.promptId}
                                className="flex items-center justify-between rounded-lg px-3 py-2 bg-background"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Zap className="h-3.5 w-3.5 text-text-dim shrink-0" />
                                  <span className="text-sm truncate">{p.title}</span>
                                  <span className="text-xs text-text-dim shrink-0 capitalize">
                                    {p.type.replace("_", " ")}
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    handleRemoveItem(col.id, undefined, p.promptId)
                                  }
                                  className="p-1 rounded hover:bg-red-500/10 text-text-dim hover:text-red-400 shrink-0"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
