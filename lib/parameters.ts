import type { Cell } from "./questions";

export type QueryParameters = Cell[];

export function validateParameters(input: unknown = []): QueryParameters {
  if (!Array.isArray(input) || input.length > 20) {
    throw new Error("Parameters must be a JSON array with at most 20 values.");
  }
  for (const value of input) {
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12) continue;
    if (typeof value === "string" && value.length <= 256 && !value.includes("\0")) continue;
    throw new Error("Parameters may contain strings (up to 256 characters), finite numbers, booleans, or null. No nested objects or arrays.");
  }
  if (JSON.stringify(input).length > 1200) throw new Error("Parameters are too long (maximum 1,200 characters).");
  return [...input] as QueryParameters;
}

export function parseParameterText(text: string): QueryParameters {
  let input: unknown;
  try { input = JSON.parse(text.trim() || "[]"); }
  catch { throw new Error('Use a JSON array for parameters, for example ["High", "Open"].'); }
  return validateParameters(input);
}

export const PARAMETER_EXAMPLE = {
  sql: "SELECT inspection_id, mine_site, hazard_type\nFROM quiz_data.safety_inspections\nWHERE risk_level = $1 AND status = $2\nORDER BY inspection_id;",
  parameters: ["High", "Open"] as QueryParameters
};
