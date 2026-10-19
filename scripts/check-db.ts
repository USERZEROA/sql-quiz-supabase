import { config } from "dotenv";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { checkReader, createDatabaseClient, runQuery } from "../lib/db";
import { QUESTIONS } from "../lib/questions";
import { PARAMETER_EXAMPLE } from "../lib/parameters";
import { gradeResult } from "../lib/grading";

let stage = "CONFIG";

function explainFailure(error: unknown): string {
  const item = error as { code?: unknown; message?: unknown } | null;
  const code = typeof item?.code === "string" ? item.code : "";
  // Inspect the message locally; never log the raw message, URL, or error object.
  const message = typeof item?.message === "string" ? item.message : "";

  if (stage === "CONFIG") {
    if (message === "QUIZ_DATABASE_URL is missing.") {
      return "[ENV_MISSING] Add QUIZ_DATABASE_URL to .env.local, or supply it through GitHub Secrets in CI.";
    }
    if (message.startsWith("Could not read .env.local")) {
      return "[ENV_FILE_UNREADABLE] Check the local file permissions. No database connection was attempted.";
    }
    if (message.startsWith("Unexpected database URL option")) {
      return "[URL_OPTIONS] This project accepts only ?sslmode=require. Supply a CA through QUIZ_DATABASE_CA_CERT, not URL options.";
    }
    if (message.startsWith("Use the quiz_reader Session pooler URL")) {
      return "[URL_SETTINGS] Use quiz_reader.PROJECT_REF, the Session pooler host, port 5432, database postgres, a nonempty role password, and ?sslmode=require.";
    }
    if (message.includes("not a valid URL") || message === "URI malformed" || error instanceof URIError) {
      return "[URL_FORMAT] Check the PostgreSQL URI and percent-encode reserved characters in the role password.";
    }
    return "[CONFIG_ERROR] Check the environment-variable format. Credentials and raw error details were withheld.";
  }

  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code) ||
      /self.signed|unable to verify|unable to get.*issuer/i.test(message)) {
    return "[TLS_CERTIFICATE_CHAIN] The server certificate could not be verified. Configure QUIZ_DATABASE_CA_CERT with the trusted CA PEM for this endpoint. Do not disable certificate verification.";
  }
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") {
    return "[TLS_HOSTNAME] The certificate does not match the host. Compare the pooler hostname with Supabase Connect.";
  }
  if (["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"].includes(code)) {
    return "[TLS_CERTIFICATE_DATE] Check the computer clock and certificate validity.";
  }
  if (code.startsWith("ERR_OSSL_PEM") || code.startsWith("ERR_OSSL_ASN1") || /no start line/i.test(message)) {
    return "[TLS_CA_FORMAT] QUIZ_DATABASE_CA_CERT must contain PEM certificate text, not a file path.";
  }
  if (/tenant.*not found|user.*not found|no tenant identifier/i.test(message)) {
    return "[POOLER_TENANT] Recheck the exact pooler host and quiz_reader.PROJECT_REF username for the same Supabase project.";
  }
  if (/circuit breaker/i.test(message)) {
    return "[POOLER_AUTH_LIMIT] The pooler is blocking repeated failed logins. Stop retrying and verify the credential configuration first.";
  }
  if (["28P01", "28000", "EAUTHQUERY"].includes(code) || /password authentication|SASL|SCRAM/i.test(message)) {
    return "[DB_AUTHENTICATION] The pooler rejected authentication. Verify the quiz_reader role password, LOGIN status, and password URI encoding; do not use the postgres administrator password.";
  }
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return "[DNS_LOOKUP] The pooler hostname could not be resolved. Check the copied hostname and network DNS.";
  }
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code) || /connection.*timeout|timeout.*connection|connection terminated due to connection timeout/i.test(message)) {
    return "[CONNECTION_TIMEOUT] The connection did not finish in time. Check pooler availability, network access, and firewall rules.";
  }
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"].includes(code)) {
    return `[${code}] The network connection was refused, interrupted, or unreachable. Check project availability and network access.`;
  }
  if (code === "42501") {
    return "[DB_PERMISSION] The connection reached Postgres, but a schema, table, or policy permission was denied.";
  }
  if (["42P01", "3F000"].includes(code)) {
    return "[DB_SCHEMA_MISSING] The connection reached Postgres, but a required schema or table is missing.";
  }
  if (code === "53300" || /max.*clients|too many connections/i.test(message)) {
    return "[DB_CONNECTION_LIMIT] The database or pooler has reached its connection limit.";
  }
  if (code === "57014") {
    return "[DB_QUERY_TIMEOUT] A database statement was cancelled or exceeded its time limit.";
  }
  if (stage === "READER_PERMISSIONS") {
    return "[READER_CHECK] The connected role must be quiz_reader, have SELECT access, and have no write or elevated role privileges.";
  }
  if (error instanceof assert.AssertionError) {
    if (stage === "TEACHING_DATA") return "[ROW_COUNT] Expected exactly 12 visible teaching records. Check the SELECT policy and seed data.";
    if (stage === "SAVED_QUIZ_ISOLATION") return "[SAVED_QUIZ_CHECK] public.saved_quizzes must exist and quiz_reader must not have access to it.";
    return "[EXPECTED_RESULT] A question's columns or rows differ from its reference result. Check the teaching data and expected table.";
  }
  // Print only a restricted code token, never the driver's original message.
  const safeCode = ["3D000", "57P01", "57P02", "57P03", "08P01", "08006", "XX000"].includes(code) ? code : "UNCLASSIFIED";
  return `[${safeCode}] The check failed at the stage above. Raw details were withheld to protect credentials.`;
}

