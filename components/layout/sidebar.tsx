"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Library,
  Zap,
  FolderOpen,
  MessageSquare,
  Settings,
  Leaf,
  Workflow,
  Bot,
  GitBranch,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard },
  { href: "/library",     label: "Library",         icon: Library },
  { href: "/prompts",     label: "Prompts",          icon: Zap },
  { href: "/automations", label: "n8n Flows",        icon: Workflow },
  { href: "/make",        label: "Make Blueprints",  icon: GitBranch },
  { href: "/skills",      label: "Claude Skills",    icon: Bot },
  { href: "/links",       label: "Links",            icon: Link2 },
  { href: "/collections", label: "Collections",      icon: FolderOpen },
  { href: "/librarian",   label: "Librarian Chat",   icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <Leaf className="h-4.5 w-4.5 text-accent" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-text">Evergreen Vault</h1>
          <p className="text-[10px] text-text-dim">Knowledge Base</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pt-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-muted hover:bg-surface-2 hover:text-text"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent/10 text-accent font-medium"
              : "text-text-muted hover:bg-surface-2 hover:text-text"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}