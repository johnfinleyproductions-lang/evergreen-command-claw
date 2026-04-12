// lib/prompt-template.ts
//
// Shared utilities for {{variable}} prompt templates.
//
// Phase 5.1: extracted out so the tasks UI can discover variables in a task's
// prompt and render an input-per-var form before firing a run. The server-side
// render is done in app/api/runs/route.ts — this file is the source of truth
// for the regex so both sides stay in sync.
//
// Syntax: {{ var_name }} — any number of word-chars, dashes, dots. Whitespace
// inside the braces is tolerated. Unknown vars are left as-is on render, not
// thrown, so a partially-supplied variable map still produces a usable prompt.

const VAR_REGEX = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Extract the unique list of {{var}} names from a template.
 * Returns them in first-appearance order. Empty array if none.
 */
export function extractTemplateVars(template: string): string[] {
  if (!template) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of template.matchAll(VAR_REGEX)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Render a template by substituting {{var}} with values from `vars`.
 * Missing / null / undefined values are left as the literal {{var}} form
 * so the caller can detect incomplete rendering downstream if needed.
 */
export function renderPromptTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(VAR_REGEX, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}
