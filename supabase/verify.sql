-- Série — verification of schema.sql. Run in the SQL Editor after schema.sql.
-- One DO block seeds throwaway auth.users, impersonates each (role `authenticated` plus
-- request.jwt.claims) and checks what the policies and RPCs allow. It ALWAYS ends by raising
-- an exception, so everything it wrote is rolled back; the message is the report.

do $verify$
declare
  o  uuid := gen_random_uuid();   -- owner of gyms A and B (platform admin)
  t  uuid := gen_random_uuid();   -- trainer in A and in B
  t2 uuid := gen_random_uuid();   -- trainer in A
  s  uuid := gen_random_uuid();   -- student in A, of t
  s2 uuid := gen_random_uuid();   -- student in A, of t2
  sb uuid := gen_random_uuid();   -- student in B, of t
  o2 uuid := gen_random_uuid();   -- owner of gym C (via owner invite)
  x  uuid := gen_random_uuid();   -- signed up, nothing else
  ga uuid; gb uuid; gc uuid;
  code text; n int; r jsonb; ok boolean;
  log text := ''; fails int := 0;
begin
  insert into auth.users (id, aud, role, email)
  select u, 'authenticated', 'authenticated', 'verify-' || u || '@example.invalid'
    from unnest(array[o, t, t2, s, s2, sb, o2, x]) u;

  -- as <uid> -------------------------------------------------------------------------------
  -- (set_config is transaction-local; `set local role` makes RLS apply)

  -- 1. bootstrap: o becomes platform admin + owner of gym A; nobody can bootstrap again
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (public.bootstrap('Owner O', 'Gym A')).id into ga;
  gb := (public.create_gym('Gym B')).id;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.bootstrap('X', 'Evil gym');
    log := log || ' || ' || 'FAIL bootstrap twice allowed'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass bootstrap only once';
  end;
  begin
    perform public.create_gym('Evil gym');
    log := log || ' || ' || 'FAIL non-owner created a gym'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass non-owner cannot create gyms';
  end;
  execute 'reset role';

  -- 2. owner invites t (trainer in A and B) and t2 (trainer in A)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('trainer', ga)).code;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Trainer T');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('trainer', gb)).code;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Trainer T');
  select count(*) into n from public.memberships where user_id = t and role = 'trainer';
  if n = 2 then log := log || ' || ' || 'pass trainer works in two gyms'; else log := log || ' || ' || ('FAIL trainer gyms ' || n); fails := fails + 1; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('trainer', ga)).code;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Trainer T2');
  execute 'reset role';

  -- 3. trainers invite their students; a used code cannot be reused
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('student', ga)).code;
  begin
    perform public.create_invite('trainer', ga);
    log := log || ' || ' || 'FAIL trainer invited a trainer'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass trainer cannot invite trainers';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Student S');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.redeem_invite(code, 'Student S2');
    log := log || ' || ' || 'FAIL invite reused'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass invite single use';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', t2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('student', ga)).code;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Student S2');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code := (public.create_invite('student', gb)).code;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', sb, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code, 'Student SB');
  -- student saves state and a workout
  r := public.save_state('{"routines": [], "unit": "kg"}'::jsonb, 0);
  perform public.save_workouts('[{"id": "w1", "day": "2026-11-03", "data": {"sets": 3}}]'::jsonb);
  execute 'reset role';

  -- 4. visibility
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.workouts where user_id = sb;
  if n = 1 then log := log || ' || ' || 'pass trainer sees own student workouts (other gym)'; else log := log || ' || ' || ('FAIL trainer sees sb workouts ' || n); fails := fails + 1; end if;
  select count(*) into n from public.user_state where user_id = s2;
  if n = 0 then log := log || ' || ' || 'pass trainer cannot read another trainer''s student'; else log := log || ' || ' || 'FAIL trainer read s2 state'; fails := fails + 1; end if;
  select count(*) into n from public.gyms;
  if n = 2 then log := log || ' || ' || 'pass trainer sees both gyms'; else log := log || ' || ' || ('FAIL trainer gyms visible ' || n); fails := fails + 1; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.workouts where user_id = sb;
  if n = 0 then log := log || ' || ' || 'pass student cannot read another student'; else log := log || ' || ' || 'FAIL student read sb'; fails := fails + 1; end if;
  select count(*) into n from public.gyms;
  if n = 1 then log := log || ' || ' || 'pass student sees only own gym'; else log := log || ' || ' || ('FAIL student gyms ' || n); fails := fails + 1; end if;
  select count(*) into n from public.profiles where id = s2;
  if n = 0 then log := log || ' || ' || 'pass student cannot see other students'; else log := log || ' || ' || 'FAIL student saw s2'; fails := fails + 1; end if;
  begin
    update public.memberships set role = 'trainer' where user_id = s;
    get diagnostics n = row_count;
    if n = 0 then log := log || ' || ' || 'pass student cannot change own role'; else log := log || ' || ' || 'FAIL student promoted self'; fails := fails + 1; end if;
  exception when others then log := log || ' || ' || 'pass student cannot change own role';
  end;
  begin
    perform public.set_student_trainer(ga, s, t2);
    log := log || ' || ' || 'FAIL student reassigned trainer'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass only owner reassigns trainers';
  end;
  execute 'reset role';

  -- 5. plans and assessments
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.offer_plan(ga, s, 'Full Body', '{"routines": []}'::jsonb);
  begin
    perform public.offer_plan(ga, s2, 'Nope', '{"routines": []}'::jsonb);
    log := log || ' || ' || 'FAIL trainer sent plan to other trainer''s student'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass plan only to own students';
  end;
  insert into public.assessments (gym_id, author_id, student_id, day, weight, "values")
  values (ga, t, s, current_date, 78.4, '{"waist": 84}');
  begin
    insert into public.assessments (gym_id, author_id, student_id, day, weight)
    values (ga, t, s2, current_date, 70);
    log := log || ' || ' || 'FAIL assessment for other trainer''s student'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass assessment only for own students';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.plan_offers where to_id = s;
  if n = 1 then log := log || ' || ' || 'pass student sees plan sent to them'; else log := log || ' || ' || 'FAIL student plan ' || n; fails := fails + 1; end if;
  select count(*) into n from public.assessments where student_id = s;
  if n = 1 then log := log || ' || ' || 'pass student sees own assessment'; else log := log || ' || ' || 'FAIL student assessment ' || n; fails := fails + 1; end if;
  execute 'reset role';

  -- 6. owner: reassign s to t2 when t leaves gym A; usage counts
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.remove_member(ga, t);
  select count(*) into n from public.memberships where gym_id = ga and trainer_id = t;
  if n = 0 then log := log || ' || ' || 'pass removed trainer leaves students unassigned'; else log := log || ' || ' || 'FAIL students still on removed trainer'; fails := fails + 1; end if;
  perform public.set_student_trainer(ga, s, t2);
  select count(*) into n from public.memberships where gym_id = gb and user_id = t;
  if n = 1 then log := log || ' || ' || 'pass trainer kept in the other gym'; else log := log || ' || ' || 'FAIL trainer lost gym B'; fails := fails + 1; end if;
  select coalesce(sum(students), 0) into n from public.gym_usage(gb);
  if n = 1 then log := log || ' || ' || 'pass usage counts the active student in gym B'; else log := log || ' || ' || ('FAIL usage ' || n); fails := fails + 1; end if;
  code := (public.create_invite('owner', null, null, 'Gym C')).code;
  execute 'reset role';

  -- 7. a new owner via owner invite sees only their gym
  perform set_config('request.jwt.claims', json_build_object('sub', o2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.redeem_invite(code, 'Owner O2');
  gc := (r->>'gym_id')::uuid;
  select count(*) into n from public.gyms;
  if n = 1 then log := log || ' || ' || 'pass new owner sees only own gym'; else log := log || ' || ' || ('FAIL o2 gyms ' || n); fails := fails + 1; end if;
  select count(*) into n from public.memberships;
  if n = 0 then log := log || ' || ' || 'pass new owner sees no other gym members'; else log := log || ' || ' || ('FAIL o2 memberships ' || n); fails := fails + 1; end if;
  begin
    perform public.gym_usage(ga);
    log := log || ' || ' || 'FAIL o2 read gym A usage'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass owners are isolated';
  end;
  execute 'reset role';

  -- 8. anon may only check an invite
  execute 'set local role anon';
  begin
    perform 1 from public.profiles limit 1;
    log := log || ' || ' || 'FAIL anon read profiles'; fails := fails + 1;
  exception when others then log := log || ' || ' || 'pass anon has no table access';
  end;
  execute 'reset role';

  raise exception 'VERIFY % (% checks, % failed) || %',
    case when fails = 0 then 'PASS' else 'FAIL' end, (length(log) - length(replace(log, ' || ', ''))) / 4, fails, log;
end $verify$;
