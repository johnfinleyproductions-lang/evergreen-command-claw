/**
 * ZIP archive extraction utility.
 * Handles nested zips (like Notion exports) and extracts all supported file types.
 * Returns individual file entries ready to be uploaded as separate resources.
 */

import AdmZip from "adm-zip";
import path from "path";
import { detectResourceType } from "./ingest";
import type { ResourceType } from "./types";

/** File types we can extract text from and index */
const INDEXABLE_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "md", "mdx", "txt", "html", "htm",
  "js", "ts", "jsx", "tsx", "py", "go", "rs", "sh", "bash",
  "yaml", "yml", "json", "toml", "css", "scss", "sql",
  "vtt", "srt", "csv", "skill",
]);

/** Extensions that are definitely zip archives */
const ZIP_EXTENSIONS = new Set(["zip"]);

/**
 * Office Open XML formats (.docx, .xlsx, .pptx, etc.) are ZIP-based internally
 * and share the PK\x03\x04 magic bytes with real ZIP archives. These must NOT
 * be treated as archives — they should be uploaded as regular documents.
 */
const OFFICE_ZIP_FORMATS = new Set([
  "docx", "docm", "dotx", "dotm",
  "xlsx", "xlsm", "xltx", "xltm",
  "pptx", "pptm", "potx", "potm",
  "odt", "ods", "odp",
]);

export interface ExtractedFile {
  /** Display name (cleaned, no Notion hash IDs) */
  fileName: string;
  /** Raw file buffer */
  buffer: Buffer;
  /** Detected resource type */
  type: ResourceType;
  /** MIME type guess */
  mimeType: string;
  /** Original path within the archive (for metadata) */
  archivePath: string;
}

/** Clean up Notion-exported filenames (remove hash IDs, decode UTF-8 artifacts) */
function cleanNotionFilename(rawName: string): string {
  // Notion appends a 32-char hex ID before the extension:
  // "Some Title 21fcdff20a5c8185aadadfdcd22e9286.md" -> "Some Title.md"
  const hashPattern = /\s+[a-f0-9]{32}(\.[a-zA-Z0-9]+)$/;
  let name = rawName.replace(hashPattern, "$1");

  // Fix UTF-8 encoding artifacts from Notion exports
  name = name
    .replace(/\u0442\u0410\u042C/g, '"')
    .replace(/\u0442\u0410\u0428/g, '"')
    .replace(/\u0442\u0410\u0412/g, "'")
    .replace(/\u0442\u0410\u041e/g, "\u2014");

  return name.trim();
}

/** Guess MIME type from extension */
function guessMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    md: "text/markdown",
    mdx: "text/markdown",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    js: "text/javascript",
    ts: "text/typescript",
    py: "text/x-python",
    vtt: "text/vtt",
    srt: "text/srt",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Extract all indexable files from a zip buffer.
 * Handles nested zips recursively (e.g., Notion exports: outer.zip -> inner.zip -> files).
 * @param zipBuffer - Raw zip file buffer
 * @param maxDepth - Max recursion depth for nested zips (default 3)
 */
export function extractZipContents(
  zipBuffer: Buffer,
  maxDepth = 3
): ExtractedFile[] {
  const results: ExtractedFile[] = [];

  function processZip(buffer: Buffer, prefix: string, depth: number) {
    if (depth > maxDepth) {
      console.warn(`[ZipExtract] Max depth ${maxDepth} reached, skipping nested zip`);
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (err) {
      console.error(`[ZipExtract] Failed to parse zip at depth ${depth}:`, err);
      return;
    }

    const entries = zip.getEntries();

    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const fullPath = entry.entryName;
      const baseName = path.basename(fullPath);
      const ext = baseName.split(".").pop()?.toLowerCase() || "";

      // Skip hidden files and OS metadata
      if (baseName.startsWith(".") || baseName === "Thumbs.db" || fullPath.includes("__MACOSX")) {
        continue;
      }

      // If it's a nested zip, recurse into it
      if (ZIP_EXTENSIONS.has(ext)) {
        const nestedBuffer = entry.getData();
        processZip(nestedBuffer, `${prefix}${fullPath}/`, depth + 1);
        continue;
      }

      // Only extract indexable file types
      if (!INDEXABLE_EXTENSIONS.has(ext)) {
        continue;
      }

      const fileBuffer = entry.getData();

      // Skip empty files
      if (fileBuffer.length === 0) continue;

      const cleanedName = cleanNotionFilename(baseName);
      const archivePath = `${prefix}${fullPath}`;
      const type = detectResourceType(cleanedName);

      results.push({
        fileName: cleanedName,
        buffer: fileBuffer,
        type,
        mimeType: guessMimeType(ext),
        archivePath,
      });
    }
  }

  processZip(zipBuffer, "", 0);

  console.log(`[ZipExtract] Extracted ${results.length} indexable files from archive`);
  return results;
}

/**
 * Check if a file is a raw ZIP archive by extension or magic bytes.
 *
 * NOTE: Office Open XML formats (docx, xlsx, pptx, etc.) are ZIP-based and share
 * the same PK magic bytes. We explicitly exclude them here so they are processed
 * as regular documents rather than being unpacked as archives.
 */
export function isZipFile(fileName: string, buffer?: Buffer): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Office formats use ZIP internally — treat as regular files, not archives
  if (OFFICE_ZIP_FORMATS.has(ext)) return false;

  if (ZIP_EXTENSIONS.has(ext)) return true;

  // Check ZIP magic bytes: PK\x03\x04
  if (buffer && buffer.length >= 4) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }

  return false;
}
