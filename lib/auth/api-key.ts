/**
 * API Key authentication for external tool access (REST API + MCP).
 * Validates Bearer tokens against VAULT_API_KEY env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function getApiKey(): string | null {
  return process.env.VAULT_API_KEY || null;
}

/** Extract Bearer token from Authorization header */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

/** Validate an API key using timing-safe comparison */
function validateKey(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Middleware helper: validate API key from request.
 * Returns null if valid, or a NextResponse error if invalid.
 */
export function validateApiKey(request: NextRequest): NextResponse | null {
  const expectedKey = getApiKey();

  if (!expectedKey) {
    return NextResponse.json(
      { error: "API access not configured. Set VAULT_API_KEY in .env" },
      { status: 503 }
    );
  }

  const providedKey = extractBearerToken(request);

  if (!providedKey) {
    return NextResponse.json(
      { error: "Missing Authorization header. Use: Bearer <your-api-key>" },
      { status: 401 }
    );
  }

  if (!validateKey(providedKey, expectedKey)) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 403 }
    );
  }

  return null; // Valid — proceed
}

/**
 * Standalone validation for non-Next.js contexts (MCP server HTTP mode).
 * Returns true if the key is valid.
 */
export function validateApiKeyRaw(providedKey: string): boolean {
  const expectedKey = getApiKey();
  if (!expectedKey || !providedKey) return false;
  return validateKey(providedKey, expectedKey);
}
