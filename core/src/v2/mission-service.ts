import { SpecOpsError } from "../errors.js";
import { DemoAdapter } from "./adapters/demo-adapter.js";
import { HttpRunnerAdapter } from "./adapters/http-runner-adapter.js";
import type { AgentAdapter } from "./adapters/types.js";
import { OBSERVE_ONLY_CAPABILITIES } from "./adapters/types.js";
import type {
  AnswerRequest,
  ConfirmRulesRequest,
  ControlRequest,
  CreateMissionRequest,
  Mission,
  MissionAnswer,
  MissionQuestion,
  MissionSnapshot,
  MissionTask,
  Rule,
  RunnerCapabilities,
  UpdateSpecRequest,
} from "./contracts.js";
import { createAnalyzePipeline } from "./provider.js";
import { buildBriefMarkdown, recomputeReviewFlags } from "./impact.js";
import { getSpec } from "./specs-library.js";
import { MissionStore } from "./store.js";
import { newId, nowIso, sha256 } from "./util.js";
import { validateEvidence } from "./assessment.js";

const PAUSE_TIMEOUT_MS = 15_000;

type SseClient = {
  write: (chunk: string) => void;
  close: () => void;
};

export class MissionService {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly unsubscribers = new Map<string, () => void>();
  private readonly sse = new Map<string, Set<SseClient>>();
  private readonly commandTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly store = new MissionStore()) {}

  createMission(req: CreateMissionRequest): MissionSnapshot {
    if (!req || typeof req !== "object") {
      throw new SpecOpsError("INVALID_INPUT", "Body non valido.", 400);
    }
    if (req.mode !== "demo" && req.mode !== "connected") {
      throw new SpecOpsError(
        "INVALID_INPUT",
        'mode deve essere "demo" oppure "connected".',
        400,
      );
    }
    const spec = getSpec(req.specId, req.specVersion);
    if (!spec) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        "Spec sconosciuta o versione non disponibile.",
        400,
      );
    }
    if (!spec.text.trim()) {
      throw new SpecOpsError("INVALID_INPUT", "Spec vuota.", 400);
    }
    if (spec.text.length > 20_000) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        "Spec oltre il limite di 20.000 caratteri.",
        400,
      );
    }

    const now = nowIso();
    const mission: Mission = {
      id: newId("msn"),
      title: spec.title,
      mode: req.mode,
      specId: spec.id,
      specVersion: spec.version,
      runnerId: req.runnerId,
      executionState: "idle",
      analysisPhase: "pending",
      rulesConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };

    this.store.withTransaction(() => {
      this.store.insertMission(mission);
      this.store.insertSpecVersion({
        missionId: mission.id,
        version: spec.version,
        text: spec.text,
        confirmedRules: [],
        createdAt: now,
      });
      this.emit(mission.id, "mission.created", { missionId: mission.id });
      this.emit(mission.id, "analysis.pending", {});
    });

    void this.runAnalysis(mission.id);

    return this.getSnapshot(mission.id);
  }

  private async runAnalysis(missionId: string): Promise<void> {
    const mission = this.store.getMission(missionId);
    if (!mission) return;
    const spec = this.store.getSpecVersion(missionId, mission.specVersion);
    if (!spec) return;

    try {
      const analyze = createAnalyzePipeline(mission.mode);
      const result = await analyze({
        title: mission.title,
        text: spec.text,
        specId: mission.specId,
      });

      const tasks: MissionTask[] = result.proposedTasks.map((t) => ({
        ...t,
        missionId,
        status: "pending",
      }));
      if (tasks.length > 30) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          "Massimo 30 task per missione.",
          400,
        );
      }

      const questions: MissionQuestion[] = result.preflightQuestions.map((q) => ({
        ...q,
        missionId,
        specVersion: mission.specVersion,
        state: "queued",
        choices: q.choices.slice(0, 3),
      }));

      mission.analysisPhase = "ready";
      mission.analysisError = undefined;
      mission.title = result.title || mission.title;
      mission.updatedAt = nowIso();

      this.store.withTransaction(() => {
        this.store.setExtracted(missionId, result.rules, tasks);
        this.store.replaceTasks(missionId, tasks);
        this.store.replaceQuestions(missionId, questions);
        this.store.updateMission(mission);
        this.emit(missionId, "analysis.ready", {
          ruleCount: result.rules.length,
          taskCount: tasks.length,
          questionCount: questions.length,
        });
      });
    } catch (err) {
      const message =
        err instanceof SpecOpsError
          ? err.message
          : "Analisi non riuscita.";
      const code = err instanceof SpecOpsError ? err.code : "PROVIDER_ERROR";
      mission.analysisPhase = "failed";
      mission.analysisError = message;
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);
      this.emit(missionId, "analysis.failed", { code, message });
    }
  }

  confirmRules(missionId: string, req: ConfirmRulesRequest): MissionSnapshot {
    const mission = this.requireMission(missionId);
    if (req.specVersion !== mission.specVersion) {
      throw new SpecOpsError("STALE_SPEC", "Versione della spec obsoleta.", 409);
    }
    if (mission.analysisPhase !== "ready" && mission.analysisPhase !== "confirmed") {
      throw new SpecOpsError(
        "INVALID_STATE",
        "Analisi non pronta per la conferma.",
        409,
      );
    }
    const extracted = this.store.getExtracted(missionId);
    if (!extracted) {
      throw new SpecOpsError("INVALID_STATE", "Regole non disponibili.", 409);
    }

    const byId = new Map(extracted.rules.map((r) => [r.id, r]));
    const confirmed: Rule[] = [];
    for (const rule of req.rules ?? []) {
      const known = byId.get(rule.id);
      if (!known) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          `Regola sconosciuta: ${rule.id}`,
          400,
        );
      }
      const origin =
        rule.origin === "developer_confirmed"
          ? "developer_confirmed"
          : known.origin;
      confirmed.push({ ...known, origin });
    }
    if (confirmed.length === 0) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        "Confermare almeno una regola.",
        400,
      );
    }

    const spec = this.store.getSpecVersion(missionId, mission.specVersion)!;
    for (const rule of confirmed) {
      if (
        !validateEvidence(
          [rule],
          { ruleId: rule.id, excerpt: rule.sourceExcerpt },
          spec.text,
        )
      ) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          "Estratto regola non coerente con la spec.",
          400,
        );
      }
    }

    this.store.withTransaction(() => {
      this.store.updateConfirmedRules(missionId, mission.specVersion, confirmed);

      mission.rulesConfirmed = true;
      mission.analysisPhase = "confirmed";
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);

      // Promote first preflight questions into visible queue (max 3)
      const questions = this.store.listQuestions(missionId);
      let visible = 0;
      for (const q of questions) {
        if (q.state !== "queued") continue;
        if (visible === 0) q.state = "visible";
        else if (visible < 3) q.state = "queued";
        this.store.updateQuestion(q);
        visible += 1;
        if (visible >= 3) break;
      }

      this.emit(missionId, "rules.confirmed", {
        ruleIds: confirmed.map((r) => r.id),
      });
    });

    return this.getSnapshot(missionId);
  }

  startMission(missionId: string): MissionSnapshot {
    const mission = this.requireMission(missionId);
    if (!mission.rulesConfirmed || mission.analysisPhase !== "confirmed") {
      throw new SpecOpsError(
        "INVALID_STATE",
        "Confermare le regole prima dell’avvio.",
        409,
      );
    }
    if (mission.executionState !== "idle" && mission.executionState !== "paused") {
      throw new SpecOpsError(
        "INVALID_STATE",
        "La missione non è in uno stato avviabile.",
        409,
      );
    }

    const openConflicts = this.store
      .listActiveAnswers(missionId)
      .filter((a) => a.assessmentSnapshot.classification === "conflict");
    if (openConflicts.length > 0 && mission.executionState === "idle") {
      throw new SpecOpsError(
        "INVALID_STATE",
        "Risolvere i conflitti di preflight prima dell’avvio.",
        409,
      );
    }

    const tasks = this.store.listTasks(missionId);
    const adapter = this.ensureAdapter(mission, tasks.map((t) => t.id));

    mission.executionState = "running";
    mission.updatedAt = nowIso();
    this.store.updateMission(mission);
    this.emit(missionId, "mission.started", {});

    if (adapter.start) {
      void adapter.start(tasks.map((t) => t.id)).catch(() => {
        /* adapter errors surface via events */
      });
    } else {
      this.emit(missionId, "mission.awaiting_external_start", {
        message:
          "Avvia l’agente nel suo ambiente; lo stato passerà a working al primo evento reale.",
      });
      mission.executionState = "idle";
      this.store.updateMission(mission);
    }

    return this.getSnapshot(missionId);
  }

  answer(
    missionId: string,
    req: AnswerRequest,
  ): { snapshot: MissionSnapshot; answer: MissionAnswer } {
    if (!req?.idempotencyKey || !req.questionId || !req.choiceId) {
      throw new SpecOpsError("INVALID_INPUT", "Campi risposta obbligatori.", 400);
    }
    const payloadHash = sha256(
      JSON.stringify({
        questionId: req.questionId,
        choiceId: req.choiceId,
        specVersion: req.specVersion,
      }),
    );
    const existing = this.store.getIdempotency(
      missionId,
      "answer",
      req.idempotencyKey,
    );
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new SpecOpsError(
          "CONFLICT",
          "idempotencyKey già usata con payload diverso.",
          409,
        );
      }
      return JSON.parse(existing.body) as {
        snapshot: MissionSnapshot;
        answer: MissionAnswer;
      };
    }

    const mission = this.requireMission(missionId);
    if (req.specVersion !== mission.specVersion) {
      const questions = this.store.listQuestions(missionId);
      const q = questions.find((x) => x.id === req.questionId);
      if (q) {
        q.state = "stale";
        this.store.updateQuestion(q);
      }
      throw new SpecOpsError(
        "STALE_SPEC",
        "Domanda legata a una versione di spec obsoleta.",
        409,
      );
    }

    // Ignore client-supplied assessment
    void req.assessment;

    const questions = this.store.listQuestions(missionId);
    const question = questions.find((q) => q.id === req.questionId);
    if (!question) {
      throw new SpecOpsError("INVALID_INPUT", "Domanda sconosciuta.", 400);
    }
    if (question.state === "stale") {
      throw new SpecOpsError("STALE_SPEC", "Domanda stale.", 409);
    }
    const choice = question.choices.find((c) => c.id === req.choiceId);
    if (!choice) {
      throw new SpecOpsError("INVALID_INPUT", "Scelta sconosciuta.", 400);
    }

    const assessment = choice.assessment;
    const spec = this.store.getSpecVersion(missionId, mission.specVersion)!;
    const rules =
      (this.store.getSpecVersion(missionId, mission.specVersion)
        ?.confirmedRules?.length
        ? this.store.getSpecVersion(missionId, mission.specVersion)!
            .confirmedRules
        : this.store.getExtracted(missionId)?.rules) ?? [];
    if (
      assessment.evidence &&
      !validateEvidence(rules, assessment.evidence, spec.text)
    ) {
      throw new SpecOpsError(
        "INVALID_ANSWER",
        "Evidenza non valida per la versione di spec.",
        422,
      );
    }

    const answer: MissionAnswer = {
      id: newId("ans"),
      missionId,
      questionId: question.id,
      specVersion: mission.specVersion,
      choiceId: choice.id,
      assessmentSnapshot: assessment,
      createdAt: nowIso(),
      active: true,
    };

    this.store.withTransaction(() => {
      this.store.deactivateAnswersForQuestion(missionId, question.id);
      this.store.insertAnswer(answer);
      // Conflict stays visible so the developer can still choose “Resta nella spec”.
      question.state =
        assessment.classification === "conflict" ? "visible" : "answered";
      this.store.updateQuestion(question);

      // Promote next queued to visible only when current is done
      if (question.state === "answered") {
        const all = this.store.listQuestions(missionId);
        const hasVisible = all.some((q) => q.state === "visible");
        if (!hasVisible) {
          const next = all.find((q) => q.state === "queued");
          if (next) {
            next.state = "visible";
            this.store.updateQuestion(next);
          }
        }
      }

      const tasks = this.store.listTasks(missionId);
      const active = this.store.listActiveAnswers(missionId);
      const updates = recomputeReviewFlags(tasks, active);
      for (const u of updates) {
        const task = tasks.find((t) => t.id === u.taskId);
        if (!task) continue;
        task.needsReview = u.needsReview;
        task.reviewCauseIds = u.reviewCauseIds;
        this.store.updateTask(task);
      }

      // If adapter controls dispatch and conflict, mark dependent pending as blocked
      const adapter = this.adapters.get(missionId);
      if (
        assessment.classification === "conflict" &&
        adapter?.getCapabilities().dispatchControl
      ) {
        for (const task of tasks) {
          if (
            task.needsReview &&
            (task.status === "pending" || task.status === "working")
          ) {
            // Do not fake-pause external working; only block pending local dispatch
            if (task.status === "pending") {
              task.status = "blocked";
              this.store.updateTask(task);
            }
          }
        }
      }

      this.emit(missionId, "answer.recorded", {
        answerId: answer.id,
        classification: assessment.classification,
      });
    });

    const result = { snapshot: this.getSnapshot(missionId), answer };
    this.store.putIdempotency(
      missionId,
      "answer",
      req.idempotencyKey,
      payloadHash,
      200,
      result,
    );
    return result;
  }

  control(
    missionId: string,
    req: ControlRequest,
  ): { commandId: string; status: "requested" } {
    if (!req?.idempotencyKey || (req.kind !== "pause" && req.kind !== "resume")) {
      throw new SpecOpsError("INVALID_INPUT", "Comando non valido.", 400);
    }
    const payloadHash = sha256(JSON.stringify({ kind: req.kind }));
    const existing = this.store.getIdempotency(
      missionId,
      "control",
      req.idempotencyKey,
    );
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new SpecOpsError(
          "CONFLICT",
          "idempotencyKey già usata con payload diverso.",
          409,
        );
      }
      return JSON.parse(existing.body) as {
        commandId: string;
        status: "requested";
      };
    }

    const mission = this.requireMission(missionId);
    const adapter = this.adapters.get(missionId) ?? this.ensureAdapter(mission);
    const caps = adapter.getCapabilities();

    if (req.kind === "pause" && !caps.pause) {
      throw new SpecOpsError(
        "CAPABILITY_UNAVAILABLE",
        "Controllo pausa non disponibile: ferma l’agente dal suo ambiente.",
        409,
      );
    }
    if (req.kind === "resume" && !caps.resume) {
      throw new SpecOpsError(
        "CAPABILITY_UNAVAILABLE",
        "Controllo resume non disponibile.",
        409,
      );
    }
    if (req.kind === "resume") {
      const specChangedNeedsAlign =
        mission.analysisPhase === "ready" && !mission.rulesConfirmed;
      if (specChangedNeedsAlign) {
        throw new SpecOpsError(
          "INVALID_STATE",
          "Riallineare la spec prima di riprendere.",
          409,
        );
      }
    }

    const commandId = newId("cmd");
    const cmd = {
      id: commandId,
      missionId,
      kind: req.kind,
      requestedAt: nowIso(),
      status: "requested" as const,
    };

    mission.executionState =
      req.kind === "pause" ? "pause_requested" : "resume_requested";
    mission.updatedAt = nowIso();

    this.store.withTransaction(() => {
      this.store.insertCommand(cmd);
      this.store.updateMission(mission);
      this.emit(missionId, "control.requested", {
        commandId,
        kind: req.kind,
      });
    });

    void adapter[
      req.kind === "pause" ? "requestPause" : "requestResume"
    ](commandId).catch((err) => {
      const message =
        err instanceof SpecOpsError ? err.message : "Comando fallito.";
      const stored = this.store.getCommand(commandId);
      if (!stored || stored.status !== "requested") return;
      stored.status = "failed";
      stored.runnerMessage = message;
      stored.acknowledgedAt = nowIso();
      this.store.updateCommand(stored);
      mission.executionState = "unknown";
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);
      this.emit(missionId, "command.failed", { commandId, message });
    });

    const timer = setTimeout(() => {
      const stored = this.store.getCommand(commandId);
      if (!stored || stored.status !== "requested") return;
      stored.status = "timed_out";
      stored.runnerMessage = "Pausa non confermata";
      stored.acknowledgedAt = nowIso();
      this.store.updateCommand(stored);
      const m = this.store.getMission(missionId);
      if (m) {
        m.executionState = "unknown";
        m.updatedAt = nowIso();
        this.store.updateMission(m);
      }
      this.emit(missionId, "command.timed_out", {
        commandId,
        message: "Pausa non confermata",
      });
    }, PAUSE_TIMEOUT_MS);
    this.commandTimers.set(commandId, timer);

    const body = { commandId, status: "requested" as const };
    this.store.putIdempotency(
      missionId,
      "control",
      req.idempotencyKey,
      payloadHash,
      202,
      body,
    );
    return body;
  }

  updateSpec(missionId: string, req: UpdateSpecRequest): MissionSnapshot {
    const mission = this.requireMission(missionId);
    if (
      mission.executionState !== "idle" &&
      mission.executionState !== "paused"
    ) {
      throw new SpecOpsError(
        "INVALID_STATE",
        "Aggiornare la spec solo in idle o paused.",
        409,
      );
    }
    if (req.baseVersion !== mission.specVersion) {
      throw new SpecOpsError(
        "STALE_SPEC",
        "baseVersion non corrisponde alla versione attiva.",
        409,
      );
    }
    const text = String(req.text ?? "").trim();
    if (!text) {
      throw new SpecOpsError("INVALID_INPUT", "Testo spec vuoto.", 400);
    }
    if (text.length > 20_000) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        "Spec oltre 20.000 caratteri.",
        400,
      );
    }

    const newVersion = mission.specVersion + 1;
    this.store.withTransaction(() => {
      this.store.insertSpecVersion({
        missionId,
        version: newVersion,
        text,
        confirmedRules: [],
        createdAt: nowIso(),
      });
      mission.specVersion = newVersion;
      mission.rulesConfirmed = false;
      mission.analysisPhase = "pending";
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);

      for (const q of this.store.listQuestions(missionId)) {
        if (q.state === "visible" || q.state === "queued") {
          q.state = "stale";
          this.store.updateQuestion(q);
        }
      }

      this.emit(missionId, "spec.updated", {
        version: newVersion,
        changeReason: req.changeReason,
      });
    });

    return this.getSnapshot(missionId);
  }

  reanalyze(missionId: string): MissionSnapshot {
    const mission = this.requireMission(missionId);
    if (
      mission.executionState !== "idle" &&
      mission.executionState !== "paused"
    ) {
      throw new SpecOpsError(
        "INVALID_STATE",
        "Reanalisi consentita solo in idle o paused.",
        409,
      );
    }
    mission.analysisPhase = "pending";
    mission.rulesConfirmed = false;
    mission.updatedAt = nowIso();
    this.store.updateMission(mission);
    this.emit(missionId, "analysis.pending", { reanalyze: true });
    // Do NOT resume runner
    void this.runAnalysis(missionId);
    return this.getSnapshot(missionId);
  }

  brief(missionId: string): { markdown: string } {
    const snap = this.getSnapshot(missionId);
    return {
      markdown: buildBriefMarkdown({
        title: snap.mission.title,
        specVersion: snap.mission.specVersion,
        rules: snap.rules,
        activeAnswers: snap.activeAnswers,
        tasks: snap.tasks,
      }),
    };
  }

  getSnapshot(missionId: string): MissionSnapshot {
    const mission = this.requireMission(missionId);
    const activeSpec = this.store.getSpecVersion(
      missionId,
      mission.specVersion,
    );
    if (!activeSpec) {
      throw new SpecOpsError("NOT_FOUND", "Spec attiva assente.", 404);
    }
    const extracted = this.store.getExtracted(missionId);
    const rules =
      activeSpec.confirmedRules.length > 0
        ? activeSpec.confirmedRules
        : (extracted?.rules ?? []);
    const tasks = this.store.listTasks(missionId);
    const questions = this.store.listQuestions(missionId);
    const visibleQuestion =
      questions.find((q) => q.state === "visible") ?? null;
    const queuedQuestions = questions
      .filter((q) => q.state === "queued")
      .slice(0, 3);
    const activeAnswers = this.store.listActiveAnswers(missionId);
    const openConflicts = activeAnswers.filter(
      (a) => a.assessmentSnapshot.classification === "conflict",
    );
    const capabilities = this.capabilitiesFor(mission);
    return {
      mission,
      activeSpec,
      rules,
      tasks,
      visibleQuestion,
      queuedQuestions,
      activeAnswers,
      openConflicts,
      capabilities,
      lastSequence: this.store.lastSequence(missionId),
      controlCommands: this.store.listCommands(missionId),
    };
  }

  listEvents(missionId: string, afterSequence: number) {
    this.requireMission(missionId);
    return this.store.listEvents(missionId, afterSequence);
  }

  subscribeSse(missionId: string, client: SseClient): () => void {
    this.requireMission(missionId);
    let set = this.sse.get(missionId);
    if (!set) {
      set = new Set();
      this.sse.set(missionId, set);
    }
    set.add(client);
    return () => {
      set!.delete(client);
    };
  }

  disposeMission(missionId: string): void {
    this.unsubscribers.get(missionId)?.();
    this.unsubscribers.delete(missionId);
    this.adapters.get(missionId)?.stop?.();
    this.adapters.delete(missionId);
  }

  private capabilitiesFor(mission: Mission): RunnerCapabilities {
    const adapter = this.adapters.get(mission.id);
    if (adapter) return adapter.getCapabilities();
    if (mission.mode === "demo") {
      return {
        observe: true,
        pause: true,
        resume: true,
        dispatchControl: true,
        start: true,
      };
    }
    return { ...OBSERVE_ONLY_CAPABILITIES };
  }

  private ensureAdapter(mission: Mission, taskIds?: string[]): AgentAdapter {
    const existing = this.adapters.get(mission.id);
    if (existing) return existing;

    let adapter: AgentAdapter;
    if (mission.mode === "demo" || !mission.runnerId || mission.runnerId === "demo") {
      adapter = new DemoAdapter({
        taskIds: taskIds ?? this.store.listTasks(mission.id).map((t) => t.id),
      });
    } else {
      const baseUrl = resolveRunnerUrl(mission.runnerId);
      if (!baseUrl) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          "runnerId non configurato sul server.",
          400,
        );
      }
      adapter = new HttpRunnerAdapter(mission.runnerId, {
        baseUrl,
        authToken: process.env.SPECOPS_RUNNER_TOKEN,
      });
    }

    const unsub = adapter.subscribe(0, (event) =>
      this.onAdapterEvent(mission.id, event),
    );
    this.unsubscribers.set(mission.id, unsub);
    this.adapters.set(mission.id, adapter);
    return adapter;
  }

  private onAdapterEvent(
    missionId: string,
    event: { type: string; payload: Record<string, unknown>; sequence: number },
  ): void {
    const mission = this.store.getMission(missionId);
    if (!mission) return;

    if (event.type === "command.acknowledged") {
      const commandId = String(event.payload.commandId ?? "");
      const timer = this.commandTimers.get(commandId);
      if (timer) {
        clearTimeout(timer);
        this.commandTimers.delete(commandId);
      }
      const cmd = this.store.getCommand(commandId);
      if (cmd && (cmd.status === "requested" || cmd.status === "timed_out")) {
        cmd.status = "acknowledged";
        cmd.acknowledgedAt = nowIso();
        this.store.updateCommand(cmd);
      }
      const exec = String(event.payload.executionState ?? "");
      if (exec === "paused" || exec === "running") {
        mission.executionState = exec;
        mission.updatedAt = nowIso();
        this.store.updateMission(mission);
      }
    }

    if (event.type === "task.updated") {
      const taskId = String(event.payload.taskId ?? "");
      const status = event.payload.status as MissionTask["status"];
      const tasks = this.store.listTasks(missionId);
      const task = tasks.find((t) => t.id === taskId);
      if (task && status) {
        task.status = status;
        this.store.updateTask(task);
      }
    }

    if (event.type === "runner.completed") {
      mission.executionState = "completed";
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);
    }

    if (event.type === "runner.started") {
      mission.executionState = "running";
      mission.updatedAt = nowIso();
      this.store.updateMission(mission);
    }

    this.emit(missionId, `runner.${event.type}`, event.payload);
  }

  private emit(
    missionId: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    const event = this.store.appendEvent(missionId, type, payload);
    const data = `id: ${event.sequence}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    const clients = this.sse.get(missionId);
    if (!clients) return;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }

  private requireMission(id: string): Mission {
    const mission = this.store.getMission(id);
    if (!mission) {
      throw new SpecOpsError("NOT_FOUND", "Missione non trovata.", 404);
    }
    return mission;
  }
}

function resolveRunnerUrl(runnerId: string): string | null {
  // Server-side registry only — no arbitrary browser URLs.
  if (runnerId === "reference") {
    return (
      process.env.SPECOPS_REFERENCE_RUNNER_URL ?? "http://127.0.0.1:3002"
    );
  }
  const mapRaw = process.env.SPECOPS_RUNNERS_JSON;
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw) as Record<string, string>;
      return map[runnerId] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

let singleton: MissionService | null = null;

export function getMissionService(): MissionService {
  if (!singleton) singleton = new MissionService();
  return singleton;
}

export function resetMissionService(): void {
  singleton = null;
}
