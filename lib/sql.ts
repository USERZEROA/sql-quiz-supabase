import { parse, toSql, type Expr, type SelectFromStatement } from "pgsql-ast-parser";
import { HttpError } from "./input";
import { validateParameters, type QueryParameters } from "./parameters";

const functions = new Set(["count", "sum", "avg", "min", "max", "lower", "upper", "length", "round", "abs", "coalesce", "nullif"]);
const binaryOps = new Set(["=", "!=", "<>", "<", "<=", ">", ">=", "AND", "OR", "IN", "NOT IN", "LIKE", "NOT LIKE", "ILIKE", "NOT ILIKE", "+", "-", "*", "/", "%", "||"]);
const casts = new Set(["text", "integer", "int", "int4", "bigint", "int8", "numeric", "decimal", "date", "boolean"]);
const denied = () => new HttpError(400, "Use a single read-only SELECT on quiz_data.safety_inspections. Joins, CTEs, system tables, and administrative functions are not supported in this quiz.");

function checkType(value: { name?: string; schema?: string; kind?: string; config?: number[] }) {
  if (value.kind || !casts.has(value.name ?? "") || (value.schema && value.schema !== "pg_catalog")) throw denied();
  if (value.config?.some(n => !Number.isInteger(n) || n < 0 || n > 100)) throw denied();
}

function checkExpr(expr: Expr, parameters: QueryParameters, used: Set<number>, depth = 0): void {
  if (depth > 30) throw denied();
  const visit = (e: Expr) => checkExpr(e, parameters, used, depth + 1);
  switch (expr.type) {
    case "ref":
      if (expr.table?.schema && expr.table.schema !== "quiz_data") throw denied();
      return;
    case "parameter": {
      if (!/^\$[1-9][0-9]*$/.test(expr.name)) throw denied();
      const number = Number(expr.name.slice(1));
      if (number > parameters.length) throw new HttpError(400, `Missing value for $${number}.`);
      used.add(number); return;
    }
    case "integer": case "numeric": case "string": case "boolean": case "null": return;
    case "binary":
      if (expr.opSchema || !binaryOps.has(expr.op)) throw denied();
      visit(expr.left); visit(expr.right); return;
    case "unary":
      if (expr.opSchema) throw denied();
      visit(expr.operand); return;
    case "ternary": visit(expr.value); visit(expr.lo); visit(expr.hi); return;
    case "list":
      for (const e of expr.expressions) visit(e);
      return;
    case "cast": checkType(expr.to); visit(expr.operand); return;
    case "constant": checkType(expr.dataType); return;
    case "call":
      if (!functions.has(expr.function.name) || (expr.function.schema && expr.function.schema !== "pg_catalog") || expr.over || expr.withinGroup) throw denied();
      for (const e of expr.args) visit(e);
      if (expr.filter) visit(expr.filter);
      for (const order of expr.orderBy ?? []) visit(order.by);
      return;
    case "case":
      if (expr.value) visit(expr.value);
      for (const item of expr.whens) { visit(item.when); visit(item.value); }
      if (expr.else) visit(expr.else);
      return;
    default: throw denied();
  }
}

export function validateSql(input: unknown, supplied: unknown = []): string {
  let parameters: QueryParameters;
  try { parameters = validateParameters(supplied); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid parameters."); }
  const used = new Set<number>();
  const visit = (expr: Expr) => checkExpr(expr, parameters, used);
  if (typeof input !== "string" || !input.trim() || input.length > 4000 || input.includes("\0")) {
    throw new HttpError(400, "Enter a SQL query with at most 4,000 characters.");
  }
  let statements;
  try { statements = parse(input); }
  catch { throw new HttpError(400, "SQL could not be parsed. Check the syntax; this quiz supports ordinary SELECT queries."); }
  if (statements.length !== 1 || statements[0].type !== "select") throw denied();
  const query: SelectFromStatement = statements[0];
  if (query.for || query.skip || query.from?.length !== 1) throw denied();
  const source = query.from[0];
  if (source.type !== "table" || source.join || source.lateral || source.name.columnNames) throw denied();
  if (source.name.name !== "safety_inspections" || (source.name.schema && source.name.schema !== "quiz_data")) throw denied();
  source.name.schema = "quiz_data";
  for (const column of query.columns ?? []) visit(column.expr);
  if (query.where) visit(query.where);
  for (const e of query.groupBy ?? []) visit(e);
  if (query.having) visit(query.having);
  for (const order of query.orderBy ?? []) visit(order.by);
  if (Array.isArray(query.distinct)) for (const e of query.distinct) visit(e);
  for (const e of [query.limit?.limit, query.limit?.offset]) {
    if (!e) continue;
    if (e.type === "parameter") {
      visit(e);
      const value = parameters[Number(e.name.slice(1)) - 1];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10000) {
        throw new HttpError(400, "LIMIT and OFFSET parameters must be integers between 0 and 10,000.");
      }
    } else if (e.type !== "integer" || e.value < 0 || e.value > 10000) throw denied();
  }
  if (used.size !== parameters.length || parameters.some((_value, i) => !used.has(i + 1))) {
    throw new HttpError(400, "Supply exactly the values used by $1, $2, and so on, without gaps or extra values.");
  }
  // Run regenerated, validated SQL, not a string checked only by a SELECT prefix.
  return toSql.statement(query).replace(/;\s*$/, "");
}

export function prepareQuery(input: unknown, supplied: unknown = []) {
  const sql = validateSql(input, supplied);
  const parameters = validateParameters(supplied);
  return {
    sql, parameters,
    // Only the validated AST and a server-calculated placeholder number enter the SQL structure.
    text: `SELECT * FROM (${sql}) AS quiz_result LIMIT $${parameters.length + 1}`,
    values: [...parameters, 101]
  };
}
