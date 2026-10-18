export type Cell = string | number | boolean | null;
export type ResultTable = { columns: string[]; rows: Cell[][] };
export type Question = {
  id: number; points: number; title: string; prompt: string;
  concept: string; hint: string; sql: string; expected: ResultTable;
};

export const QUIZ_VERSION = "mining-safety-v1";
export const QUESTIONS: Question[] = [
  {
    id: 1, points: 4, title: "Open high-risk findings", concept: "WHERE · AND · ORDER BY",
    prompt: "Find inspections whose risk level is High and status is Open. Return inspection_id, mine_site, and hazard_type, ordered by inspection_id ascending.",
    hint: "Both conditions must hold. The stored values are case-sensitive strings.",
    sql: "SELECT inspection_id, mine_site, hazard_type\nFROM quiz_data.safety_inspections\nWHERE risk_level = 'High' AND status = 'Open'\nORDER BY inspection_id;",
    expected: { columns: ["inspection_id", "mine_site", "hazard_type"], rows: [
      [1, "North Mine", "Ventilation"], [3, "South Mine", "Equipment"],
      [5, "North Mine", "Ground Stability"], [11, "South Mine", "Equipment"]
    ] }
  },
  {
    id: 2, points: 4, title: "Inspection counts by mine", concept: "GROUP BY · COUNT",
    prompt: "Count all inspections for each mine. Return mine_site and inspection_count. Sort by inspection_count descending, then mine_site ascending.",
    hint: "Group rows by mine_site and use COUNT(*) for the number of rows in each group.",
    sql: "SELECT mine_site, COUNT(*) AS inspection_count\nFROM quiz_data.safety_inspections\nGROUP BY mine_site\nORDER BY inspection_count DESC, mine_site;",
    expected: { columns: ["mine_site", "inspection_count"], rows: [
      ["North Mine", 5], ["South Mine", 4], ["East Mine", 3]
    ] }
  },
  {
    id: 3, points: 4, title: "The three latest inspections", concept: "ORDER BY · LIMIT",
    prompt: "Return inspection_id, mine_site, and inspection_date for the three most recent inspections. Sort by inspection_date descending and use inspection_id descending as the tie-breaker.",
    hint: "Sort before applying LIMIT 3.",
    sql: "SELECT inspection_id, mine_site, inspection_date\nFROM quiz_data.safety_inspections\nORDER BY inspection_date DESC, inspection_id DESC\nLIMIT 3;",
    expected: { columns: ["inspection_id", "mine_site", "inspection_date"], rows: [
      [12, "North Mine", "2026-09-12"], [11, "South Mine", "2026-09-11"], [10, "East Mine", "2026-09-10"]
    ] }
  },
  {
    id: 4, points: 4, title: "Distinct hazards at each mine", concept: "COUNT(DISTINCT) · GROUP BY",
    prompt: "Count the distinct hazard types recorded at each mine. Return mine_site and hazard_count, ordered by mine_site ascending. Repeated inspections of the same hazard type should count only once per mine.",
    hint: "Use COUNT(DISTINCT hazard_type), not COUNT(*).",
    sql: "SELECT mine_site, COUNT(DISTINCT hazard_type) AS hazard_count\nFROM quiz_data.safety_inspections\nGROUP BY mine_site\nORDER BY mine_site;",
    expected: { columns: ["mine_site", "hazard_count"], rows: [
      ["East Mine", 3], ["North Mine", 4], ["South Mine", 3]
    ] }
  },
  {
    id: 5, points: 4, title: "Mines with at least four inspections", concept: "HAVING · COUNT",
    prompt: "Find mines with at least four inspections. Return mine_site and inspection_count, sorted by inspection_count descending, then mine_site ascending.",
    hint: "HAVING filters grouped results; WHERE filters individual rows.",
    sql: "SELECT mine_site, COUNT(*) AS inspection_count\nFROM quiz_data.safety_inspections\nGROUP BY mine_site\nHAVING COUNT(*) >= 4\nORDER BY inspection_count DESC, mine_site;",
    expected: { columns: ["mine_site", "inspection_count"], rows: [
      ["North Mine", 5], ["South Mine", 4]
    ] }
  }
];

export const SCHEMA_COLUMNS = [
  ["inspection_id", "integer"], ["mine_site", "text"], ["work_area", "text"],
  ["hazard_type", "text"], ["risk_level", "text"], ["status", "text"],
  ["inspection_date", "date"]
];
export const STARTER_SQL = "SELECT *\nFROM quiz_data.safety_inspections\nORDER BY inspection_id;";
export const emptyAnswers = (): Record<string, string> =>
  Object.fromEntries(QUESTIONS.map(q => [String(q.id), ""]));
