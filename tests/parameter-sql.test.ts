import test from "node:test";
import assert from "node:assert/strict";
import { prepareQuery, validateSql } from "../lib/sql";
import { PARAMETER_EXAMPLE } from "../lib/parameters";

test("parameterized first question keeps value bindings", () => {
  const prepared = prepareQuery(PARAMETER_EXAMPLE.sql, PARAMETER_EXAMPLE.parameters);
  assert.deepEqual(prepared.values, ["High", "Open", 101]);
  assert.match(prepared.text, /LIMIT \$3$/);
  assert.ok(!prepared.text.includes("'High'"));
});
test("malicious data never enters SQL text", () => {
  const value = "High' OR 1=1 --";
  const result = prepareQuery("SELECT inspection_id FROM safety_inspections WHERE risk_level=$1", [value]);
  assert.ok(!result.text.includes(value)); assert.equal(result.values[0], value);
});
test("ordinary queries keep original limit binding", () => {
  const result = prepareQuery("SELECT * FROM safety_inspections");
  assert.match(result.text, /LIMIT \$1$/); assert.deepEqual(result.values, [101]);
});
test("repeated placeholder binds once", () => {
  assert.ok(validateSql("SELECT * FROM safety_inspections WHERE risk_level=$1 OR status=$1", ["High"]));
});
test("literal placeholder text is not a parameter", () => {
  assert.ok(validateSql("SELECT '$1' FROM safety_inspections"));
  assert.throws(() => validateSql("SELECT '$1' FROM safety_inspections", ["x"]));
});
test("placeholders in comments are not parameters", () => assert.ok(validateSql("SELECT * FROM safety_inspections -- $1")));
test("parameterized LIMIT is supported", () => {
  assert.ok(validateSql("SELECT * FROM safety_inspections LIMIT $1", [3]));
});
for (const [sql, params] of [
  ["SELECT * FROM safety_inspections WHERE risk_level=$1", []],
  ["SELECT * FROM safety_inspections WHERE risk_level=$2", ["unused", "High"]],
  ["SELECT * FROM safety_inspections WHERE risk_level=$1", ["High", "extra"]],
  ["SELECT * FROM safety_inspections WHERE risk_level=$0", ["High"]],
  ["SELECT * FROM safety_inspections WHERE risk_level=$21", Array(20).fill("x")],
  ["SELECT * FROM safety_inspections LIMIT $1", [-1]],
  ["SELECT * FROM safety_inspections LIMIT $1", ["3"]],
  ["SELECT * FROM safety_inspections LIMIT $1", [10001]],
  ["SELECT quiz_audit.append_query_event($1,$2) FROM safety_inspections", ["x", "y"]],
  ["SELECT * FROM quiz_audit.events WHERE actor_id=$1", ["x"]],
] as const) test(`invalid parameter query rejected: ${sql} ${JSON.stringify(params)}`, () => assert.throws(() => validateSql(sql, params)));
