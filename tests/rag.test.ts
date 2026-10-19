import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../lib/input";
import { QUESTIONS } from "../lib/questions";
import { gradeResult } from "../lib/grading";
import { acquireRagSlot, runRag, validateRagInput, type RagDependencies } from "../lib/rag-core";
import { buildGeminiBody, extractGeminiSql, generateRagSql } from "../lib/rag-gemini";
import { RAG_KNOWLEDGE } from "../lib/rag-knowledge";
import type { RagInput, RetrievedNote, RagRun } from "../lib/rag-types";

const note: RetrievedNote = { id: "rule", text: "A retrieved-only marker.", kind: "semantics", distance: .2 };
const input: RagInput = { question: "Find open high-risk inspections", questionId: 1, execute: true };
const sql = "SELECT inspection_id, mine_site, hazard_type FROM quiz_data.safety_inspections WHERE risk_level='High' AND status='Open' ORDER BY inspection_id";
const generated = { sql, model: "gemini-test", inputTokens: 20, outputTokens: 10 };
const table = QUESTIONS[0].expected;
const run: RagRun = { ...table, elapsedMs: 1, truncated: false, grade: gradeResult(1, table), auditId: "test-event" };
const deps: RagDependencies = { retrieve: async () => [note], generate: async () => generated, execute: async () => run };

