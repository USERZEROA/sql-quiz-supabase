-- No passwords here. An existing quiz_reader password/LOGIN setting is preserved.
BEGIN;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quiz_reader') THEN
        CREATE ROLE quiz_reader NOLOGIN;
    END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO quiz_reader;
GRANT USAGE ON SCHEMA quiz_data TO quiz_reader;
REVOKE ALL ON quiz_data.safety_inspections FROM PUBLIC, anon, authenticated, quiz_reader;
GRANT SELECT ON quiz_data.safety_inspections TO quiz_reader;
ALTER TABLE quiz_data.safety_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quiz_reader_select_inspections ON quiz_data.safety_inspections;
CREATE POLICY quiz_reader_select_inspections ON quiz_data.safety_inspections
    FOR SELECT TO quiz_reader USING (true);
COMMIT;
SELECT
    has_table_privilege('quiz_reader', 'quiz_data.safety_inspections', 'SELECT') AS can_read,
    has_table_privilege('quiz_reader', 'quiz_data.safety_inspections', 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write;
