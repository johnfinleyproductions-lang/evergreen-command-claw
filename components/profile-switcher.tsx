// components/profile-switcher.tsx
//
// Top-nav widget showing the currently active profile with a dropdown to
// swap between profiles or visit the manage page. Polls /api/profiles and
// /api/profiles/active on mount and after each mutation — cheap enough to
// not bother with SWR.
//
// When no profiles exist at all, the widget collapses to a subtle "add
// context" link instead of taking up nav space.

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserCircle2, Check, Settings, Plus, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

type ProfileRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profiles", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profiles: ProfileRow[] };
      setProfiles(data.profiles);
    } catch {
      // swallow — widget just stays empty on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = profiles.find((p) => p.isActive);

  const handleSwap = async (id: string, activate: boolean) => {
    setSwapping(true);
    try {
      await fetch(`/api/profiles/${id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: activate }),
      });
      await load();
    } finally {
      setSwapping(false);
    }
  };

  // Zero state — no profiles at all. Show a subtle "add" link.
  if (!loading && profiles.length === 0) {
    return (
      <Link
        href="/profiles"
        className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        title="No profile attached. Add a CLAUDE.md or context file."
      >
        <Plus className="h-3 w-3" />
        Add context
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
        title={active ? `Active profile: ${active.name}` : "No active profile"}
      >
        {swapping ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <UserCircle2 className="h-3 w-3" />
        )}
        <span className="max-w-[120px] truncate">
          {loading ? "…" : active ? active.name : "No profile"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Switch profile</DropdownMenuLabel>
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={(e) => {
              e.preventDefault();
              void handleSwap(p.id, !p.isActive);
            }}
          >
            <span className="flex-1 truncate">{p.name}</span>
            {p.isActive && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profiles" className="flex items-center gap-2">
            <Settings />
            Manage profiles
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
