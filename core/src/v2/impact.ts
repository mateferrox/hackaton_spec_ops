import type { MissionAnswer, MissionTask, Rule } from "./contracts.js";
import { transitiveDependents } from "./dag.js";

export interface ImpactUpdate {
  taskId: string;
  needsReview: boolean;
  reviewCauseIds: string[];
}

/**
 * Recalculate needsReview from active conflict/unspecified answers.
 * Execution status is left untouched.
 */
export function recomputeReviewFlags(
  tasks: MissionTask[],
  activeAnswers: MissionAnswer[],
): ImpactUpdate[] {
  const directCauses = new Map<string, Set<string>>();

  for (const answer of activeAnswers) {
    const classification = answer.assessmentSnapshot.classification;
    if (classification !== "conflict" && classification !== "unspecified") {
      continue;
    }
    for (const taskId of answer.assessmentSnapshot.affectedTaskIds) {
      let set = directCauses.get(taskId);
      if (!set) {
        set = new Set();
        directCauses.set(taskId, set);
      }
      set.add(answer.questionId);
    }
  }

  const seed = [...directCauses.keys()];
  const transitive = transitiveDependents(
    tasks.map((t) => ({ id: t.id, dependsOnTaskIds: t.dependsOnTaskIds })),
    seed,
  );

  const updates: ImpactUpdate[] = tasks.map((task) => {
    const direct = directCauses.get(task.id);
    const causes = new Set<string>(direct ? [...direct] : []);
    if (!direct && transitive.includes(task.id)) {
      for (const [seedId, seedCauses] of directCauses) {
        const depends = taskDependsOn(tasks, task.id, seedId);
        if (depends) {
          for (const c of seedCauses) causes.add(c);
        }
      }
    }
    return {
      taskId: task.id,
      needsReview: causes.size > 0,
      reviewCauseIds: [...causes],
    };
  });

  return updates;
}

function taskDependsOn(
  tasks: MissionTask[],
  taskId: string,
  ancestorId: string,
): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  function walk(id: string): boolean {
    if (id === ancestorId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const t = byId.get(id);
    if (!t) return false;
    return t.dependsOnTaskIds.some(walk);
  }
  return walk(taskId);
}

export function buildBriefMarkdown(input: {
  title: string;
  specVersion: number;
  rules: Rule[];
  activeAnswers: MissionAnswer[];
  tasks: MissionTask[];
}): string {
  const confirmed = input.activeAnswers.filter(
    (a) => a.assessmentSnapshot.classification === "aligned",
  );
  const conflicts = input.activeAnswers.filter(
    (a) => a.assessmentSnapshot.classification === "conflict",
  );
  const open = input.activeAnswers.filter(
    (a) =>
      a.assessmentSnapshot.classification === "unspecified" ||
      a.assessmentSnapshot.classification === "uncertain",
  );
  const review = input.tasks.filter((t) => t.needsReview);

  const lines: string[] = [
    `# Brief — ${input.title}`,
    "",
    `Spec versione ${input.specVersion}`,
    "",
    "## Regole confermate",
  ];
  if (input.rules.length === 0 && confirmed.length === 0) {
    lines.push("Nessuna");
  } else {
    for (const rule of input.rules) {
      lines.push(`- ${rule.statement}`);
    }
    for (const a of confirmed) {
      lines.push(`- Decisione allineata: ${a.assessmentSnapshot.explanation}`);
    }
  }

  lines.push("", "## Conflitti aperti");
  if (conflicts.length === 0) lines.push("Nessuna");
  else {
    for (const a of conflicts) {
      const ex = a.assessmentSnapshot.evidence?.excerpt;
      lines.push(
        `- ${a.assessmentSnapshot.explanation}${ex ? ` (regola: «${ex}»)` : ""}`,
      );
    }
  }

  lines.push("", "## Decisioni da formalizzare");
  if (open.length === 0) lines.push("Nessuna");
  else {
    for (const a of open) {
      lines.push(`- ${a.assessmentSnapshot.explanation}`);
    }
  }

  lines.push("", "## Task da rivalutare");
  if (review.length === 0) lines.push("Nessuna");
  else {
    for (const t of review) {
      lines.push(
        `- ${t.title} (cause: ${t.reviewCauseIds.join(", ") || "n/d"})`,
      );
    }
  }

  return lines.join("\n");
}
