import test from "node:test";
import assert from "node:assert/strict";
import { POST as run } from "../app/api/query/route";
import { GET as list, POST as save } from "../app/api/quizzes/route";

for (const [label, handler, method] of [
  ["run", run, "POST"], ["save", save, "POST"], ["list", list, "GET"]
] as const) {
  test(`signed-out ${label} is rejected by the server`, async () => {
    const response = await handler(new Request(`http://localhost/api/${label}`, { method }));
    assert.equal(response.status, 401);
    const data = await response.json();
    assert.match(data.error, /Sign in/);
  });
}