async function main() {
  const fromEnvironment = process.env.QUIZ_DATABASE_URL !== undefined;
  const localFileExists = existsSync(".env.local");
  const loaded = config({ path: ".env.local", quiet: true });
  if (localFileExists && loaded.error) throw new Error("Could not read .env.local.");
  console.log(`CONFIG: .env.local ${localFileExists ? "found" : "not present (allowed in CI)"}.`);
  console.log(`CONFIG: QUIZ_DATABASE_URL ${process.env.QUIZ_DATABASE_URL ? "set" : "missing"}; source: ${fromEnvironment ? "process environment" : ".env.local"}.`);
  console.log(`CONFIG: custom CA ${process.env.QUIZ_DATABASE_CA_CERT ? "set" : "not set"}.`);

  const client = createDatabaseClient();
  console.log("PASS: database URL format (Session pooler, quiz_reader, port 5432, sslmode=require). This is not yet a connection test.");

  try {
    stage = "CONNECT";
    console.log("CHECK: connecting to Supabase with TLS certificate verification...");
    await client.connect();
    console.log("PASS: authenticated database connection with verified TLS.");

    stage = "READER_PERMISSIONS";
    await checkReader(client);
    console.log("PASS: quiz_reader permissions.");

    stage = "TEACHING_DATA";
    const count = await client.query("SELECT COUNT(*)::integer AS total FROM quiz_data.safety_inspections");
    assert.equal(count.rows[0]?.total, 12);
    console.log("PASS: 12 visible teaching records.");

    stage = "SAVED_QUIZ_ISOLATION";
    const saved = await client.query("SELECT to_regclass('public.saved_quizzes') IS NOT NULL AS exists");
    assert.equal(saved.rows[0]?.exists, true);
    const acl = await client.query(
      "SELECT has_table_privilege(current_user, $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed",
      ["public.saved_quizzes"]
    );
    assert.equal(acl.rows[0]?.allowed, false);
    console.log("PASS: saved-quiz table exists and quiz_reader cannot access it.");
  } finally {
    await client.end().catch(() => undefined);
  }

  for (const q of QUESTIONS) {
    stage = `QUESTION_${q.id}`;
    console.log(`CHECK: live result for question ${q.id}...`);
    const actual = await runQuery(q.sql);
    assert.deepEqual(actual.columns, q.expected.columns);
    assert.deepEqual(
      actual.rows.map(row => row.map(v => v === null ? null : String(v))),
      q.expected.rows.map(row => row.map(v => v === null ? null : String(v)))
    );
    console.log(`PASS: question ${q.id} matches its expected live result (${q.points} points).`);
  }
  stage = "PARAMETER_BINDING";
  const parameterized = await runQuery(PARAMETER_EXAMPLE.sql, PARAMETER_EXAMPLE.parameters);
  assert.equal(gradeResult(1, parameterized).earned, 4);
  const maliciousValue = await runQuery(PARAMETER_EXAMPLE.sql, ["High' OR 1=1 --", "Open"]);
  assert.equal(maliciousValue.rows.length, 0);
  const limited = await runQuery("SELECT inspection_id, mine_site, inspection_date FROM safety_inspections ORDER BY inspection_date DESC, inspection_id DESC LIMIT $1", [3]);
  assert.equal(gradeResult(3, limited).earned, 4);
  console.log("PASS: bound parameters, injection-like text treated as data, and parameterized LIMIT.");
  console.log("LIVE DATABASE CHECK PASSED: five questions, 20 points. No passwords were printed.");
}

main().catch((error: unknown) => {
  console.error(`Database check failed at stage: ${stage}`);
  console.error(explainFailure(error));
  console.error("No password, connection URL, token, or raw driver error was printed.");
  process.exitCode = 1;
});
