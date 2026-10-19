# Week 8: RAG Text-to-SQL

Local page: `http://localhost:3000/rag`. After deploying this patch, use `https://sql-quiz-supabase.vercel.app/rag`. The existing Week 7 page at `/` stays unchanged. Grading login details are supplied in the Canvas assignment comments; this page uses the same Supabase accounts.

## Architecture

A natural-language question is embedded with Chroma Cloud Qwen3-Embedding-0.6B using the same `nl_to_code` task as indexing. Chroma queries `mining-sql-knowledge-v1` for the five closest notes. Those exact retrieved texts, with their IDs, are sent to Gemini `gemini-3.1-flash-lite` through the `generateContent` API. The site displays the generated SQL and retrieval evidence, including distances. It does not fall back to a reference answer when either API fails.

With automatic execution enabled (the default), the server passes the generated SQL to the existing Week 7 audited query service. Its AST validator, read-only `quiz_reader`, TLS verification, statement timeout, and row limit remain in force. The result is compared with the selected quiz question by values and required row ordering, not SQL spelling. The reference SQL and expected result are not appended to the model prompt. The editable question defaults to the selected quiz prompt; changing its meaning requires selecting Custom question or interpreting validation against the still-selected reference. Custom questions run without an expected-answer grade.

The eight knowledge records in `lib/rag-knowledge.ts` contain schema, business semantics, and two few-shot examples. This is a small, task-specific teaching corpus, not evidence of general Text-to-SQL accuracy. A lower retrieval distance is not a probability of correctness. RAG calls invoke remote embeddings and model generation; applicable credits and rate limits still apply.

## Configuration

Keep the four working Week 7 Supabase/PostgreSQL environment variables. Add these server-only values locally and in Vercel Production:

```dotenv
GEMINI_API_KEY=
CHROMA_API_KEY=
CHROMA_TENANT=
CHROMA_DATABASE=mining-sql-rag
```

`GEMINI_MODEL` is optional; it defaults to the successfully probed `gemini-3.1-flash-lite`. Duke and Anthropic credentials are not used by this page. Do not prefix provider credentials with `NEXT_PUBLIC_`.

The project must have `chromadb` and `@chroma-core/chroma-cloud-qwen` installed. They were installed during the CLI probe; this patch does not overwrite `package.json` or the lockfile. For a fresh clone use `npm ci` from the committed lockfile. No new database migration is required.

The collection has already been indexed during this project's CLI probe. Do not reindex it merely to install the page. For a fresh Chroma database, or an intentional knowledge update, run:

```powershell
npx tsx scripts/index-rag.ts
```

That script checks the live PostgreSQL schema against the teaching notes, then upserts the eight stable IDs. It consumes embedding usage, does not reset the database, and does not call Gemini. The web API only opens and queries the existing collection; it never creates or seeds one implicitly.

## Local run and tests

```powershell
npm run check
npm run dev
```

Open `/rag`, sign in, choose question 1, and click **Generate, run & validate** once. Retrieval and generation are remote calls, not fixtures. The expected first-query result is inspections 1, 3, 5, and 11; model accuracy is not guaranteed. If execution is rejected, the generated SQL remains visible beside the error. To demonstrate the baseline separately, turn off automatic execution and generate SQL without running it.

The added offline tests cover pipeline sequencing, context propagation, empty retrieval, model failures, refused execution, custom/ungraded questions, result-based validation, and rate-limit handling. They do not substitute for live provider or hosted browser acceptance. Existing CI runs these tests via its test wildcard without AI credentials; it still performs the Week 7 live database and audit checks. We deliberately do not make paid generation calls on every push.

A per-user, per-server-instance guard refuses simultaneous requests and rapid repeats within ten seconds. It is not a global spending cap. Provider failures are not automatically retried, and the app never calls a paid alternative automatically. Request cancellation in the browser or an overall timeout does not guarantee a remote provider stopped processing a request.

The page does not save a separate RAG conversation. Successful automatic SQL runs are recorded through the existing query audit path and can be viewed in Week 7 My activity. Retrieval/generation-only attempts are not added to that SQL audit table. The RAG page does not update the Week 7 page's in-memory score.

## Deployment and submission

After local checks, push the new source files plus the dependency changes already made during setup. In the existing Vercel project, add the four server variables above to Production and redeploy. Preserve the existing four Supabase/PostgreSQL settings. The public URL is `/rag`, not the Vercel dashboard. Use an incognito window to confirm that a grader can open it without a Vercel account.

Week 8 explicitly requires a question/generated-SQL screenshot and, for bonus credit, executed SQL/result/validation evidence. After testing, save real images to:

```text
docs/screenshots/week8-rag-sql.png
docs/screenshots/week8-rag-validation.png
```

Before Canvas submission add the following section to the ROOT README, with the actual screenshots present. Keep the Week 7 instructions below it:

```markdown
## Week 8: RAG Text-to-SQL

[Open the RAG application](https://sql-quiz-supabase.vercel.app/rag)

**Grading login email and password are provided in the Canvas assignment comments.**

The RAG page embeds questions with Chroma Cloud Qwen, retrieves relevant schema/business/example notes, and asks Gemini to generate SQL from those retrieved notes. Automatic mode uses the existing read-only PostgreSQL executor and compares the live result with the selected quiz answer. [Architecture, setup, and running instructions](docs/week8-rag.md).

![Natural-language question and generated SQL](docs/screenshots/week8-rag-sql.png)
![Automatic SQL execution, result table, and validation](docs/screenshots/week8-rag-validation.png)
```

Do not record all tests as passing before observing the results. The reference/generated SQL need not match character-for-character, and a completed model call alone does not demonstrate automatic execution or correct validation.

## Current evidence

The user-provided CLI log confirms an eight-record collection, real five-note retrieval, and a successful Gemini SQL response. The model output was not executed or graded in that probe. The new web code is a separate delivery: hosted authentication, retrieval, generation, automatic execution, and validation still need the acceptance checks below. Authoring checks are documented separately and are not cloud execution claims.

| Acceptance check | Status when delivered |
| --- | --- |
| Week 7 regression tests and new RAG tests pass locally | Pending |
| Signed-out `/api/rag` refuses requests before provider calls | Pending hosted check |
| `/rag` loads and existing account signs in | Pending |
| A new question retrieves actual Chroma notes, shown on page | Pending |
| Gemini receives retrieved context and returns SQL | Pending web check; CLI probe passed |
| Default button automatically executes SQL and shows results | Pending |
| Correct/incorrect status agrees with the chosen reference result | Pending |
| Custom question is not falsely graded against a preset answer | Pending |
| Generation-only mode does not execute SQL | Pending |
| Provider/execution failures show errors, not fabricated success | Pending |
| Latest CI and Vercel deployment succeed | Pending |
| Root README and two required screenshots are updated | Pending |

Sources: [Chroma Qwen embedding integration](https://docs.trychroma.com/integrations/embedding-models/chroma-cloud-qwen), [Chroma collection queries](https://docs.trychroma.com/docs/querying-collections/query-and-get), and [Gemini generateContent](https://ai.google.dev/api/generate-content).
