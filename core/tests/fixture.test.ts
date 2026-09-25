import { describe, expect, it } from "vitest";
import { DEMO_ANALYZE_REQUEST, DEMO_ANALYSIS, DEMO_PLAN, DEMO_SPEC } from "../src/fixture.js";
import { normalizeWhitespace } from "../src/normalize.js";

describe("canonical rooms fixture", () => {
  it("exposes exact demo texts and mock analyze request", () => {
    expect(DEMO_SPEC).toBe(
      "Un'app per prenotare sale riunioni. Gli utenti vedono la disponibilità, prenotano e possono cancellare.",
    );
    expect(DEMO_PLAN).toBe(
      [
        "T1. Implementare login obbligatorio per prenotare.",
        "T2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.",
        "T3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.",
        "T4. Inviare un'email con le condizioni di cancellazione. Dipende da T3.",
      ].join("\n"),
    );
    expect(DEMO_ANALYZE_REQUEST).toEqual({
      spec: DEMO_SPEC,
      plan: DEMO_PLAN,
      mode: "mock",
    });
  });

  it("builds the demo analysis with stable ids and dependencies", () => {
    expect(DEMO_ANALYSIS.id).toBe("demo-rooms-v1");
    expect(DEMO_ANALYSIS.mode).toBe("mock");
    expect(DEMO_ANALYSIS.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(DEMO_ANALYSIS.tasks.map((t) => t.dependsOnTaskIds)).toEqual([
      [],
      ["t1"],
      ["t2"],
      ["t3"],
    ]);
    for (const task of DEMO_ANALYSIS.tasks) {
      expect(DEMO_PLAN.includes(task.planExcerpt)).toBe(true);
    }
    expect(DEMO_ANALYSIS.assumptions.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    for (const assumption of DEMO_ANALYSIS.assumptions) {
      expect(assumption.kind).toBe("unspecified");
      expect(assumption.choices).toHaveLength(2);
      expect(assumption.choices.filter((c) => c.effect === "confirm")).toHaveLength(1);
      expect(assumption.choices.filter((c) => c.effect === "revise")).toHaveLength(1);
      expect(DEMO_PLAN.includes(assumption.planExcerpt)).toBe(true);
    }
  });

  it("treats whitespace-normalized demo texts as matching", () => {
    const paddedSpec = `  ${DEMO_SPEC}  \n`;
    const paddedPlan = `\n${DEMO_PLAN.replace(/\n/g, "  \n  ")}\n`;
    expect(normalizeWhitespace(paddedSpec)).toBe(normalizeWhitespace(DEMO_SPEC));
    expect(normalizeWhitespace(paddedPlan)).toBe(normalizeWhitespace(DEMO_PLAN));
  });
});
