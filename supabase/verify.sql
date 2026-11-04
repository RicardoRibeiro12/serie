-- Série — verification. Run in the SQL Editor after schema.sql.
--
-- Part A: plain catalogue SELECTs (run them one by one, or all; the editor shows the last).
-- Part B: one DO block that seeds throwaway auth.users + profiles, impersonates each of them
--         (set local role authenticated + request.jwt.claims) and checks what RLS and the RPCs
--         allow. It ALWAYS ends by raising an exception, so everything it wrote is rolled back;
--         the exception message is the report ("VERIFY PASS ..." or "VERIFY FAIL ...").

-- ===== Part A ================================================================================

-- A1. Tables and RLS flag
select c.relname as table, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by 1;

-- A2. Policies
select tablename, policyname, cmd, roles
  from pg_policies where schemaname = 'public' order by tablename, policyname;

-- A3. Functions, security definer flag, and who may execute them
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' order by 1;

-- A4. Table grants for the API roles
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 group by 1, 2 order by 1, 2;

-- ===== Part B ================================================================================

do $verify$
declare
  o   uuid := gen_random_uuid();   -- owner of gym 1
  t   uuid := gen_random_uuid();   -- trainer in gym 1
  t2  uuid := gen_random_uuid();   -- second trainer in gym 1
  s   uuid := gen_random_uuid();   -- student of t
  s2  uuid := gen_random_uuid();   -- student of t2
  x   uuid := gen_random_uuid();   -- signed up, no profile
  o2  uuid := gen_random_uuid();   -- owner of gym 2
  c_t text; c_t2 text; c_s text; c_s2 text;
  n int; r jsonb; ok boolean; v text;
  log text[] := '{}';
  fails int := 0;
