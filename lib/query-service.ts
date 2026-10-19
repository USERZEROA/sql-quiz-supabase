import { runQuery } from "./db";
import { appendQueryEvent, type QueryEvent } from "./audit";
import { gradeResult } from "./grading";
import { HttpError } from "./input";
import { QUESTIONS } from "./questions";
import { validateParameters, type QueryParameters } from "./parameters";

// Injectable dependencies keep success, rejection, and audit failure testable offline.
export async function executeAuditedQuery(actorId: string, body: Record<string, unknown>,
  dependencies = { run: runQuery, append: appendQueryEvent }) {
  const questionId = body.questionId ?? null;
  if (questionId !== null && (!Number.isInteger(questionId) || !QUESTIONS.some(q => q.id === questionId))) {
    throw new HttpError(400, "Unknown question ID.");
  }
  if (typeof body.sql !== "string" || body.sql.length > 4000) throw new HttpError(400, "SQL must be a string of at most 4,000 characters.");
  let parameters: QueryParameters;
  try { parameters = validateParameters(body.parameters ?? []); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Invalid parameters.";
    await dependencies.append(actorId, { action: "run_query", question_id: questionId as number | null,
      sql: body.sql, parameters: [], outcome: "rejected", error: `Parameter validation: ${message}` });
    throw new HttpError(400, message);
  }
  const event: QueryEvent = { action: questionId === null ? "preview_data" : "run_query",
    question_id: questionId as number | null, sql: body.sql, parameters, outcome: "success" };
  let result: Awaited<ReturnType<typeof runQuery>>;
  try { result = await dependencies.run(body.sql, parameters); }
  catch (error) {
    const known = error instanceof HttpError;
    await dependencies.append(actorId, { ...event, outcome: "rejected",
      error: known ? error.message : "Query execution failed." });
    throw error;
  }
  const grade = questionId === null ? null : gradeResult(questionId as number, result);
  const auditId = await dependencies.append(actorId, { ...event, row_count: result.rows.length,
    elapsed_ms: result.elapsedMs, ...(grade ? { grade } : {}) });
  return { ...result, grade, auditId };
}
