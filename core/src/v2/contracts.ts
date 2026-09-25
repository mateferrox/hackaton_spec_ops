/** SpecOps v2 domain contracts — shared shapes for API and store. */

export type MissionMode = "demo" | "connected";

export type ExecutionState =
  | "idle"
  | "running"
  | "pause_requested"
  | "paused"
  | "resume_requested"
  | "completed"
  | "failed"
  | "unknown";

export type TaskStatus =
  | "pending"
  | "working"
  | "done"
  | "paused"
  | "blocked"
  | "failed";

export type RuleOrigin = "explicit" | "developer_confirmed";

export type QuestionState = "queued" | "visible" | "answered" | "stale";

export type AssessmentClassification =
  | "aligned"
  | "conflict"
  | "unspecified"
  | "uncertain";

export type ControlKind = "pause" | "resume";

export type ControlCommandStatus =
  | "requested"
  | "acknowledged"
  | "failed"
  | "timed_out";

export type AnalysisPhase =
  | "pending"
  | "ready"
  | "failed"
  | "confirmed";

export interface RunnerCapabilities {
  observe: boolean;
  pause: boolean;
  resume: boolean;
  dispatchControl: boolean;
  start?: boolean;
}

export interface SpecLibraryItem {
  id: string;
  title: string;
  version: number;
  preview: string;
  characterCount: number;
}

export interface Rule {
  id: string;
  statement: string;
  origin: RuleOrigin;
  sourceExcerpt: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface MissionTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  dependsOnTaskIds: string[];
  relevantRuleIds: string[];
  runnerTaskId?: string;
  status: TaskStatus;
  evidenceRefs: string[];
  needsReview: boolean;
  reviewCauseIds: string[];
}

export interface ChoiceAssessment {
  classification: AssessmentClassification;
  explanation: string;
  evidence: { ruleId: string; excerpt: string } | null;
  affectedTaskIds: string[];
}

export interface MissionChoice {
  id: string;
  label: string;
  proposedRule: string;
  assessment: ChoiceAssessment;
}

export interface MissionQuestion {
  id: string;
  missionId: string;
  specVersion: number;
  taskIds: string[];
  ruleIds: string[];
  situation: string;
  prompt: string;
  choices: MissionChoice[];
  state: QuestionState;
  deduplicationKey: string;
}

export interface MissionAnswer {
  id: string;
  missionId: string;
  questionId: string;
  specVersion: number;
  choiceId: string;
  assessmentSnapshot: ChoiceAssessment;
  createdAt: string;
  active: boolean;
}

export interface ControlCommand {
  id: string;
  missionId: string;
  kind: ControlKind;
  requestedAt: string;
  status: ControlCommandStatus;
  acknowledgedAt?: string;
  runnerMessage?: string;
}

export interface SpecVersionRecord {
  missionId: string;
  version: number;
  text: string;
  confirmedRules: Rule[];
  createdAt: string;
}

export interface Mission {
  id: string;
  title: string;
  mode: MissionMode;
  specId: string;
  specVersion: number;
  runnerId?: string;
  executionState: ExecutionState;
  analysisPhase: AnalysisPhase;
  analysisError?: string;
  rulesConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MissionEvent {
  missionId: string;
  sequence: number;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface MissionSnapshot {
  mission: Mission;
  activeSpec: SpecVersionRecord;
  rules: Rule[];
  tasks: MissionTask[];
  visibleQuestion: MissionQuestion | null;
  queuedQuestions: MissionQuestion[];
  activeAnswers: MissionAnswer[];
  openConflicts: MissionAnswer[];
  capabilities: RunnerCapabilities;
  lastSequence: number;
  controlCommands: ControlCommand[];
}

export interface CreateMissionRequest {
  specId: string;
  specVersion: number;
  mode: MissionMode;
  runnerId?: string;
}

export interface ConfirmRulesRequest {
  specVersion: number;
  rules: Rule[];
}

export interface AnswerRequest {
  questionId: string;
  choiceId: string;
  specVersion: number;
  idempotencyKey: string;
  assessment?: unknown;
}

export interface ControlRequest {
  kind: ControlKind;
  idempotencyKey: string;
}

export interface UpdateSpecRequest {
  baseVersion: number;
  text: string;
  changeReason: string;
}

export interface V2ErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
