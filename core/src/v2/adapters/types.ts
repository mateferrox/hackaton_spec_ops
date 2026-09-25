import type {
  ControlKind,
  ExecutionState,
  RunnerCapabilities,
  TaskStatus,
} from "./contracts.js";

export interface RunnerTaskState {
  id: string;
  status: TaskStatus;
}

export interface RunnerSnapshot {
  executionState: ExecutionState;
  taskStates: RunnerTaskState[];
  lastSequence: number;
  capabilities: RunnerCapabilities;
}

export interface RunnerEvent {
  sequence: number;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AgentAdapter {
  readonly id: string;
  readonly label: string;
  getCapabilities(): RunnerCapabilities;
  getSnapshot(): Promise<RunnerSnapshot>;
  subscribe(
    fromSequence: number,
    onEvent: (event: RunnerEvent) => void,
  ): () => void;
  requestPause(commandId: string): Promise<void>;
  requestResume(commandId: string): Promise<void>;
  /** Optional: start work if the adapter can dispatch. */
  start?(taskIds: string[]): Promise<void>;
  stop?(): void;
}

export const DEMO_CAPABILITIES: RunnerCapabilities = {
  observe: true,
  pause: true,
  resume: true,
  dispatchControl: true,
  start: true,
};

export const OBSERVE_ONLY_CAPABILITIES: RunnerCapabilities = {
  observe: true,
  pause: false,
  resume: false,
  dispatchControl: false,
  start: false,
};

export type AdapterEventHandler = (event: RunnerEvent) => void;
