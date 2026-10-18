import { QUESTIONS } from "./questions";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function bearerToken(request: Request): string {
  const match = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > 10000) throw new HttpError(401, "Sign in before running or saving a quiz.");
  return match[1];
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Send a JSON request.");
  }
  const limit = 30000;
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request too large.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new HttpError(400, "Invalid JSON object."); }
}

export function validateSavedQuiz(data: Record<string, unknown>) {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title || title.length > 100) throw new HttpError(400, "Use a quiz title between 1 and 100 characters.");
  if (data.id !== undefined && (typeof data.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id))) {
    throw new HttpError(400, "Invalid saved quiz ID.");
  }
  const answers = data.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new HttpError(400, "Answers must be an object.");
  const items = answers as Record<string, unknown>;
  const ids = new Set(QUESTIONS.map(q => String(q.id)));
  if (Object.keys(items).some(key => !ids.has(key))) throw new HttpError(400, "Unknown question ID.");
  const clean: Record<string, string> = {};
  for (const id of ids) {
    const value = items[id] ?? "";
    if (typeof value !== "string" || value.length > 4000) throw new HttpError(400, "Each SQL answer must be at most 4,000 characters.");
    clean[id] = value;
  }
  return { id: data.id as string | undefined, title, answers: clean };
}

export function jsonError(error: unknown): Response {
  const known = error instanceof HttpError;
  return Response.json({ error: known ? error.message : "The request could not be completed. Check the server configuration." },
    { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
