import { describe, expect, it } from "vitest";
import { DEMO_ANALYSIS } from "../src/fixture.js";
import { resolve } from "../src/resolve.js";
import { SpecOpsError } from "../src/errors.js";
import type { Analysis, Answer } from "../src/contracts.js";

const emptyAssumptionsAnalysis: Analysis = {
  ...DEMO_ANALYSIS,
  id: "empty-cards",
  assumptions: [],
};

describe("resolve", () => {
  it("keeps all tasks proposed when there are no answers", () => {
    const result = resolve({ analysis: DEMO_ANALYSIS, answers: [] });
    expect(result.progress).toEqual({
      total: 3,
      answered: 0,
      confirmed: 0,
      revised: 0,
      pending: 3,
    });
    expect(result.taskStates.every((t) => t.status === "proposed")).toBe(true);
    expect(result.briefMarkdown).toContain("## Decisioni aperte");
    expect(result.briefMarkdown).toContain("Chi può prenotare?");
  });

  it("marks no tasks for review when all answers confirm", () => {
    const answers: Answer[] = [
      { assumptionId: "a1", choiceId: "account" },
      { assumptionId: "a2", choiceId: "fixed" },
      { assumptionId: "a3", choiceId: "day_before" },
    ];
    const result = resolve({ analysis: DEMO_ANALYSIS, answers });
    expect(result.progress).toEqual({
      total: 3,
      answered: 3,
      confirmed: 3,
      revised: 0,
      pending: 0,
    });
    expect(result.taskStates.every((t) => t.status === "proposed")).toBe(true);
    expect(result.briefMarkdown).toContain("## Regole confermate");
    expect(result.briefMarkdown).toContain(
      "Consentire la prenotazione solo agli utenti registrati con account.",
    );
    expect(result.briefMarkdown).toMatch(/## Task da rivalutare\n\nNessuna/);
  });

  it("propagates a3 revise to t3 direct and t4 upstream", () => {
    const result = resolve({
      analysis: DEMO_ANALYSIS,
      answers: [{ assumptionId: "a3", choiceId: "until_start" }],
    });
    expect(result.progress).toEqual({
      total: 3,
      answered: 1,
      confirmed: 0,
      revised: 1,
      pending: 2,
    });
    const byId = Object.fromEntries(result.taskStates.map((t) => [t.taskId, t]));
    expect(byId.t1.status).toBe("proposed");
    expect(byId.t2.status).toBe("proposed");
    expect(byId.t3).toMatchObject({
      status: "needs_review",
      directCauseIds: ["a3"],
      upstreamCauseIds: [],
    });
    expect(byId.t4).toMatchObject({
      status: "needs_review",
      directCauseIds: [],
      upstreamCauseIds: ["a3"],
    });
    expect(result.briefMarkdown).toContain(
      "Consentire la cancellazione fino all'inizio della prenotazione.",
    );
  });

  it("propagates a1 revise through the full dependency chain", () => {
    const result = resolve({
      analysis: DEMO_ANALYSIS,
      answers: [{ assumptionId: "a1", choiceId: "guests" }],
    });
    const byId = Object.fromEntries(result.taskStates.map((t) => [t.taskId, t]));
    expect(byId.t1.directCauseIds).toEqual(["a1"]);
    expect(byId.t2.upstreamCauseIds).toEqual(["a1"]);
    expect(byId.t3.upstreamCauseIds).toEqual(["a1"]);
    expect(byId.t4.upstreamCauseIds).toEqual(["a1"]);
  });

  it("removes only a1 effects when a1 is later confirmed while a3 stays revised", () => {
    const bothRevised = resolve({
      analysis: DEMO_ANALYSIS,
      answers: [
        { assumptionId: "a1", choiceId: "guests" },
        { assumptionId: "a3", choiceId: "until_start" },
      ],
    });
    expect(
      bothRevised.taskStates.find((t) => t.taskId === "t1")?.directCauseIds,
    ).toEqual(["a1"]);

    const a1Confirmed = resolve({
      analysis: DEMO_ANALYSIS,
      answers: [
        { assumptionId: "a1", choiceId: "account" },
        { assumptionId: "a3", choiceId: "until_start" },
      ],
    });
    const byId = Object.fromEntries(a1Confirmed.taskStates.map((t) => [t.taskId, t]));
    expect(byId.t1.status).toBe("proposed");
    expect(byId.t2.status).toBe("proposed");
    expect(byId.t3).toMatchObject({
      status: "needs_review",
      directCauseIds: ["a3"],
    });
    expect(byId.t4).toMatchObject({
      status: "needs_review",
      upstreamCauseIds: ["a3"],
    });
  });

  it("is stateless across repeated calls with changed answers", () => {
    resolve({
      analysis: DEMO_ANALYSIS,
      answers: [{ assumptionId: "a1", choiceId: "guests" }],
    });
    const cleared = resolve({ analysis: DEMO_ANALYSIS, answers: [] });
    expect(cleared.taskStates.every((t) => t.status === "proposed")).toBe(true);
  });

  it("handles zero assumptions", () => {
    const result = resolve({ analysis: emptyAssumptionsAnalysis, answers: [] });
    expect(result.progress).toEqual({
      total: 0,
      answered: 0,
      confirmed: 0,
      revised: 0,
      pending: 0,
    });
    expect(result.briefMarkdown).toMatch(/## Decisioni aperte\n\nNessuna/);
    expect(result.taskStates.every((t) => t.status === "proposed")).toBe(true);
  });

  it("rejects duplicate answers and unknown ids", () => {
    try {
      resolve({
        analysis: DEMO_ANALYSIS,
        answers: [
          { assumptionId: "a1", choiceId: "account" },
          { assumptionId: "a1", choiceId: "guests" },
        ],
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      expect((err as SpecOpsError).code).toBe("INVALID_ANSWER");
    }

    try {
      resolve({
        analysis: DEMO_ANALYSIS,
        answers: [{ assumptionId: "a9", choiceId: "account" }],
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      expect((err as SpecOpsError).code).toBe("INVALID_ANSWER");
    }

    try {
      resolve({
        analysis: DEMO_ANALYSIS,
        answers: [{ assumptionId: "a1", choiceId: "nope" }],
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      expect((err as SpecOpsError).code).toBe("INVALID_ANSWER");
    }
  });

  it("rejects invalid analysis graphs", () => {
    const cyclic: Analysis = {
      ...DEMO_ANALYSIS,
      tasks: [
        { ...DEMO_ANALYSIS.tasks[0]!, dependsOnTaskIds: ["t2"] },
        { ...DEMO_ANALYSIS.tasks[1]! },
        { ...DEMO_ANALYSIS.tasks[2]! },
        { ...DEMO_ANALYSIS.tasks[3]! },
      ],
    };
    expect(() => resolve({ analysis: cyclic, answers: [] })).toThrow(SpecOpsError);

    const inventedExcerpt: Analysis = {
      ...DEMO_ANALYSIS,
      tasks: [
        { ...DEMO_ANALYSIS.tasks[0]!, planExcerpt: "excerpt inventato" },
        ...DEMO_ANALYSIS.tasks.slice(1),
      ],
    };
    expect(() => resolve({ analysis: inventedExcerpt, answers: [] })).toThrow(
      SpecOpsError,
    );
  });

  it("rejects missing assumption title as INVALID_ANALYSIS", () => {
    const broken = structuredClone(DEMO_ANALYSIS) as Analysis;
    delete (broken.assumptions[0] as { title?: string }).title;
    try {
      resolve({ analysis: broken, answers: [] });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      const e = err as SpecOpsError;
      expect(e.code).toBe("INVALID_ANALYSIS");
      expect(e.status).toBe(422);
    }
  });

  it("rejects null task entries as INVALID_ANALYSIS", () => {
    const broken = structuredClone(DEMO_ANALYSIS) as Analysis;
    broken.tasks = [null as unknown as Analysis["tasks"][number], ...broken.tasks.slice(1)];
    try {
      resolve({ analysis: broken, answers: [] });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      const e = err as SpecOpsError;
      expect(e.code).toBe("INVALID_ANALYSIS");
      expect(e.status).toBe(422);
    }
  });

  it("rejects empty planExcerpt as INVALID_ANALYSIS", () => {
    const broken = structuredClone(DEMO_ANALYSIS) as Analysis;
    broken.tasks[0]!.planExcerpt = "";
    try {
      resolve({ analysis: broken, answers: [] });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      const e = err as SpecOpsError;
      expect(e.code).toBe("INVALID_ANALYSIS");
      expect(e.status).toBe(422);
    }
  });
});
