// For a NEW collection or an intentional knowledge update. Not needed after a successful init-rag probe.
// Run from the repository root: npx tsx scripts/index-rag.ts
import { config } from "dotenv";
import { createDatabaseClient, checkReader } from "../lib/db";
import { chromaConnection } from "../lib/rag-chroma";
import { RAG_COLLECTION, RAG_EMBEDDING_MODEL } from "../lib/rag-types";
import { RAG_KNOWLEDGE } from "../lib/rag-knowledge";
import { SCHEMA_COLUMNS } from "../lib/questions";

config({ path: ".env.local", quiet: true });
async function main() {
  const client = createDatabaseClient();
  try {
    await client.connect(); await checkReader(client);
    const { rows } = await client.query<{ name: string; type: string; not_null: boolean }>(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
       FROM pg_attribute a WHERE a.attrelid = 'quiz_data.safety_inspections'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`);
    if (rows.length !== SCHEMA_COLUMNS.length || rows.some((r, i) => r.name !== SCHEMA_COLUMNS[i][0] || r.type !== SCHEMA_COLUMNS[i][1] || !r.not_null)) {
      throw new Error("Live schema differs from the teaching notes. Review it before indexing.");
    }
    console.log("PASS: knowledge schema matches live PostgreSQL columns, types, and nullability.");
  } finally { await client.end().catch(() => undefined); }
  const { client: chroma, embedder } = chromaConnection();
  const collection = await chroma.getOrCreateCollection({ name: RAG_COLLECTION, embeddingFunction: embedder,
    metadata: { source: "ids706-week8", kb_version: "1", embedding_model: RAG_EMBEDDING_MODEL } });
  if (collection.metadata?.embedding_model !== RAG_EMBEDDING_MODEL || collection.metadata?.source !== "ids706-week8") {
    throw new Error("Collection configuration differs. No documents were changed.");
  }
  await collection.upsert({ ids: RAG_KNOWLEDGE.map(n => n.id), documents: RAG_KNOWLEDGE.map(n => n.text),
    metadatas: RAG_KNOWLEDGE.map(n => ({ id: n.id, kind: n.kind, source: "week7-teaching-schema" })) });
  console.log(`INDEX COMPLETE: ${await collection.count()} records in ${RAG_COLLECTION}. Embedding usage was incurred; no SQL was generated.`);
}
main().catch(() => {
  console.error("INDEX FAILED. Check PostgreSQL schema/reader configuration and Chroma settings. Provider errors are not printed.");
  process.exitCode = 1;
});
