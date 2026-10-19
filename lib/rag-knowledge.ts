// Versioned teaching notes, matching the eight records already indexed for Week 8.
export const RAG_KNOWLEDGE: Array<{ id: string; kind: string; text: string }> = [
  { id: "schema", kind: "schema", text: `PostgreSQL table quiz_data.safety_inspections has seven columns:
inspection_id integer primary key; mine_site text; work_area text;
hazard_type text; risk_level text; status text; inspection_date date.
Each row describes one inspection. All columns are NOT NULL.` },
  { id: "risk-status", kind: "semantics", text: `In quiz_data.safety_inspections, risk_level is 'High', 'Medium', or 'Low'.
status is 'Open' or 'Closed'. High-risk unresolved findings require BOTH
risk_level = 'High' AND status = 'Open'. String comparisons are case-sensitive.
Use inspection_id to identify an inspection and hazard_type for its hazard.` },
  { id: "counts", kind: "semantics", text: `Count inspections per mine in quiz_data.safety_inspections with
COUNT(*) AS inspection_count and GROUP BY mine_site. Include every status
unless the question requests a filter. Sort by inspection_count DESC,
then mine_site ASC when ranking mines by inspection count.` },
  { id: "recent", kind: "semantics", text: `For the latest inspections in quiz_data.safety_inspections, return
inspection_id, mine_site, inspection_date. Sort inspection_date DESC,
inspection_id DESC, then apply LIMIT. Use the inspection date, not today's date.` },
  { id: "distinct-hazards", kind: "semantics", text: `For distinct hazards per mine in quiz_data.safety_inspections, use
COUNT(DISTINCT hazard_type) AS hazard_count, GROUP BY mine_site, and
ORDER BY mine_site ASC. Repeated instances of one hazard count only once per mine.` },
  { id: "having", kind: "semantics", text: `To find mines with at least N inspections in quiz_data.safety_inspections,
GROUP BY mine_site and use HAVING COUNT(*) >= N. Return mine_site and
COUNT(*) AS inspection_count. Sort inspection_count DESC, mine_site ASC.
WHERE filters individual rows; HAVING filters groups.` },
  { id: "example-filter", kind: "example", text: `Question: List closed medium-risk inspection IDs and sites in ID order.
SQL: SELECT inspection_id, mine_site FROM quiz_data.safety_inspections
WHERE risk_level = 'Medium' AND status = 'Closed' ORDER BY inspection_id;` },
  { id: "example-group", kind: "example", text: `Question: Count open inspections at each site, in site-name order.
SQL: SELECT mine_site, COUNT(*) AS open_count FROM quiz_data.safety_inspections
WHERE status = 'Open' GROUP BY mine_site ORDER BY mine_site;` },
];
