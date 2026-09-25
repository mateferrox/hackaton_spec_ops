import type { DatabaseSync } from "node:sqlite";
import type {
  ControlCommand,
  Mission,
  MissionAnswer,
  MissionEvent,
  MissionQuestion,
  MissionTask,
  Rule,
  SpecVersionRecord,
} from "./contracts.js";
import { getDb } from "./db.js";
import { nowIso } from "./util.js";

function j<T>(value: T): string {
  return JSON.stringify(value);
}

function p<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export class MissionStore {
  constructor(private readonly db: DatabaseSync = getDb()) {}

  withTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  insertMission(mission: Mission): void {
    this.db
      .prepare(
        `INSERT INTO missions(
          id, title, mode, spec_id, spec_version, runner_id,
          execution_state, analysis_phase, analysis_error, rules_confirmed,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        mission.id,
        mission.title,
        mission.mode,
        mission.specId,
        mission.specVersion,
        mission.runnerId ?? null,
        mission.executionState,
        mission.analysisPhase,
        mission.analysisError ?? null,
        mission.rulesConfirmed ? 1 : 0,
        mission.createdAt,
        mission.updatedAt,
      );
  }

  updateMission(mission: Mission): void {
    this.db
      .prepare(
        `UPDATE missions SET
          title=?, spec_version=?, runner_id=?, execution_state=?,
          analysis_phase=?, analysis_error=?, rules_confirmed=?, updated_at=?
         WHERE id=?`,
      )
      .run(
        mission.title,
        mission.specVersion,
        mission.runnerId ?? null,
        mission.executionState,
        mission.analysisPhase,
        mission.analysisError ?? null,
        mission.rulesConfirmed ? 1 : 0,
        mission.updatedAt,
        mission.id,
      );
  }

  getMission(id: string): Mission | null {
    const row = this.db
      .prepare("SELECT * FROM missions WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      title: String(row.title),
      mode: row.mode as Mission["mode"],
      specId: String(row.spec_id),
      specVersion: Number(row.spec_version),
      runnerId: row.runner_id ? String(row.runner_id) : undefined,
      executionState: row.execution_state as Mission["executionState"],
      analysisPhase: row.analysis_phase as Mission["analysisPhase"],
      analysisError: row.analysis_error ? String(row.analysis_error) : undefined,
      rulesConfirmed: Boolean(row.rules_confirmed),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  insertSpecVersion(spec: SpecVersionRecord): void {
    this.db
      .prepare(
        `INSERT INTO spec_versions(mission_id, version, text, confirmed_rules_json, created_at)
         VALUES (?,?,?,?,?)`,
      )
      .run(
        spec.missionId,
        spec.version,
        spec.text,
        j(spec.confirmedRules),
        spec.createdAt,
      );
  }

  getSpecVersion(missionId: string, version: number): SpecVersionRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM spec_versions WHERE mission_id = ? AND version = ?",
      )
      .get(missionId, version) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      missionId: String(row.mission_id),
      version: Number(row.version),
      text: String(row.text),
      confirmedRules: p<Rule[]>(String(row.confirmed_rules_json)),
      createdAt: String(row.created_at),
    };
  }

  updateConfirmedRules(
    missionId: string,
    version: number,
    rules: Rule[],
  ): void {
    this.db
      .prepare(
        `UPDATE spec_versions SET confirmed_rules_json=? WHERE mission_id=? AND version=?`,
      )
      .run(j(rules), missionId, version);
  }

  setExtracted(
    missionId: string,
    rules: Rule[],
    proposedTasks: MissionTask[],
  ): void {
    this.db
      .prepare(
        `INSERT INTO extracted_rules(mission_id, rules_json, proposed_tasks_json, updated_at)
         VALUES (?,?,?,?)
         ON CONFLICT(mission_id) DO UPDATE SET
           rules_json=excluded.rules_json,
           proposed_tasks_json=excluded.proposed_tasks_json,
           updated_at=excluded.updated_at`,
      )
      .run(missionId, j(rules), j(proposedTasks), nowIso());
  }

  getExtracted(missionId: string): { rules: Rule[]; proposedTasks: MissionTask[] } | null {
    const row = this.db
      .prepare("SELECT * FROM extracted_rules WHERE mission_id = ?")
      .get(missionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      rules: p<Rule[]>(String(row.rules_json)),
      proposedTasks: p<MissionTask[]>(String(row.proposed_tasks_json)),
    };
  }

  replaceTasks(missionId: string, tasks: MissionTask[]): void {
    this.db.prepare("DELETE FROM tasks WHERE mission_id = ?").run(missionId);
    const stmt = this.db.prepare(
      `INSERT INTO tasks(
        id, mission_id, title, description, depends_on_json, relevant_rule_ids_json,
        runner_task_id, status, evidence_refs_json, needs_review, review_cause_ids_json, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    tasks.forEach((task, index) => {
      stmt.run(
        task.id,
        missionId,
        task.title,
        task.description,
        j(task.dependsOnTaskIds),
        j(task.relevantRuleIds),
        task.runnerTaskId ?? null,
        task.status,
        j(task.evidenceRefs),
        task.needsReview ? 1 : 0,
        j(task.reviewCauseIds),
        index,
      );
    });
  }

  listTasks(missionId: string): MissionTask[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM tasks WHERE mission_id = ? ORDER BY sort_order ASC",
      )
      .all(missionId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      title: String(row.title),
      description: String(row.description),
      dependsOnTaskIds: p<string[]>(String(row.depends_on_json)),
      relevantRuleIds: p<string[]>(String(row.relevant_rule_ids_json)),
      runnerTaskId: row.runner_task_id ? String(row.runner_task_id) : undefined,
      status: row.status as MissionTask["status"],
      evidenceRefs: p<string[]>(String(row.evidence_refs_json)),
      needsReview: Boolean(row.needs_review),
      reviewCauseIds: p<string[]>(String(row.review_cause_ids_json)),
    }));
  }

  updateTask(task: MissionTask): void {
    this.db
      .prepare(
        `UPDATE tasks SET status=?, needs_review=?, review_cause_ids_json=?, evidence_refs_json=?
         WHERE id=? AND mission_id=?`,
      )
      .run(
        task.status,
        task.needsReview ? 1 : 0,
        j(task.reviewCauseIds),
        j(task.evidenceRefs),
        task.id,
        task.missionId,
      );
  }

  replaceQuestions(missionId: string, questions: MissionQuestion[]): void {
    this.db.prepare("DELETE FROM questions WHERE mission_id = ?").run(missionId);
    const stmt = this.db.prepare(
      `INSERT INTO questions(
        id, mission_id, spec_version, task_ids_json, rule_ids_json,
        situation, prompt, choices_json, state, deduplication_key, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    questions.forEach((q, index) => {
      stmt.run(
        q.id,
        missionId,
        q.specVersion,
        j(q.taskIds),
        j(q.ruleIds),
        q.situation,
        q.prompt,
        j(q.choices),
        q.state,
        q.deduplicationKey,
        index,
      );
    });
  }

  listQuestions(missionId: string): MissionQuestion[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM questions WHERE mission_id = ? ORDER BY sort_order ASC",
      )
      .all(missionId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      specVersion: Number(row.spec_version),
      taskIds: p<string[]>(String(row.task_ids_json)),
      ruleIds: p<string[]>(String(row.rule_ids_json)),
      situation: String(row.situation),
      prompt: String(row.prompt),
      choices: p(String(row.choices_json)),
      state: row.state as MissionQuestion["state"],
      deduplicationKey: String(row.deduplication_key),
    }));
  }

  updateQuestion(q: MissionQuestion): void {
    this.db
      .prepare(
        `UPDATE questions SET state=?, choices_json=?, spec_version=? WHERE id=? AND mission_id=?`,
      )
      .run(q.state, j(q.choices), q.specVersion, q.id, q.missionId);
  }

  insertAnswer(answer: MissionAnswer): void {
    this.db
      .prepare(
        `INSERT INTO answers(
          id, mission_id, question_id, spec_version, choice_id, assessment_json, created_at, active
        ) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        answer.id,
        answer.missionId,
        answer.questionId,
        answer.specVersion,
        answer.choiceId,
        j(answer.assessmentSnapshot),
        answer.createdAt,
        answer.active ? 1 : 0,
      );
  }

  deactivateAnswersForQuestion(missionId: string, questionId: string): void {
    this.db
      .prepare(
        "UPDATE answers SET active=0 WHERE mission_id=? AND question_id=? AND active=1",
      )
      .run(missionId, questionId);
  }

  listActiveAnswers(missionId: string): MissionAnswer[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM answers WHERE mission_id = ? AND active = 1 ORDER BY created_at ASC",
      )
      .all(missionId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      questionId: String(row.question_id),
      specVersion: Number(row.spec_version),
      choiceId: String(row.choice_id),
      assessmentSnapshot: p(String(row.assessment_json)),
      createdAt: String(row.created_at),
      active: Boolean(row.active),
    }));
  }

  insertCommand(cmd: ControlCommand): void {
    this.db
      .prepare(
        `INSERT INTO control_commands(
          id, mission_id, kind, requested_at, status, acknowledged_at, runner_message
        ) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        cmd.id,
        cmd.missionId,
        cmd.kind,
        cmd.requestedAt,
        cmd.status,
        cmd.acknowledgedAt ?? null,
        cmd.runnerMessage ?? null,
      );
  }

  updateCommand(cmd: ControlCommand): void {
    this.db
      .prepare(
        `UPDATE control_commands SET status=?, acknowledged_at=?, runner_message=? WHERE id=?`,
      )
      .run(
        cmd.status,
        cmd.acknowledgedAt ?? null,
        cmd.runnerMessage ?? null,
        cmd.id,
      );
  }

  getCommand(id: string): ControlCommand | null {
    const row = this.db
      .prepare("SELECT * FROM control_commands WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapCommand(row);
  }

  listCommands(missionId: string): ControlCommand[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM control_commands WHERE mission_id = ? ORDER BY requested_at ASC",
      )
      .all(missionId) as Record<string, unknown>[];
    return rows.map(mapCommand);
  }

  nextSequence(missionId: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) AS m FROM events WHERE mission_id = ?",
      )
      .get(missionId) as { m: number };
    return Number(row.m) + 1;
  }

  appendEvent(
    missionId: string,
    type: string,
    payload: Record<string, unknown>,
  ): MissionEvent {
    const sequence = this.nextSequence(missionId);
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO events(mission_id, sequence, type, timestamp, payload_json)
         VALUES (?,?,?,?,?)`,
      )
      .run(missionId, sequence, type, timestamp, j(payload));
    return { missionId, sequence, type, timestamp, payload };
  }

  listEvents(missionId: string, afterSequence = 0): MissionEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM events WHERE mission_id = ? AND sequence > ? ORDER BY sequence ASC`,
      )
      .all(missionId, afterSequence) as Record<string, unknown>[];
    return rows.map((row) => ({
      missionId: String(row.mission_id),
      sequence: Number(row.sequence),
      type: String(row.type),
      timestamp: String(row.timestamp),
      payload: p(String(row.payload_json)),
    }));
  }

  lastSequence(missionId: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) AS m FROM events WHERE mission_id = ?",
      )
      .get(missionId) as { m: number };
    return Number(row.m);
  }

  getIdempotency(
    missionId: string,
    operation: string,
    key: string,
  ): { payloadHash: string; status: number; body: string } | null {
    const row = this.db
      .prepare(
        `SELECT payload_hash, response_status, response_body FROM idempotency
         WHERE mission_id=? AND operation=? AND idempotency_key=?`,
      )
      .get(missionId, operation, key) as
      | { payload_hash: string; response_status: number; response_body: string }
      | undefined;
    if (!row) return null;
    return {
      payloadHash: row.payload_hash,
      status: row.response_status,
      body: row.response_body,
    };
  }

  putIdempotency(
    missionId: string,
    operation: string,
    key: string,
    payloadHash: string,
    status: number,
    body: unknown,
  ): void {
    this.db
      .prepare(
        `INSERT INTO idempotency(
          mission_id, operation, idempotency_key, payload_hash, response_status, response_body, created_at
        ) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(missionId, operation, key, payloadHash, status, j(body), nowIso());
  }
}

function mapCommand(row: Record<string, unknown>): ControlCommand {
  return {
    id: String(row.id),
    missionId: String(row.mission_id),
    kind: row.kind as ControlCommand["kind"],
    requestedAt: String(row.requested_at),
    status: row.status as ControlCommand["status"],
    acknowledgedAt: row.acknowledged_at
      ? String(row.acknowledged_at)
      : undefined,
    runnerMessage: row.runner_message ? String(row.runner_message) : undefined,
  };
}
