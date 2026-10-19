import type { Grade } from "./grading";
import type { ResultTable } from "./questions";

export const RAG_COLLECTION = "mining-sql-knowledge-v1";
export const RAG_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B";
export type RagInput = { question: string; questionId: number | null; execute: boolean };
export type RetrievedNote = { id: string; text: string; kind: string; distance: number | null };
export type GeneratedSql = { sql: string; model: string; inputTokens: number | null; outputTokens: number | null };
export type RagRun = ResultTable & { elapsedMs: number; truncated: boolean; grade: Grade | null; auditId: string };
export type RagReport = {
  question: string; questionId: number | null; collection: string;
  retrieved: RetrievedNote[]; generated: GeneratedSql | null; run: RagRun | null;
  error: { stage: "retrieval" | "generation" | "execution"; message: string } | null;
  elapsedMs: number;
};
