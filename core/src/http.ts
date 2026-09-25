import http from "node:http";
import { appendFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { analyze, isLiveConfigured } from "./analyze.js";
import type { AnalyzeRequest, ResolveRequest } from "./contracts.js";
import { SpecOpsError } from "./errors.js";
import { DEMO_ANALYZE_REQUEST } from "./fixture.js";
import { resolve } from "./resolve.js";
import { handleV2 } from "./v2/http-v2.js";
import { openDatabase, getDb, closeDb } from "./v2/db.js";
import { resetMissionService } from "./v2/mission-service.js";

const MAX_BODY_BYTES = 256 * 1024;

// #region agent log
function agentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  try {
    appendFileSync(
      "/Users/matteo/Documents/projects/specops/.cursor/debug-7ce33b.log",
      `${JSON.stringify({ sessionId: "7ce33b", runId: "pre-fix", hypothesisId, location, message, data, timestamp: Date.now() })}\n`,
    );
  } catch {
    /* ignore */
  }
}
// #endregion

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Last-Event-ID",
    );
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  setCors(req, res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload, "utf8"),
  });
  res.end(payload);
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  err: SpecOpsError,
): void {
  sendJson(req, res, err.status, err.toApiError());
}

async function readBody(req: IncomingMessage): Promise<string> {
  const contentLengthHeader = req.headers["content-length"];
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      req.resume();
      throw new SpecOpsError(
        "PAYLOAD_TOO_LARGE",
        "Il body supera il limite di 256 KB.",
        413,
      );
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      req.resume();
      throw new SpecOpsError(
        "PAYLOAD_TOO_LARGE",
        "Il body supera il limite di 256 KB.",
        413,
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  if (!raw.trim()) {
    throw new SpecOpsError(
      "INVALID_INPUT",
      "Body JSON obbligatorio.",
      400,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SpecOpsError(
      "INVALID_INPUT",
      "Body JSON non valido.",
      400,
    );
  }
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

const routes: Record<string, Partial<Record<string, RouteHandler>>> = {
  "/api/health": {
    GET: (_req, res) => {
      sendJson(_req, res, 200, {
        ok: true,
        modes: { mock: true, live: isLiveConfigured() },
      });
    },
  },
  "/api/demo": {
    GET: (_req, res) => {
      sendJson(_req, res, 200, DEMO_ANALYZE_REQUEST);
    },
  },
  "/api/analyze": {
    POST: async (req, res) => {
      const body = (await parseJsonBody(req)) as AnalyzeRequest;
      if (!body || typeof body !== "object") {
        throw new SpecOpsError(
          "INVALID_INPUT",
          "Body AnalyzeRequest non valido.",
          400,
        );
      }
      const result = analyze({
        spec: body.spec,
        plan: body.plan,
        mode: body.mode,
      });
      sendJson(req, res, 200, result);
    },
  },
  "/api/resolve": {
    POST: async (req, res) => {
      const body = (await parseJsonBody(req)) as ResolveRequest;
      if (!body || typeof body !== "object") {
        throw new SpecOpsError(
          "INVALID_INPUT",
          "Body ResolveRequest non valido.",
          400,
        );
      }
      const result = resolve({
        analysis: body.analysis,
        answers: body.answers,
      });
      sendJson(req, res, 200, result);
    },
  },
};

export function createAppServer(options?: { dbPath?: string }): http.Server {
  // Ensure DB is ready for v2 routes
  if (options?.dbPath) {
    closeDb();
    resetMissionService();
    openDatabase(options.dbPath);
  } else {
    getDb();
  }

  return http.createServer(async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;
      // #region agent log
      if (path.startsWith("/api/v2/specs")) {
        agentLog("core/src/http.ts:handler", "incoming specs request", { method, path, port: PORT }, "B,C");
      }
      // #endregion

      if (method === "OPTIONS") {
        setCors(req, res);
        res.writeHead(204);
        res.end();
        return;
      }

      const handled = await handleV2(req, res, method, path, {
        sendJson,
        parseJson: parseJsonBody,
        setCors: () => setCors(req, res),
      });
      if (handled) return;

      const route = routes[path];
      if (!route) {
        throw new SpecOpsError("NOT_FOUND", "Rotta non trovata.", 404);
      }
      const handler = route[method];
      if (!handler) {
        throw new SpecOpsError(
          "METHOD_NOT_ALLOWED",
          `Metodo ${method} non consentito su ${path}.`,
          405,
        );
      }
      await handler(req, res);
    } catch (err) {
      // #region agent log
      agentLog(
        "core/src/http.ts:catch",
        "handler threw",
        {
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          isSpecOps: err instanceof SpecOpsError,
          status: err instanceof SpecOpsError ? err.status : null,
        },
        "C",
      );
      // #endregion
      if (err instanceof SpecOpsError) {
        sendError(req, res, err);
        return;
      }
      sendError(
        req,
        res,
        new SpecOpsError(
          "INVALID_INPUT",
          "Errore interno non esposto.",
          400,
        ),
      );
    }
  });
}

export const PORT = Number(process.env.SPECOPS_PORT ?? 3001);
export const HOST = process.env.SPECOPS_HOST ?? "127.0.0.1";
