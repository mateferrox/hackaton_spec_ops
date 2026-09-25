import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createAppServer } from "../src/http.js";
import { DEMO_ANALYZE_REQUEST, DEMO_ANALYSIS, DEMO_PLAN, DEMO_SPEC } from "../src/fixture.js";

const HOST = "127.0.0.1";
let server: Server;
let baseUrl: string;

async function jsonFetch(
  path: string,
  init?: RequestInit & { origin?: string },
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const headers = new Headers(init?.headers);
  if (init?.origin) headers.set("Origin", init.origin);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: res.status, body, headers: res.headers };
}

beforeAll(async () => {
  server = createAppServer();
  await new Promise<void>((resolve) => {
    server.listen(0, HOST, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://${HOST}:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("HTTP API", () => {
  it("GET /api/health reports mock available and live unavailable", async () => {
    const res = await jsonFetch("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      modes: { mock: true, live: false },
    });
  });

  it("GET /api/demo returns the fixture analyze request", async () => {
    const res = await jsonFetch("/api/demo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEMO_ANALYZE_REQUEST);
  });

  it("runs demo → analyze → resolve end-to-end", async () => {
    const demo = await jsonFetch("/api/demo");
    const analyze = await jsonFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify(demo.body),
    });
    expect(analyze.status).toBe(200);
    expect(analyze.body).toEqual(DEMO_ANALYSIS);

    const resolve = await jsonFetch("/api/resolve", {
      method: "POST",
      body: JSON.stringify({
        analysis: analyze.body,
        answers: [{ assumptionId: "a3", choiceId: "until_start" }],
      }),
    });
    expect(resolve.status).toBe(200);
    const body = resolve.body as {
      progress: Record<string, number>;
      taskStates: Array<{
        taskId: string;
        status: string;
        directCauseIds: string[];
        upstreamCauseIds: string[];
      }>;
    };
    expect(body.progress).toEqual({
      total: 3,
      answered: 1,
      confirmed: 0,
      revised: 1,
      pending: 2,
    });
    const t3 = body.taskStates.find((t) => t.taskId === "t3");
    const t4 = body.taskStates.find((t) => t.taskId === "t4");
    expect(t3).toMatchObject({
      status: "needs_review",
      directCauseIds: ["a3"],
    });
    expect(t4).toMatchObject({
      status: "needs_review",
      upstreamCauseIds: ["a3"],
    });
  });

  it("returns 422 INVALID_ANALYSIS for missing assumption title", async () => {
    const broken = structuredClone(DEMO_ANALYSIS);
    delete (broken.assumptions[0] as { title?: string }).title;
    const res = await jsonFetch("/api/resolve", {
      method: "POST",
      body: JSON.stringify({ analysis: broken, answers: [] }),
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: { code: "INVALID_ANALYSIS", retryable: false },
    });
  });

  it("rejects invalid input and mock mismatch", async () => {
    const empty = await jsonFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ spec: "", plan: DEMO_PLAN, mode: "mock" }),
    });
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({
      error: { code: "INVALID_INPUT", retryable: false },
    });

    const mismatch = await jsonFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        spec: "altra spec",
        plan: DEMO_PLAN,
        mode: "mock",
      }),
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toMatchObject({
      error: { code: "MOCK_INPUT_MISMATCH", retryable: false },
    });

    const live = await jsonFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        spec: DEMO_SPEC,
        plan: DEMO_PLAN,
        mode: "live",
      }),
    });
    expect(live.status).toBe(503);
    expect(live.body).toMatchObject({
      error: { code: "LIVE_NOT_CONFIGURED", retryable: false },
    });
  });

  it("supports CORS preflight for allowed origins", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(res.headers.get("access-control-allow-methods")).toMatch(/POST/);

    const denied = await fetch(`${baseUrl}/api/analyze`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns NOT_FOUND and METHOD_NOT_ALLOWED", async () => {
    const missing = await jsonFetch("/api/unknown");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      error: { code: "NOT_FOUND", retryable: false },
    });

    const wrong = await jsonFetch("/api/demo", { method: "POST", body: "{}" });
    expect(wrong.status).toBe(405);
    expect(wrong.body).toMatchObject({
      error: { code: "METHOD_NOT_ALLOWED", retryable: false },
    });
  });

  it("rejects oversized payloads with PAYLOAD_TOO_LARGE", async () => {
    const overLimit = "x".repeat(256 * 1024 + 1);
    const res = await jsonFetch("/api/analyze", {
      method: "POST",
      body: overLimit,
    });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE", retryable: false },
    });
  });
});
