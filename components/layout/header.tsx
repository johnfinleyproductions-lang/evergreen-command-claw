"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/library": "Library",
  "/prompts": "Prompts",
  "/collections": "Collections",
  "/librarian": "Librarian Chat",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const title =
    Object.entries(pageTitles).find(([path]) =>
      pathname.startsWith(path)
    )?.[1] ?? "Evergreen Vault";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-dim" />
          <input
            type="text"
            placeholder="Search vault..."
            className="bg-transparent text-sm text-text placeholder:text-text-dim outline-none w-48"
          />
          <kbd className="text-[10px] text-text-dim bg-surface-3 px-1.5 py-0.5 rounded">
            Cmd+K
          </kbd>
        </div>
      </div>
    </header>
  );
}
