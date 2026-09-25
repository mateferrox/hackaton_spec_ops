import type { Analysis, Assumption, Choice, Task } from "./contracts.js";
import { SpecOpsError } from "./errors.js";

const LIMITS = {
  titleAssumption: 70,
  statement: 240,
  whyItMatters: 240,
  question: 160,
  choiceLabel: 100,
  instruction: 300,
  taskTitle: 100,
  excerpt: 500,
  maxTasks: 12,
  maxAssumptions: 3,
  maxChoices: 3,
  minChoices: 2,
  maxInputChars: 20_000,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertStringLength(
  value: string,
  max: number,
  label: string,
  code: "INVALID_ANALYSIS" | "INVALID_INPUT",
): void {
  if (value.length > max) {
    throw new SpecOpsError(code, `${label} supera ${max} caratteri.`, code === "INVALID_INPUT" ? 400 : 422);
  }
}

function assertUniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `ID duplicato in ${label}: ${id}.`,
        422,
      );
    }
    seen.add(id);
  }
}

function validateChoice(choice: unknown, assumptionId: string): void {
  if (!choice || typeof choice !== "object") {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Scelta non valida in ${assumptionId}.`,
      422,
    );
  }
  const c = choice as Choice;
  if (!isNonEmptyString(c.id)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Scelta senza id in ${assumptionId}.`,
      422,
    );
  }
  if (!isNonEmptyString(c.label)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Scelta ${c.id} senza label.`,
      422,
    );
  }
  if (!isNonEmptyString(c.instruction)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Scelta ${c.id} senza instruction.`,
      422,
    );
  }
  if (c.effect !== "confirm" && c.effect !== "revise") {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Effetto non valido per scelta ${c.id}.`,
      422,
    );
  }
  assertStringLength(c.label, LIMITS.choiceLabel, `Label ${c.id}`, "INVALID_ANALYSIS");
  assertStringLength(
    c.instruction,
    LIMITS.instruction,
    `Instruction ${c.id}`,
    "INVALID_ANALYSIS",
  );
}

function validateAssumption(
  assumption: unknown,
  taskIds: Set<string>,
  plan: string,
): void {
  if (!assumption || typeof assumption !== "object") {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      "Assunzione non valida.",
      422,
    );
  }
  const a = assumption as Assumption;
  if (!isNonEmptyString(a.id)) {
    throw new SpecOpsError("INVALID_ANALYSIS", "Assunzione senza id.", 422);
  }
  if (!isNonEmptyString(a.title)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Titolo assunzione mancante per ${a.id}.`,
      422,
    );
  }
  if (!isNonEmptyString(a.statement)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Statement mancante per ${a.id}.`,
      422,
    );
  }
  if (!isNonEmptyString(a.whyItMatters)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `whyItMatters mancante per ${a.id}.`,
      422,
    );
  }
  if (!isNonEmptyString(a.question)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Question mancante per ${a.id}.`,
      422,
    );
  }
  if (!isNonEmptyString(a.planExcerpt)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `planExcerpt mancante o vuoto per ${a.id}.`,
      422,
    );
  }
  assertStringLength(a.title, LIMITS.titleAssumption, "Titolo assunzione", "INVALID_ANALYSIS");
  assertStringLength(a.statement, LIMITS.statement, "Statement", "INVALID_ANALYSIS");
  assertStringLength(a.whyItMatters, LIMITS.whyItMatters, "whyItMatters", "INVALID_ANALYSIS");
  assertStringLength(a.question, LIMITS.question, "Question", "INVALID_ANALYSIS");
  assertStringLength(a.planExcerpt, LIMITS.excerpt, "planExcerpt", "INVALID_ANALYSIS");

  if (a.kind !== "unspecified" && a.kind !== "ambiguous") {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Kind non valido per ${a.id}.`,
      422,
    );
  }
  if (!plan.includes(a.planExcerpt)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `planExcerpt non presente nel piano per ${a.id}.`,
      422,
    );
  }
  if (
    !Array.isArray(a.choices) ||
    a.choices.length < LIMITS.minChoices ||
    a.choices.length > LIMITS.maxChoices
  ) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `La carta ${a.id} deve avere 2 o 3 scelte.`,
      422,
    );
  }
  for (const choice of a.choices) {
    if (!choice || typeof choice !== "object" || !isNonEmptyString((choice as Choice).id)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `Scelta senza id in ${a.id}.`,
        422,
      );
    }
  }
  assertUniqueIds(
    a.choices.map((c) => c.id),
    `scelte di ${a.id}`,
  );
  let confirmCount = 0;
  for (const choice of a.choices) {
    validateChoice(choice, a.id);
    if (choice.effect === "confirm") confirmCount += 1;
  }
  if (confirmCount !== 1) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `La carta ${a.id} deve avere esattamente una scelta confirm.`,
      422,
    );
  }
  if (
    !Array.isArray(a.affectedTaskIds) ||
    a.affectedTaskIds.length < 1
  ) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `La carta ${a.id} deve riferirsi ad almeno un task.`,
      422,
    );
  }
  for (const taskId of a.affectedTaskIds) {
    if (!isNonEmptyString(taskId)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `affectedTaskId non valido in ${a.id}.`,
        422,
      );
    }
  }
  assertUniqueIds(a.affectedTaskIds, `affectedTaskIds di ${a.id}`);
  for (const taskId of a.affectedTaskIds) {
    if (!taskIds.has(taskId)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `affectedTaskId sconosciuto ${taskId} in ${a.id}.`,
        422,
      );
    }
  }
}

function validateTask(task: unknown, plan: string, allIds: Set<string>): void {
  if (!task || typeof task !== "object") {
    throw new SpecOpsError("INVALID_ANALYSIS", "Task non valido.", 422);
  }
  const t = task as Task;
  if (!isNonEmptyString(t.id)) {
    throw new SpecOpsError("INVALID_ANALYSIS", "Task senza id.", 422);
  }
  if (!isNonEmptyString(t.title)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `Titolo task mancante per ${t.id}.`,
      422,
    );
  }
  if (!isNonEmptyString(t.planExcerpt)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `planExcerpt mancante o vuoto per task ${t.id}.`,
      422,
    );
  }
  assertStringLength(t.title, LIMITS.taskTitle, "Titolo task", "INVALID_ANALYSIS");
  assertStringLength(t.planExcerpt, LIMITS.excerpt, "planExcerpt task", "INVALID_ANALYSIS");
  if (!plan.includes(t.planExcerpt)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `planExcerpt non presente nel piano per task ${t.id}.`,
      422,
    );
  }
  if (!Array.isArray(t.dependsOnTaskIds)) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      `dependsOnTaskIds non valido per ${t.id}.`,
      422,
    );
  }
  for (const dep of t.dependsOnTaskIds) {
    if (!isNonEmptyString(dep)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `Dipendenza non valida in ${t.id}.`,
        422,
      );
    }
  }
  assertUniqueIds(t.dependsOnTaskIds, `dipendenze di ${t.id}`);
  for (const dep of t.dependsOnTaskIds) {
    if (!allIds.has(dep)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `Dipendenza sconosciuta ${dep} in ${t.id}.`,
        422,
      );
    }
    if (dep === t.id) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        `Self-dependency in ${t.id}.`,
        422,
      );
    }
  }
}

function assertAcyclic(tasks: Task[]): void {
  const deps = new Map(tasks.map((t) => [t.id, t.dependsOnTaskIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new SpecOpsError(
        "INVALID_ANALYSIS",
        "Il grafo dei task contiene un ciclo.",
        422,
      );
    }
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      dfs(dep);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const task of tasks) {
    dfs(task.id);
  }
}

export function validateAnalyzeInput(spec: unknown, plan: unknown): {
  spec: string;
  plan: string;
} {
  if (typeof spec !== "string" || typeof plan !== "string") {
    throw new SpecOpsError(
      "INVALID_INPUT",
      "Spec e piano devono essere stringhe non vuote.",
      400,
    );
  }
  const trimmedSpec = spec.trim();
  const trimmedPlan = plan.trim();
  if (!trimmedSpec || !trimmedPlan) {
    throw new SpecOpsError(
      "INVALID_INPUT",
      "Spec e piano sono obbligatori e non possono essere vuoti.",
      400,
    );
  }
  if (spec.length > LIMITS.maxInputChars || plan.length > LIMITS.maxInputChars) {
    throw new SpecOpsError(
      "INVALID_INPUT",
      `Spec e piano non possono superare ${LIMITS.maxInputChars} caratteri ciascuno.`,
      400,
    );
  }
  return { spec, plan };
}

export function validateAnalysis(analysis: unknown): Analysis {
  if (!analysis || typeof analysis !== "object") {
    throw new SpecOpsError("INVALID_ANALYSIS", "Analysis non valida.", 422);
  }
  const a = analysis as Analysis;
  if (!isNonEmptyString(a.id)) {
    throw new SpecOpsError("INVALID_ANALYSIS", "Analysis senza id.", 422);
  }
  if (a.mode !== "mock" && a.mode !== "live") {
    throw new SpecOpsError("INVALID_ANALYSIS", "Mode non valido.", 422);
  }
  if (
    !a.source ||
    typeof a.source.spec !== "string" ||
    typeof a.source.plan !== "string"
  ) {
    throw new SpecOpsError("INVALID_ANALYSIS", "Source non valido.", 422);
  }
  if (!Array.isArray(a.tasks) || a.tasks.length > LIMITS.maxTasks) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      "I task devono essere un array di al massimo 12 elementi.",
      422,
    );
  }
  if (
    !Array.isArray(a.assumptions) ||
    a.assumptions.length > LIMITS.maxAssumptions
  ) {
    throw new SpecOpsError(
      "INVALID_ANALYSIS",
      "Le assunzioni devono essere un array di al massimo 3 elementi.",
      422,
    );
  }

  assertUniqueIds(
    a.tasks.map((t) => {
      if (!t || typeof t !== "object" || !isNonEmptyString((t as Task).id)) {
        throw new SpecOpsError("INVALID_ANALYSIS", "Task senza id.", 422);
      }
      return (t as Task).id;
    }),
    "tasks",
  );
  assertUniqueIds(
    a.assumptions.map((x) => {
      if (!x || typeof x !== "object" || !isNonEmptyString((x as Assumption).id)) {
        throw new SpecOpsError("INVALID_ANALYSIS", "Assunzione senza id.", 422);
      }
      return (x as Assumption).id;
    }),
    "assumptions",
  );

  const taskIds = new Set(
    a.tasks.map((t) => (t as Task).id),
  );
  for (const task of a.tasks) {
    validateTask(task, a.source.plan, taskIds);
  }
  assertAcyclic(a.tasks as Task[]);
  for (const assumption of a.assumptions) {
    validateAssumption(assumption, taskIds, a.source.plan);
  }

  return a;
}

export { LIMITS };
