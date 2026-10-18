import test from "node:test";
import assert from "node:assert/strict";
import { validateSql } from "../lib/sql";
import { QUESTIONS } from "../lib/questions";

for (const q of QUESTIONS) test(`reference query ${q.id} is allowed`, () => assert.ok(validateSql(q.sql)));
for (const [name, sql] of [
  ["qualified SELECT", "SELECT * FROM quiz_data.safety_inspections;"],
  ["table alias and different casing", "select s.mine_site from safety_inspections AS s where s.status='Open' order by s.mine_site"],
  ["empty-result filter", "SELECT inspection_id FROM safety_inspections WHERE inspection_id < 0"],
  ["literal semicolon", "SELECT mine_site FROM safety_inspections WHERE mine_site = 'x; y'"],
  ["aggregate FILTER", "SELECT COUNT(*) FILTER (WHERE status = 'Open') FROM safety_inspections"],
  ["CASE", "SELECT SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END) FROM safety_inspections"],
  ["date literal", "SELECT inspection_id FROM safety_inspections WHERE inspection_date >= DATE '2026-09-01'"],
  ["trailing comment", "SELECT COUNT(*) FROM safety_inspections; -- comment"],
]) test(`accept ${name}`, () => assert.ok(validateSql(sql)));
for (const [name, sql] of [
  ["empty", ""],
  ["multiple statements", "SELECT * FROM safety_inspections; DELETE FROM safety_inspections"],
  ["write", "UPDATE quiz_data.safety_inspections SET status='Closed'"],
  ["role change", "SET ROLE postgres"],
  ["DDL", "DROP TABLE quiz_data.safety_inspections"],
  ["auth table", "SELECT * FROM auth.users"],
  ["system table", "SELECT * FROM pg_catalog.pg_roles"],
  ["saved quizzes", "SELECT * FROM public.saved_quizzes"],
  ["sleep", "SELECT pg_sleep(10) FROM safety_inspections"],
  ["config change", "SELECT set_config('role','postgres',false) FROM safety_inspections"],
  ["subquery data leak", "SELECT (SELECT email FROM auth.users LIMIT 1) FROM safety_inspections"],
  ["function subquery", "SELECT count((SELECT email FROM auth.users LIMIT 1)) FROM safety_inspections"],
  ["custom function", "SELECT public.count(inspection_id) FROM safety_inspections"],
  ["dangerous cast", "SELECT 'auth.users'::regclass FROM safety_inspections"],
  ["join", "SELECT * FROM safety_inspections a CROSS JOIN safety_inspections b"],
  ["locking clause", "SELECT * FROM safety_inspections FOR UPDATE"],
  ["CTE", "WITH x AS (SELECT * FROM safety_inspections) SELECT * FROM x"],
  ["unsupported within group", "SELECT count(*) WITHIN GROUP (ORDER BY pg_sleep(1)) FROM safety_inspections"],
  ["no data table", "SELECT current_user"],
]) test(`reject ${name}`, () => assert.throws(() => validateSql(sql)));
test("SQL length limit", () => assert.throws(() => validateSql("SELECT " + "a".repeat(4000))));
