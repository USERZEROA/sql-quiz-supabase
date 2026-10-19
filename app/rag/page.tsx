"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { QUESTIONS, type ResultTable } from "../../lib/questions";
import type { RagReport } from "../../lib/rag-types";
import styles from "./rag.module.css";
import PageNavigation from "../components/page-navigation";

function Table({ data }: { data: ResultTable }) {
  return <div className="table-scroll"><table><thead><tr>{data.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
    <tbody>{data.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === null ? "NULL" : String(cell)}</td>)}</tr>)}</tbody>
  </table>{!data.rows.length && <p className="empty">The query returned no rows.</p>}</div>;
}

export default function RagPage() {
  const client = useRef<SupabaseClient | null>(null);
  const currentUser = useRef<string | null>(null);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [selected, setSelected] = useState("1");
  const [question, setQuestion] = useState(QUESTIONS[0].prompt);
  const [execute, setExecute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<RagReport | null>(null);
  const reference = selected ? QUESTIONS.find(q => q.id === Number(selected)) : undefined;

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setAuthMessage("Missing public Supabase settings. Configure them before building the site."); return; }
    const browser = window as Window & { miningQuizSupabase?: SupabaseClient };
    browser.miningQuizSupabase ??= createClient(url, key);
    const supabase = browser.miningQuizSupabase;
    client.current = supabase;
    let mounted = true;
    const apply = (next: Session | null) => {
      if (!mounted) return;
      const id = next?.user.id ?? null;
      if (currentUser.current !== id) {
        revision.current += 1; controller.current?.abort();
        pending.current = false; setBusy(false); setReport(null); setMessage("");
      }
      currentUser.current = id; setSession(next); setReady(true);
    };
    let authEvents = 0;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { authEvents += 1; apply(next); });
    const version = authEvents;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && mounted) setAuthMessage("Could not restore your session. Please sign in again.");
      if (authEvents === version) apply(data.session);
    }).catch(() => { if (mounted) { setAuthMessage("Could not restore the session."); setReady(true); } });
    return () => { mounted = false; revision.current += 1; controller.current?.abort(); listener.subscription.unsubscribe(); };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!client.current) return;
    setAuthBusy(true); setAuthMessage("");
    try {
      const { error } = await client.current.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setAuthMessage("Sign-in failed. Check the quiz account details in Canvas.");
      else setPassword("");
    } catch { setAuthMessage("Sign-in could not reach Supabase. Try again later."); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (!client.current) return;
    revision.current += 1; controller.current?.abort(); pending.current = false;
    setBusy(false); setReport(null); setAuthBusy(true);
    try {
      const { error } = await client.current.auth.signOut();
      if (error) setAuthMessage("Sign-out failed. Please try again.");
    } catch { setAuthMessage("Sign-out could not be completed."); }
    finally { setAuthBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setReport(null); setMessage("");
    const owner = currentUser.current;
    const attempt = ++revision.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 115000);
    try {
      const { data, error } = await client.current!.auth.getSession();
      if (error || !data.session || !owner) throw new Error("Sign in before generating SQL.");
      if (attempt !== revision.current || currentUser.current !== owner) return;
      const response = await fetch("/api/rag", {
        method: "POST", cache: "no-store", signal: abort.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ question, questionId: selected ? Number(selected) : null, execute }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "RAG request failed.");
      if (!Array.isArray(body.retrieved)) throw new Error("Unexpected response. Check the deployed API version.");
      if (attempt === revision.current && currentUser.current === owner) setReport(body as RagReport);
    } catch (error) {
      if (attempt === revision.current && currentUser.current === owner) {
        setMessage(error instanceof Error && error.name === "AbortError" ? "The request was cancelled or exceeded the time limit. No retry was made."
          : error instanceof Error ? error.message : "Request failed.");
      }
    } finally {
      clearTimeout(timeout);
      if (attempt === revision.current) { pending.current = false; setBusy(false); }
    }
  }

  return <main className={`shell ${styles.page}`}>
    <PageNavigation active="rag" busy={busy || authBusy} />
    <section className="intro"><span className="eyebrow">QUESTION → RETRIEVAL → GENERATION → VALIDATION</span>
      <h1>Ask the mining database</h1><p>Ask a question in plain language. Chroma retrieves relevant knowledge, Gemini writes SQL, and PostgreSQL can execute it with read-only access.</p>
      <p className="muted">Synthetic teaching data only. AI-generated SQL can be wrong; the output and validation are shown separately.</p>
    </section>

    <section className="card auth" aria-label="Account">
      {session ? <div className="auth-row"><div><strong>Signed in</strong><p>{session.user.email}</p></div>
        <button className="secondary" onClick={signOut} disabled={authBusy}>Sign out</button></div>
        : <><h2>Sign in to generate and run SQL</h2><p><strong>Grading account and password: see the Canvas assignment comments.</strong></p>
          <form className="auth-form" onSubmit={signIn}>
            <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button disabled={!ready || authBusy}>Sign in</button>
          </form></>}
      {authMessage && <p className="notice" role="status">{authMessage}</p>}
    </section>

    <form className="card" onSubmit={submit}>
      <h2>1. Ask a question</h2>
      <label>Expected answer to validate against
        <select className={styles.select} value={selected} disabled={busy} onChange={e => {
          const value = e.target.value; setSelected(value);
          setQuestion(value ? QUESTIONS.find(q => q.id === Number(value))!.prompt : ""); setReport(null); setMessage("");
        }}>
          {QUESTIONS.map(q => <option key={q.id} value={q.id}>{q.id}. {q.title}</option>)}
          <option value="">Custom question — no expected answer</option>
        </select>
      </label>
      <p className="muted">Rephrase the selected quiz question without changing its meaning. For a different task, choose Custom question. Reference SQL and expected rows are not sent to Gemini.</p>
      <label htmlFor="rag-question">Your natural-language question</label>
      <textarea id="rag-question" className={styles.question} maxLength={1500} value={question} disabled={busy} required
        onChange={e => { setQuestion(e.target.value); setReport(null); setMessage(""); }} />
      <label className={styles.checkbox}><input type="checkbox" checked={execute} disabled={busy} onChange={e => { setExecute(e.target.checked); setReport(null); }} />
        Automatically execute the generated SQL and validate against the selected question
      </label>
      <div className="actions"><button disabled={!session || !ready || busy || !question.trim()}>
        {busy ? "Retrieving and generating…" : execute ? "Generate, run & validate" : "Generate SQL"}
      </button><span className="muted">Uses Chroma credits and Gemini quota. Wait 10 seconds between requests.</span></div>
      {busy && <p className="notice" role="status">Working on the server. Do not click again; a rejected query will not be replaced with a reference answer.</p>}
      {message && <p className={styles.error} role="alert">{message}</p>}
    </form>

    {report && <section className={styles.output} aria-live="polite">
      <div className={styles.stats}><span><strong>{report.retrieved.length}</strong> retrieved notes</span>
        <span>{report.generated?.model ?? "Generation not completed"}</span><span>{(report.elapsedMs / 1000).toFixed(1)}s total</span></div>
      {report.error && <p className={styles.error} role="alert"><strong>{report.error.stage} failed:</strong> {report.error.message}</p>}
      {report.generated && <section className="card"><h2>2. AI-generated SQL</h2>
        <p className="muted">Question: {report.question}</p><pre className={styles.code}><code>{report.generated.sql}</code></pre>
        <p className="muted">Model: {report.generated.model} · Input tokens: {report.generated.inputTokens ?? "not reported"} · Output tokens: {report.generated.outputTokens ?? "not reported"}</p>
        {!execute && <p className="notice">Generation only. This SQL has not been executed or validated.</p>}
      </section>}
      {report.run && <section className="card"><h2>3. PostgreSQL result</h2><p className="muted">{report.run.rows.length} rows · {report.run.elapsedMs} ms · read-only quiz_reader</p>
        <Table data={report.run} />
        {report.run.truncated && <p className="notice">Only the first 100 rows are displayed.</p>}
        <h3>4. Result validation</h3>
        {report.run.grade ? <p className={`grade ${report.run.grade.correct ? "correct" : "incorrect"}`}>
          <strong>{report.run.grade.correct ? "Correct" : "Incorrect"} — {report.run.grade.earned}/{report.run.grade.possible}</strong><br />{report.run.grade.feedback}
        </p> : <p className="notice">Not graded: this custom question has no expected answer. SQL execution succeeded.</p>}
        <p className="muted">Compared by returned values and required row order, not SQL text. Audit event: {report.run.auditId}</p>
        {reference && <details><summary>Expected result for question {reference.id}</summary><Table data={reference.expected} /></details>}
      </section>}
      {report.generated && report.error?.stage === "execution" && <p className="notice">SQL generation completed, but execution/validation did not. The model output above is preserved; no reference SQL was substituted.</p>}
      <section className="card"><h2>Retrieved knowledge</h2><p className="muted">Collection: {report.collection}. These exact notes were supplied to Gemini. Distance is not an accuracy score.</p>
        {report.retrieved.map((note, i) => <details key={note.id} className={styles.note} open={i === 0}>
          <summary>{i + 1}. {note.id} · {note.kind} · distance {note.distance === null ? "not reported" : note.distance.toFixed(6)}</summary>
          <pre className={styles.code}>{note.text}</pre>
        </details>)}
        {!report.retrieved.length && <p>No usable retrieval results. Generation was not attempted.</p>}
      </section>
    </section>}
    <footer>IDS 706 Week 8 · Chroma Cloud + Qwen embeddings · Gemini · Supabase PostgreSQL</footer>
  </main>;
}
