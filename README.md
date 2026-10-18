# Mining Safety SQL Quiz

A 20-point SQL quiz built with Next.js, Supabase Auth, and hosted PostgreSQL for IDS 706 Week 7. The five questions use 12 synthetic mine-inspection records. They are teaching examples, not real inspections or safety recommendations.

**Quiz site: not deployed yet. Replace this line with the actual public Vercel URL before submitting.**

## Using the quiz

Open the site and create an account or sign in with an existing email and password. Choose a question, enter a SELECT query, and click **Run SQL**. The result table comes from the hosted database, not a browser fixture. Each question is worth four points and has a fold-out hint containing reference SQL and the expected result. Different SQL that produces the requested result is acceptable; the app does not grade by comparing query text.

**Preview live data** retrieves the teaching table. **Save quiz** stores a private copy of the five questions and your current answers in PostgreSQL. Give the copy a title, save it, then reopen it from **My saved quizzes** after refreshing or signing in again. **New copy** starts a separate draft. Reading questions and editing an unsaved local draft are allowed while signed out; running SQL, listing saved quizzes, and saving are not.

## Local setup

Use Node.js 22 or 24 and npm. In the repository root, keep your existing `.env.local`, or copy `.env.example` to `.env.local` and fill in the three required variables. Never commit the real file.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. `npm install` creates `package-lock.json`; commit that lockfile with the source after reviewing the changes. The first install needs network access.

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The project's HTTPS API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Its publishable key, not a secret/service-role key. |
| `QUIZ_DATABASE_URL` | The quiz_reader **Session pooler** URI on port 5432, ending in `?sslmode=require`. Server only. |

The database password is the password assigned to `quiz_reader`, not the project administrator password. URL-encode reserved characters in it. No administrator or service-role credential is needed by the website. The connection code requires TLS and verifies the server certificate; if your environment needs a custom root CA, set the optional `QUIZ_DATABASE_CA_CERT` to the PEM certificate supplied by Supabase. Do not disable certificate verification to bypass an error.

## Database setup

The SQL files belong in version control and contain no passwords. For a new Supabase project, run `supabase/01_quiz_data.sql`, `02_quiz_reader_permissions.sql`, and `03_saved_quizzes.sql` in that order using the SQL Editor's administrative role. The first two reproduce the teaching data and reader permissions. Existing data are not replaced, and an existing reader password/LOGIN setting is not reset. Assign the reader a strong password separately in a private administrative session; do not commit a password-setting statement.

For the project already initialized during development, **only `03_saved_quizzes.sql` still needs to be run**. It creates the saved-quiz table and owner-only RLS policies without modifying the 12 teaching records. Its final result should be `true, true, false, false`: RLS enabled, signed-in users allowed to save under their ownership policies, anonymous users not allowed to save, and quiz_reader not allowed to read saved quizzes.

Keep `quiz_data` out of the Data API's exposed schemas. Live student SQL goes through the authenticated Next.js endpoint and Session pooler. Saving uses Supabase's Data API with the signed-in user's token and RLS; the database identity for live SELECTs is deliberately separate.

## Authentication configuration

Enable the Email provider in Supabase Auth. This version uses email/password rather than OAuth so no separate OAuth application is required. For the fastest local test, create a user in **Authentication → Users → Add user** and confirm it there, then sign in on the site.

For a public course demo containing only synthetic data, the owner may disable **Confirm email** in the Email provider settings so graders can create their own accounts without an SMTP setup. This means email ownership is not verified; it does not remove password authentication or the server's token validation. For a non-demo deployment, keep email confirmation enabled and configure a working SMTP provider instead. Set Supabase's Site URL to the final Vercel URL after deployment. Do not put a user's password in README or GitHub.

## Tests and GitHub Actions

```powershell
npm run typecheck
npm test
npm run build
npm run check:db
```

The unit tests cover request validation, signed-out API rejection, the five reference queries, alternative SELECT forms, and rejection of writes, extra statements, system-table access, and unsafe function calls. `check:db` is different: it really connects to Supabase using `QUIZ_DATABASE_URL`, verifies the reader role and 12-row dataset, checks isolation from saved quizzes, and compares all five reference queries with their expected result tables. It fails when credentials are missing; it is not a mock or a skipped check disguised as a pass.

In GitHub, add a repository Actions secret named **`QUIZ_DATABASE_URL`** with the same reader Session pooler URI. Add `QUIZ_DATABASE_CA_CERT` only if using a custom CA. The workflow runs tests and a production build, followed by the real database check on pushes to `main` and manual runs. Pull requests run the offline checks without database secrets. It uses `npm ci` when the lockfile exists and otherwise uses `npm install` for the first run. Never print the secret or paste a password into the workflow.

## Deploying on Vercel

Import this repository as a Next.js project in your personal Hobby workspace. Use Node.js 22 or 24, keep the repository root as the project root, and add the same three environment variables. The two public variables must be present when the site is built; redeploy after changing them. Add the CA variable only if needed. No custom domain is needed: use the actual `vercel.app` URL assigned to the deployment. Make sure the grader can access the production URL without a separate Vercel login.

After deployment, replace the URL placeholder above, set the Supabase Site URL, and perform the manual checks in `docs/acceptance.md`. A generated workflow is not evidence that Actions ran; wait for the live-database job to succeed.

## Query boundaries

This is a small quiz, not a general PostgreSQL console. Queries are parsed into an AST and restricted to one SELECT over `quiz_data.safety_inspections`, with common comparisons, aggregates, grouping, sorting, and LIMIT. Joins, CTEs, subqueries, other tables, write statements, and administrative functions are outside this version's scope. The server validates the Supabase user before execution, checks that the database account is quiz_reader, executes in a read-only transaction, applies a three-second statement timeout, and returns at most 100 rows. Saved quizzes use owner-only RLS policies, including checks on updates.

The row-limit value and fixed application checks use parameters; saved text is sent through the Supabase client as data. User-authored SQL cannot be turned into a safe query by treating the entire statement as one parameter, so it uses structural validation and database privileges instead. An audit log and tamper-resistant audit-log feature are **not implemented or claimed for extra credit**.

## Verification status

The project files and test commands are included. The authoring environment could not access npm or the private Supabase project, so a full Next.js build, complete test suite, real authentication, live database queries, and cloud deployment have **not** been claimed as passed here. Record actual local and hosted results in `docs/acceptance.md` before submission.

Reference documentation: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
