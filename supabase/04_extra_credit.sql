-- Run once as postgres after scripts 01, 02 and 03. Safe to rerun.
-- Keeps teaching data, existing saved quizzes, role passwords and LOGIN settings.
BEGIN;

ALTER TABLE public.saved_quizzes
    ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.saved_quizzes'::regclass
                   AND conname = 'saved_quizzes_parameters_check') THEN
        ALTER TABLE public.saved_quizzes ADD CONSTRAINT saved_quizzes_parameters_check
            CHECK (jsonb_typeof(parameters) = 'object' AND octet_length(parameters::text) <= 12000);
    END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS quiz_audit;
REVOKE ALL ON SCHEMA quiz_audit FROM PUBLIC, anon, authenticated, quiz_reader;
GRANT USAGE ON SCHEMA quiz_audit TO quiz_reader;

CREATE TABLE IF NOT EXISTS quiz_audit.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('run_query', 'preview_data', 'save_quiz', 'update_quiz', 'delete_quiz')),
    quiz_id UUID,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 100000)
);
CREATE INDEX IF NOT EXISTS quiz_audit_actor_time
    ON quiz_audit.events(actor_id, created_at DESC, id);
ALTER TABLE quiz_audit.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quiz_audit.events FROM PUBLIC, anon, authenticated, quiz_reader;

-- Only the server's restricted database role can append query events.
-- The HTTP endpoint verifies the user with Auth before passing actor_id.
-- Students never execute this function through their SQL editor or the Data API.
CREATE OR REPLACE FUNCTION quiz_audit.append_query_event(p_actor UUID, p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    event_id UUID;
    event_action TEXT := p_payload->>'action';
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN
        RAISE EXCEPTION 'A real user is required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR event_action IS NULL OR event_action NOT IN ('run_query', 'preview_data')
       OR jsonb_typeof(p_payload->'sql') IS DISTINCT FROM 'string'
       OR length(p_payload->>'sql') > 4000
       OR jsonb_typeof(p_payload->'parameters') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'parameters') > 20
       OR p_payload->>'outcome' IS NULL
       OR p_payload->>'outcome' NOT IN ('success', 'rejected') THEN
        RAISE EXCEPTION 'Invalid query audit event' USING ERRCODE = '22023';
    END IF;
    INSERT INTO quiz_audit.events(actor_id, action, payload)
        VALUES (p_actor, event_action, p_payload) RETURNING id INTO event_id;
    RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION quiz_audit.append_query_event(UUID, JSONB) FROM PUBLIC, anon, authenticated, quiz_reader;
GRANT EXECUTE ON FUNCTION quiz_audit.append_query_event(UUID, JSONB) TO quiz_reader;

-- Scores in saved copies come from server-generated query events, never the POST body.
CREATE OR REPLACE FUNCTION quiz_audit.attach_saved_scores()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    question_key TEXT;
    last_grade JSONB;
BEGIN
    NEW.scores := '{}'::jsonb;
    NEW.parameters := coalesce(NEW.parameters, '{}'::jsonb);
    FOR question_key IN SELECT generate_series(1, 5)::text LOOP
        SELECT e.payload->'grade' INTO last_grade
        FROM quiz_audit.events e
        WHERE e.actor_id = NEW.owner_id AND e.action = 'run_query'
          AND e.payload->>'question_id' = question_key
          AND e.payload->>'quiz_version' = NEW.quiz_version
          AND e.payload->>'sql' = NEW.answers->>question_key
          AND e.payload->'parameters' = coalesce(NEW.parameters->question_key, '[]'::jsonb)
        ORDER BY e.created_at DESC, e.id DESC LIMIT 1;
        IF jsonb_typeof(last_grade) = 'object' THEN
            NEW.scores := NEW.scores || jsonb_build_object(question_key, last_grade);
        END IF;
    END LOOP;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION quiz_audit.attach_saved_scores() FROM PUBLIC, anon, authenticated, quiz_reader;
DROP TRIGGER IF EXISTS saved_quiz_scores ON public.saved_quizzes;
CREATE TRIGGER saved_quiz_scores BEFORE INSERT OR UPDATE ON public.saved_quizzes
    FOR EACH ROW EXECUTE FUNCTION quiz_audit.attach_saved_scores();

-- A save and its log entry commit or roll back together, including direct RLS-authorized saves.
CREATE OR REPLACE FUNCTION quiz_audit.log_saved_quiz()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    item public.saved_quizzes%ROWTYPE;
    actor UUID;
    event_action TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN item := OLD; ELSE item := NEW; END IF;
    actor := coalesce(auth.uid(), item.owner_id);
    event_action := CASE TG_OP WHEN 'INSERT' THEN 'save_quiz'
                     WHEN 'UPDATE' THEN 'update_quiz' ELSE 'delete_quiz' END;
    INSERT INTO quiz_audit.events(actor_id, action, quiz_id, payload)
    VALUES (actor, event_action, item.id, jsonb_build_object(
        'title', item.title, 'owner_id', item.owner_id, 'quiz_version', item.quiz_version,
        'questions', item.questions, 'answers', item.answers, 'parameters', item.parameters,
        'scores', item.scores, 'outcome', 'success', 'source', 'database_trigger',
        'actor_source', CASE WHEN auth.uid() IS NULL THEN 'owner_context_for_admin_operation' ELSE 'verified_auth_user' END));
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION quiz_audit.log_saved_quiz() FROM PUBLIC, anon, authenticated, quiz_reader;
DROP TRIGGER IF EXISTS saved_quiz_audit ON public.saved_quizzes;
CREATE TRIGGER saved_quiz_audit AFTER INSERT OR UPDATE OR DELETE ON public.saved_quizzes
    FOR EACH ROW EXECUTE FUNCTION quiz_audit.log_saved_quiz();

-- Expose only the caller's most recent 50 events. No client-supplied user ID.
CREATE OR REPLACE FUNCTION public.my_quiz_activity()
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, actor_id UUID, action TEXT, quiz_id UUID, payload JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT e.id, e.created_at, e.actor_id, e.action, e.quiz_id, e.payload
        FROM quiz_audit.events e WHERE e.actor_id = auth.uid()
        ORDER BY e.created_at DESC, e.id DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION public.my_quiz_activity() FROM PUBLIC, anon, authenticated, quiz_reader;
GRANT EXECUTE ON FUNCTION public.my_quiz_activity() TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT
    EXISTS (SELECT 1 FROM pg_class WHERE oid = 'quiz_audit.events'::regclass AND relrowsecurity) AS audit_rls,
    has_function_privilege('quiz_reader', 'quiz_audit.append_query_event(uuid,jsonb)', 'EXECUTE') AS backend_can_append,
    has_table_privilege('quiz_reader', 'quiz_audit.events', 'INSERT,UPDATE,DELETE,TRUNCATE') AS reader_can_edit_log,
    has_table_privilege('authenticated', 'quiz_audit.events', 'INSERT,UPDATE,DELETE,TRUNCATE') AS taker_can_edit_log,
    has_function_privilege('authenticated', 'public.my_quiz_activity()', 'EXECUTE') AS taker_can_view_own_activity;
