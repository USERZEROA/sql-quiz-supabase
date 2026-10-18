"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS, SCHEMA_COLUMNS, STARTER_SQL, emptyAnswers, type ResultTable } from "../lib/questions";

type SavedQuiz = { id: string; title: string; answers: Record<string, string>; updated_at: string };
type QueryResult = ResultTable & { elapsedMs: number; truncated: boolean };

// Reuse one client per browser tab, including during development hot reloads.
function browserClient(url: string, key: string): SupabaseClient {
  const browser = window as Window & { miningQuizSupabase?: SupabaseClient };
  browser.miningQuizSupabase ??= createClient(url, key);
  return browser.miningQuizSupabase;
}

function Table({ data }: { data: ResultTable }) {
  return <div className="table-scroll"><table><thead><tr>
    {data.columns.map((column, index) => <th key={index}>{column}</th>)}
  </tr></thead><tbody>
    {data.rows.map((row, index) => <tr key={index}>{row.map((value, i) =>
      <td key={i}>{value === null ? <span className="muted">NULL</span> : String(value)}</td>
    )}</tr>)}
  </tbody></table>{data.rows.length === 0 && <p className="empty">The query returned no rows.</p>}</div>;
}

export default function Home() {
  const client = useRef<SupabaseClient | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(emptyAnswers);
  const [title, setTitle] = useState("My mining safety quiz");
  const [savedId, setSavedId] = useState<string | undefined>();
  const [saved, setSaved] = useState<SavedQuiz[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const question = QUESTIONS[active];
  const answer = answers[String(question.id)] ?? "";

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setAuthMessage("Set the two public Supabase environment variables, then restart or redeploy the site."); return; }
    const supabase = browserClient(url, key);
    client.current = supabase;
    let mounted = true;
    const applySession = (next: Session | null) => {
      if (!mounted) return;
      if (sessionRef.current?.user.id !== next?.user.id) {
        setAnswers(emptyAnswers()); setSaved([]); setSavedId(undefined);
        setResult(null); setMessage(""); setTitle("My mining safety quiz");
      }
      sessionRef.current = next; setSession(next); setReady(true);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && mounted) setAuthMessage("Could not restore your session. Please sign in.");
      applySession(data.session);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function api(path: string, body?: unknown) {
    const current = await client.current?.auth.getSession();
    const token = current?.data.session?.access_token;
    if (!token) throw new Error("Sign in before running or saving a quiz.");
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store", signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    api("/api/quizzes").then(data => { if (!cancelled) setSaved(data.quizzes); })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [session?.user.id]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (!client.current) return;
    setAuthBusy(true); setAuthMessage("");
    try {
      const credentials = { email: email.trim(), password };
      const response = signUp ? await client.current.auth.signUp(credentials) :
        await client.current.auth.signInWithPassword(credentials);
      if (response.error) throw response.error;
      setPassword("");
      setAuthMessage(response.data.session ? "" : "Account request received. Confirm your email before signing in. If this is the class demo, ask the owner to check the email-confirmation setting.");
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (!client.current) return;
    setAuthBusy(true);
    const { error } = await client.current.auth.signOut();
    if (error) setAuthMessage(error.message);
    setAuthBusy(false);
  }

  async function run(sql = answer) {
    const owner = sessionRef.current?.user.id;
    setBusy(true); setMessage(""); setResult(null);
    try {
      const data = await api("/api/query", { sql });
      if (sessionRef.current?.user.id === owner) setResult(data);
    } catch (error) {
      if (sessionRef.current?.user.id === owner) setMessage(error instanceof Error ? error.message : "Query failed.");
    } finally { setBusy(false); }
  }

  async function saveQuiz() {
    const owner = sessionRef.current?.user.id;
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/quizzes", { ...(savedId ? { id: savedId } : {}), title, answers });
      if (sessionRef.current?.user.id !== owner) return;
      setSavedId(data.quiz.id);
      setSaved(previous => [data.quiz, ...previous.filter(q => q.id !== data.quiz.id)]);
      setMessage("Quiz and answers saved to your account.");
    } catch (error) {
      if (sessionRef.current?.user.id === owner) setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally { setBusy(false); }
  }

  function updateAnswer(sql: string) {
    setAnswers(previous => ({ ...previous, [String(question.id)]: sql }));
    setResult(null);
    setMessage("");
  }

  function openQuiz(quiz: SavedQuiz) {
    setSavedId(quiz.id); setTitle(quiz.title); setAnswers({ ...emptyAnswers(), ...quiz.answers });
    setActive(0); setResult(null); setMessage("Saved quiz opened.");
  }

  return <main className="shell">
    <header className="topbar"><div className="wordmark">MINE / SQL LAB</div><span className="tag">5 questions · 20 points</span></header>
    <section className="intro"><p className="eyebrow">SQL PRACTICE</p><h1>Mining Safety SQL Quiz</h1>
      <p>Investigate inspection records across three mine sites. Write your own query, run it against PostgreSQL, and compare the result with the hint.</p>
      <p className="muted">All 12 records are synthetic teaching data, not operational safety advice.</p>
    </section>
    <section className="auth card">
      {session ? <div className="auth-row"><div><strong>Signed in</strong><p>{session.user.email}</p></div>
        <button className="secondary" onClick={signOut} disabled={authBusy}>Sign out</button></div> : <>
        <h2>{signUp ? "Create an account" : "Sign in to run and save"}</h2>
        <p className="muted">You may read the questions while signed out. Running SQL and saving a quiz require an account.</p>
        <form className="auth-form" onSubmit={authenticate}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signUp ? "new-password" : "current-password"} minLength={8} required /></label>
          <button disabled={!ready || authBusy}>{authBusy ? "Please wait…" : signUp ? "Create account" : "Sign in"}</button>
        </form>
        <button className="link" onClick={() => { setSignUp(!signUp); setAuthMessage(""); }} disabled={authBusy}>
          {signUp ? "Already registered? Sign in" : "New here? Create an account"}
        </button>
      </>}
      {authMessage && <p className="notice" role="status">{authMessage}</p>}
    </section>

    <div className="workspace"><aside>
      <nav className="question-nav" aria-label="Quiz questions">{QUESTIONS.map((q, i) =>
        <button key={q.id} className={active === i ? "question-tab active" : "question-tab"}
          disabled={busy} onClick={() => { setActive(i); setResult(null); setMessage(""); }} aria-current={active === i ? "step" : undefined}>
          <span className="number">{q.id}</span><span>{q.title}<small>{q.points} points</small></span>
        </button>
      )}</nav>
      <section className="card schema"><h2>Database schema</h2><code>quiz_data.safety_inspections</code>
        <dl>{SCHEMA_COLUMNS.map(([name, type]) => <div key={name}><dt>{name}</dt><dd>{type}</dd></div>)}</dl>
        <button className="secondary" onClick={() => run(STARTER_SQL)} disabled={!session || busy}>Preview live data</button>
      </section>
    </aside><section className="card editor">
      <div className="heading-row"><p className="eyebrow">QUESTION {question.id}</p><span className="tag">{question.points} points</span></div>
      <h2>{question.title}</h2><p>{question.prompt}</p><p className="concept">{question.concept}</p>
      <label className="sql-label" htmlFor="sql">Your SQL</label>
      <textarea id="sql" className="sql-editor" value={answer} spellCheck={false} maxLength={4000} disabled={busy}
        onChange={e => updateAnswer(e.target.value)}
        placeholder="SELECT ...
FROM quiz_data.safety_inspections;" />
      <div className="actions"><button onClick={() => run()} disabled={!session || busy || !answer.trim()}>{busy ? "Working…" : "Run SQL"}</button>
        <span className="muted">Read-only SELECT · 3-second limit · up to 100 rows</span></div>
      {message && <p className="notice" role="status">{message}</p>}
      {result && <section className="results" aria-live="polite"><h3>Query result <small>{result.rows.length} rows · {result.elapsedMs} ms</small></h3>
        <Table data={result} />{result.truncated && <p className="muted">Only the first 100 rows are shown.</p>}
      </section>}
      <details className="hint" key={question.id}><summary>Show hint, reference SQL, and expected result</summary>
        <p>{question.hint}</p><pre><code>{question.sql}</code></pre>
        <button className="secondary" disabled={busy} onClick={() => updateAnswer(question.sql)}>Use reference SQL</button>
        <h3>Expected result</h3><Table data={question.expected} />
        <p className="muted">These are reference results for the seeded dataset, not a live query. Run SQL to retrieve live rows. Equivalent queries are welcome; there is no character-for-character SQL check.</p>
      </details>
    </section></div>

    <section className="card saved-section"><div className="heading-row"><h2>My saved quizzes</h2><span className="muted">Private to your account</span></div>
      <div className="save-form"><label>Quiz title<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
        <button onClick={saveQuiz} disabled={!session || busy}>{savedId ? "Update saved quiz" : "Save quiz"}</button>
        <button className="secondary" disabled={busy} onClick={() => { setSavedId(undefined); setAnswers(emptyAnswers()); setResult(null); setTitle("My mining safety quiz"); setMessage(""); }}>New copy</button></div>
      {!session ? <p className="muted">Sign in to save the five questions and your SQL answers, then reopen them later.</p> :
        saved.length ? <ul className="saved-list">{saved.map(q => <li key={q.id}><div><strong>{q.title}</strong><small>{new Date(q.updated_at).toLocaleString()}</small></div>
          <button className="secondary" disabled={busy} onClick={() => openQuiz(q)}>Open</button></li>)}</ul> : <p className="muted">No saved quizzes yet.</p>}
    </section>
    <footer>IDS 706 · Hosted PostgreSQL with Supabase Auth · Synthetic mining inspection data</footer>
  </main>;
}
