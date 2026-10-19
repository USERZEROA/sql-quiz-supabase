# Extra-credit acceptance

The deployed baseline and original 58-test suite were checked before this upgrade. Do not treat those results as tests of the new code. Record dates and results below after running it locally and on the production URL.

| Check | Result after upgrade |
| --- | --- |
| SQL migration 04 returns true / true / false / false / true | Pending |
| SQL verification 05: every returned `passed` value is true | Pending |
| `npm run check` | Pending |
| `npm run check:db`: normal and parameterized live queries | Pending |
| `npm run check:audit`: real reader mutation attempts are denied | Pending |
| Latest GitHub Actions `tests` and `live-database` jobs | Pending |
| Signed-out query, save and history requests are rejected | Pending |
| First question's parameterized example returns 4 rows and earns 4/4 | Pending |
| Literal SQL answers still work with [] parameters | Pending |
| Wrong answer earns 0; edited answers clear the old score | Pending |
| Five reference answers produce a total of 20/20 | Pending |
| Save, refresh and Open restore SQL, parameters and trusted scores | Pending |
| My activity shows the correct user, SQL/parameters and save contents | Pending |
| Second user's activity and saved quizzes do not expose the first user's | Pending |
| Production sign-out clears results, scores and private activity | Pending |

For the parameter test, use the first question's example with `["High", "Open"]`. Change only the first value to `"High' OR 1=1 --"`: the result should be empty, not a bypassed filter. Restore the example afterward.

Script 05 is an administrative verification, not a button exposed to takers. It changes effective roles inside a transaction and attempts INSERT, UPDATE, DELETE and TRUNCATE against actual temporary probe entries. It also tests the own-history function and save triggers. A successful run leaves existing data unchanged; an unexpected allowed operation raises an error and rolls the transaction back. Save its output as evidence of the integrity check.
