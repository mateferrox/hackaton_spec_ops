import { createAppServer } from "../src/http.js";
import { resetDbForTests, closeDb } from "../src/v2/db.js";
import { resetMissionService } from "../src/v2/mission-service.js";
import type { AddressInfo } from "node:net";

resetDbForTests(":memory:");
resetMissionService();
const server = createAppServer({ dbPath: ":memory:" });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

async function j(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json();
  return { status: res.status, body };
}

const health = await j("/api/health");
console.log("health", health.body);

const specs = await j("/api/v2/specs");
console.log("specs", specs.body.specs.length);

const created = await j("/api/v2/missions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ specId: "rooms-v1", specVersion: 1, mode: "demo" }),
});
const id = created.body.mission.id;
console.log("created", id, created.body.mission.analysisPhase);

for (let i = 0; i < 30; i++) {
  const snap = await j(`/api/v2/missions/${id}`);
  if (snap.body.mission.analysisPhase !== "pending") {
    console.log("analysis", snap.body.mission.analysisPhase, "rules", snap.body.rules.length);
    break;
  }
  await new Promise((r) => setTimeout(r, 50));
}

let snap = await j(`/api/v2/missions/${id}`);
snap = await j(`/api/v2/missions/${id}/confirm-rules`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ specVersion: 1, rules: snap.body.rules }),
});
console.log("confirmed", snap.body.mission.rulesConfirmed, "exec", snap.body.mission.executionState);

const q = snap.body.visibleQuestion;
const aligned = q.choices.find((c: { assessment: { classification: string } }) => c.assessment.classification === "aligned");
const ans = await j(`/api/v2/missions/${id}/answers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    questionId: q.id,
    choiceId: aligned.id,
    specVersion: 1,
    idempotencyKey: "manual-1",
  }),
});
console.log("answer", ans.body.answer.assessmentSnapshot.classification);

const started = await j(`/api/v2/missions/${id}/start`, { method: "POST" });
console.log("started", started.body.mission.executionState);

const ctl = await j(`/api/v2/missions/${id}/control`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "pause", idempotencyKey: "manual-pause" }),
});
console.log("control", ctl.status, ctl.body);

await new Promise((r) => setTimeout(r, 250));
const after = await j(`/api/v2/missions/${id}`);
console.log("after pause", after.body.mission.executionState);

const brief = await j(`/api/v2/missions/${id}/brief`);
console.log("brief lines", brief.body.markdown.split("\n").length);

server.close();
closeDb();
resetMissionService();
console.log("OK");
