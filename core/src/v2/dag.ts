import { SpecOpsError } from "../errors.js";

export function validateTaskDag(
  tasks: Array<{ id: string; dependsOnTaskIds: string[] }>,
): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id || typeof task.id !== "string") {
      throw new SpecOpsError("INVALID_INPUT", "Task id non valido.", 400);
    }
    if (ids.has(task.id)) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        `Task id duplicato: ${task.id}.`,
        400,
      );
    }
    ids.add(task.id);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOnTaskIds) {
      if (!ids.has(dep)) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          `Dipendenza sconosciuta ${dep} per task ${task.id}.`,
          400,
        );
      }
      if (dep === task.id) {
        throw new SpecOpsError(
          "INVALID_INPUT",
          `Task ${task.id} dipende da se stesso.`,
          400,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  function dfs(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new SpecOpsError(
        "INVALID_INPUT",
        "Il grafo dei task contiene un ciclo.",
        400,
      );
    }
    visiting.add(id);
    const task = byId.get(id)!;
    for (const dep of task.dependsOnTaskIds) dfs(dep);
    visiting.delete(id);
    visited.add(id);
  }

  for (const task of tasks) dfs(task.id);
}

/** Transitive dependents: tasks that (transitively) depend on any of seedIds. */
export function transitiveDependents(
  tasks: Array<{ id: string; dependsOnTaskIds: string[] }>,
  seedIds: string[],
): string[] {
  const seeds = new Set(seedIds);
  const result: string[] = [];
  const seen = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (seen.has(task.id) || seeds.has(task.id)) continue;
      if (task.dependsOnTaskIds.some((d) => seeds.has(d) || seen.has(d))) {
        seen.add(task.id);
        result.push(task.id);
        changed = true;
      }
    }
  }
  return result;
}
