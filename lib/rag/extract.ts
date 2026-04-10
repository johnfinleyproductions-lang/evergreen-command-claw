/**
 * Text extraction for all supported resource types.
 * PDF: pdfjs-dist with @napi-rs/canvas for server-side rendering
 * DOCX: mammoth for raw text extraction
 * VTT/SRT: Custom parser that strips timestamps and deduplicates
 * Markdown/Text/Code/Skill/HTML: direct UTF-8 read
 */

import type { ResourceType } from "./types";

// ---- PDF Extraction ----

let pdfGlobalsInitialized = false;

async function initPdfGlobals() {
  if (pdfGlobalsInitialized) return;

  // pdfjs-dist needs canvas globals in Node.js
  const canvas = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;

  if (!g.DOMMatrix) {
    g.DOMMatrix = canvas.DOMMatrix;
  }
  if (!g.ImageData) {
    g.ImageData = canvas.ImageData;
  }
  if (!g.Path2D) {
    g.Path2D = canvas.Path2D;
  }

  pdfGlobalsInitialized = true;
}

export async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  pages: string[];
  pageCount: number;
}> {
  await initPdfGlobals();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true })
    .promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item: Record<string, unknown>) => "str" in item)
      .map((item: Record<string, unknown>) => item.str as string)
      .join(" ");
    pages.push(pageText);
  }

  return {
    text: pages.join("\n\n"),
    pages,
    pageCount: doc.numPages,
  };
}

// ---- DOCX Extraction ----

export async function extractDocxText(
  buffer: Buffer
): Promise<{ text: string }> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}

// ---- VTT/SRT Transcript extraction ----

export function extractTranscriptText(buffer: Buffer): { text: string } {
  const raw = buffer.toString("utf-8");
  const lines = raw.split("\n");
  const dialogueLines: string[] = [];
  let lastLine = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, WEBVTT header, cue numbers, and timestamp lines
    if (!trimmed) continue;
    if (trimmed === "WEBVTT") continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes("-->")) continue;
    // Also skip NOTE lines and style blocks
    if (trimmed.startsWith("NOTE")) continue;
    if (trimmed.startsWith("STYLE")) continue;

    // Strip HTML tags (some VTTs have <v> voice tags)
    const cleaned = trimmed.replace(/<[^>]+>/g, "").trim();
    if (!cleaned) continue;

    // Deduplicate consecutive identical or near-identical lines
    // (VTT often repeats lines as the speaker self-corrects)
    if (cleaned === lastLine) continue;
    if (lastLine && cleaned.startsWith(lastLine.slice(0, Math.floor(lastLine.length * 0.7)))) {
      // This line is an extended version of the last — replace it
      dialogueLines[dialogueLines.length - 1] = cleaned;
      lastLine = cleaned;
      continue;
    }

    dialogueLines.push(cleaned);
    lastLine = cleaned;
  }

  return { text: dialogueLines.join("\n") };
}

// ---- Plain text extraction (Markdown, Text, Code, Skill, HTML) ----

export function extractPlainText(buffer: Buffer): { text: string } {
  return { text: buffer.toString("utf-8") };
}

// ---- Unified extraction dispatcher ----

export interface ExtractionResult {
  text: string;
  pages?: string[];
  pageCount?: number;
}

export async function extractText(
  buffer: Buffer,
  type: ResourceType
): Promise<ExtractionResult> {
  switch (type) {
    case "pdf":
      return extractPdfText(buffer);
    case "docx":
      return extractDocxText(buffer);
    case "transcript":
      return extractTranscriptText(buffer);
    case "markdown":
    case "text":
    case "code":
    case "html":
    case "skill":
      return extractPlainText(buffer);
    default: {
      // Auto-detect VTT/SRT by content header
      const head = buffer.toString("utf-8", 0, 20).trim();
      if (head.startsWith("WEBVTT") || /^\d+\r?\n\d{2}:\d{2}/.test(head)) {
        return extractTranscriptText(buffer);
      }
      return extractPlainText(buffer);
    }
  }
}
