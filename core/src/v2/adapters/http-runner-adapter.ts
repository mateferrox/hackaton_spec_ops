import { SpecOpsError } from "../../errors.js";
import { nowIso } from "../util.js";
import {
  OBSERVE_ONLY_CAPABILITIES,
  type AgentAdapter,
  type RunnerCapabilities,
  type RunnerEvent,
  type RunnerSnapshot,
} from "./types.js";

export interface HttpRunnerAdapterOptions {
  baseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}

/**
 * Connects to a compatible runner over HTTP (snapshot, SSE events, commands).
 * Browser never supplies arbitrary URLs — only server config / known runnerId.
 */
export class HttpRunnerAdapter implements AgentAdapter {
  readonly id: string;
  readonly label: string;
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollMs: number;
  private listeners = new Set<(event: RunnerEvent) => void>();
  private abort: AbortController | null = null;
  private capabilities: RunnerCapabilities = { ...OBSERVE_ONLY_CAPABILITIES };

  constructor(id: string, options: HttpRunnerAdapterOptions) {
    this.id = id;
    this.label = `Runner ${id}`;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollMs = options.pollMs ?? 800;
  }

  getCapabilities(): RunnerCapabilities {
    return { ...this.capabilities };
  }

  async getSnapshot(): Promise<RunnerSnapshot> {
    try {
      const res = await this.request("GET", "/snapshot");
      if (!res.ok) {
        throw new SpecOpsError(
          "RUNNER_UNREACHABLE",
          "Il runner non ha restituito uno snapshot valido.",
          502,
        );
      }
      const body = (await res.json()) as RunnerSnapshot;
      this.capabilities = body.capabilities ?? this.capabilities;
      return body;
    } catch (err) {
      if (err instanceof SpecOpsError) throw err;
      throw new SpecOpsError(
        "RUNNER_UNREACHABLE",
        "Runner irraggiungibile.",
        502,
      );
    }
  }

  subscribe(fromSequence: number, onEvent: (event: RunnerEvent) => void): () => void {
    this.listeners.add(onEvent);
    if (!this.abort) {
      this.abort = new AbortController();
      void this.pumpEvents(fromSequence, this.abort.signal);
    }
    return () => {
      this.listeners.delete(onEvent);
      if (this.listeners.size === 0) {
        this.abort?.abort();
        this.abort = null;
      }
    };
  }

  async requestPause(commandId: string): Promise<void> {
    await this.postCommand(commandId, "pause");
  }

  async requestResume(commandId: string): Promise<void> {
    await this.postCommand(commandId, "resume");
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.listeners.clear();
  }

  private async postCommand(commandId: string, kind: "pause" | "resume"): Promise<void> {
    const caps = this.capabilities;
    if (kind === "pause" && !caps.pause) {
      throw new SpecOpsError(
        "CAPABILITY_UNAVAILABLE",
        "Controllo pausa non disponibile: ferma l’agente dal suo ambiente.",
        409,
      );
    }
    if (kind === "resume" && !caps.resume) {
      throw new SpecOpsError(
        "CAPABILITY_UNAVAILABLE",
        "Controllo resume non disponibile.",
        409,
      );
    }
    try {
      const res = await this.request("POST", "/commands", {
        commandId,
        kind,
      });
      if (res.status !== 202 && !res.ok) {
        throw new SpecOpsError(
          "RUNNER_UNREACHABLE",
          "Il runner ha rifiutato il comando.",
          502,
        );
      }
    } catch (err) {
      if (err instanceof SpecOpsError) throw err;
      throw new SpecOpsError(
        "RUNNER_UNREACHABLE",
        "Impossibile inviare il comando al runner.",
        502,
      );
    }
  }

  private async pumpEvents(fromSequence: number, signal: AbortSignal): Promise<void> {
    // Prefer SSE; fall back to polling snapshot sequence.
    try {
      const res = await this.request(
        "GET",
        `/events?from=${fromSequence}`,
        undefined,
        { Accept: "text/event-stream" },
        signal,
      );
      if (res.ok && res.body) {
        await this.readSse(res, signal);
        return;
      }
    } catch {
      /* fall through to poll */
    }
    let last = fromSequence;
    while (!signal.aborted) {
      try {
        const snap = await this.getSnapshot();
        if (snap.lastSequence > last) {
          const event: RunnerEvent = {
            sequence: snap.lastSequence,
            type: "snapshot.updated",
            timestamp: nowIso(),
            payload: { snapshot: snap },
          };
          last = snap.lastSequence;
          for (const l of this.listeners) l(event);
        }
      } catch {
        /* ignore transient */
      }
      await sleep(this.pollMs, signal);
    }
  }

  private async readSse(res: Response, signal: AbortSignal): Promise<void> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(5).trim()) as RunnerEvent;
          for (const l of this.listeners) l(event);
        } catch {
          /* ignore malformed */
        }
      }
    }
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(extraHeaders ?? {}),
    };
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
