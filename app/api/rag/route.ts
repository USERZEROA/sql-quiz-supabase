import { requireUser } from "../../../lib/auth";
import { readBody, jsonError } from "../../../lib/input";
import { acquireRagSlot, runRag, validateRagInput } from "../../../lib/rag-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const { user } = await requireUser(request);
    const input = validateRagInput(await readBody(request));
    release = acquireRagSlot(user.id);
    // Delayed imports: signed-out requests never load or call either AI provider.
    const [{ retrieveKnowledge }, { generateRagSql }, { executeAuditedQuery }] = await Promise.all([
      import("../../../lib/rag-chroma"), import("../../../lib/rag-gemini"), import("../../../lib/query-service"),
    ]);
    const report = await runRag(input, {
      retrieve: retrieveKnowledge,
      generate: generateRagSql,
      execute: (sql, questionId) => executeAuditedQuery(user.id, { sql, questionId, parameters: [] }),
    });
    // Preserve generated SQL and retrieved context even if execution was rejected.
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
  finally { release?.(); }
}