begin
  -- seed auth users (as postgres)
  insert into auth.users (instance_id, id, aud, role, email)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
         'verify-' || u || '@example.invalid'
    from unnest(array[o, t, t2, s, s2, x, o2]) u;

  -- helper macro: impersonate
  -- (inline: set_config + set local role)

  -- 1. owner creates gym
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_gym('Verify Gym', 'Owner');
  select count(*) into n from public.profiles where id = o and role = 'owner';
  log := log || format('%s create_gym makes owner', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;

  -- 2. owner invites two trainers
  select code into c_t  from public.create_invite('trainer');
  select code into c_t2 from public.create_invite('trainer');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.redeem_invite(c_t, 'Trainer One');
  select count(*) into n from public.profiles where id = t and role = 'trainer';
  log := log || format('%s redeem_invite makes trainer', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  -- trainer cannot create a trainer invite
  begin
    perform public.create_invite('trainer');
    log := log || 'FAIL trainer created trainer invite'; fails := fails + 1;
  exception when others then log := log || format('PASS trainer cannot invite trainer (%s)', sqlstate);
  end;
  -- trainer cannot create a student invite for someone else
  begin
    insert into public.invites (gym_id, role, trainer_id, created_by) values (public.my_gym(), 'student', o, t);
    log := log || 'FAIL trainer invited student for another trainer'; fails := fails + 1;
  exception when others then log := log || format('PASS trainer invite bound to self (%s)', sqlstate);
  end;
  select code into c_s from public.create_invite('student');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', t2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.redeem_invite(c_t2, 'Trainer Two');
  select code into c_s2 from public.create_invite('student');
  reset role;

  -- 3. students sign up
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.redeem_invite(c_s, 'Student One');
  select count(*) into n from public.profiles where id = s and role = 'student' and trainer_id = t;
  log := log || format('%s student gets trainer from invite', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  -- student reads: self + own trainer only
  select count(*) into n from public.profiles;
  log := log || format('%s student sees 2 profiles (self + trainer): %s', case when n = 2 then 'PASS' else 'FAIL' end, n);
  if n <> 2 then fails := fails + 1; end if;
  -- student cannot promote self / change trainer
  begin
    update public.profiles set role = 'owner' where id = s;
    log := log || 'FAIL student changed own role'; fails := fails + 1;
  exception when others then log := log || format('PASS student cannot change role (%s)', sqlstate);
  end;
  begin
    update public.profiles set trainer_id = t2 where id = s;
    log := log || 'FAIL student changed own trainer'; fails := fails + 1;
  exception when others then log := log || format('PASS student cannot change trainer (%s)', sqlstate);
  end;
  update public.profiles set name = 'Student Renamed' where id = s;
  select count(*) into n from public.profiles where id = s and name = 'Student Renamed';
  log := log || format('%s student renames self', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  -- no direct profile insert, no direct state write
  begin
    insert into public.profiles (id, name, role) values (x, 'Hacker', 'owner');
    log := log || 'FAIL direct profile insert'; fails := fails + 1;
  exception when others then log := log || format('PASS no direct profile insert (%s)', sqlstate);
  end;
  begin
    update public.user_state set rev = 99 where user_id = s;
    log := log || 'FAIL direct user_state update'; fails := fails + 1;
  exception when others then log := log || format('PASS no direct user_state write (%s)', sqlstate);
  end;
  -- save_state concurrency
  r := public.save_state('{"workouts":[{"d":"2026-11-04"}]}'::jsonb, 0);
  ok := (r->>'ok')::boolean and (r->>'rev')::bigint = 1;
  log := log || format('%s save_state rev 0 -> 1: %s', case when ok then 'PASS' else 'FAIL' end, r);
  if not ok then fails := fails + 1; end if;
  r := public.save_state('{"workouts":[]}'::jsonb, 0);
  ok := not (r->>'ok')::boolean and (r->>'rev')::bigint = 1 and r ? 'doc';
  log := log || format('%s save_state stale rev conflicts', case when ok then 'PASS' else 'FAIL' end);
  if not ok then fails := fails + 1; end if;
  begin
    perform public.save_state('{}'::jsonb, 1);
    log := log || 'FAIL empty doc accepted'; fails := fails + 1;
  exception when others then log := log || format('PASS empty doc refused (%s)', sqlstate);
  end;
  -- student cannot write assessments / offers, cannot see invites
  begin
    insert into public.assessments (gym_id, trainer_id, student_id, date) values (public.my_gym(), s, s, current_date);
    log := log || 'FAIL student inserted assessment'; fails := fails + 1;
  exception when others then log := log || format('PASS student cannot insert assessment (%s)', sqlstate);
  end;
  select count(*) into n from public.invites;
  log := log || format('%s student sees no invites: %s', case when n = 0 then 'PASS' else 'FAIL' end, n);
  if n <> 0 then fails := fails + 1; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.redeem_invite(c_s2, 'Student Two');
  perform public.save_state('{"workouts":[]}'::jsonb, 0);
  reset role;

  -- 4. trainer t: sees own students only, reads their state, coaches them
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  log := log || format('%s trainer sees self + 1 student: %s', case when n = 2 then 'PASS' else 'FAIL' end, n);
  if n <> 2 then fails := fails + 1; end if;
  select count(*) into n from public.user_state where user_id = s;
  log := log || format('%s trainer reads own student state', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from public.user_state where user_id = s2;
  log := log || format('%s trainer cannot read other trainer''s student state', case when n = 0 then 'PASS' else 'FAIL' end);
  if n <> 0 then fails := fails + 1; end if;
  insert into public.assessments (gym_id, trainer_id, student_id, date, weight, "values")
    values (public.my_gym(), t, s, current_date, 80, '{"waist":82}');
  log := log || 'PASS trainer inserts assessment for own student';
  begin
    insert into public.assessments (gym_id, trainer_id, student_id, date) values (public.my_gym(), t, s2, current_date);
    log := log || 'FAIL trainer assessed another trainer''s student'; fails := fails + 1;
  exception when others then log := log || format('PASS trainer cannot assess other''s student (%s)', sqlstate);
  end;
  perform public.offer_plan(s, 'Plano A', '{"routines":[]}'::jsonb);
  perform public.offer_plan(s, 'Plano B', '{"routines":[]}'::jsonb);
  select count(*) into n from public.plan_offers where to_id = s;
  log := log || format('%s offer_plan keeps one pending offer: %s', case when n = 1 then 'PASS' else 'FAIL' end, n);
  if n <> 1 then fails := fails + 1; end if;
  begin
    perform public.offer_plan(s2, 'X', '{}'::jsonb);
    log := log || 'FAIL trainer offered plan to other''s student'; fails := fails + 1;
  exception when others then log := log || format('PASS trainer cannot offer to other''s student (%s)', sqlstate);
  end;
  reset role;

  -- 5. student reads and deletes own offer, reads own assessment
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.assessments;
  log := log || format('%s student reads own assessment: %s', case when n = 1 then 'PASS' else 'FAIL' end, n);
  if n <> 1 then fails := fails + 1; end if;
  delete from public.plan_offers where to_id = s;
  get diagnostics n = row_count;
  log := log || format('%s student deletes own offer', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  reset role;

  -- 6. owner: sees whole gym, moves a student to another PT, cannot mint an owner
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  log := log || format('%s owner sees whole gym (5): %s', case when n = 5 then 'PASS' else 'FAIL' end, n);
  if n <> 5 then fails := fails + 1; end if;
  select count(*) into n from public.user_state;
  log := log || format('%s owner reads gym states (5): %s', case when n = 5 then 'PASS' else 'FAIL' end, n);
  if n <> 5 then fails := fails + 1; end if;
  update public.profiles set trainer_id = t2 where id = s;
  select count(*) into n from public.profiles where id = s and trainer_id = t2;
  log := log || format('%s owner reassigns student PT', case when n = 1 then 'PASS' else 'FAIL' end);
  if n <> 1 then fails := fails + 1; end if;
  begin
    update public.profiles set role = 'owner' where id = t;
    log := log || 'FAIL owner minted another owner'; fails := fails + 1;
  exception when others then log := log || format('PASS owner cannot mint owner (%s)', sqlstate);
  end;
  begin
    update public.profiles set trainer_id = s2 where id = s;
    log := log || 'FAIL student set as trainer'; fails := fails + 1;
  exception when others then log := log || format('PASS trainer_id must be a trainer (%s)', sqlstate);
  end;
  -- demoting trainer t2 clears its students' trainer_id
  update public.profiles set role = 'student' where id = t2;
  select count(*) into n from public.profiles where trainer_id = t2;
  log := log || format('%s demoting a trainer frees their students: %s left', case when n = 0 then 'PASS' else 'FAIL' end, n);
  if n <> 0 then fails := fails + 1; end if;
  reset role;

  -- 7. outsiders
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  log := log || format('%s user without profile sees no profiles: %s', case when n = 0 then 'PASS' else 'FAIL' end, n);
  if n <> 0 then fails := fails + 1; end if;
  begin
    perform public.redeem_invite(c_s, 'Reuse');
    log := log || 'FAIL used invite redeemed again'; fails := fails + 1;
  exception when others then log := log || format('PASS used invite refused (%s)', sqlstate);
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_gym('Other Gym', 'Other Owner');
  select count(*) into n from public.profiles;
  log := log || format('%s other gym owner sees only self: %s', case when n = 1 then 'PASS' else 'FAIL' end, n);
  if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from public.user_state where user_id = s;
  log := log || format('%s other gym owner cannot read state', case when n = 0 then 'PASS' else 'FAIL' end);
  if n <> 0 then fails := fails + 1; end if;
  reset role;

  -- 8. anon: no table access, check_invite allowed
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from public.profiles;
    log := log || 'FAIL anon can select profiles'; fails := fails + 1;
  exception when others then log := log || format('PASS anon has no table access (%s)', sqlstate);
  end;
  v := coalesce(public.check_invite('NOPE')::text, 'null');
  log := log || format('PASS anon can call check_invite (unknown code -> %s)', v);
  reset role;

  raise exception '% (% failed) || %',
    case when fails = 0 then 'VERIFY PASS' else 'VERIFY FAIL' end, fails, array_to_string(log, ' || ');
end
$verify$;
