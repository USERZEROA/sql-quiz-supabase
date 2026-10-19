import { randomUUID } from "node:crypto";
import { requireUser } from "../../../lib/auth";
import { HttpError, readBody, validateSavedQuiz, jsonError } from "../../../lib/input";
import { QUESTIONS, QUIZ_VERSION } from "../../../lib/questions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const { data, error } = await supabase.from("saved_quizzes")
      .select("id,title,answers,parameters,scores,updated_at").eq("owner_id", user.id)
      .order("updated_at", { ascending: false }).limit(50);
    if (error) throw new HttpError(503, "Could not load saved quizzes. Check the saved_quizzes migration and RLS policies.");
    return Response.json({ quizzes: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const input = validateSavedQuiz(await readBody(request));
    // Database triggers derive scores from trusted runs and append the save log atomically.
    const { data, error } = await supabase.from("saved_quizzes").upsert({
      id: input.id ?? randomUUID(), owner_id: user.id, title: input.title,
      quiz_version: QUIZ_VERSION, questions: QUESTIONS, answers: input.answers, parameters: input.parameters,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" }).select("id,title,answers,parameters,scores,updated_at").single();
    if (error) throw new HttpError(403, "Quiz could not be saved. Check the migration and owner-only RLS policies.");
    return Response.json({ quiz: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
