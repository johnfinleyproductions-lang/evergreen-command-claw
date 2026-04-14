// components/keyboard-shortcuts.tsx
//
// Global keyboard shortcuts, GitHub-style. Two-key "g"-prefix navigation
// plus a "?" help dialog. Ignores events when the user is typing in an
// input / textarea / contenteditable so it never fights with forms.
//
// Mounted once in app/layout.tsx; no props.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const G_TIMEOUT_MS = 1200;

type Shortcut = {
  keys: string[]; // rendered, e.g. ["g", "r"]
  description: string;
};

const SHORTCUTS: Shortcut[] = [
  { keys: ["g", "d"], description: "Go to dashboard" },
  { keys: ["g", "r"], description: "Go to runs" },
  { keys: ["g", "n"], description: "New run" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Close dialogs / menus" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // Radix dialogs/menus stop propagation themselves, but double-check.
  if (target.closest("[role='dialog']")) {
    // Still allow shortcuts inside help dialog to dismiss it
    return !target.closest("[data-shortcuts-help='true']");
  }
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPending, setGPending] = useState(false);

  // g-prefix timeout reset
  useEffect(() => {
    if (!gPending) return;
    const t = setTimeout(() => setGPending(false), G_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [gPending]);

  const nav = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // "?" (shift + /) → open help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        setGPending(false);
        return;
      }

      if (gPending) {
        const k = e.key.toLowerCase();
        if (k === "d") {
          e.preventDefault();
          setGPending(false);
          nav("/");
          return;
        }
        if (k === "r") {
          e.preventDefault();
          setGPending(false);
          nav("/runs");
          return;
        }
        if (k === "n") {
          e.preventDefault();
          setGPending(false);
          nav("/runs/new");
          return;
        }
        // Any other key cancels pending g.
        setGPending(false);
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        setGPending(true);
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [gPending, nav]);

  return (
    <>
      {/* Subtle hint chip shown while "g" is pending. Non-blocking, bottom-left. */}
      {gPending && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-4 z-40 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-lg font-mono"
        >
          <kbd className="text-foreground">g</kbd> · then{" "}
          <kbd className="text-foreground">d</kbd>{" "}
          <kbd className="text-foreground">r</kbd>{" "}
          <kbd className="text-foreground">n</kbd>
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          data-shortcuts-help="true"
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Global navigation, GitHub-style. Shortcuts are ignored while
              typing in an input.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3">
            <ul className="divide-y divide-border text-sm">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.keys.join("-")}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-muted-foreground">{s.description}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="inline-flex items-center justify-center rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground min-w-[1.5rem]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
