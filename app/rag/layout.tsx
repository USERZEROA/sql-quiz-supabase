import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Mining SQL · RAG Lab",
  description: "Natural-language questions, Chroma vector retrieval, Gemini SQL generation, and read-only PostgreSQL validation."
};
export default function RagLayout({ children }: { children: React.ReactNode }) { return children; }
