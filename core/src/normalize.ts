/** Collapse runs of whitespace to a single space and trim. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
