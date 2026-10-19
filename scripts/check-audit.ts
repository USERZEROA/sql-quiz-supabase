import { config } from "dotenv";
import assert from "node:assert/strict";
import { createDatabaseClient, checkReader } from "../lib/db";
config({ path: ".env.local", quiet: true });

async function main() {
  const client = createDatabaseClient();
  let stage = "connect";
  try {
    await client.connect(); await checkReader(client);
    stage = "audit objects";
    const object = await client.query("SELECT to_regclass('quiz_audit.events') IS NOT NULL AS exists");
    assert.equal(object.rows[0]?.exists, true, "Apply migration 04 first.");
    for (const role of ["quiz_reader", "authenticated", "anon"]) {
      const result = await client.query("SELECT has_table_privilege($1, 'quiz_audit.events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS direct_access", [role]);
      assert.equal(result.rows[0].direct_access, false, `${role} has direct access to the private log.`);
      console.log(`PASS: ${role} has no direct audit-table privileges.`);
    }
    const functions = await client.query(`SELECT
      has_function_privilege('quiz_reader', 'quiz_audit.append_query_event(uuid,jsonb)', 'EXECUTE') AS backend_append,
      has_function_privilege('authenticated', 'quiz_audit.append_query_event(uuid,jsonb)', 'EXECUTE') AS taker_append,
      has_function_privilege('anon', 'public.my_quiz_activity()', 'EXECUTE') AS anonymous_history,
      has_function_privilege('authenticated', 'public.my_quiz_activity()', 'EXECUTE') AS own_history`);
    assert.deepEqual(functions.rows[0], { backend_append: true, taker_append: false, anonymous_history: false, own_history: true });
    console.log("PASS: only the backend can append; only signed-in users can call own-history RPC.");

    // Real denied operations, each in a rollback-only transaction. No user data is changed.
    for (const [operation, sql] of [
      ["INSERT", "INSERT INTO quiz_audit.events(actor_id,action,payload) VALUES ('00000000-0000-0000-0000-000000000000','preview_data','{}'::jsonb)"],
      ["UPDATE", "UPDATE quiz_audit.events SET payload='{}'::jsonb WHERE false"],
      ["DELETE", "DELETE FROM quiz_audit.events WHERE false"],
      ["TRUNCATE", "TRUNCATE TABLE quiz_audit.events"],
      ["SELECT", "SELECT * FROM quiz_audit.events LIMIT 1"]
    ]) {
      stage = operation;
      await client.query("BEGIN");
      let denied = false;
      try { await client.query(sql); }
      catch (error) {
        if ((error as { code?: string }).code !== "42501") throw error;
        denied = true;
      } finally { await client.query("ROLLBACK"); }
      assert.equal(denied, true, `${operation} unexpectedly succeeded.`);
      console.log(`PASS: actual ${operation} by quiz_reader rejected (42501).`);
    }
    console.log("AUDIT ROLE CHECK PASSED. Also run SQL script 05 for authenticated/anon mutation, ownership, and unchanged-row checks.");
  } catch {
    console.error(`Audit check failed at ${stage}. Apply migration 04 and check the reader permissions. No raw connection error printed.`);
    process.exitCode = 1;
  } finally { await client.end().catch(() => undefined); }
}
main().catch(() => { console.error("Audit check could not start. Check the existing database environment variables."); process.exitCode = 1; });
