import { requireUser } from "../../../lib/auth";
import { runQuery } from "../../../lib/db";
import { readBody, jsonError } from "../../../lib/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await readBody(request);
    const result = await runQuery(body.sql);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
