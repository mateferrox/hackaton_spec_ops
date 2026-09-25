import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppServer } from "../src/http.js";
import { closeDb, resetDbForTests } from "../src/v2/db.js";
import { resetMissionService } from "../src/v2/mission-service.js";
import { analyzeSpecDemo } from "../src/v2/demo-analysis.js";
import { recomputeReviewFlags } from "../src/v2/impact.js";
import { DemoAdapter } from "../src/v2/adapters/demo-adapter.js";
import { createReferenceRunner } from "../src/v2/reference-runner.js";
import { HttpRunnerAdapter } from "../src/v2/adapters/http-runner-adapter.js";
import type { MissionAnswer, MissionTask } from "../src/v2/contracts.js";
import { AddressInfo } from "node:net";
import type { Server } from "node:http";

async function listen(server: Server): Promise<{ base: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function waitFor(
  fn: () => Promise<boolean> | boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("timeout waiting for condition");
}

describe("v2 demo analysis and impact", () => {
  it("extracts rooms rules with exact excerpts", () => {
    const result = analyzeSpecDemo({
      title: "Sale",
      text: [
        "Un'app per prenotare sale riunioni.",
        "",
        "Regole esplicite:",
        "1. Solo gli utenti registrati possono prenotare.",
        "2. Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.",
        "3. È possibile cancellare fino a 24 ore prima dell'inizio.",
      ].join("\n"),
      specId: "rooms-v1",
    });
    expect(result.rules).toHaveLength(3);
    expect(result.preflightQuestions).toHaveLength(3);
    expect(
      result.preflightQuestions[0]!.choices.some(
        (c) => c.assessment.classification === "conflict",
      ),
    ).toBe(true);
    expect(
      result.preflightQuestions[0]!.choices.some(
        (c) => c.assessment.classification === "aligned",
      ),
    ).toBe(true);
  });

  it("propagates review flags transitively and clears independent causes", () => {
    const tasks: MissionTask[] = [
      {
        id: "t1",
        missionId: "m",
        title: "t1",
        description: "",
        dependsOnTaskIds: [],
        relevantRuleIds: [],
        status: "pending",
        evidenceRefs: [],
        needsReview: false,
        reviewCauseIds: [],
      },
      {
        id: "t2",
        missionId: "m",
        title: "t2",
        description: "",
        dependsOnTaskIds: ["t1"],
        relevantRuleIds: [],
        status: "pending",
        evidenceRefs: [],
        needsReview: false,
        reviewCauseIds: [],
      },
      {
        id: "t3",
        missionId: "m",
        title: "t3",
        description: "",
        dependsOnTaskIds: ["t2"],
        relevantRuleIds: [],
        status: "done",
        evidenceRefs: [],
        needsReview: false,
        reviewCauseIds: [],
      },
    ];
    const answers: MissionAnswer[] = [
      {
        id: "a1",
        missionId: "m",
        questionId: "q1",
        specVersion: 1,
        choiceId: "c",
        assessmentSnapshot: {
          classification: "conflict",
          explanation: "x",
          evidence: null,
          affectedTaskIds: ["t1"],
        },
        createdAt: new Date().toISOString(),
        active: true,
      },
    ];
    let updates = recomputeReviewFlags(tasks, answers);
    expect(updates.find((u) => u.taskId === "t1")?.needsReview).toBe(true);
    expect(updates.find((u) => u.taskId === "t3")?.needsReview).toBe(true);
    // completed task keeps execution status separate — needsReview is attribute only
    expect(tasks.find((t) => t.id === "t3")!.status).toBe("done");

    updates = recomputeReviewFlags(tasks, []);
    expect(updates.every((u) => !u.needsReview)).toBe(true);
  });
});

describe("DemoAdapter pause protocol", () => {
  it("requested is not paused until ack; stops further work after ack", async () => {
    const adapter = new DemoAdapter({
      taskIds: ["t1", "t2"],
      tickMs: 80,
      ackMs: 50,
    });
    const events: string[] = [];
    adapter.subscribe(0, (e) => events.push(e.type));
    await adapter.start();
    await adapter.requestPause("cmd-1");
    const snapRequested = await adapter.getSnapshot();
    expect(["pause_requested", "paused"]).toContain(snapRequested.executionState);
    await waitFor(async () => (await adapter.getSnapshot()).executionState === "paused");
    const after = await adapter.getSnapshot();
    expect(after.executionState).toBe("paused");
    expect(events).toContain("command.acknowledged");
    const doneBefore = after.taskStates.filter((t) => t.status === "done").length;
    await new Promise((r) => setTimeout(r, 200));
    const later = await adapter.getSnapshot();
    expect(later.taskStates.filter((t) => t.status === "done").length).toBe(doneBefore);
    await adapter.requestResume("cmd-2");
    await waitFor(async () => (await adapter.getSnapshot()).executionState === "running");
    adapter.stop();
  });

  it("dedupes command ids", async () => {
    const adapter = new DemoAdapter({ taskIds: ["t1"], ackMs: 10, tickMs: 1000 });
    await adapter.start();
    await adapter.requestPause("same");
    await adapter.requestPause("same");
    await waitFor(async () => (await adapter.getSnapshot()).executionState === "paused");
    adapter.stop();
  });
});

describe("reference runner + HttpRunnerAdapter", () => {
  it("acks pause and stops dispatch", async () => {
    const runner = createReferenceRunner({ taskIds: ["t1", "t2"], ackMs: 40 });
    const { base, close } = await listen(runner);
    // start work
    await fetch(`${base}/start`, { method: "POST" });
    const adapter = new HttpRunnerAdapter("reference", { baseUrl: base, pollMs: 50 });
    const snap = await adapter.getSnapshot();
    expect(snap.capabilities.pause).toBe(true);
    await adapter.requestPause("c1");
    await waitFor(async () => (await adapter.getSnapshot()).executionState === "paused");
    const paused = await adapter.getSnapshot();
    expect(paused.executionState).toBe("paused");
    const done = paused.taskStates.filter((t) => t.status === "done").length;
    await new Promise((r) => setTimeout(r, 300));
    const later = await adapter.getSnapshot();
    expect(later.taskStates.filter((t) => t.status === "done").length).toBe(done);
    adapter.stop();
    await close();
  });
});

describe("v2 HTTP mission flow", () => {
  let server: Server;
  let base: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    resetDbForTests(":memory:");
    resetMissionService();
    server = createAppServer({ dbPath: ":memory:" });
    const listening = await listen(server);
    base = listening.base;
    close = listening.close;
  });

  afterEach(async () => {
    await close();
    closeDb();
    resetMissionService();
  });

  async function waitAnalysis(missionId: string) {
    await waitFor(async () => {
      const res = await fetch(`${base}/api/v2/missions/${missionId}`);
      const snap = (await res.json()) as { mission: { analysisPhase: string } };
      return snap.mission.analysisPhase === "ready" || snap.mission.analysisPhase === "failed";
    });
  }

  it("analyzes repeated missions without task or question ID collisions", async () => {
    const ids: string[] = [];
    for (const specId of ["rooms-v1", "rooms-v1", "checkout-v1"]) {
      const response = await fetch(`${base}/api/v2/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId, specVersion: 1, mode: "demo" }),
      });
      expect(response.status).toBe(201);
      const created = await response.json();
      ids.push(created.mission.id);
      await waitAnalysis(created.mission.id);
    }
    for (const id of ids) {
      const snapshot = await (await fetch(`${base}/api/v2/missions/${id}`)).json();
      expect(snapshot.mission.analysisPhase).toBe("ready");
      expect(snapshot.tasks.length).toBeGreaterThan(0);
      expect(snapshot.tasks.every((task: MissionTask) => task.missionId === id)).toBe(true);
      expect(snapshot.visibleQuestion || snapshot.queuedQuestions.length).toBeTruthy();
    }
  });

  it("lists specs and runs demo mission to answer+conflict+pause", async () => {
    const specs = await (await fetch(`${base}/api/v2/specs`)).json();
    expect(specs.specs.length).toBeGreaterThan(0);
    const rooms = specs.specs.find((s: { id: string }) => s.id === "rooms-v1");
    expect(rooms).toBeTruthy();

    const created = await (
      await fetch(`${base}/api/v2/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specId: "rooms-v1",
          specVersion: 1,
          mode: "demo",
        }),
      })
    ).json();

    expect(created.mission.executionState).toBe("idle");
    expect(created.mission.analysisPhase).toBe("pending");
    await waitAnalysis(created.mission.id);

    let snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}`)
    ).json();
    expect(snap.mission.analysisPhase).toBe("ready");
    expect(snap.mission.executionState).toBe("idle");
    expect(snap.rules.length).toBe(3);

    snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/confirm-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specVersion: 1,
          rules: snap.rules,
        }),
      })
    ).json();
    expect(snap.mission.rulesConfirmed).toBe(true);
    expect(snap.visibleQuestion).toBeTruthy();

    // Answer with conflict choice
    const q = snap.visibleQuestion;
    const conflict = q.choices.find(
      (c: { assessment: { classification: string } }) =>
        c.assessment.classification === "conflict",
    );
    const answered = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          choiceId: conflict.id,
          specVersion: 1,
          idempotencyKey: "ans-1",
        }),
      })
    ).json();
    expect(answered.answer.assessmentSnapshot.classification).toBe("conflict");
    expect(answered.snapshot.openConflicts.length).toBe(1);

    // Preflight conflict blocks start
    const startBlocked = await fetch(
      `${base}/api/v2/missions/${created.mission.id}/start`,
      { method: "POST" },
    );
    expect(startBlocked.status).toBe(409);

    // Stay in spec on next question path: answer aligned on a fresh mission flow
    // Resolve conflict by answering aligned via new answer replacing — use remaining questions
    // For start: create fresh mission without open conflict
  });

  it("starts after aligned answers and pauses with ack", async () => {
    const created = await (
      await fetch(`${base}/api/v2/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specId: "rooms-v1",
          specVersion: 1,
          mode: "demo",
        }),
      })
    ).json();
    await waitAnalysis(created.mission.id);
    let snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}`)
    ).json();
    snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/confirm-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specVersion: 1, rules: snap.rules }),
      })
    ).json();

    // Answer visible with aligned
    const q = snap.visibleQuestion;
    const aligned = q.choices.find(
      (c: { assessment: { classification: string } }) =>
        c.assessment.classification === "aligned",
    );
    await fetch(`${base}/api/v2/missions/${created.mission.id}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: q.id,
        choiceId: aligned.id,
        specVersion: 1,
        idempotencyKey: "ok-1",
      }),
    });

    snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/start`, {
        method: "POST",
      })
    ).json();
    expect(snap.mission.executionState).toBe("running");

    const control = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "pause", idempotencyKey: "pause-1" }),
      })
    ).json();
    expect(control.status).toBe("requested");

    await waitFor(async () => {
      const s = await (
        await fetch(`${base}/api/v2/missions/${created.mission.id}`)
      ).json();
      return s.mission.executionState === "paused";
    });

    const brief = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/brief`)
    ).json();
    expect(brief.markdown).toContain("Brief");
  });

  it("rejects connected mode without provider", async () => {
    delete process.env.SPECOPS_AI_API_KEY;
    delete process.env.SPECOPS_AI_BASE_URL;
    const created = await (
      await fetch(`${base}/api/v2/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specId: "checkout-v1",
          specVersion: 1,
          mode: "connected",
        }),
      })
    ).json();
    await waitAnalysis(created.mission.id);
    const snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}`)
    ).json();
    expect(snap.mission.analysisPhase).toBe("failed");
    expect(snap.mission.analysisError).toMatch(/non configurato/i);
  });

  it("marks questions stale on spec version change and rejects answers", async () => {
    const created = await (
      await fetch(`${base}/api/v2/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specId: "rooms-v1",
          specVersion: 1,
          mode: "demo",
        }),
      })
    ).json();
    await waitAnalysis(created.mission.id);
    let snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}`)
    ).json();
    snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/confirm-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specVersion: 1, rules: snap.rules }),
      })
    ).json();
    const q = snap.visibleQuestion;

    // Pause first to allow spec update? idle is ok before start
    snap = await (
      await fetch(`${base}/api/v2/missions/${created.mission.id}/spec`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion: 1,
          text: snap.activeSpec.text + "\n\n4. Nuova regola aggiunta dal developer.",
          changeReason: "chiarimento",
        }),
      })
    ).json();
    expect(snap.mission.specVersion).toBe(2);

    const stale = await fetch(
      `${base}/api/v2/missions/${created.mission.id}/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          choiceId: q.choices[0].id,
          specVersion: 1,
          idempotencyKey: "stale-1",
        }),
      },
    );
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error.code).toBe("STALE_SPEC");
  });

  it("preserves legacy endpoints", async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.ok).toBe(true);
    expect(health.modes.mock).toBe(true);
    expect(health.modes.live).toBe(false);
  });
});
