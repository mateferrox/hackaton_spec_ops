import type {
  Analysis,
  Answer,
  Assumption,
  Choice,
  Resolution,
  ResolveRequest,
  TaskResolution,
} from "./contracts.js";
import { SpecOpsError } from "./errors.js";
import { validateAnalysis } from "./validate.js";

function buildDependentsIndex(analysis: Analysis): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const task of analysis.tasks) {
    dependents.set(task.id, []);
  }
  for (const task of analysis.tasks) {
    for (const dep of task.dependsOnTaskIds) {
      dependents.get(dep)!.push(task.id);
    }
  }
  return dependents;
}

function collectTransitiveDependents(
  rootTaskIds: string[],
  dependents: Map<string, string[]>,
): Set<string> {
  const result = new Set<string>();
  const queue = [...rootTaskIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of dependents.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

function orderCauses(
  causeIds: Iterable<string>,
  assumptionOrder: string[],
): string[] {
  const set = new Set(causeIds);
  return assumptionOrder.filter((id) => set.has(id));
}

function findChoice(
  assumption: Assumption,
  choiceId: string,
): Choice {
  const choice = assumption.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new SpecOpsError(
      "INVALID_ANSWER",
      `choiceId sconosciuto "${choiceId}" per ${assumption.id}.`,
      422,
    );
  }
  return choice;
}

function validateAnswers(analysis: Analysis, answers: Answer[]): Map<
  string,
  { assumption: Assumption; choice: Choice }
> {
  if (!Array.isArray(answers)) {
    throw new SpecOpsError(
      "INVALID_ANSWER",
      "answers deve essere un array.",
      422,
    );
  }

  const byAssumption = new Map<
    string,
    { assumption: Assumption; choice: Choice }
  >();
  const assumptionById = new Map(
    analysis.assumptions.map((a) => [a.id, a]),
  );

  for (const answer of answers) {
    if (
      !answer ||
      typeof answer.assumptionId !== "string" ||
      typeof answer.choiceId !== "string"
    ) {
      throw new SpecOpsError(
        "INVALID_ANSWER",
        "Ogni risposta richiede assumptionId e choiceId.",
        422,
      );
    }
    if (byAssumption.has(answer.assumptionId)) {
      throw new SpecOpsError(
        "INVALID_ANSWER",
        `Risposta duplicata per ${answer.assumptionId}.`,
        422,
      );
    }
    const assumption = assumptionById.get(answer.assumptionId);
    if (!assumption) {
      throw new SpecOpsError(
        "INVALID_ANSWER",
        `assumptionId sconosciuto "${answer.assumptionId}".`,
        422,
      );
    }
    const choice = findChoice(assumption, answer.choiceId);
    byAssumption.set(answer.assumptionId, { assumption, choice });
  }

  return byAssumption;
}

function buildBrief(
  analysis: Analysis,
  answered: Map<string, { assumption: Assumption; choice: Choice }>,
  taskStates: TaskResolution[],
): string {
  const confirmed: string[] = [];
  const revised: string[] = [];
  const open: string[] = [];

  for (const assumption of analysis.assumptions) {
    const selected = answered.get(assumption.id);
    if (!selected) {
      open.push(assumption.question);
      continue;
    }
    if (selected.choice.effect === "confirm") {
      confirmed.push(selected.choice.instruction);
    } else {
      revised.push(selected.choice.instruction);
    }
  }

  const toReview = taskStates.filter((t) => t.status === "needs_review");
  const reviewLines = toReview.map((t) => {
    const task = analysis.tasks.find((x) => x.id === t.taskId)!;
    const direct =
      t.directCauseIds.length > 0
        ? `cause dirette: ${t.directCauseIds.join(", ")}`
        : "cause dirette: nessuna";
    const upstream =
      t.upstreamCauseIds.length > 0
        ? `cause transitive: ${t.upstreamCauseIds.join(", ")}`
        : "cause transitive: nessuna";
    return `- ${task.id} (${task.title}): ${direct}; ${upstream}`;
  });

  const confirmedBody =
    confirmed.length === 0 ? "Nessuna" : confirmed.map((l) => `- ${l}`).join("\n");
  const revisedBody =
    revised.length === 0 ? "Nessuna" : revised.map((l) => `- ${l}`).join("\n");
  const openBody =
    open.length === 0 ? "Nessuna" : open.map((l) => `- ${l}`).join("\n");
  const reviewBody =
    reviewLines.length === 0 ? "Nessuna" : reviewLines.join("\n");

  return [
    `## Regole confermate\n\n${confirmedBody}`,
    `## Regole da cambiare\n\n${revisedBody}`,
    `## Decisioni aperte\n\n${openBody}`,
    `## Task da rivalutare\n\n${reviewBody}`,
  ].join("\n\n");
}

export function resolve(request: ResolveRequest): Resolution {
  const analysis = validateAnalysis(request.analysis);
  const answered = validateAnswers(analysis, request.answers);
  const assumptionOrder = analysis.assumptions.map((a) => a.id);
  const dependents = buildDependentsIndex(analysis);

  const directCauses = new Map<string, Set<string>>();
  const upstreamCauses = new Map<string, Set<string>>();
  for (const task of analysis.tasks) {
    directCauses.set(task.id, new Set());
    upstreamCauses.set(task.id, new Set());
  }

  let confirmed = 0;
  let revised = 0;

  for (const { assumption, choice } of answered.values()) {
    if (choice.effect === "confirm") {
      confirmed += 1;
      continue;
    }
    revised += 1;
    for (const taskId of assumption.affectedTaskIds) {
      directCauses.get(taskId)!.add(assumption.id);
    }
    const transitive = collectTransitiveDependents(
      assumption.affectedTaskIds,
      dependents,
    );
    for (const taskId of transitive) {
      upstreamCauses.get(taskId)!.add(assumption.id);
    }
  }

  const taskStates: TaskResolution[] = analysis.tasks.map((task) => {
    const direct = orderCauses(directCauses.get(task.id)!, assumptionOrder);
    const upstreamRaw = orderCauses(
      upstreamCauses.get(task.id)!,
      assumptionOrder,
    );
    // If a cause is both direct and transitive, keep it only in direct.
    const directSet = new Set(direct);
    const upstream = upstreamRaw.filter((id) => !directSet.has(id));
    const status =
      direct.length > 0 || upstream.length > 0 ? "needs_review" : "proposed";
    return {
      taskId: task.id,
      status,
      directCauseIds: direct,
      upstreamCauseIds: upstream,
    };
  });

  const total = analysis.assumptions.length;
  const answeredCount = confirmed + revised;
  const progress = {
    total,
    answered: answeredCount,
    confirmed,
    revised,
    pending: total - answeredCount,
  };

  return {
    analysisId: analysis.id,
    progress,
    taskStates,
    briefMarkdown: buildBrief(analysis, answered, taskStates),
  };
}
