# Final acceptance record

Production site: https://sql-quiz-supabase.vercel.app

The project owner confirmed completion of the final production acceptance run. This record combines that manual verification with the supplied local test output, live database checks, and SQL integrity-check results. It does not describe a separate external audit.

## Automated and database checks

| Check | Result |
| --- | --- |
| TypeScript checking | Passed |
| Automated tests | 117 passed; 0 failed; 0 skipped |
| Next.js production build | Passed |
| Verified TLS connection through Session pooler | Passed |
| Reader permissions and 12 visible teaching records | Passed |
| Five live reference results | Passed; five questions, 20 points |
| Bound values, injection-like text as data, parameterized LIMIT | Passed in the live database check |
| `check:audit` | Passed; prohibited reader operations returned 42501 |
| SQL migration 04 verification | true / true / false / false / true |
| SQL verification 05 | 19 checks passed; fixture and role-grant rollback included |

## Production acceptance

| # | Check | Result |
| --- | --- | --- |
| 1 | Signed-out Run, Preview, Save, and private-record access are restricted | Passed |
| 2 | Grading account can sign in | Passed |
| 3 | Preview live data returns 12 rows | Passed |
| 4 | Parameterized question 1 returns IDs 1, 3, 5, 11 and earns 4/4 | Passed |
| 5 | Question 2 returns North Mine 5, South Mine 4, East Mine 3 and earns 4/4 | Passed |
| 6 | Question 3 returns IDs 12, 11, 10 and earns 4/4 | Passed |
| 7 | Question 4 returns East Mine 3, North Mine 4, South Mine 3 and earns 4/4 | Passed |
| 8 | Question 5 returns North Mine 5, South Mine 4 and earns 4/4 | Passed |
| 9 | Five correct answers total 20/20 | Passed |
| 10 | A valid but incorrect query earns 0/4; editing clears the previous score | Passed |
| 11 | Save, refresh, and Open restore SQL, parameters, and scores | Passed |
| 12 | My activity shows query/save events with the correct actor and contents | Passed |
| 13 | Another account cannot see the first account's quizzes or activity | Passed |
| 14 | Sign-out restores restrictions and clears private activity | Passed |
| 15 | Latest CI passes both jobs; live-database includes check:db and check:audit | Passed, as confirmed by the project owner |
| 16 | Final README includes production URL, badge, Canvas access notice, and current verification results | Updated in this documentation set; commit and push both documents before submission |

## Submission

Submit the GitHub repository URL to Canvas. Send the quiz login email and quiz-only password separately in the assignment comments and ensure the comment is posted. The README directs graders to those comments. No extra-credit point total is assumed because the supplied rubric does not state one.