test("RAG input defaults to automatic execution and ignores forged fields", () => {
  assert.deepEqual(validateRagInput({ question: "  my question  ", questionId: 1, sql: "forged", actor: "forged", score: 20 }),
    { question: "my question", questionId: 1, execute: true });
});
for (const body of [{question:""}, {question:"x".repeat(1501)}, {question:12}, {question:"ok",questionId:99},
  {question:"ok",questionId:"1"}, {question:"ok",execute:"yes"}]) {
  test(`RAG rejects invalid input ${JSON.stringify(body).slice(0,80)}`, () => assert.throws(() => validateRagInput(body), HttpError));
}
test("custom question has no default reference answer", () => assert.equal(validateRagInput({question:"custom"}).questionId, null));
test("generation-only mode remains supported", () => assert.equal(validateRagInput({question:"custom",execute:false}).execute, false));
test("exact retrieved context reaches Gemini and actual model SQL reaches execution", async () => {
  const stages: string[] = [];
  const result = await runRag(input, {
    retrieve: async q => { assert.equal(q,input.question); stages.push("retrieve"); return [note]; },
    generate: async (q, notes) => { assert.equal(q,input.question); assert.deepEqual(notes,[note]); stages.push("generate"); return generated; },
    execute: async (text,id) => { assert.equal(text,sql); assert.equal(id,1); stages.push("execute"); return run; },
  });
  assert.deepEqual(stages,["retrieve","generate","execute"]); assert.equal(result.run?.grade?.earned,4); assert.equal(result.error,null);
});
test("empty vector retrieval prevents generation and execution", async () => {
  const result = await runRag(input, { ...deps, retrieve: async () => [], generate: async () => { throw new Error("must not run"); } });
  assert.equal(result.error?.stage,"retrieval"); assert.equal(result.generated,null); assert.equal(result.run,null);
});
test("retrieval service failure never falls back to a reference answer", async () => {
  const result = await runRag(input,{...deps,retrieve: async () => {throw new Error("secret provider trace");}});
  assert.equal(result.error?.stage,"retrieval"); assert.ok(!result.error?.message.includes("secret"));
});
test("generation failure preserves retrieval evidence", async () => {
  const result = await runRag(input,{...deps,generate: async () => {throw new HttpError(502,"Quota exhausted");}});
  assert.equal(result.retrieved.length,1); assert.equal(result.error?.stage,"generation"); assert.equal(result.run,null);
});
test("unsafe generated SQL is preserved but execution is rejected", async () => {
  const result = await runRag(input,{...deps,generate: async () => ({...generated,sql:"DROP TABLE x"}), execute: async text => {
    assert.equal(text,"DROP TABLE x"); throw new HttpError(400,"Read-only SELECT only");
  }});
  assert.equal(result.error?.stage,"execution"); assert.equal(result.generated?.sql,"DROP TABLE x"); assert.equal(result.run,null);
});
test("incorrect live results remain incorrect instead of being replaced", async () => {
  const empty = {columns:table.columns,rows:[]};
  const result = await runRag(input,{...deps,execute: async () => ({...run,...empty,grade:gradeResult(1,empty)})});
  assert.equal(result.error,null); assert.equal(result.run?.grade?.correct,false); assert.equal(result.run?.grade?.earned,0);
});
test("generation-only never invokes the database", async () => {
  const result = await runRag({...input,execute:false},{...deps,execute: async () => {throw new Error("must not execute");}});
  assert.equal(result.generated?.sql,sql); assert.equal(result.run,null); assert.equal(result.error,null);
});
test("custom automatic execution is not graded against question one", async () => {
  const result = await runRag({...input,questionId:null},{...deps,execute: async (_sql,id) => {assert.equal(id,null);return {...run,grade:null};}});
  assert.equal(result.run?.grade,null);
});
test("prompt contains retrieved notes and question, not preset answers", () => {
  const body = JSON.stringify(buildGeminiBody("my question",[note]));
  assert.ok(body.includes(note.text)); assert.ok(body.includes("my question"));
  assert.ok(!body.includes(QUESTIONS[0].sql)); assert.ok(!body.includes(JSON.stringify(QUESTIONS[0].expected.rows)));
});
const apiData = (text: string) => ({ candidates:[{finishReason:"STOP",content:{parts:[{text}]}}], usageMetadata:{promptTokenCount:30,candidatesTokenCount:12} });
test("Gemini output extraction removes fences without replacing SQL", () => {
  const result=extractGeminiSql(apiData("```sql\nSELECT * FROM safety_inspections;\n```"),"m");
  assert.equal(result.sql,"SELECT * FROM safety_inspections;"); assert.equal(result.inputTokens,30);
});
test("Gemini thought parts are excluded", () => {
  assert.equal(extractGeminiSql({candidates:[{finishReason:"STOP",content:{parts:[{text:"private",thought:true},{text:"SELECT 1"}]}}]},"m").sql,"SELECT 1");
});
for (const data of [{}, {promptFeedback:{blockReason:"SAFETY"}}, {candidates:[{finishReason:"MAX_TOKENS"}]}, apiData(""), apiData("x".repeat(4001))]) {
  test(`incomplete Gemini response rejected ${JSON.stringify(data).slice(0,70)}`, () => assert.throws(() => extractGeminiSql(data,"m"),HttpError));
}
test("knowledge IDs match the existing eight-record collection", () => {
  assert.equal(RAG_KNOWLEDGE.length,8); assert.equal(new Set(RAG_KNOWLEDGE.map(n=>n.id)).size,8);
  assert.ok(RAG_KNOWLEDGE.some(n=>n.kind==="schema")); assert.ok(RAG_KNOWLEDGE.some(n=>n.kind==="example"));
});
test("in-flight and rapid repeat calls for the same user are refused", () => {
  const id = `test-${Date.now()}`; const release=acquireRagSlot(id);
  assert.throws(()=>acquireRagSlot(id),HttpError); release(); assert.throws(()=>acquireRagSlot(id),HttpError);
});
test("Gemini HTTP request uses real retrieval in the request body", async () => {
  const previous=globalThis.fetch; const key=process.env.GEMINI_API_KEY; const model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY="local-test-not-a-real-key"; delete process.env.GEMINI_MODEL;
  try {
    globalThis.fetch=async (_url,init) => {
      assert.equal(init?.method,"POST"); const body=JSON.parse(String(init?.body));
      assert.ok(body.contents[0].parts[0].text.includes(note.text));
      return Response.json(apiData(sql));
    };
    assert.equal((await generateRagSql(input.question,[note])).sql,sql);
    globalThis.fetch=async ()=>new Response("quota",{status:429});
    await assert.rejects(()=>generateRagSql(input.question,[note]), /quota or rate limit/);
  } finally {
    globalThis.fetch=previous; if(key===undefined) delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;
    if(model===undefined) delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=model;
  }
});
