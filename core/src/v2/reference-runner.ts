import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ExecutionState, TaskStatus } from "./contracts.js";
import { nowIso } from "./util.js";
import { DEMO_CAPABILITIES } from "./adapters/types.js";

/**
 * Controllable reference runner implementing the minimal HTTP contract:
 * GET /snapshot, GET /events (SSE), POST /commands.
 */
export function createReferenceRunner(options?: {
  taskIds?: string[];
  ackMs?: number;
}): http.Server {
  const taskIds = options?.taskIds ?? ["t1", "t2", "t3", "t4"];
  const ackMs = options?.ackMs ?? 100;

  let executionState: ExecutionState = "idle";
  let sequence = 0;
  const tasks = taskIds.map((id) => ({ id, status: "pending" as TaskStatus }));
  const seenCommands = new Set<string>();
  const sseClients = new Set<ServerResponse>();
  let workTimer: ReturnType<typeof setInterval> | null = null;
  let cursor = 0;
  let paused = false;

  function emit(type: string, payload: Record<string, unknown>): void {
    sequence += 1;
    const event = {
      sequence,
      type,
      timestamp: nowIso(),
      payload,
    };
    const data = `id: ${sequence}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      client.write(data);
    }
  }

  function snapshot() {
    return {
      executionState,
      taskStates: tasks.map((t) => ({ ...t })),
      lastSequence: sequence,
      capabilities: { ...DEMO_CAPABILITIES },
    };
  }

  function clearWork(): void {
    if (workTimer) {
      clearInterval(workTimer);
      workTimer = null;
    }
  }

  function ensureWork(): void {
    if (workTimer || paused || executionState !== "running") return;
    workTimer = setInterval(() => {
      if (paused || executionState !== "running") return;
      const working = tasks.find((t) => t.status === "working");
      if (working) {
        working.status = "done";
        emit("task.updated", { taskId: working.id, status: "done" });
        cursor += 1;
      }
      if (cursor >= tasks.length) {
        executionState = "completed";
        clearWork();
        emit("runner.completed", { executionState: "completed" });
        return;
      }
      const next = tasks[cursor];
      if (next && next.status === "pending") {
        next.status = "working";
        emit("task.updated", { taskId: next.id, status: "working" });
      }
    }, 400);
  }

  function start(): void {
    executionState = "running";
    paused = false;
    cursor = 0;
    for (const t of tasks) t.status = "pending";
    emit("runner.started", { executionState: "running" });
    const first = tasks[0];
    if (first) {
      first.status = "working";
      emit("task.updated", { taskId: first.id, status: "working" });
    }
    ensureWork();
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "GET" && url.pathname === "/snapshot") {
      json(res, 200, snapshot());
      return;
    }

    if (method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (method === "POST" && url.pathname === "/commands") {
      const body = await readJson(req);
      const commandId = String((body as { commandId?: string })?.commandId ?? "");
      const kind = (body as { kind?: string })?.kind;
      if (!commandId || (kind !== "pause" && kind !== "resume")) {
        json(res, 400, { error: "invalid" });
        return;
      }
      if (seenCommands.has(commandId)) {
        res.writeHead(202);
        res.end();
        return;
      }
      seenCommands.add(commandId);
      res.writeHead(202);
      res.end();

      if (kind === "pause") {
        executionState = "pause_requested";
        setTimeout(() => {
          paused = true;
          clearWork();
          executionState = "paused";
          for (const t of tasks) {
            if (t.status === "working") t.status = "paused";
          }
          emit("command.acknowledged", {
            commandId,
            kind: "pause",
            executionState: "paused",
          });
        }, ackMs);
      } else {
        executionState = "resume_requested";
        setTimeout(() => {
          paused = false;
          executionState = "running";
          for (const t of tasks) {
            if (t.status === "paused") t.status = "working";
          }
          emit("command.acknowledged", {
            commandId,
            kind: "resume",
            executionState: "running",
          });
          ensureWork();
        }, ackMs);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/start") {
      start();
      json(res, 200, snapshot());
      return;
    }

    json(res, 404, { error: "not_found" });
  });

  return server;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}
