import { Client, types } from "pg";
import { databaseConfig } from "./db-config";
import { prepareQuery } from "./sql";
import { HttpError } from "./input";
import type { Cell } from "./questions";

// Keep PostgreSQL DATE values as YYYY-MM-DD in every deployment timezone.
types.setTypeParser(1082, value => value);
export function createDatabaseClient() { return new Client(databaseConfig()); }

export async function checkReader(client: Client) {
  const { rows } = await client.query(`
    SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
      has_table_privilege(current_user, 'quiz_data.safety_inspections', 'SELECT') AS can_read,
      has_table_privilege(current_user, 'quiz_data.safety_inspections', 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
    FROM pg_roles r WHERE r.rolname = current_user`);
  const role = rows[0];
  if (!role || role.role_name !== "quiz_reader" || !role.can_read || role.can_write ||
      role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb) {
    throw new HttpError(503, "The database account must be the read-only quiz_reader role.");
  }
}

export async function runQuery(input: unknown, parameters: unknown = []) {
  const prepared = prepareQuery(input, parameters);
  const client = createDatabaseClient();
  const start = Date.now();
  try {
    await client.connect();
    await checkReader(client);
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL search_path = pg_catalog, quiz_data");
    await client.query("SET LOCAL statement_timeout = '3s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const result = await client.query<Cell[]>({
      // SQL is a single allowlisted AST; the outer limit is a bound data value.
      text: prepared.text, values: prepared.values, rowMode: "array"
    });
    await client.query("ROLLBACK");
    return { columns: result.fields.map(f => f.name), rows: result.rows.slice(0, 100),
      truncated: result.rows.length > 100, elapsedMs: Date.now() - start };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "57014") throw new HttpError(400, "The query exceeded the 3-second limit.");
    if (["42703", "42803", "42804", "42883", "42601", "22P02", "22007", "22012"].includes(code ?? "")) {
      throw new HttpError(400, "PostgreSQL rejected the query. Check column names, grouping, data types, and SQL syntax.");
    }
    if (code === "42501") throw new HttpError(403, "The database denied this operation. Check the quiz_reader grants and RLS policy.");
    // Do not return connection errors or credentials to the browser.
    throw new HttpError(503, "Database connection failed. Check the Session pooler URL, quiz_reader password, TLS certificate, and database permissions.");
  } finally { await client.end().catch(() => undefined); }
}
