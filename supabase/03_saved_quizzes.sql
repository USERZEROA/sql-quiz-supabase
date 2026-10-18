-- Run as postgres in the Supabase SQL Editor. This does not change teaching data or passwords.
BEGIN;
CREATE TABLE IF NOT EXISTS public.saved_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    quiz_version TEXT NOT NULL,
    questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND octet_length(questions::text) <= 25000),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(answers) = 'object' AND octet_length(answers::text) <= 25000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_quizzes_owner_updated
    ON public.saved_quizzes(owner_id, updated_at DESC);
ALTER TABLE public.saved_quizzes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_quizzes FROM PUBLIC, anon, quiz_reader, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_quizzes TO authenticated;

DROP POLICY IF EXISTS saved_quizzes_select_own ON public.saved_quizzes;
CREATE POLICY saved_quizzes_select_own ON public.saved_quizzes
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS saved_quizzes_insert_own ON public.saved_quizzes;
CREATE POLICY saved_quizzes_insert_own ON public.saved_quizzes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS saved_quizzes_update_own ON public.saved_quizzes;
CREATE POLICY saved_quizzes_update_own ON public.saved_quizzes
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id)
    WITH CHECK ((SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS saved_quizzes_delete_own ON public.saved_quizzes;
CREATE POLICY saved_quizzes_delete_own ON public.saved_quizzes
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.saved_quizzes'::regclass) AS rls_enabled,
    has_table_privilege('authenticated', 'public.saved_quizzes', 'INSERT') AS signed_in_can_save,
    has_table_privilege('anon', 'public.saved_quizzes', 'INSERT') AS signed_out_can_save,
    has_table_privilege('quiz_reader', 'public.saved_quizzes', 'SELECT') AS reader_can_read_saved_quizzes;
