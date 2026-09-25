import { randomUUID, createHash } from "node:crypto";
import type { ErrorCode } from "../errors.js";

export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function utf16Slice(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

export function findExactExcerpt(
  text: string,
  excerpt: string,
): { start: number; end: number } | null {
  if (!excerpt) return null;
  const start = text.indexOf(excerpt);
  if (start < 0) return null;
  return { start, end: start + excerpt.length };
}

export function assertExcerpt(
  text: string,
  excerpt: string,
  start: number,
  end: number,
): boolean {
  if (start < 0 || end < start || end > text.length) return false;
  return text.slice(start, end) === excerpt;
}

/** Extend ErrorCode usage without breaking legacy codes. */
export type V2ErrorCode =
  | ErrorCode
  | "STALE_SPEC"
  | "CAPABILITY_UNAVAILABLE"
  | "INVALID_STATE"
  | "PROVIDER_NOT_CONFIGURED"
  | "RUNNER_UNREACHABLE"
  | "COMMAND_TIMEOUT"
  | "CONFLICT";
