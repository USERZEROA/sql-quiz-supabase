import { QUESTIONS, type Cell, type ResultTable } from "./questions";

export type Grade = { questionId: number; earned: number; possible: number; correct: boolean; feedback: string };
export type Grades = Record<string, Grade>;

function sameValue(actual: Cell, expected: Cell): boolean {
  if (actual === expected) return true;
  // PostgreSQL COUNT returns int8, which pg normally exposes as a string.
  if (typeof expected === "number" && typeof actual === "string" && actual.trim() &&
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(actual.trim())) {
    return Number(actual) === expected;
  }
  return false;
}

export function gradeResult(questionId: number, actual: ResultTable & { truncated?: boolean }): Grade {
  const question = QUESTIONS.find(item => item.id === questionId);
  if (!question) throw new Error("Unknown question.");
  const expected = question.expected;
  const grade: Grade = { questionId, earned: 0, possible: question.points, correct: false, feedback: "" };
  if (actual.truncated) return { ...grade, feedback: "Too many rows. Return only the requested result." };
  // Column positions follow the prompt; aliases do not determine correctness.
  if (actual.columns.length !== expected.columns.length) {
    return { ...grade, feedback: `Return ${expected.columns.length} columns, in the order requested by the question.` };
  }
  if (actual.rows.length !== expected.rows.length) {
    return { ...grade, feedback: `Expected ${expected.rows.length} rows; your query returned ${actual.rows.length}.` };
  }
  const sameRow = (row: Cell[], reference: Cell[]) => row.length === reference.length && row.every((v, i) => sameValue(v, reference[i]));
  if (actual.rows.every((row, i) => sameRow(row, expected.rows[i]))) {
    return { ...grade, earned: question.points, correct: true, feedback: "Correct result, including the requested row order." };
  }
  const unused = [...expected.rows];
  const sameRows = actual.rows.every(row => {
    const index = unused.findIndex(reference => sameRow(row, reference));
    if (index < 0) return false;
    unused.splice(index, 1); return true;
  });
  return { ...grade, feedback: sameRows ? "The values match, but the row order does not. Check ORDER BY." :
    "The result values do not match. Check filtering, grouping, distinct values, and column order." };
}

export function totalScore(grades: Grades): number {
  return QUESTIONS.reduce((sum, question) => sum + (grades[String(question.id)]?.earned ?? 0), 0);
}
