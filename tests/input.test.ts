import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, HttpError, readBody, validateSavedQuiz } from "../lib/input";
import { QUESTIONS, emptyAnswers } from "../lib/questions";

test("five SQL questions total exactly twenty points", () => {
  assert.equal(QUESTIONS.length, 5);
  assert.equal(QUESTIONS.reduce((sum, q) => sum + q.points, 0), 20);
  for (const q of QUESTIONS) { assert.ok(q.sql); assert.ok(q.hint); assert.ok(q.expected.rows.length); }
});
test("missing authentication is rejected", () => {
  assert.throws(() => bearerToken(new Request("http://localhost/api/query")), (e: unknown) => e instanceof HttpError && e.status === 401);
});
test("malformed authorization is rejected", () => {
  for (const header of ["Basic abc", "Bearer", "Bearer a b"]) {
    assert.throws(() => bearerToken(new Request("http://localhost", { headers: { Authorization: header } })));
  }
});
test("bearer extraction does not treat it as verified identity", () => {
  assert.equal(bearerToken(new Request("http://localhost", { headers: { Authorization: "Bearer token" } })), "token");
});
test("save accepts blank answers as a draft", () => {
  assert.deepEqual(validateSavedQuiz({ title: " My quiz ", answers: {} }).answers, emptyAnswers());
});
test("save normalizes title and keeps literal SQL as data", () => {
  const draft = validateSavedQuiz({ title: " My quiz ", answers: { "1": "SELECT 'a; b';" } });
  assert.equal(draft.title, "My quiz"); assert.equal(draft.answers["1"], "SELECT 'a; b';");
});
test("save ignores a client-supplied owner_id", () => {
  assert.ok(!("owner_id" in validateSavedQuiz({ title: "Mine", answers: {}, owner_id: "someone-else" })));
});
test("invalid quiz title is rejected", () => {
  for (const title of ["", " ", "a".repeat(101)]) assert.throws(() => validateSavedQuiz({ title, answers: {} }));
});
test("invalid quiz ID is rejected", () => {
  assert.throws(() => validateSavedQuiz({ id: "../../other", title: "Mine", answers: {} }));
});
test("oversized answers are rejected", () => {
  assert.throws(() => validateSavedQuiz({ title: "Mine", answers: { "1": "a".repeat(4001) } }));
});
test("unknown question IDs are rejected", () => {
  assert.throws(() => validateSavedQuiz({ title: "Mine", answers: { "6": "SELECT 1" } }));
});
test("non-string answers are rejected", () => {
  assert.throws(() => validateSavedQuiz({ title: "Mine", answers: { "1": 4 } }));
});
test("JSON request parsed", async () => {
  const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"title":"Mine"}' });
  assert.deepEqual(await readBody(request), { title: "Mine" });
});
test("malformed JSON rejected", async () => {
  const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" });
  await assert.rejects(() => readBody(request));
});
test("non-JSON requests rejected", async () => {
  await assert.rejects(() => readBody(new Request("http://localhost", { method: "POST", body: "x" })));
});
test("request size is limited even without Content-Length", async () => {
  const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "x".repeat(30001) }) });
  await assert.rejects(() => readBody(request), (e: unknown) => e instanceof HttpError && e.status === 413);
});
