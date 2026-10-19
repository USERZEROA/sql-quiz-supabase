SELECT to_jsonb(e) INTO snapshot FROM quiz_audit.events e WHERE e.id = probe;

        FOREACH checked_role IN ARRAY ARRAY['authenticated', 'quiz_reader', 'anon'] LOOP
            EXECUTE format('SET LOCAL ROLE %I', checked_role);
            FOREACH operation IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
                allowed := false;
                BEGIN
                    CASE operation
                        WHEN 'INSERT' THEN
                            INSERT INTO quiz_audit.events(actor_id, action, payload)
                            VALUES (actor, 'preview_data', '{"forged":true}');
                        WHEN 'UPDATE' THEN
                            UPDATE quiz_audit.events SET payload = '{"tampered":true}' WHERE id = probe;
                        WHEN 'DELETE' THEN DELETE FROM quiz_audit.events WHERE id = probe;
                        WHEN 'TRUNCATE' THEN TRUNCATE TABLE quiz_audit.events;
                    END CASE;
                    allowed := true;
                EXCEPTION WHEN insufficient_privilege THEN NULL;
                END;
                IF allowed THEN
                    RAISE EXCEPTION 'FAIL: % unexpectedly allowed to % the audit log', checked_role, operation;
                END IF;
                EXECUTE format('SET LOCAL ROLE %I', original_role);
                INSERT INTO pg_temp.quiz_integrity_results VALUES (checked_role || ' cannot ' || operation || ' audit events', true);
                EXECUTE format('SET LOCAL ROLE %I', checked_role);
            END LOOP;
            EXECUTE format('SET LOCAL ROLE %I', original_role);
        END LOOP;

        -- Users cannot call the server-only append function to forge another user's actions.
        EXECUTE 'SET LOCAL ROLE authenticated';
        BEGIN
            PERFORM quiz_audit.append_query_event(other_actor, '{}'::jsonb);
            RAISE EXCEPTION 'FAIL: authenticated user called the backend append function';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        EXECUTE format('SET LOCAL ROLE %I', original_role);
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('taker cannot call backend append function', true);

        -- The activity RPC must use auth.uid(), not a user ID provided by the caller.
        PERFORM set_config('request.jwt.claim.sub', actor::text, true);
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        SELECT count(*) INTO visible_count FROM public.my_quiz_activity();
        IF visible_count <> 1 OR EXISTS (SELECT 1 FROM public.my_quiz_activity() e WHERE e.actor_id <> actor) THEN
            RAISE EXCEPTION 'FAIL: activity RPC did not isolate the caller';
        END IF;
        EXECUTE format('SET LOCAL ROLE %I', original_role);
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('activity RPC returns only the caller records', true);

        EXECUTE 'SET LOCAL ROLE anon';
        BEGIN
            PERFORM public.my_quiz_activity();
            RAISE EXCEPTION 'FAIL: anonymous role called activity RPC';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        EXECUTE format('SET LOCAL ROLE %I', original_role);
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('anonymous activity access denied', true);

        IF (SELECT to_jsonb(e) FROM quiz_audit.events e WHERE e.id = probe) IS DISTINCT FROM snapshot THEN
            RAISE EXCEPTION 'FAIL: original audit entry changed';
        END IF;
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('original audit entry remains unchanged', true);
        -- Verify the permitted append path and the atomic save trigger using one existing test user.
        SELECT u.id INTO real_actor FROM auth.users u ORDER BY u.created_at LIMIT 1;
        IF real_actor IS NULL THEN
            RAISE EXCEPTION 'Create a test Auth user before running this verification';
        END IF;
        query_payload := jsonb_build_object('action', 'run_query', 'question_id', 1,
            'quiz_version', 'mining-safety-v1', 'sql', answer_sql, 'parameters', jsonb_build_array('High','Open'),
            'outcome', 'success', 'row_count', 4, 'grade', jsonb_build_object(
                'questionId', 1, 'earned', 4, 'possible', 4, 'correct', true, 'feedback', 'Integrity test fixture'));
        EXECUTE 'SET LOCAL ROLE quiz_reader';
        SELECT quiz_audit.append_query_event(real_actor, query_payload) INTO query_probe;
        EXECUTE format('SET LOCAL ROLE %I', original_role);
        IF NOT EXISTS (SELECT 1 FROM quiz_audit.events e WHERE e.id = query_probe
                       AND e.actor_id = real_actor AND e.payload = query_payload) THEN
            RAISE EXCEPTION 'FAIL: query audit content or actor is wrong';
        END IF;
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('backend query append records actor and exact payload', true);

        PERFORM set_config('request.jwt.claim.sub', real_actor::text, true);
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', real_actor, 'role', 'authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.saved_quizzes(id, owner_id, title, quiz_version, questions, answers, parameters, scores)
        VALUES (saved_probe, real_actor, 'Temporary integrity check', 'mining-safety-v1', '[]',
            jsonb_build_object('1', answer_sql), jsonb_build_object('1', jsonb_build_array('High','Open')),
            '{"5":{"earned":999}}'::jsonb) RETURNING scores INTO returned_scores;
        IF returned_scores->'1'->>'earned' IS DISTINCT FROM '4' OR returned_scores ? '5' THEN
            RAISE EXCEPTION 'FAIL: saved scores were not derived from trusted query events';
        END IF;
        UPDATE public.saved_quizzes SET title = 'Changed integrity check', answers = '{}'::jsonb,
            scores = '{"1":{"earned":999}}'::jsonb WHERE id = saved_probe RETURNING scores INTO returned_scores;
        IF returned_scores IS DISTINCT FROM '{}'::jsonb THEN
            RAISE EXCEPTION 'FAIL: edited answers retained forged or stale scores';
        END IF;
        DELETE FROM public.saved_quizzes WHERE id = saved_probe;
        EXECUTE format('SET LOCAL ROLE %I', original_role);
        IF (SELECT count(*) FROM quiz_audit.events e WHERE e.quiz_id = saved_probe AND e.actor_id = real_actor) <> 3
           OR NOT EXISTS (SELECT 1 FROM quiz_audit.events e WHERE e.quiz_id = saved_probe
                          AND e.action = 'save_quiz' AND e.payload->'answers'->>'1' = answer_sql)
           OR NOT EXISTS (SELECT 1 FROM quiz_audit.events e WHERE e.quiz_id = saved_probe AND e.action = 'update_quiz')
           OR NOT EXISTS (SELECT 1 FROM quiz_audit.events e WHERE e.quiz_id = saved_probe AND e.action = 'delete_quiz') THEN
            RAISE EXCEPTION 'FAIL: save/update/delete history is incomplete';
        END IF;
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('save/update/delete trigger records real operations', true);
        INSERT INTO pg_temp.quiz_integrity_results VALUES ('saved scores ignore forged values and clear edited answers', true);

        DELETE FROM quiz_audit.events WHERE id IN (probe, other_probe, query_probe) OR quiz_id = saved_probe;

        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.check_name)
        INTO report_rows FROM pg_temp.quiz_integrity_results r;
        IF jsonb_array_length(report_rows) IS DISTINCT FROM 19 THEN
            RAISE EXCEPTION 'FAIL: expected exactly 19 completed checks';
        END IF;
        checks_finished := true;
        -- Intentional rollback after success, not a test failure.
        RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'rollback audit verification fixtures';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN
        IF NOT checks_finished THEN RAISE; END IF;
    END;

    -- The variables survive rollback, but all database and membership changes do not.
    IF current_user <> original_role THEN
        RAISE EXCEPTION 'FAIL: verification did not restore the original role';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.grantor), '[]'::jsonb)
    INTO membership_after
    FROM pg_auth_members m
    WHERE m.roleid = (SELECT oid FROM pg_roles WHERE rolname = 'quiz_reader')
      AND m.member = (SELECT oid FROM pg_roles WHERE rolname = 'postgres');
    IF membership_after IS DISTINCT FROM membership_before THEN
        RAISE EXCEPTION 'FAIL: temporary role membership was not rolled back';
    END IF;

    INSERT INTO pg_temp.quiz_integrity_results(check_name, passed)
    SELECT r.check_name, r.passed
    FROM jsonb_to_recordset(report_rows) AS r(check_name TEXT, passed BOOLEAN);
END $test$;
COMMIT;
SELECT check_name, passed FROM pg_temp.quiz_integrity_results ORDER BY check_name;