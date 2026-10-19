import { HttpError } from "./input";
import { QUESTIONS } from "./questions";
import { RAG_COLLECTION, type RagInput, type RetrievedNote, type GeneratedSql, type RagRun, type RagReport } from "./rag-types";

export function validateRagInput(body: Record<string, unknown>): RagInput {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 1500) throw new HttpError(400, "Enter a question of 1–1,500 characters.");
  const questionId = body.questionId ?? null;
  if (questionId !== null && (!Number.isInteger(questionId) || !QUESTIONS.some(q => q.id === questionId))) {
    throw new HttpError(400, "Choose an existing quiz question or Custom question.");
  }
  if (body.execute !== undefined && typeof body.execute !== "boolean") throw new HttpError(400, "execute must be a boolean.");
  // Never accept a user ID, SQL answer, score, or retrieved context from the browser.
  return { question, questionId: questionId as number | null, execute: body.execute !== false };
}

export type RagDependencies = {
  retrieve: (question: string) => Promise<RetrievedNote[]>;
  generate: (question: string, notes: RetrievedNote[]) => Promise<GeneratedSql>;
  execute: (sql: string, questionId: number | null) => Promise<RagRun>;
};

export async function runRag(input: RagInput, dependencies: RagDependencies): Promise<RagReport> {
  const start = Date.now();
  const report: RagReport = { question: input.question, questionId: input.questionId,
    collection: RAG_COLLECTION, retrieved: [], generated: null, run: null, error: null, elapsedMs: 0 };
  let stage: "retrieval" | "generation" | "execution" = "retrieval";
  try {
    report.retrieved = await dependencies.retrieve(input.question);
    if (!report.retrieved.length || report.retrieved.some(n => !n.id || !n.text.trim())) {
      throw new HttpError(502, "Vector search returned no usable knowledge. Generation was not attempted.");
    }
    stage = "generation";
    report.generated = await dependencies.generate(input.question, report.retrieved);
    if (!report.generated.sql.trim()) throw new HttpError(502, "The model returned no SQL text.");
    if (input.execute) {
      stage = "execution";
      // Execute exactly the model's output, never a reference-answer substitution.
      report.run = await dependencies.execute(report.generated.sql, input.questionId);
    }
  } catch (error) {
    report.error = { stage, message: error instanceof HttpError ? error.message : `The ${stage} step failed. Check server configuration and provider availability.` };
  }
  report.elapsedMs = Date.now() - start;
  return report;
}

// A small per-instance guard, not a distributed billing or rate-limit guarantee.
const active = new Set<string>();
const lastRequest = new Map<string, number>();
export function acquireRagSlot(userId: string): () => void {
  const now = Date.now();
  for (const [id, time] of lastRequest) if (now - time > 600000) lastRequest.delete(id);
  if (active.has(userId) || now - (lastRequest.get(userId) ?? 0) < 10000) {
    throw new HttpError(429, "Wait ten seconds between RAG requests and let the current request finish.");
  }
  if (lastRequest.size >= 1000 && !lastRequest.has(userId)) throw new HttpError(429, "The demo is busy. Please try later.");
  active.add(userId); lastRequest.set(userId, now);
  return () => { active.delete(userId); };
}
