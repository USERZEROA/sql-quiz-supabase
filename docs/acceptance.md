# Manual acceptance record

Status: not yet run against the student's project. Replace each pending entry with the actual result and date. Never include passwords or tokens in screenshots.

| Check | Actual result |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | Pending |
| `npm run check:db` connects through Session pooler and checks all five hints | Pending |
| Signed-out Run and Save buttons are disabled | Pending |
| Signed-out POST /api/query and POST /api/quizzes return 401 | Pending |
| Invalid bearer token is rejected | Pending |
| Create account/sign in, run a self-written SELECT, see live rows | Pending |
| Run each question's reference SQL and compare its result with the hint | Pending |
| Save quiz, refresh, reopen questions and answers | Pending |
| Sign out; run/save requests without a session remain rejected | Pending |
| A second account cannot list, read, overwrite, or delete the first account's saved quiz | Pending |
| Attempt a DELETE or pg_sleep query; confirm rejection and unchanged data | Pending |
| Public Vercel URL works in a private browser window | Pending |
| GitHub Actions live-database job succeeds using the repository Secret | Pending |
| README contains the actual quiz site URL | Pending |
| Git history contains no real password, .env.local, or secret key | Pending |

Use the browser Network panel to verify API status codes, not only whether buttons are hidden. For cross-user checks, keep the first user's quiz ID, sign in as the second user, and verify that attempts to update that ID are rejected. RLS must also protect direct Supabase Data API access, not just the Next.js UI.

Example signed-out check from PowerShell (while the dev server is running):

```powershell
curl.exe -i -X POST http://localhost:3000/api/query -H "Content-Type: application/json" --data '{}'
curl.exe -i -X POST http://localhost:3000/api/quizzes -H "Content-Type: application/json" --data '{}'
```

Both should return HTTP 401 before any SQL runs or data are saved. These examples use no real credentials.
