-- Synthetic teaching data. Safe to rerun; existing records are not replaced.
BEGIN;
CREATE SCHEMA IF NOT EXISTS quiz_data;
CREATE TABLE IF NOT EXISTS quiz_data.safety_inspections (
    inspection_id INT PRIMARY KEY,
    mine_site TEXT NOT NULL,
    work_area TEXT NOT NULL,
    hazard_type TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL,
    inspection_date DATE NOT NULL
);
ALTER TABLE quiz_data.safety_inspections ENABLE ROW LEVEL SECURITY;
INSERT INTO quiz_data.safety_inspections
    (inspection_id, mine_site, work_area, hazard_type, risk_level, status, inspection_date)
VALUES
    (1, 'North Mine', 'Tunnel', 'Ventilation', 'High', 'Open', '2026-09-01'),
    (2, 'North Mine', 'Tunnel', 'Dust', 'Medium', 'Closed', '2026-09-02'),
    (3, 'South Mine', 'Pit', 'Equipment', 'High', 'Open', '2026-09-03'),
    (4, 'East Mine', 'Processing', 'Electrical', 'Medium', 'Closed', '2026-09-04'),
    (5, 'North Mine', 'Tunnel', 'Ground Stability', 'High', 'Open', '2026-09-05'),
    (6, 'South Mine', 'Pit', 'Dust', 'Low', 'Closed', '2026-09-06'),
    (7, 'East Mine', 'Processing', 'Equipment', 'Medium', 'Open', '2026-09-07'),
    (8, 'North Mine', 'Surface', 'Electrical', 'Low', 'Closed', '2026-09-08'),
    (9, 'South Mine', 'Tunnel', 'Ventilation', 'High', 'Closed', '2026-09-09'),
    (10, 'East Mine', 'Surface', 'Dust', 'Medium', 'Open', '2026-09-10'),
    (11, 'South Mine', 'Pit', 'Equipment', 'High', 'Open', '2026-09-11'),
    (12, 'North Mine', 'Surface', 'Ground Stability', 'Medium', 'Closed', '2026-09-12')
ON CONFLICT (inspection_id) DO NOTHING;
COMMIT;
SELECT COUNT(*) AS total_inspections FROM quiz_data.safety_inspections;
