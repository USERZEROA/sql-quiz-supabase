import { CloudClient } from "chromadb";
import { ChromaCloudQwenEmbeddingFunction, ChromaCloudQwenEmbeddingModel } from "@chroma-core/chroma-cloud-qwen";
import { HttpError } from "./input";
import { RAG_COLLECTION, RAG_EMBEDDING_MODEL, type RetrievedNote } from "./rag-types";

export function chromaConnection() {
  const values = ["CHROMA_API_KEY", "CHROMA_TENANT", "CHROMA_DATABASE"].map(name => {
    const value = process.env[name]?.trim();
    if (!value || /[\r\n]/.test(value)) throw new HttpError(503, `Set ${name} in the server environment and redeploy.`);
    return value;
  });
  const client = new CloudClient({ apiKey: values[0], tenant: values[1], database: values[2] });
  const embedder = new ChromaCloudQwenEmbeddingFunction({ apiKeyEnvVar: "CHROMA_API_KEY",
    model: ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B, task: "nl_to_code" });
  return { client, embedder };
}

export async function retrieveKnowledge(question: string): Promise<RetrievedNote[]> {
  const { client, embedder } = chromaConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      const collection = await client.getCollection({ name: RAG_COLLECTION, embeddingFunction: embedder });
      if (collection.metadata?.embedding_model !== RAG_EMBEDDING_MODEL) {
        throw new HttpError(503, "Collection embedding settings differ from the Qwen setup used at indexing.");
      }
      const matches = await collection.query({ queryTexts: [question], nResults: 5,
        include: ["documents", "metadatas", "distances"] });
      const ids = matches.ids?.[0] ?? [];
      const documents = matches.documents?.[0] ?? [];
      if (!ids.length || ids.length !== documents.length) throw new HttpError(502, "Vector retrieval returned no usable knowledge.");
      return ids.map((id, index) => {
        const text = documents[index];
        if (typeof text !== "string" || !text.trim() || text.length > 6000) throw new HttpError(502, "Retrieved knowledge is empty or too large.");
        const distance = matches.distances?.[0]?.[index];
        const kind = matches.metadatas?.[0]?.[index]?.kind;
        return { id, text, kind: typeof kind === "string" ? kind : "knowledge",
          distance: typeof distance === "number" && Number.isFinite(distance) ? distance : null };
      });
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, "Chroma retrieval exceeded 25 seconds. Generation was not attempted.")), 25000);
    })]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // SDK messages can contain request details; return a fixed diagnostic instead.
    throw new HttpError(502, "Chroma retrieval failed. Check its key, tenant, database, credits, and indexed collection.");
  } finally { if (timer) clearTimeout(timer); }
}
