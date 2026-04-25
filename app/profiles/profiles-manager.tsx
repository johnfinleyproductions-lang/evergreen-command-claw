// app/profiles/profiles-manager.tsx
//
// Client island for /profiles. Owns: the rendered list, the drag-drop zone
// state, and the inline editor for each row. Mutations hit /api/profiles**
// and finish with router.refresh() so the server list is the source of
// truth after every action.
//
// Drag-drop accepts .md / .txt / .json (well, any plain text) up to 256KB.
// Multiple files dropped in one go each become their own profile; the first
// one is activated if there's no active profile yet.

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Check,
  Trash2,
  Pencil,
  Loader2,
  AlertTriangle,
  X,
  Power,
  PowerOff,
  Plus,
} from "lucide-react";
import type { Profile } from "@/lib/db/schema/profiles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/lib/hooks/use-toast";

const MAX_BYTES = 256 * 1024;

type Props = { initialProfiles: Profile[] };

export function ProfilesManager({ initialProfiles }: Props) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const hasAny = initialProfiles.length > 0;
  const hasActive = initialProfiles.some((p) => p.isActive);

  // ---------------------------------------------------------------
  // Upload pipeline — shared by drop + button picker
  // ---------------------------------------------------------------
  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    let succeeded = 0;
    let activatedOne = hasActive;
    try {
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          toast({
            title: `${file.name} too large`,
            description: `Max ${Math.round(MAX_BYTES / 1024)}KB`,
            variant: "destructive",
          });
          continue;
        }
        const content = await file.text();
        const name = stripExtension(file.name);
        // Auto-activate the very first profile if nothing's active yet —
        // makes the zero-state one-click instead of two.
        const activate = !activatedOne;
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content, activate }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status} on ${file.name}`);
        }
        if (activate) activatedOne = true;
        succeeded += 1;
      }
      if (succeeded > 0) {
        toast({
          title: `Uploaded ${succeeded} profile${succeeded > 1 ? "s" : ""}`,
          variant: "success",
        });
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  // ---------------------------------------------------------------
  // Per-row mutations
  // ---------------------------------------------------------------
  const handleActivate = async (profile: Profile, active: boolean) => {
    setBusyId(profile.id);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({
        title: active ? `Activated "${profile.name}"` : "Deactivated",
        description: active
          ? "New runs will include this context automatically."
          : "No profile is attached to new runs.",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Activation failed";
      setError(msg);
      toast({ title: "Could not activate", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (profile: Profile) => {
    const name = renameDraft[profile.id] ?? profile.name;
    const content = contentDraft[profile.id] ?? profile.content;
    if (name === profile.name && content === profile.content) {
      setExpandedId(null);
      return;
    }
    setBusyId(profile.id);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Profile saved", variant: "success" });
      setExpandedId(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (profile: Profile) => {
    if (
      !confirm(
        `Delete profile "${profile.name}"? ${
          profile.isActive
            ? "This is the active profile — new runs will have no attached context until you activate another."
            : ""
        }`,
      )
    ) {
      return;
    }
    setBusyId(profile.id);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Profile deleted", variant: "success" });
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
      toast({ title: "Could not delete", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <>
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
            <Badge variant="muted" className="font-mono">
              {initialProfiles.length === 0
                ? "none"
                : `${initialProfiles.length} total`}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Drop a CLAUDE.md or any context file. The active profile is
            automatically prepended to every new run.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
          {uploading ? "Uploading…" : "Upload file"}
        </Button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.json,text/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
        }}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Something went wrong</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Drop zone — always visible, expands when dragging */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "mb-6 rounded-xl border-2 border-dashed transition-colors p-8 text-center",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-secondary/20 hover:bg-secondary/40",
        )}
      >
        <Upload
          className={cn(
            "mx-auto h-6 w-6 mb-2 transition-colors",
            dragging ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="text-sm text-foreground font-medium">
          {dragging ? "Release to upload" : "Drop a context file here"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          .md · .txt · .json — up to {Math.round(MAX_BYTES / 1024)}KB per file
        </p>
      </div>

      {!hasAny ? (
        <Card className="p-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
            <FileText className="h-5 w-5" />
          </div>
          <p className="text-foreground font-medium">No profiles yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Drop a file above or click{" "}
            <span className="text-primary font-medium">Upload file</span> to
            get started.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {initialProfiles.map((profile) => {
            const expanded = expandedId === profile.id;
            const busy = busyId === profile.id;
            const bytes = Buffer.byteLength(profile.content, "utf8");
            return (
              <div
                key={profile.id}
                className={cn(
                  "px-5 py-4 transition-colors",
                  profile.isActive
                    ? "bg-primary/5"
                    : "hover:bg-secondary/40",
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {profile.name}
                      </h3>
                      {profile.isActive && (
                        <Badge
                          variant="muted"
                          className="bg-primary/20 text-primary ring-1 ring-primary/30 font-mono text-[10px] inline-flex items-center gap-1"
                        >
                          <Check className="h-3 w-3" />
                          active
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground tabular-nums font-mono">
                      <span>
                        {bytes.toLocaleString()} B
                      </span>
                      <span>·</span>
                      <span>
                        updated{" "}
                        {new Date(profile.updatedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>·</span>
                      <span>{profile.id.slice(0, 8)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    {profile.isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleActivate(profile, false)}
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <PowerOff />
                        )}
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleActivate(profile, true)}
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Power />
                        )}
                        Activate
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (expanded) {
                          setExpandedId(null);
                        } else {
                          setExpandedId(profile.id);
                          setRenameDraft((m) => ({
                            ...m,
                            [profile.id]: profile.name,
                          }));
                          setContentDraft((m) => ({
                            ...m,
                            [profile.id]: profile.content,
                          }));
                        }
                      }}
                    >
                      <Pencil />
                      {expanded ? "Close" : "Edit"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => handleDelete(profile)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`name-${profile.id}`}>Name</Label>
                      <Input
                        id={`name-${profile.id}`}
                        value={renameDraft[profile.id] ?? profile.name}
                        onChange={(e) =>
                          setRenameDraft((m) => ({
                            ...m,
                            [profile.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`content-${profile.id}`}>Content</Label>
                      <Textarea
                        id={`content-${profile.id}`}
                        value={contentDraft[profile.id] ?? profile.content}
                        onChange={(e) =>
                          setContentDraft((m) => ({
                            ...m,
                            [profile.id]: e.target.value,
                          }))
                        }
                        rows={12}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSave(profile)}
                        disabled={busy}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}
