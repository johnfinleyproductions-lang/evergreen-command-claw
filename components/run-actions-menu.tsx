// components/run-actions-menu.tsx
//
// Phase 5.4.1 (round 2) — kebab menu on the run detail header.
// Round 3 — added "Open raw JSON" and "Open in new tab".
//
// Actions:
//   - Re-run (custom prompt or task template → /runs/new?prompt= / ?taskId=)
//   - Copy prompt to clipboard
//   - Copy run id
//   - Open raw JSON (GET /api/runs/[id] in a new tab)
//   - Open run in new tab (current detail page)
//
// Intentionally renders even for terminal runs — Re-run is useful then.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Repeat,
  Copy,
  Hash,
  FileJson,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/hooks/use-toast";

type Props = {
  runId: string;
  prompt: string | null;
  taskId: string | null;
};

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    // Fallback for non-HTTPS localhost edge cases
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function RunActionsMenu({ runId, prompt, taskId }: Props) {
  const router = useRouter();

  const handleRerun = () => {
    const params = new URLSearchParams();
    if (prompt) params.set("prompt", prompt);
    else if (taskId) params.set("taskId", taskId);
    router.push(`/runs/new${params.size ? "?" + params.toString() : ""}`);
  };

  const handleCopyPrompt = async () => {
    if (!prompt) {
      toast({ title: "No prompt to copy", variant: "warning" });
      return;
    }
    const ok = await copyToClipboard(prompt);
    toast({
      title: ok ? "Prompt copied" : "Copy failed",
      variant: ok ? "success" : "destructive",
    });
  };

  const handleCopyId = async () => {
    const ok = await copyToClipboard(runId);
    toast({
      title: ok ? "Run id copied" : "Copy failed",
      description: ok ? runId : undefined,
      variant: ok ? "success" : "destructive",
    });
  };

  const handleOpenJson = () => {
    // Open the API representation in a new tab. Most browsers render JSON
    // natively; if not, at least the raw bytes are there for curl/jq.
    window.open(`/api/runs/${runId}`, "_blank", "noopener,noreferrer");
  };

  const handleOpenInNewTab = () => {
    window.open(`/runs/${runId}`, "_blank", "noopener,noreferrer");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Run actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Run actions</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={handleRerun}
          disabled={!prompt && !taskId}
        >
          <Repeat />
          Re-run this prompt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCopyPrompt} disabled={!prompt}>
          <Copy />
          Copy prompt
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopyId}>
          <Hash />
          Copy run id
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleOpenJson}>
          <FileJson />
          Open raw JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleOpenInNewTab}>
          <ExternalLink />
          Open in new tab
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
