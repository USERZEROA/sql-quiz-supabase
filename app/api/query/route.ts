import { requireUser } from "../../../lib/auth";
import { executeAuditedQuery } from "../../../lib/query-service";
import { readBody, jsonError } from "../../../lib/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const result = await executeAuditedQuery(user.id, await readBody(request));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
