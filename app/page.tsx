"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS, SCHEMA_COLUMNS, STARTER_SQL, emptyAnswers, type ResultTable } from "../lib/questions";
import { parseParameterText, PARAMETER_EXAMPLE, type QueryParameters } from "../lib/parameters";
import { totalScore, type Grade, type Grades } from "../lib/grading";

type SavedQuiz = { id: string; title: string; answers: Record<string, string>;
  parameters?: Record<string, QueryParameters>; scores?: Grades; updated_at: string };
type AuditEvent = { id: string; created_at: string; actor_id: string; action: string; quiz_id: string | null; payload: Record<string, unknown> };
type QueryResult = ResultTable & { elapsedMs: number; truncated: boolean; grade: Grade | null; auditId: string };
const emptyParameters = (): Record<string, string> => Object.fromEntries(QUESTIONS.map(q => [String(q.id), "[]"]));

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
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(emptyAnswers);
  const [parameterText, setParameterText] = useState<Record<string, string>>(emptyParameters);
  const [scores, setScores] = useState<Grades>({});
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [activityMessage, setActivityMessage] = useState("");
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
        setAnswers(emptyAnswers()); setParameterText(emptyParameters()); setScores({});
        setActivity([]); setActivityMessage(""); setSaved([]); setSavedId(undefined);
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

  async function refreshActivity() {
    const owner = sessionRef.current?.user.id;
    if (!owner) return;
    try {
      const data = await api("/api/audit");
      if (sessionRef.current?.user.id === owner) { setActivity(data.events); setActivityMessage(""); }
    } catch (error) {
      if (sessionRef.current?.user.id === owner) setActivityMessage(error instanceof Error ? error.message : "Could not load activity.");
    }
  }

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    api("/api/quizzes").then(data => { if (!cancelled) setSaved(data.quizzes); })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    api("/api/audit").then(data => { if (!cancelled) { setActivity(data.events); setActivityMessage(""); } })
      .catch(error => { if (!cancelled) setActivityMessage(error.message); });
    return () => { cancelled = true; };
  }, [session?.user.id]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (!client.current) return;
    setAuthBusy(true); setAuthMessage("");
    try {
      const credentials = { email: email.trim(), password };
      const response = await client.current.auth.signInWithPassword(credentials);
      if (response.error) throw response.error;
      if (!response.data.session) throw new Error("Sign-in did not complete. Please try again.");
      setPassword("");
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

  async function run(preview = false) {
    const owner = sessionRef.current?.user.id;
    setBusy(true); setMessage(""); setResult(null);
    if (!preview) setScores(previous => { const next = { ...previous }; delete next[String(question.id)]; return next; });
    try {
      const sql = preview ? STARTER_SQL : answer;
      const parameters = preview ? [] : parseParameterText(parameterText[String(question.id)] ?? "[]");
      const data = await api("/api/query", { sql, parameters, ...(preview ? {} : { questionId: question.id }) });
      if (sessionRef.current?.user.id === owner) {
        setResult(data);
        if (data.grade) setScores(previous => ({ ...previous, [String(question.id)]: data.grade }));
        await refreshActivity();
      }
    } catch (error) {
      if (sessionRef.current?.user.id === owner) {
        setMessage(error instanceof Error ? error.message : "Query failed.");
        await refreshActivity();
      }
    } finally { setBusy(false); }
  }

  async function saveQuiz() {
    const owner = sessionRef.current?.user.id;
    setBusy(true); setMessage("");
    try {
      const parameters: Record<string, QueryParameters> = {};
      for (const q of QUESTIONS) {
        try { parameters[String(q.id)] = parseParameterText(parameterText[String(q.id)] ?? "[]"); }
        catch (error) { throw new Error(`Question ${q.id}: ${error instanceof Error ? error.message : "Invalid parameters."}`); }
      }
      const data = await api("/api/quizzes", { ...(savedId ? { id: savedId } : {}), title, answers, parameters });
      if (sessionRef.current?.user.id !== owner) return;
      setSavedId(data.quiz.id);
      setSaved(previous => [data.quiz, ...previous.filter(q => q.id !== data.quiz.id)]);
      setScores(data.quiz.scores ?? {});
      setMessage("Quiz, parameters, and verified scores saved to your account.");
      await refreshActivity();
    } catch (error) {
      if (sessionRef.current?.user.id === owner) setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally { setBusy(false); }
  }

  function invalidateScore() {
    setScores(previous => { const next = { ...previous }; delete next[String(question.id)]; return next; });
    setResult(null); setMessage("");
  }

  function updateAnswer(sql: string) {
    invalidateScore();
    setAnswers(previous => ({ ...previous, [String(question.id)]: sql }));
    setResult(null);
    setMessage("");
  }

  function useReference() {
    updateAnswer(question.sql);
    setParameterText(previous => ({ ...previous, [String(question.id)]: "[]" }));
  }

  function newCopy() {
    setSavedId(undefined); setAnswers(emptyAnswers()); setParameterText(emptyParameters()); setScores({});
    setResult(null); setTitle("My mining safety quiz"); setMessage("");
  }

  function openQuiz(quiz: SavedQuiz) {
    setSavedId(quiz.id); setTitle(quiz.title); setAnswers({ ...emptyAnswers(), ...quiz.answers });
    setParameterText(Object.fromEntries(QUESTIONS.map(q => [String(q.id), JSON.stringify(quiz.parameters?.[String(q.id)] ?? [])])));
    setScores(quiz.scores ?? {});
    setActive(0); setResult(null); setMessage("Saved quiz opened. Scores belong to the exact saved SQL and parameters; edit and run again to recheck.");
  }

  return <main className="shell">
    <header className="topbar"><div className="wordmark">MINE / SQL LAB</div><span className="tag">5 questions · 20 points</span></header>
    <section className="intro"><p className="eyebrow">SQL PRACTICE</p><h1>Mining Safety SQL Quiz</h1>
      <p>Investigate inspection records across three mine sites. Write your own query, run it against PostgreSQL, and compare the result with the hint.</p>
      <p className="muted">All 12 records are synthetic teaching data, not operational safety advice.</p>
    </section>
    <section className="auth card">
      {session ? <div className="auth-row"><div><strong>Signed in</strong><p>{session.user.email}</p></div>
        <button className="secondary" onClick={signOut} disabled={authBusy || busy}>Sign out</button></div> : <>
        <h2>Sign in to run and save</h2>
        <p className="muted">Use an account provided by the quiz owner. You may read questions while signed out.</p>
        <p className="notice"><strong>For grading access, check the Canvas assignment comments for the quiz login email and password.</strong></p>
        <form className="auth-form" onSubmit={authenticate}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required /></label>
          <button disabled={!ready || authBusy}>{authBusy ? "Please wait…" : "Sign in"}</button>
        </form>
      </>}
      {authMessage && <p className="notice" role="status">{authMessage}</p>}
    </section>

    <section className="card score-panel" aria-live="polite">
      <div><h2>Quiz score: {totalScore(scores)} / 20</h2>
        <p className="muted">{Object.keys(scores).length} of 5 answers checked. Each correct result earns 4 points; incorrect results earn 0. Editing an answer or its parameters clears that question's score until you run it again.</p></div>
      <span className="tag">Practice quiz · hints allowed</span>
    </section>
    <div className="workspace"><aside>
      <nav className="question-nav" aria-label="Quiz questions">{QUESTIONS.map((q, i) =>
        <button key={q.id} className={active === i ? "question-tab active" : "question-tab"}
          disabled={busy} onClick={() => { setActive(i); setResult(null); setMessage(""); }} aria-current={active === i ? "step" : undefined}>
          <span className="number">{q.id}</span><span>{q.title}<small>{scores[String(q.id)] ? `${scores[String(q.id)].earned} / ${q.points} earned` : `${q.points} points · not checked`}</small></span>
        </button>
      )}</nav>
      <section className="card schema"><h2>Database schema</h2><code>quiz_data.safety_inspections</code>
        <dl>{SCHEMA_COLUMNS.map(([name, type]) => <div key={name}><dt>{name}</dt><dd>{type}</dd></div>)}</dl>
        <button className="secondary" onClick={() => run(true)} disabled={!session || busy}>Preview live data</button>
      </section>
    </aside><section className="card editor">
      <div className="heading-row"><p className="eyebrow">QUESTION {question.id}</p><span className="tag">{question.points} points</span></div>
      <h2>{question.title}</h2><p>{question.prompt}</p><p className="concept">{question.concept}</p>
      <label className="sql-label" htmlFor="sql">Your SQL</label>
      <textarea id="sql" className="sql-editor" value={answer} spellCheck={false} maxLength={4000} disabled={busy}
        onChange={e => updateAnswer(e.target.value)}
        placeholder="SELECT ...
FROM quiz_data.safety_inspections;" />
      <label className="sql-label" htmlFor="parameters">Parameters (JSON array, optional)</label>
      <textarea id="parameters" className="parameter-editor" rows={2} spellCheck={false} maxLength={2000} disabled={busy}
        value={parameterText[String(question.id)] ?? "[]"}
        onChange={event => { setParameterText(previous => ({ ...previous, [String(question.id)]: event.target.value })); invalidateScore(); }} />
      <p className="muted">Use $1, $2, … in SQL and supply values separately, for example ["High", "Open"]. Leave [] for a query without parameters.</p>
      {question.id === 1 && <button className="secondary" disabled={busy} onClick={() => {
        updateAnswer(PARAMETER_EXAMPLE.sql);
        setParameterText(previous => ({ ...previous, "1": JSON.stringify(PARAMETER_EXAMPLE.parameters) }));
      }}>Use parameterized example</button>}
      <div className="actions"><button onClick={() => run()} disabled={!session || busy || !answer.trim()}>{busy ? "Working…" : "Run SQL & check answer"}</button>
        <span className="muted">Read-only SELECT · 3-second limit · up to 100 rows</span></div>
      {message && <p className="notice" role="status">{message}</p>}
      {result?.grade && <p className={result.grade.correct ? "grade correct" : "grade incorrect"} role="status">
        <strong>{result.grade.earned} / {result.grade.possible} points.</strong> {result.grade.feedback}
      </p>}
      {result && <section className="results" aria-live="polite"><h3>Query result <small>{result.rows.length} rows · {result.elapsedMs} ms</small></h3>
        <Table data={result} />{result.truncated && <p className="muted">Only the first 100 rows are shown.</p>}
      </section>}
      <details className="hint" key={question.id}><summary>Show hint, reference SQL, and expected result</summary>
        <p>{question.hint}</p><pre><code>{question.sql}</code></pre>
        <button className="secondary" disabled={busy} onClick={useReference}>Use reference SQL</button>
        <h3>Expected result</h3><Table data={question.expected} />
        <p className="muted">These are reference results, not a live query. Scoring compares returned values and the requested order, not SQL text or alias spelling. Previewing data does not award points.</p>
      </details>
    </section></div>

    <section className="card saved-section"><div className="heading-row"><h2>My saved quizzes</h2><span className="muted">Private to your account</span></div>
      <div className="save-form"><label>Quiz title<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
        <button onClick={saveQuiz} disabled={!session || busy}>{savedId ? "Update saved quiz" : "Save quiz"}</button>
        <button className="secondary" disabled={busy} onClick={newCopy}>New copy</button></div>
      {!session ? <p className="muted">Sign in to save the five questions, your SQL, parameters, and verified scores.</p> :
        saved.length ? <ul className="saved-list">{saved.map(q => <li key={q.id}><div><strong>{q.title}</strong><small>{totalScore(q.scores ?? {})} / 20 · {new Date(q.updated_at).toLocaleString()}</small></div>
          <button className="secondary" disabled={busy} onClick={() => openQuiz(q)}>Open</button></li>)}</ul> : <p className="muted">No saved quizzes yet.</p>}
    </section>
    <section className="card activity-section">
      <div className="heading-row"><h2>My activity</h2><button className="secondary" disabled={!session || busy} onClick={refreshActivity}>Refresh activity</button></div>
      <p className="muted">Your latest 50 recorded query attempts and saves. This is an append-only history: your account cannot edit or delete its entries.</p>
      {activityMessage && <p className="notice" role="status">{activityMessage}</p>}
      {!session ? <p className="muted">Sign in to view your activity.</p> : activity.length ?
        <ul className="activity-list">{activity.map(event => <li key={event.id}>
          <details><summary>{event.action.replaceAll("_", " ")} · {String(event.payload.outcome ?? "success")} · {new Date(event.created_at).toLocaleString()}</summary>
            <p className="muted">Actor: {event.actor_id}<br />Event: {event.id}</p>
            <pre><code>{JSON.stringify(event.payload, null, 2)}</code></pre>
          </details></li>)}</ul> : <p className="muted">No recorded activity yet. Run a query or save a quiz.</p>}
    </section>
    <footer>IDS 706 · Hosted PostgreSQL with Supabase Auth · Synthetic mining inspection data</footer>
  </main>;
}
