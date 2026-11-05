-- Série — what the app needs on top of schema.sql: the openGym sync contract, each student's
-- plan library, the full assessments, membership cards and gym entries/exits, and the answers the
-- app's screens read (frontend/src/lib/supa-api.js maps the app's /api/... routes onto these).
-- Run after schema.sql, as postgres. Safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- A plan a trainer wrote for one student in one gym. No weekdays: the student picks the day.
create table if not exists public.student_plans (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  from_id     uuid references public.profiles (id) on delete set null,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  plan        jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 262144),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists student_plans_to_idx on public.student_plans (to_id, updated_at desc);

-- Body composition (age, height, sex, metabolism, heart rate, water, muscle ...) and whether the
-- student's app has folded weight and body fat into their own history yet.
alter table public.assessments add column if not exists body jsonb not null default '{}'::jsonb;
alter table public.assessments add column if not exists merged boolean not null default false;

-- RGPD consent, per person: the privacy policy (needed to use the app), and separately the
-- explicit consent for health data (art. 9): without it no trainer can record an assessment for
-- them (record_assessment). The version names the policy text that was accepted.
alter table public.profiles add column if not exists consent_terms_at timestamptz;
alter table public.profiles add column if not exists consent_health_at timestamptz;
alter table public.profiles add column if not exists consent_version text;
alter table public.assessments drop constraint if exists assessments_check;
alter table public.assessments add constraint assessments_check
  check (weight is not null or "values" <> '{}'::jsonb or body <> '{}'::jsonb);

create sequence if not exists public.card_seq;
create table if not exists public.member_cards (
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  number      text not null unique,
  code        text not null unique,                  -- only ever in the QR; looked up by the desk
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  primary key (gym_id, user_id)
);

create table if not exists public.visits (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  in_at       timestamptz not null default now(),
  out_at      timestamptz,
  auto        boolean not null default false,        -- closed by the 6-hour rule, not by a person
  by_desk     boolean not null default false
);
create index if not exists visits_gym_idx on public.visits (gym_id, in_at desc);
create unique index if not exists visits_open_idx on public.visits (gym_id, user_id) where out_at is null;

alter table public.student_plans enable row level security;
alter table public.member_cards  enable row level security;
alter table public.visits        enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Session and sync
-- ---------------------------------------------------------------------------------------------

-- Who the app is talking to: the shape of the old /api/me user, plus the gyms.
-- admin = owns a gym (or runs the platform), owner = platform admin, trainer = trainer anywhere.
create or replace function public.app_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name,
    'admin', public.is_platform_admin() or exists (select 1 from gyms where owner_id = p.id),
    'owner', public.is_platform_admin(),
    'trainer', exists (select 1 from memberships where user_id = p.id and role = 'trainer'),
    'consentTerms', p.consent_terms_at, 'consentHealth', p.consent_health_at, 'consentVersion', p.consent_version,
    'gyms', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', 'owner') order by g.created_at)
                        from gyms g where g.owner_id = p.id), '[]'::jsonb)
            || coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', m.role) order by m.created_at)
                        from memberships m join gyms g on g.id = m.gym_id where m.user_id = p.id), '[]'::jsonb))
  from profiles p where p.id = auth.uid()
$$;

-- First sign-in after sign-up: the profile, then the invite if there is one, or, for the very first
-- person on a fresh project, the platform and its first gym.
create or replace function public.app_join(p_name text, p_code text default null, p_gym_name text default 'Série') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    perform public.redeem_invite(p_code, p_name);
  elsif not exists (select 1 from platform_admins) then
    perform public.bootstrap(p_name, p_gym_name);
  else
    perform public.ensure_profile(p_name);
  end if;
  return public.app_me();
end $$;

