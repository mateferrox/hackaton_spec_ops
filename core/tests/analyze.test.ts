import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { DEMO_PLAN, DEMO_SPEC, DEMO_ANALYSIS } from "../src/fixture.js";
import { SpecOpsError } from "../src/errors.js";

describe("analyze", () => {
  it("returns the canonical mock analysis for exact demo texts", () => {
    const result = analyze({ spec: DEMO_SPEC, plan: DEMO_PLAN, mode: "mock" });
    expect(result).toEqual(DEMO_ANALYSIS);
  });

  it("accepts whitespace-normalized demo texts in mock mode", () => {
    const result = analyze({
      spec: `  ${DEMO_SPEC}\n`,
      plan: `\n${DEMO_PLAN}\n`,
      mode: "mock",
    });
    expect(result.id).toBe("demo-rooms-v1");
    expect(result.source).toEqual({ spec: DEMO_SPEC, plan: DEMO_PLAN });
  });

  it("rejects non-demo mock input with MOCK_INPUT_MISMATCH", () => {
    try {
      analyze({
        spec: "Una spec diversa.",
        plan: DEMO_PLAN,
        mode: "mock",
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      const e = err as SpecOpsError;
      expect(e.code).toBe("MOCK_INPUT_MISMATCH");
      expect(e.status).toBe(400);
      expect(e.retryable).toBe(false);
      expect(e.message).toMatch(/scenario demo/i);
    }
  });

  it("rejects empty or oversized inputs", () => {
    expect(() =>
      analyze({ spec: "   ", plan: DEMO_PLAN, mode: "mock" }),
    ).toThrow(SpecOpsError);
    expect(() =>
      analyze({ spec: DEMO_SPEC, plan: "", mode: "mock" }),
    ).toThrow(SpecOpsError);
    expect(() =>
      analyze({
        spec: "x".repeat(20_001),
        plan: DEMO_PLAN,
        mode: "mock",
      }),
    ).toThrow(SpecOpsError);
  });

  it("returns LIVE_NOT_CONFIGURED for live mode", () => {
    try {
      analyze({ spec: DEMO_SPEC, plan: DEMO_PLAN, mode: "live" });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecOpsError);
      const e = err as SpecOpsError;
      expect(e.code).toBe("LIVE_NOT_CONFIGURED");
      expect(e.status).toBe(503);
      expect(e.retryable).toBe(false);
    }
  });

  it("isolates returned analysis from later analyze calls", () => {
    const first = analyze({ spec: DEMO_SPEC, plan: DEMO_PLAN, mode: "mock" });
    first.tasks[0]!.id = "mutated";
    first.assumptions[0]!.title = "mutated title";
    const second = analyze({ spec: DEMO_SPEC, plan: DEMO_PLAN, mode: "mock" });
    expect(second.tasks[0]!.id).toBe("t1");
    expect(second.assumptions[0]!.title).toBe(DEMO_ANALYSIS.assumptions[0]!.title);
  });
});
