import { createDatabaseClient } from "./db";
import { HttpError } from "./input";
import { QUIZ_VERSION } from "./questions";
import type { QueryParameters } from "./parameters";
import type { Grade } from "./grading";

export type QueryEvent = {
  action: "run_query" | "preview_data";
  question_id: number | null;
  sql: string;
  parameters: QueryParameters;
  outcome: "success" | "rejected";
  row_count?: number;
  elapsed_ms?: number;
  grade?: Grade;
  error?: string;
};

export async function appendQueryEvent(actorId: string, event: QueryEvent): Promise<string> {
  const client = createDatabaseClient();
  try {
    await client.connect();
    // A narrowly granted append-only function, not direct INSERT/UPDATE access.
    const result = await client.query<{ id: string }>(
      "SELECT quiz_audit.append_query_event($1::uuid, $2::jsonb) AS id",
      [actorId, JSON.stringify({ ...event, quiz_version: QUIZ_VERSION })]
    );
    return result.rows[0].id;
  } catch {
    throw new HttpError(503, "Audit recording failed. Check that migration 04 is applied. No successful run is reported without its audit record.");
  } finally { await client.end().catch(() => undefined); }
}
