import test from "node:test";
import assert from "node:assert/strict";
import { validateParameters, parseParameterText } from "../lib/parameters";
import { gradeResult, totalScore } from "../lib/grading";
import { QUESTIONS } from "../lib/questions";
import { validateSavedQuiz } from "../lib/input";

for (const input of [[], ["High", "Open"], [null, true, false, 3, "2026-09-01"]]) {
  test(`parameter scalars accepted: ${JSON.stringify(input)}`, () => assert.deepEqual(validateParameters(input), input));
}
for (const input of [{}, "x", [[1]], [{}], [Infinity], [NaN], ["a".repeat(257)], Array(21).fill(1), ["\0"]]) {
  test(`invalid parameters rejected: ${JSON.stringify(input)}`, () => assert.throws(() => validateParameters(input)));
}
test("empty parameter input means []", () => assert.deepEqual(parseParameterText("  "), []));
test("malformed parameter JSON rejected", () => assert.throws(() => parseParameterText("['High']")));
test("injection-like parameter remains literal data", () => {
  const input = ["High' OR 1=1 --"];
  assert.deepEqual(validateParameters(input), input);
});
for (const q of QUESTIONS) {
  test(`question ${q.id} gets four points for its result, not SQL text`, () => {
    const grade = gradeResult(q.id, structuredClone(q.expected));
    assert.equal(grade.earned, 4); assert.equal(grade.correct, true);
  });
}
test("COUNT string values compare to numeric expectations", () => {
  const actual = structuredClone(QUESTIONS[1].expected);
  actual.rows = actual.rows.map(row => row.map(String));
  assert.equal(gradeResult(2, actual).earned, 4);
});
test("different aliases do not lose points", () => {
  const actual = structuredClone(QUESTIONS[1].expected);
  actual.columns = ["site", "n"];
  assert.equal(gradeResult(2, actual).earned, 4);
});
test("wrong row order is explained, since the questions require sorting", () => {
  const actual = structuredClone(QUESTIONS[0].expected); actual.rows.reverse();
  const grade = gradeResult(1, actual);
  assert.equal(grade.earned, 0); assert.match(grade.feedback, /row order/);
});
test("wrong values receive zero", () => {
  const actual = structuredClone(QUESTIONS[1].expected); actual.rows[0][1] = 99;
  assert.equal(gradeResult(2, actual).earned, 0);
});
test("missing rows receive zero", () => {
  const actual = structuredClone(QUESTIONS[0].expected); actual.rows.pop();
  assert.equal(gradeResult(1, actual).earned, 0);
});
test("duplicate rows do not replace a missing row", () => {
  const actual = structuredClone(QUESTIONS[0].expected); actual.rows[1] = actual.rows[0];
  assert.equal(gradeResult(1, actual).earned, 0);
});
test("extra columns receive zero", () => {
  const actual = structuredClone(QUESTIONS[0].expected); actual.columns.push("extra");
  assert.equal(gradeResult(1, actual).earned, 0);
});
test("truncated result cannot earn marks", () => {
  assert.equal(gradeResult(1, { ...QUESTIONS[0].expected, truncated: true }).earned, 0);
});
test("null does not coerce to number or text", () => {
  const actual = structuredClone(QUESTIONS[1].expected); actual.rows[0][1] = null;
  assert.equal(gradeResult(2, actual).earned, 0);
});
test("unknown question cannot be graded", () => assert.throws(() => gradeResult(6, QUESTIONS[0].expected)));
test("total score reaches twenty", () => {
  const grades = Object.fromEntries(QUESTIONS.map(q => [String(q.id), gradeResult(q.id, q.expected)]));
  assert.equal(totalScore(grades), 20); assert.equal(totalScore({}), 0);
});
test("old saved drafts have empty parameter arrays", () => {
  const draft = validateSavedQuiz({ title: "Old", answers: {} });
  assert.deepEqual(draft.parameters, { 1: [], 2: [], 3: [], 4: [], 5: [] });
});
test("save preserves parameter data and ignores forged grades", () => {
  const draft = validateSavedQuiz({ title: "Draft", answers: { 1: "SELECT $1 FROM safety_inspections" },
    parameters: { 1: ["'; DROP TABLE x; --"] }, scores: { 1: { earned: 100 } }, owner_id: "other" });
  assert.deepEqual(draft.parameters["1"], ["'; DROP TABLE x; --"]);
  assert.ok(!("scores" in draft)); assert.ok(!("owner_id" in draft));
});
test("unknown saved parameter question rejected", () => assert.throws(() => validateSavedQuiz({ title: "x", answers: {}, parameters: { 6: [] } })));
test("malformed saved parameters rejected", () => assert.throws(() => validateSavedQuiz({ title: "x", answers: {}, parameters: { 1: {} } })));