-- openGym's PUT /api/data: a write over the revision the device last read, else 409 with the
-- stored document so the device merges and tries again (frontend lib/sync-merge.js). The stored
-- document carries _rev, a write id _wid and its ancestors _wids, as the old server's did.
create or replace function public.put_state(p_doc jsonb, p_base_rev bigint default null, p_base_wid text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rev bigint; v_doc jsonb; v_wid text; v_wids jsonb;
begin
  perform public.require_uid();
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'no profile' using errcode = 'P0002'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'state required' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_object_keys(p_doc) k where k not in ('_rev', '_ts')) then
    raise exception 'state required' using errcode = '22023';
  end if;
  if (p_doc ? 'workouts' and jsonb_typeof(p_doc->'workouts') not in ('array', 'null'))
     or (p_doc ? 'routines' and jsonb_typeof(p_doc->'routines') not in ('array', 'null')) then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > 4 * 1024 * 1024 then raise exception 'state too large' using errcode = '54000'; end if;
  insert into user_state (user_id) values (auth.uid()) on conflict do nothing;
  select doc, rev into v_doc, v_rev from user_state where user_id = auth.uid() for update;
  if p_base_rev is not null and (p_base_rev <> v_rev
      or (p_base_wid is not null and v_doc ? '_wid' and v_doc->>'_wid' <> p_base_wid)) then
    return jsonb_build_object('conflict', true, 'rev', v_rev, 'state', v_doc);
  end if;
  p_doc := p_doc - 'active';
  -- "Reset everything" only moves forward.
  if coalesce((v_doc->>'resetAt')::numeric, 0) > coalesce((p_doc->>'resetAt')::numeric, 0) then
    p_doc := p_doc || jsonb_build_object('resetAt', v_doc->'resetAt');
    if v_doc ? 'resetIds' then p_doc := p_doc || jsonb_build_object('resetIds', v_doc->'resetIds'); else p_doc := p_doc - 'resetIds'; end if;
  end if;
  v_wid := encode(gen_random_bytes(8), 'hex');
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_wids from (
    select x from (
      select x, row_number() over () n, count(*) over () c
        from jsonb_array_elements(coalesce(v_doc->'_wids', '[]'::jsonb) || case when v_doc ? '_wid' then jsonb_build_array(v_doc->'_wid') else '[]'::jsonb end) x
    ) s where n > c - 50
  ) t;
  v_rev := v_rev + 1;
  p_doc := p_doc || jsonb_build_object('_rev', v_rev, '_wid', v_wid, '_wids', v_wids);
  update user_state set doc = p_doc, rev = v_rev, updated_at = now() where user_id = auth.uid();
  perform public.touch_usage();
  return jsonb_build_object('ok', true, 'rev', v_rev, 'wid', v_wid, 'ts', p_doc->'_ts');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Trainers: students, plan library, assessments
-- ---------------------------------------------------------------------------------------------

-- The gym in which the caller coaches this student (their trainer there, or its owner).
create or replace function public.coach_gym(p_student uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.gym_id from memberships m join gyms g on g.id = m.gym_id
   where m.user_id = p_student and m.role = 'student' and (m.trainer_id = auth.uid() or g.owner_id = auth.uid())
   order by (m.trainer_id = auth.uid()) desc limit 1
$$;

-- The trainer's overview: their students in every gym, with totals read off the student's document.
create or replace function public.trainer_students() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb) from (
    select distinct on (p.id) jsonb_build_object(
      'id', p.id, 'name', p.name, 'gym', g.name,
      'workouts', coalesce(jsonb_array_length(case when jsonb_typeof(s.doc->'workouts') = 'array' then s.doc->'workouts' end), 0),
      'lastWorkout', (select max(w->>'d') from jsonb_array_elements(case when jsonb_typeof(s.doc->'workouts') = 'array' then s.doc->'workouts' else '[]'::jsonb end) w),
      'unit', case when s.doc->>'unit' = 'lb' then 'lb' else 'kg' end,
      'weight', (select jsonb_build_object('d', b->>'d', 'w', (b->>'w')::numeric) from jsonb_array_elements(case when jsonb_typeof(s.doc->'bodyweight') = 'array' then s.doc->'bodyweight' else '[]'::jsonb end) b
                  where (b->>'w') ~ '^[0-9.]+$' order by b->>'d' desc limit 1),
      'bodyFat', (select jsonb_build_object('d', a.day, 'v', (a."values"->>'bodyFat')::numeric) from assessments a
                   where a.student_id = p.id and a."values" ? 'bodyFat' order by a.day desc, a.created_at desc limit 1),
      'plans', (select count(*) from student_plans sp where sp.to_id = p.id),
      'assessments', (select count(*) from assessments a where a.student_id = p.id),
      'healthConsent', p.consent_health_at is not null) as row
    from memberships m join gyms g on g.id = m.gym_id join profiles p on p.id = m.user_id
    left join user_state s on s.user_id = p.id
    where m.role = 'student' and (m.trainer_id = auth.uid() or g.owner_id = auth.uid())
    order by p.id
  ) x
