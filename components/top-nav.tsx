// components/top-nav.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Terminal, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { HealthIndicator } from "@/components/health-indicator";
import { ProfileSwitcher } from "@/components/profile-switcher";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/runs", label: "Runs" },
  { href: "/tasks", label: "Tasks" },
  { href: "/profiles", label: "Profiles" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center gap-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground font-semibold tracking-tight hover:text-primary transition-colors"
        >
          <Terminal className="h-4 w-4 text-primary" />
          <span>Evergreen</span>
          <span className="text-muted-foreground text-xs font-normal">
            /command
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative px-3 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[13px] h-[2px] bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ProfileSwitcher />
          <HealthIndicator />
          <span
            aria-hidden
            className="hidden md:inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[10px] text-muted-foreground font-mono"
            title="Open command palette"
          >
            <kbd className="font-mono">⌘</kbd>
            <kbd className="font-mono">K</kbd>
          </span>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/runs/new">
              <Plus />
              New run
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
