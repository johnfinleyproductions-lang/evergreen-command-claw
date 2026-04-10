export type ResourceType =
  | "pdf"
  | "docx"
  | "markdown"
  | "text"
  | "code"
  | "url"
  | "transcript"
  | "image"
  | "html"
  | "skill"
  | "other";

export interface ChunkedDocument {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievalChunk {
  content: string;
  resourceId: string;
  resourceName: string;
  similarity: number;
  pageNumber?: number;
  chunkIndex: number;
}

export interface RetrievalResult {
  contextText: string;
  chunks: RetrievalChunk[];
  sources: Array<{
    resourceId: string;
    resourceName: string;
    pageNumber?: number;
    similarity: number;
    quote: string;
  }>;
  timing: number;
}
