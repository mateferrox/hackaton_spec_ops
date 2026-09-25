import type {
  ExecutionState,
  TaskStatus,
} from "../contracts.js";
import { nowIso } from "../util.js";
import {
  DEMO_CAPABILITIES,
  type AgentAdapter,
  type RunnerEvent,
  type RunnerSnapshot,
  type RunnerTaskState,
} from "./types.js";

export interface DemoAdapterOptions {
  taskIds: string[];
  /** Delay between task progress ticks (ms). */
  tickMs?: number;
  /** Delay before acknowledging pause/resume (ms). */
  ackMs?: number;
  onEvent?: (event: RunnerEvent) => void;
}

/**
 * Local simulation runner. Pause stops timers and further dispatch.
 * Always labeled as simulation by the application layer.
 */
export class DemoAdapter implements AgentAdapter {
  readonly id = "demo";
  readonly label = "Simulazione";

  private executionState: ExecutionState = "idle";
  private tasks: RunnerTaskState[];
  private sequence = 0;
  private listeners = new Set<(event: RunnerEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private readonly tickMs: number;
  private readonly ackMs: number;
  private readonly externalOnEvent?: (event: RunnerEvent) => void;
  private paused = false;
  private seenCommands = new Set<string>();

  constructor(options: DemoAdapterOptions) {
    this.tasks = options.taskIds.map((id) => ({ id, status: "pending" as TaskStatus }));
    this.tickMs = options.tickMs ?? 1200;
    this.ackMs = options.ackMs ?? 150;
    this.externalOnEvent = options.onEvent;
  }

  getCapabilities() {
    return { ...DEMO_CAPABILITIES };
  }

  async getSnapshot(): Promise<RunnerSnapshot> {
    return {
      executionState: this.executionState,
      taskStates: this.tasks.map((t) => ({ ...t })),
      lastSequence: this.sequence,
      capabilities: this.getCapabilities(),
    };
  }

  subscribe(fromSequence: number, onEvent: (event: RunnerEvent) => void): () => void {
    this.listeners.add(onEvent);
    void fromSequence;
    return () => this.listeners.delete(onEvent);
  }

  async start(taskIds?: string[]): Promise<void> {
    if (taskIds?.length) {
      this.tasks = taskIds.map((id) => {
        const existing = this.tasks.find((t) => t.id === id);
        return existing ?? { id, status: "pending" as TaskStatus };
      });
    }
    this.executionState = "running";
    this.paused = false;
    this.cursor = 0;
    this.emit("runner.started", { executionState: "running" });
    this.advanceWorking();
    this.ensureTimer();
  }

  async requestPause(commandId: string): Promise<void> {
    if (this.seenCommands.has(commandId)) return;
    this.seenCommands.add(commandId);
    this.executionState = "pause_requested";
    this.emit("command.requested", { commandId, kind: "pause" });
    setTimeout(() => {
      this.paused = true;
      this.clearTimer();
      this.executionState = "paused";
      for (const t of this.tasks) {
        if (t.status === "working") t.status = "paused";
      }
      this.emit("command.acknowledged", {
        commandId,
        kind: "pause",
        executionState: "paused",
      });
    }, this.ackMs);
  }

  async requestResume(commandId: string): Promise<void> {
    if (this.seenCommands.has(commandId)) return;
    this.seenCommands.add(commandId);
    this.executionState = "resume_requested";
    this.emit("command.requested", { commandId, kind: "resume" });
    setTimeout(() => {
      this.paused = false;
      this.executionState = "running";
      for (const t of this.tasks) {
        if (t.status === "paused") t.status = "working";
      }
      this.emit("command.acknowledged", {
        commandId,
        kind: "resume",
        executionState: "running",
      });
      this.ensureTimer();
    }, this.ackMs);
  }

  stop(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private ensureTimer(): void {
    if (this.timer || this.paused || this.executionState !== "running") return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (this.paused || this.executionState !== "running") return;
    const working = this.tasks.find((t) => t.status === "working");
    if (working) {
      working.status = "done";
      this.emit("task.updated", { taskId: working.id, status: "done" });
      this.cursor += 1;
    }
    if (this.cursor >= this.tasks.length) {
      this.executionState = "completed";
      this.clearTimer();
      this.emit("runner.completed", { executionState: "completed" });
      return;
    }
    this.advanceWorking();
  }

  private advanceWorking(): void {
    const next = this.tasks[this.cursor];
    if (!next) return;
    next.status = "working";
    this.emit("task.updated", { taskId: next.id, status: "working" });
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    this.sequence += 1;
    const event: RunnerEvent = {
      sequence: this.sequence,
      type,
      timestamp: nowIso(),
      payload,
    };
    for (const listener of this.listeners) listener(event);
    this.externalOnEvent?.(event);
  }
}
