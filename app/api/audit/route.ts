import { requireUser } from "../../../lib/auth";
import { HttpError, jsonError } from "../../../lib/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    // The function also checks auth.uid() itself and returns only that user's events.
    const { data, error } = await supabase.rpc("my_quiz_activity");
    if (error) throw new HttpError(503, "Could not load activity. Check migration 04 and sign in again.");
    return Response.json({ events: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