$$;

create or replace function public.save_student_plan(p_student uuid, p_id uuid, p_name text, p_plan jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := public.coach_gym(p_student); v_id uuid;
begin
  perform public.require_uid();
  if v_gym is null then raise exception 'not your student' using errcode = '42501'; end if;
  if p_plan is null or jsonb_typeof(p_plan->'routines') <> 'array' or jsonb_array_length(p_plan->'routines') = 0 then
    raise exception 'the plan has no routines' using errcode = '22023';
  end if;
  p_plan := (p_plan - 'programmes' - 'programme_fmt') || jsonb_build_object('week', '{}'::jsonb);
  if p_id is not null then
    update student_plans set name = coalesce(nullif(btrim(p_name), ''), 'Plano'), plan = p_plan, updated_at = now()
     where id = p_id and to_id = p_student and from_id = auth.uid() returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;
  if (select count(*) from student_plans where to_id = p_student) >= 30 then
    raise exception 'this student already has 30 plans' using errcode = '22023';
  end if;
  insert into student_plans (gym_id, from_id, to_id, name, plan)
  values (v_gym, auth.uid(), p_student, coalesce(nullif(btrim(p_name), ''), 'Plano'), p_plan) returning id into v_id;
  return v_id;
end $$;

create or replace function public.record_assessment(p_student uuid, p_day date, p_weight numeric, p_values jsonb, p_body jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := public.coach_gym(p_student); v_id uuid;
begin
  perform public.require_uid();
  if v_gym is null then raise exception 'not your student' using errcode = '42501'; end if;
  if (select consent_health_at from profiles where id = p_student) is null then
    raise exception 'no health consent' using errcode = '42501';
  end if;
  insert into assessments (gym_id, author_id, student_id, day, weight, "values", body, note)
  values (v_gym, auth.uid(), p_student, p_day, p_weight, coalesce(p_values, '{}'::jsonb), coalesce(p_body, '{}'::jsonb), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- The person's own consent. p_terms true records the acceptance of the privacy policy (it is not
-- withdrawn here: that is deleting the account). p_health true gives, false withdraws, the consent
-- for health data; null leaves either as it is. Answers the person as app_me() does.
create or replace function public.set_consent(p_terms boolean, p_health boolean, p_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  update profiles set
    consent_terms_at = case when p_terms is true and consent_terms_at is null then now() else consent_terms_at end,
    consent_health_at = case when p_health is true then coalesce(consent_health_at, now()) when p_health is false then null else consent_health_at end,
    consent_version = case when p_terms is true or p_health is not null then left(coalesce(nullif(btrim(p_version), ''), consent_version), 20) else consent_version end
  where id = auth.uid();
  return public.app_me();
end $$;

-- The person deletes their own account (right to erasure): the sign-in, the profile and, by the
-- foreign keys, their state, workouts, memberships, plans, assessments, card and visits. p_name must
-- be their name, typed back, so a stray request does nothing. An owner hands their gyms on first.
create or replace function public.delete_my_account(p_name text) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare v_name text;
begin
  perform public.require_uid();
  select name into v_name from profiles where id = auth.uid();
  if v_name is null or lower(btrim(coalesce(p_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'name does not match' using errcode = '22023';
  end if;
  if exists (select 1 from gyms where owner_id = auth.uid()) then
    raise exception 'owns a gym' using errcode = '42501';
  end if;
  delete from platform_admins where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
  return true;
end $$;

-- The person erases every assessment recorded about them (right to erasure).
create or replace function public.delete_my_assessments() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from assessments where student_id = auth.uid() returning 1) select count(*)::int from d
$$;

-- The student's app merged these into their own weigh-ins and measurements.
create or replace function public.assessments_merged(p_ids uuid[]) returns integer
language sql security definer set search_path = public as $$
  with u as (update assessments set merged = true where student_id = auth.uid() and id = any(p_ids) and not merged returning 1)
  select count(*)::int from u
$$;

-- ---------------------------------------------------------------------------------------------
-- Membership cards and entries/exits (the owner of the gym manages them)
-- ---------------------------------------------------------------------------------------------

-- Whoever is still in when the day ends (Lisbon time) is checked out at its last minute.
create or replace function public.close_stale_visits(p_gym uuid default null) returns void
language sql security definer set search_path = public as $$
  update visits
     set out_at = (((in_at at time zone 'Europe/Lisbon')::date + time '23:59:59') at time zone 'Europe/Lisbon'), auto = true
   where out_at is null
     and (in_at at time zone 'Europe/Lisbon')::date < (now() at time zone 'Europe/Lisbon')::date
     and (p_gym is null or gym_id = p_gym)
$$;

-- Issue (or reissue: new QR, the old one stops working) a card to a member of the owner's gym.
create or replace function public.issue_card(p_gym uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_card member_cards;
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if not exists (select 1 from memberships where gym_id = p_gym and user_id = p_user)
     and not exists (select 1 from gyms where id = p_gym and owner_id = p_user) then
    raise exception 'not a member of this gym' using errcode = '22023';
  end if;
  insert into member_cards (gym_id, user_id, number, code)
  values (p_gym, p_user, 'S-' || lpad(nextval('card_seq')::text, 6, '0'), encode(gen_random_bytes(18), 'base64'))
  on conflict (gym_id, user_id) do update set code = encode(gen_random_bytes(18), 'base64')
  returning * into v_card;
  return jsonb_build_object('number', v_card.number, 'status', v_card.status);
end $$;

create or replace function public.set_card_status(p_gym uuid, p_user uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_card member_cards;
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'status must be active or suspended' using errcode = '22023'; end if;
  update member_cards set status = p_status where gym_id = p_gym and user_id = p_user returning * into v_card;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  return jsonb_build_object('number', v_card.number, 'status', v_card.status);
end $$;

-- The caller's own card (the first gym that issued one) and whether they are in now.
create or replace function public.my_card() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_card member_cards; v_gym gyms; v_in timestamptz;
begin
  perform public.require_uid();
  perform public.close_stale_visits();
  select * into v_card from member_cards where user_id = auth.uid() order by created_at limit 1;
  if not found then return jsonb_build_object('card', null); end if;
  select * into v_gym from gyms where id = v_card.gym_id;
  select in_at into v_in from visits where gym_id = v_card.gym_id and user_id = auth.uid() and out_at is null;
  return jsonb_build_object('card', jsonb_build_object(
      'number', v_card.number, 'qr', 'SERIE1:' || v_card.code, 'status', v_card.status, 'since', v_card.created_at,
      'name', (select name from profiles where id = auth.uid()), 'gym', v_gym.name,
      'role', coalesce((select role from memberships where gym_id = v_card.gym_id and user_id = auth.uid()), 'member')),
    'inside', v_in);
end $$;

-- The desk moves a member in or out ('toggle': in if they are out, out if they are in).
create or replace function public.visit_move(p_gym uuid, p_user uuid, p_dir text, p_desk boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_card member_cards; v_open visits; v_at timestamptz := now();
begin
  select * into v_card from member_cards where gym_id = p_gym and user_id = p_user;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  if v_card.status <> 'active' then raise exception 'card suspended' using errcode = '42501'; end if;
  perform public.close_stale_visits(p_gym);
  select * into v_open from visits where gym_id = p_gym and user_id = p_user and out_at is null for update;
  if p_dir = 'toggle' then p_dir := case when v_open.id is null then 'in' else 'out' end; end if;
  if p_dir = 'in' then
    if v_open.id is not null then raise exception 'already checked in' using errcode = '23505'; end if;
    insert into visits (gym_id, user_id, in_at, by_desk) values (p_gym, p_user, v_at, p_desk);
  elsif p_dir = 'out' then
    if v_open.id is null then raise exception 'not checked in' using errcode = 'P0002'; end if;
    update visits set out_at = v_at where id = v_open.id;
  else
    raise exception 'dir must be in or out' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'dir', p_dir, 'at', v_at, 'name', (select name from profiles where id = p_user), 'number', v_card.number);
end $$;

-- The desk: the QR text ("SERIE1:<code>") or the member number.
create or replace function public.desk_scan(p_gym uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_card member_cards; v_t text := btrim(coalesce(p_text, ''));
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if v_t like 'SERIE1:%' then select * into v_card from member_cards where gym_id = p_gym and code = substr(v_t, 8);
  else select * into v_card from member_cards where gym_id = p_gym and number = upper(v_t); end if;
  if not found then raise exception 'unknown card' using errcode = 'P0002'; end if;
  return public.visit_move(p_gym, v_card.user_id, 'toggle', true);
end $$;

-- The owner's list of a gym's people, in the shape the admin screen reads.
create or replace function public.gym_people(p_gym uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  perform public.close_stale_visits(p_gym);
  return coalesce((select jsonb_agg(x order by x->>'name') from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name,
      'admin', p.id = g.owner_id, 'owner', p.id = g.owner_id,
      'trainer', coalesce(m.role = 'trainer', false), 'trainerId', m.trainer_id,
      'workouts', coalesce(jsonb_array_length(case when jsonb_typeof(s.doc->'workouts') = 'array' then s.doc->'workouts' end), 0),
      'lastWorkout', (select max(w->>'d') from jsonb_array_elements(case when jsonb_typeof(s.doc->'workouts') = 'array' then s.doc->'workouts' else '[]'::jsonb end) w),
      'lastSync', s.updated_at,
      'card', (select jsonb_build_object('number', c.number, 'status', c.status, 'created', c.created_at, 'qr', 'SERIE1:' || c.code)
                 from member_cards c where c.gym_id = p_gym and c.user_id = p.id),
      'inside', (select v.in_at from visits v where v.gym_id = p_gym and v.user_id = p.id and v.out_at is null)) x
    from gyms g
    join profiles p on p.id = g.owner_id or p.id in (select user_id from memberships where gym_id = g.id)
    left join memberships m on m.gym_id = g.id and m.user_id = p.id
    left join user_state s on s.user_id = p.id
    where g.id = p_gym) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------------------------

drop policy if exists student_plans_select on public.student_plans;
create policy student_plans_select on public.student_plans for select to authenticated
  using (to_id = auth.uid() or from_id = auth.uid() or public.owns_gym(gym_id));
drop policy if exists student_plans_delete on public.student_plans;
create policy student_plans_delete on public.student_plans for delete to authenticated
  using (from_id = auth.uid() or public.owns_gym(gym_id));

drop policy if exists member_cards_select on public.member_cards;
create policy member_cards_select on public.member_cards for select to authenticated
  using (user_id = auth.uid() or public.owns_gym(gym_id));

drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select to authenticated
  using (user_id = auth.uid() or public.owns_gym(gym_id));

revoke all on public.student_plans, public.member_cards, public.visits from anon, authenticated;
grant select, delete on public.student_plans to authenticated;
grant select on public.member_cards, public.visits to authenticated;
-- Students read their own assessments' body readings; nothing else changes on the table grants.
grant select on public.assessments to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.app_me(), public.app_join(text, text, text), public.put_state(jsonb, bigint, text),
  public.set_consent(boolean, boolean, text), public.delete_my_assessments(), public.delete_my_account(text),
  public.coach_gym(uuid), public.trainer_students(), public.save_student_plan(uuid, uuid, text, jsonb),
  public.record_assessment(uuid, date, numeric, jsonb, jsonb, text), public.assessments_merged(uuid[]),
  public.issue_card(uuid, uuid), public.set_card_status(uuid, uuid, text), public.my_card(),
  public.desk_scan(uuid, text), public.gym_people(uuid)
to authenticated;
-- schema.sql's own grants, restated because the revoke above covers every function.
grant execute on function
  public.ensure_profile(text), public.bootstrap(text, text), public.create_gym(text),
  public.set_member_role(uuid, uuid, text), public.set_student_trainer(uuid, uuid, uuid),
  public.remove_member(uuid, uuid), public.transfer_gym(uuid, uuid),
  public.create_invite(text, uuid, uuid, text), public.check_invite(text), public.redeem_invite(text, text),
  public.save_state(jsonb, bigint), public.save_workouts(jsonb), public.offer_plan(uuid, uuid, text, jsonb),
  public.gym_usage(uuid, integer),
  public.owns_gym(uuid), public.is_member_of(uuid), public.is_trainer_in(uuid, uuid), public.can_coach_in(uuid, uuid),
  public.can_coach(uuid), public.can_see_profile(uuid), public.is_platform_admin()
to authenticated;
grant execute on function public.check_invite(text) to anon;
