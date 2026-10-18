import test from "node:test";
import assert from "node:assert/strict";
import { databaseConfig } from "../lib/db-config";

const valid = "postgresql://quiz_reader.example:not-a-real-password@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require";
test("session-pooler config requires TLS and certificate verification", () => {
  const result = databaseConfig(valid);
  assert.equal(result.ssl.rejectUnauthorized, true);
  assert.equal(new URL(result.connectionString).port, "5432");
});
test("admin database account refused", () => { assert.throws(() => databaseConfig(valid.replace("quiz_reader.", "postgres."))); });
test("transaction pooler refused", () => { assert.throws(() => databaseConfig(valid.replace(":5432/", ":6543/"))); });
test("unencrypted connection refused", () => { assert.throws(() => databaseConfig(valid.replace("?sslmode=require", ""))); });
test("direct host refused", () => { assert.throws(() => databaseConfig(valid.replace("aws-0-us-east-2.pooler.supabase.com", "db.example.supabase.co"))); });
test("unexpected SSL overrides refused", () => { assert.throws(() => databaseConfig(valid + "&ssl=no-verify")); });
