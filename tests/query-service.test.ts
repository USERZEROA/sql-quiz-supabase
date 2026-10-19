import test from "node:test";
import assert from "node:assert/strict";
import { executeAuditedQuery } from "../lib/query-service";
import { QUESTIONS } from "../lib/questions";
import { HttpError } from "../lib/input";
import type { QueryEvent } from "../lib/audit";

test("successful authenticated run logs actor, SQL, parameters and earned grade", async () => {
  const events: Array<{ actor: string; event: QueryEvent }> = [];
  const result = await executeAuditedQuery("verified-user", { questionId: 1, sql: QUESTIONS[0].sql, parameters: [] }, {
    run: async () => ({ ...QUESTIONS[0].expected, truncated: false, elapsedMs: 10 }),
    append: async (actor, event) => { events.push({ actor, event }); return "event-id"; }
  });
  assert.equal(result.grade?.earned, 4); assert.equal(result.auditId, "event-id");
  assert.equal(events[0].actor, "verified-user"); assert.equal(events[0].event.sql, QUESTIONS[0].sql);
  assert.equal(events[0].event.grade?.earned, 4);
});
test("preview is logged but receives no score", async () => {
  let event: QueryEvent | undefined;
  const result = await executeAuditedQuery("user", { sql: "SELECT * FROM safety_inspections" }, {
    run: async () => ({ ...QUESTIONS[0].expected, truncated: false, elapsedMs: 10 }),
    append: async (_actor, value) => { event = value; return "id"; }
  });
  assert.equal(result.grade, null); assert.equal(event?.action, "preview_data");
});
test("wrong answer executes successfully but earns zero", async () => {
  const result = await executeAuditedQuery("user", { questionId: 1, sql: "SELECT * FROM safety_inspections" }, {
    run: async () => ({ columns: ["x"], rows: [], truncated: false, elapsedMs: 1 }), append: async () => "id"
  });
  assert.equal(result.grade?.earned, 0);
});
test("execution rejection is audited and rethrown", async () => {
  const events: QueryEvent[] = [];
  await assert.rejects(() => executeAuditedQuery("user", { questionId: 1, sql: "DELETE FROM safety_inspections" }, {
    run: async () => { throw new HttpError(400, "Only SELECT."); },
    append: async (_actor, event) => { events.push(event); return "id"; }
  }), (e: unknown) => e instanceof HttpError && e.status === 400);
  assert.equal(events[0].outcome, "rejected");
});
test("audit failure does not produce a successful run response", async () => {
  await assert.rejects(() => executeAuditedQuery("user", { questionId: 1, sql: QUESTIONS[0].sql }, {
    run: async () => ({ ...QUESTIONS[0].expected, truncated: false, elapsedMs: 1 }),
    append: async () => { throw new HttpError(503, "Audit unavailable"); }
  }), (e: unknown) => e instanceof HttpError && e.status === 503);
});
test("client-supplied identity and score are ignored", async () => {
  let recordedActor = "";
  const result = await executeAuditedQuery("verified", { questionId: 1, sql: "SELECT * FROM safety_inspections", actor_id: "forged", score: 20 }, {
    run: async () => ({ columns: ["x"], rows: [], truncated: false, elapsedMs: 1 }),
    append: async (actor) => { recordedActor = actor; return "id"; }
  });
  assert.equal(recordedActor, "verified"); assert.equal(result.grade?.earned, 0);
});
