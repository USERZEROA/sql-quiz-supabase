# Mining Safety SQL Quiz

[![Quiz checks](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml)

**Quiz site:** [Open the quiz](https://sql-quiz-supabase.vercel.app)

## Grading access: check Canvas assignment comments

**I will provide the quiz login email and password in the Canvas assignment comments. Please check those comments before signing in. These are quiz-only credentials, not a university account login. No login password is stored in this repository.**

This IDS 706 Week 7 project uses Next.js, Supabase Auth, and hosted PostgreSQL. Five SQL questions are worth four points each. The dataset contains 12 synthetic mine-inspection records, not real inspections or safety advice.

## Taking the quiz

Sign in, choose a question, enter SQL, and click **Run SQL & check answer**. The result comes from PostgreSQL. The server compares returned values and the row order requested in the question, not SQL text or alias spelling. Correct results earn 4 points and incorrect results earn 0; the total is shown out of 20. Hints are available, so this is a practice quiz rather than a secure examination.

Editing SQL or parameters clears that question's displayed score until it is run again. **Preview live data** shows all 12 records but awards no points. **Save quiz** stores the questions, answers, parameters, and scores derived from recorded runs. Refresh and use **Open** to restore them. Old saved quizzes remain available; answers saved before grading was added need to be run once to earn scores.

Visitors may read hints and edit an unsaved draft while signed out. Query execution, saving, saved quizzes, and activity history require a verified user. Save requests cannot set their own owner or score.

## Parameterized queries

Ordinary SELECT queries still work with `[]` in the Parameters box. To bind values separately, use placeholders and a JSON array:

```sql
SELECT inspection_id, mine_site, hazard_type
FROM quiz_data.safety_inspections
WHERE risk_level = $1 AND status = $2
ORDER BY inspection_id;
```

```json
["High", "Open"]
```

The first question has a **Use parameterized example** button. Values are passed through node-postgres's `values` argument, not substituted into SQL text. The validator checks placeholder numbering and value types. `check:db` verifies the parameterized result and checks that injection-like text stays data.

## Setup

Use Node.js 22 or 24. Copy `.env.example` to `.env.local` only if a configured local file does not already exist. Keep the following four values from your Supabase project:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase HTTPS Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable API key for the client and authenticated requests. |
| `QUIZ_DATABASE_URL` | `quiz_reader` Session pooler URI, port 5432, with `?sslmode=require`. |
| `QUIZ_DATABASE_CA_CERT` | Trusted CA PEM text, including BEGIN and END lines. |

The database password belongs to `quiz_reader`, not a website user or database administrator. The driver verifies TLS certificates. The CA accepts real line breaks or escaped `\n` sequences. Existing working connection settings do not change for this upgrade.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`. For a new database, run SQL scripts 01, 02, 03, and 04 in `supabase/` in order. Set the reader's LOGIN/password separately. In the database already used for this project, run **only `04_extra_credit.sql`**, then **`05_verify_audit_integrity.sql`**. These do not replace teaching data or reset passwords.

Enable the Email provider in Supabase Auth. A grading user can be created and auto-confirmed in **Authentication → Users → Add user**. Public signup still depends on the project's confirmation/email configuration. Set the Auth Site URL to the public quiz URL. No OAuth application or administrator credential is needed by the website.

## Audit history and integrity

**My activity** shows the caller's latest 50 query and save events. Each entry includes a user ID, server timestamp, operation, and the SQL/parameters or saved quiz contents. Authenticated query execution rejections are also recorded. Save, update, and delete events come from a database trigger and commit in the same transaction as the saved record.

The private `quiz_audit.events` table has no direct access grants for `anon`, `authenticated`, or `quiz_reader`. The backend reader may call one append-only function after verifying the user's token; it cannot update or delete existing events. Student SQL cannot call that function. A separate read-only RPC checks `auth.uid()` and returns only the caller's events. This provides taker-level integrity, not protection against the database owner. SQL Editor administrators can inspect the full table.

Saved scores are rebuilt by a trigger from the most recent matching server-recorded query for that user, question, SQL, and parameters. Client-supplied scores are ignored. New edits without matching runs have no saved score. Query results are not reported as successful if their audit write fails. Requests rejected before a usable authenticated query is received, and database outages, are not a guarantee of a complete access log.

## Checks and deployment

```powershell
npm run check:all
```

`check:all` runs the following checks in sequence and stops at the first failure. `check` runs TypeScript, automated tests, and a production build. `check:db` verifies the live dataset, all five answers, and bound parameters. `check:audit` verifies grants and actually attempts prohibited table operations as `quiz_reader`. Run SQL script 05 as `postgres` to test mutation attempts under `authenticated`, `anon`, and `quiz_reader`, caller-only history, unchanged log contents, save logging, and rejection of forged saved scores. Its temporary test records are removed before commit; unexpected success aborts the transaction.

GitHub Actions uses the existing `QUIZ_DATABASE_URL` and `QUIZ_DATABASE_CA_CERT` Secrets. Its `tests` and `live-database` jobs must both pass; the latter now includes the audit check. No new Secret is required. Deploy the repository to Vercel with the same four Production environment variables and apply migration 04 before deploying the new code. Use the free `vercel.app` URL.

The baseline previously passed 58 tests, live database checks, CI, and hosted querying. The added parameter, audit, integrity, and grading features need the acceptance checks in [docs/acceptance.md](docs/acceptance.md) after this upgrade. Record actual results there rather than assuming new deployment success.

The SQL editor remains deliberately limited to one SELECT on the teaching table, common expressions and aggregates, grouping, sorting, and LIMIT. It does not support joins, CTEs, subqueries, or other schemas. Execution is read-only, limited to three seconds and 100 displayed rows. The implementation addresses the three optional areas—parameter binding, activity logging, and taker-level log integrity—but extra-credit marks depend on the demonstrated results and the course rubric.
