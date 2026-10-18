# Mining Safety SQL Quiz

[![Quiz checks](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/USERZEROA/sql-quiz-supabase/actions/workflows/ci.yml)

**Quiz site:** Not deployed yet.

**Grading login:** `haiweiyu@duke.edu`. Use the quiz password supplied privately through Canvas, not a Duke account password.

This IDS 706 Week 7 project is a 20-point SQL quiz built with Next.js, Supabase Auth, and hosted PostgreSQL. Its five questions use 12 synthetic safety-inspection records from three mine sites. The records are teaching examples, not real inspections or safety advice.

## Using the quiz

Sign in, choose a question, enter SQL, and click **Run SQL** to see rows from the hosted database. Each question is worth four points and includes a hint, reference SQL, and an expected result table. The questions cover filtering, grouping, recent inspections, distinct hazards, and HAVING. Different SQL that produces the requested result is acceptable; there is no character-for-character answer check.

**Preview live data** retrieves all 12 records. **Save quiz** stores a private copy of the five questions and your SQL answers. Give it a title and use **Open** under **My saved quizzes** to restore it after refreshing or signing in again. **New copy** starts another draft. Saving does not mark answers as correct.

Signed-out visitors can read questions, view hints, and edit an unsaved draft. Running SQL, previewing live data, saving, and retrieving saved quizzes require a verified signed-in user.

## Local setup

Use Node.js 22 or 24. From the repository root, install the locked dependencies and start the development server:

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`. Before starting, copy `.env.example` to `.env.local` if you do not already have a configured local file. For this project's verified connection, configure all four variables below. Keep `.env.local` out of Git.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key. |
| `QUIZ_DATABASE_URL` | The `quiz_reader` Session pooler URI, using port 5432 and ending in `?sslmode=require`. Server only. |
| `QUIZ_DATABASE_CA_CERT` | The trusted CA certificate supplied by Supabase, as PEM text. Server only. |

Use the `quiz_reader` password, not an administrator or website-user password, and percent-encode reserved characters in the URI. Certificate verification stays enabled. The CA value accepts PEM with actual line breaks or escaped `\n` sequences; include the complete BEGIN and END lines.

## Database and authentication setup

For a new Supabase project, run these scripts in order in the SQL Editor using the administrative role:

```text
supabase/01_quiz_data.sql
supabase/02_quiz_reader_permissions.sql
supabase/03_saved_quizzes.sql
```

These create teaching data, reader permissions, and the saved-quiz table. Enable LOGIN and assign a password to `quiz_reader` separately; the scripts do not contain or reset passwords. Keep `quiz_data` outside the Data API's exposed schemas. Teaching SQL runs through the Next.js endpoint and Session pooler. Saving uses the user's Supabase token and owner-only row-level security (RLS).

Enable the Email provider in Supabase Auth. For a grading account, use **Authentication → Users → Add user → Create new user**, set an email and a quiz-only password, and select **Auto Confirm User**. This confirms that individual account without depending on confirmation email delivery. Website sign-in is separate from database-role login. Public self-registration requires a working confirmation flow if email confirmation is enabled; it has not yet been verified on a deployed site.

The development database already has all three scripts applied. It does not need to be recreated for deployment.

## Checks and GitHub Actions

```powershell
npm run check
npm run check:db
```

`check` runs TypeScript checking, tests, and the production build. Tests cover authentication, request validation, reference queries, and accepted or rejected SQL. `check:db` connects to Supabase, verifies reader permissions and the 12-row dataset, checks saved-quiz isolation, and compares all five reference queries with their expected results. Missing connection settings cause failure, not a skipped check.

The workflow in `.github/workflows/ci.yml` uses Node.js 22. Its `tests` job runs the offline checks and build; `live-database` then connects to Supabase using the repository Secrets `QUIZ_DATABASE_URL` and `QUIZ_DATABASE_CA_CERT`. Both secrets are configured for this project. Pushes to `main` and manual runs include the live check. Pull requests run offline checks without database secrets. The badge above links to the workflow results.

## Deployment

Import this repository into Vercel as a Next.js project, with the repository root as the project root and Node.js 22 or 24. Configure the same four environment variables for Production before deploying. Public Supabase variables are needed at build time, so changes require a new deployment. Use the assigned `vercel.app` production URL; no custom domain is needed.

After deployment, update Supabase's Site URL and the quiz-site line above. Verify public access, sign-in, SQL execution, saving, reopening, and sign-out using [docs/acceptance.md](docs/acceptance.md).

## Verification and scope

Local TypeScript checks, all 58 automated tests, and the production build passed. The live database check passed with certificate verification and matched all five questions. Browser testing confirmed sign-in, the 12-row preview, the first question's four-row result, saving, reopening after refresh, and signed-out controls. GitHub Actions also completed both the `tests` and `live-database` jobs successfully. Public deployment and hosted-browser acceptance are still pending.

This is a focused teaching tool, not a general PostgreSQL console. It accepts one SELECT over `quiz_data.safety_inspections` and supports the comparisons, aggregates, grouping, sorting, and limits needed by the quiz. Joins, CTEs, subqueries, other tables, writes, and administrative functions are outside its supported SQL subset. The server validates the user before execution, uses a read-only transaction, applies a three-second statement timeout, and returns at most 100 rows.

Fixed application values use query parameters, and saved SQL is sent as data through the Supabase client. Student-authored SQL is restricted through structural validation and database permissions rather than treated as one parameter. Audit logging and tamper-resistant audit-log checks are not implemented or claimed for extra credit.