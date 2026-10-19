# Mining Safety SQL Quiz

[![Quiz checks](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml)

**Quiz site:** [Open the Mining Safety SQL Quiz](https://sql-quiz-supabase.vercel.app)

## Grading access: check Canvas assignment comments

**I will provide the quiz login email and password in the Canvas assignment comments. Please check those comments before signing in. These credentials are for this quiz, not a university account.**

This IDS 706 Week 7 project uses Next.js, Supabase Auth, and hosted PostgreSQL. Its five questions are worth four points each and use 12 synthetic safety-inspection records from three mine sites. The records are teaching data, not real inspections or safety advice.

## Taking the quiz

Sign in, choose a question, enter SQL, and click **Run SQL & check answer**. The result comes from PostgreSQL. Each question includes a hint, reference SQL, and an expected result table. Grading compares the returned values and the requested column and row order, not SQL text or column aliases. A correct answer earns 4 points; an incorrect answer earns 0. The total is displayed out of 20. Hints are allowed: this is a practice quiz, not a secure examination.

Editing an answer or its parameters clears that question's displayed score until it is run again. **Preview live data** retrieves all 12 records without awarding points. **Save quiz** stores a private copy of the questions, answers, parameters, and scores derived from recorded runs. Refresh and click **Open** to restore it. **New copy** starts another draft.

Signed-out visitors may read hints and edit an unsaved draft, but cannot execute queries, preview live data, save, or retrieve private records. The website offers sign-in and sign-out only; it does not offer public registration or send registration emails.

## Parameterized queries

All five questions accept an optional JSON parameter array. Use `[]` when no parameters are needed. The first question has a **Use parameterized example** shortcut:

```sql
SELECT inspection_id, mine_site, hazard_type
FROM quiz_data.safety_inspections
WHERE risk_level = $1 AND status = $2
ORDER BY inspection_id;
```

```json
["High", "Open"]
```

Values are passed separately through node-postgres's `values` argument, not inserted into SQL text. The validator checks placeholder numbering and parameter types. The live database test also verifies that injection-like parameter text remains data. Other questions can use parameters where appropriate, such as `LIMIT $1` with `[3]` in question 3.

## Local setup

Use Node.js 22 or 24. Copy `.env.example` to `.env.local` only if you do not already have a configured local file. This deployment uses four variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase HTTPS Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable API key for the client and authenticated requests. |
| `QUIZ_DATABASE_URL` | The `quiz_reader` Session pooler URI, using port 5432 and `?sslmode=require`. Server only. |
| `QUIZ_DATABASE_CA_CERT` | Trusted CA PEM text, including its BEGIN and END lines. Server only. |

The database password belongs to `quiz_reader`, not a website user. Use the Session pooler username `quiz_reader.<project-ref>` and percent-encode reserved password characters in the URI. TLS certificate verification stays enabled. The CA value accepts actual line breaks or escaped `\n` sequences. Keep `.env.local` excluded from Git.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Database and authentication

For a new Supabase project, run these files in order in the SQL Editor as `postgres`:

```text
supabase/01_quiz_data.sql
supabase/02_quiz_reader_permissions.sql
supabase/03_saved_quizzes.sql
supabase/04_extra_credit.sql
```

Assign `quiz_reader` its LOGIN setting and password separately. The scripts contain no passwords. Keep `quiz_data` outside the Data API's exposed schemas: teaching queries use the authenticated Next.js endpoint and Session pooler, while saved quizzes use the user's Supabase token and owner-only row-level security (RLS). The existing deployed project already has these migrations applied; it does not need to be recreated.

Keep the Email provider enabled in Supabase Auth and disable **Allow new users to sign up**. Create and auto-confirm grading accounts through **Authentication → Users → Add user → Create new user**. Set the Auth Site URL to the public quiz URL. No OAuth application, SMTP service, or database administrator credential is required by the website.

## Audit history and integrity

**My activity** shows the caller's latest 50 recorded query and save events, including the user ID, server timestamp, operation, and SQL/parameters or saved contents. Save, update, and delete events are recorded by a database trigger in the same transaction as the saved record.

The private `quiz_audit.events` table denies direct access to `anon`, `authenticated`, and `quiz_reader`. After verifying a user, the backend can call a narrowly granted append function, but student SQL cannot call it. A read-only RPC returns only the caller's history. Saved scores are derived from matching server-recorded runs; client-supplied scores are ignored. These controls protect against the taker roles, not the database owner, and do not promise a complete access log during outages.

Run `supabase/05_verify_audit_integrity.sql` as `postgres` for the administrative integrity check. It exercises denied operations, caller isolation, unchanged entries, save logging, and forged-score rejection. Temporary data and role grants are rolled back; the existing records and permissions remain unchanged after a successful run.

## Checks, CI, and deployment

```powershell
npm run check:all
```

This runs TypeScript checking, automated tests, the production build, `check:db`, and `check:audit`, stopping on failure. The database check executes all five reference answers and parameterized queries against Supabase. The audit check verifies privileges and actually attempts prohibited operations as `quiz_reader`. SQL script 05 separately checks the other taker roles and database triggers.

GitHub Actions uses Node.js 22. The `tests` job runs offline checks and a build; `live-database` runs `check:db` and `check:audit` using the repository Secrets `QUIZ_DATABASE_URL` and `QUIZ_DATABASE_CA_CERT`. Pushes to `main` and manual runs include the live checks. Pull requests run offline checks without those secrets. The badge links to the workflow.

The site is deployed on Vercel. To reproduce the deployment, import this repository as Next.js and configure the same four variables for Production before building. Use the assigned `vercel.app` URL and verify that graders can open it without a separate Vercel login. Environment-variable changes require a new deployment.

## Verification and limitations

TypeScript checking, all **117 automated tests**, the production build, and both live database checks passed. SQL script 05 completed **19 integrity checks**. The latest CI checks passed, and production testing confirmed all five answers, **20/20** scoring, incorrect-answer scoring, save/reopen recovery, query and save activity, cross-account isolation, and signed-out restrictions. The detailed record is in [docs/acceptance.md](docs/acceptance.md).

The query editor supports a limited SQL subset: one SELECT over the teaching table, common expressions and aggregates, grouping, sorting, and LIMIT. Joins, CTEs, subqueries, other schemas, and writes are not supported. Execution is read-only, has a three-second statement timeout, and displays at most 100 rows. Parameter binding, operation logging, and taker-level log integrity are implemented and tested for the optional extra-credit requirements; the course determines the awarded marks.
