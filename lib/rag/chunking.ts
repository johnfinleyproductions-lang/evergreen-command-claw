/**
 * Text chunking engine.
 * 1000-char chunks, 200-char overlap, paragraph-boundary-aware splitting.
 * Adapted from anotherwrapper RAG system.
 */

import type { ChunkedDocument } from "./types";

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

/** Clean up text: normalize whitespace, remove null bytes */
export function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split text into chunks respecting paragraph/line/word boundaries */
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  const sanitized = sanitizeText(text);
  if (sanitized.length <= chunkSize) {
    return sanitized.length > 0 ? [sanitized] : [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < sanitized.length) {
    let end = Math.min(start + chunkSize, sanitized.length);

    // If we're not at the end, try to break at a good boundary
    if (end < sanitized.length) {
      // Try paragraph break first
      const paragraphBreak = sanitized.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + chunkSize * 0.5) {
        end = paragraphBreak + 2;
      } else {
        // Try line break
        const lineBreak = sanitized.lastIndexOf("\n", end);
        if (lineBreak > start + chunkSize * 0.5) {
          end = lineBreak + 1;
        } else {
          // Try word boundary (space)
          const spaceBreak = sanitized.lastIndexOf(" ", end);
          if (spaceBreak > start + chunkSize * 0.3) {
            end = spaceBreak + 1;
          }
          // Otherwise just cut at chunkSize
        }
      }
    }

    const chunk = sanitized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start forward, accounting for overlap
    const advance = end - start;
    start = end - Math.min(overlap, advance - 1);

    // Safety: always advance at least 1 character
    if (start <= (chunks.length > 0 ? end - advance : 0)) {
      start = end;
    }
  }

  return chunks;
}

/** Build chunked documents from extracted text, optionally with page info */
export function buildChunkedDocuments(
  text: string,
  pages?: string[],
  chunkSize?: number,
  chunkOverlap?: number
): ChunkedDocument[] {
  if (pages && pages.length > 0) {
    // Chunk per-page for PDFs to preserve page numbers
    const documents: ChunkedDocument[] = [];
    let globalIndex = 0;

    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const pageChunks = splitTextIntoChunks(
        pages[pageNum],
        chunkSize,
        chunkOverlap
      );
      for (const chunk of pageChunks) {
        documents.push({
          content: chunk,
          chunkIndex: globalIndex++,
          pageNumber: pageNum + 1,
        });
      }
    }

    return documents;
  }

  // No pages — chunk the full text
  const chunks = splitTextIntoChunks(text, chunkSize, chunkOverlap);
  return chunks.map((content, index) => ({
    content,
    chunkIndex: index,
  }));
}
