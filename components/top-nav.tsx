// components/top-nav.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/runs", label: "Runs" },
  { href: "/tasks", label: "Tasks" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-surface/70 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-5xl px-6 h-14 flex items-center gap-6">
        <Link href="/" className="text-text font-semibold tracking-tight">
          Evergreen
        </Link>
        <div className="flex gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  active
                    ? "bg-gray-800 text-text"
                    : "text-text-muted hover:text-text hover:bg-gray-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
