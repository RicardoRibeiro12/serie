-- Série — Supabase schema (public schema, RLS on every table).
-- Run as the SQL Editor's default role (postgres). Safe to re-run: tables IF NOT EXISTS,
-- functions CREATE OR REPLACE, policies dropped and recreated.
--
-- Model
--   profiles       one row per person (auth user): the display name. Roles live in memberships.
--   gyms           a gym with its own name and one owner; an owner may own many gyms.
--   memberships    who is in which gym as 'trainer' or 'student'; a student's trainer in that gym.
--                  A trainer can work in several gyms; one person can be a trainer in one gym
--                  and a student in another.
--   user_state     the openGym client document WITHOUT the workout history (plan, settings,
--                  weigh-ins, measurements): small, rewritten on each sync.
--   workouts       one row per logged session, so history grows without rewriting anything and
--                  trainers/owners can list or count sessions cheaply.
--   usage_months   which month each person used the app (for the per-gym active-user count).
--   invites        single-use codes: owner -> trainer/student of a gym, trainer -> own student,
--                  platform admin -> a new gym owner.
--   plan_offers    a plan sent to a student in a gym (one pending per student per gym).
--   assessments    check-ins (weight, body fat, measurements) a trainer/owner records.
--   platform_admins  who may create gyms for new owners (the first caller of bootstrap()).
--
-- Writes that need rules beyond "my own row" go through SECURITY DEFINER functions; table
-- grants to `authenticated` are explicit (auto-expose is off) and `anon` gets only check_invite.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index if not exists gyms_owner_idx on public.gyms (owner_id);

create table if not exists public.memberships (
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('trainer', 'student')),
  trainer_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (gym_id, user_id),
  check (trainer_id is null or role = 'student'),
  check (trainer_id is distinct from user_id)
);
create index if not exists memberships_user_idx    on public.memberships (user_id);
create index if not exists memberships_trainer_idx on public.memberships (gym_id, trainer_id) where trainer_id is not null;

create table if not exists public.user_state (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  doc         jsonb not null default '{}'::jsonb,
  rev         bigint not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.workouts (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),   -- the client's own id
  day         date not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,                          -- tombstone for sync
  primary key (user_id, id)
);
create index if not exists workouts_user_day_idx on public.workouts (user_id, day desc) where not deleted;
create index if not exists workouts_user_updated_idx on public.workouts (user_id, updated_at);

create table if not exists public.usage_months (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  month       date not null,                                           -- first day of the month
  primary key (user_id, month)
);

create table if not exists public.invites (
  code        text primary key,
  gym_id      uuid references public.gyms (id) on delete cascade,      -- null for an owner invite
  role        text not null check (role in ('owner', 'trainer', 'student')),
  gym_name    text check (gym_name is null or char_length(gym_name) between 1 and 80),
  trainer_id  uuid references public.profiles (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  used_by     uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  check ((role = 'owner') = (gym_id is null)),
  check (role = 'owner' or gym_name is null),
  check (trainer_id is null or role = 'student')
);
create index if not exists invites_gym_idx on public.invites (gym_id) where used_by is null;

create table if not exists public.plan_offers (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  from_id     uuid references public.profiles (id) on delete set null,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  name        text not null default 'Plano' check (char_length(name) between 1 and 80),
  plan        jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 262144),
  created_at  timestamptz not null default now(),
  unique (gym_id, to_id)
);

create table if not exists public.assessments (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  day         date not null check (day <= current_date + 1),
  weight      numeric(5,1) check (weight is null or weight between 20 and 400),
  "values"    jsonb not null default '{}'::jsonb check (jsonb_typeof("values") = 'object'),
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  check (weight is not null or "values" <> '{}'::jsonb)
);
create index if not exists assessments_student_idx on public.assessments (student_id, day desc);

alter table public.profiles        enable row level security;
alter table public.platform_admins enable row level security;
alter table public.gyms            enable row level security;
alter table public.memberships     enable row level security;
alter table public.user_state      enable row level security;
alter table public.workouts        enable row level security;
alter table public.usage_months    enable row level security;
alter table public.invites         enable row level security;
alter table public.plan_offers     enable row level security;
alter table public.assessments     enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can ask without recursing through RLS)
-- ---------------------------------------------------------------------------------------------

create or replace function public.owns_gym(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gyms where id = p_gym and owner_id = auth.uid())
$$;

create or replace function public.is_member_of(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where gym_id = p_gym and user_id = auth.uid())
$$;

create or replace function public.is_trainer_in(p_gym uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where gym_id = p_gym and user_id = p_user and role = 'trainer')
$$;

-- The caller may coach this student in this gym: their trainer there, or the gym's owner.
create or replace function public.can_coach_in(p_gym uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                  where m.gym_id = p_gym and m.user_id = p_student and m.role = 'student'
                    and (m.trainer_id = auth.uid() or public.owns_gym(p_gym)))
$$;

-- The caller may coach this person in any gym (to read their workouts and plan).
create or replace function public.can_coach(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m join gyms g on g.id = m.gym_id
                  where m.user_id = p_student and m.role = 'student'
                    and (m.trainer_id = auth.uid() or g.owner_id = auth.uid()))
$$;

-- Whose name the caller may see: themselves, people they coach, their own trainers, the
-- trainers and owner of their gyms, and everyone in gyms they own.
create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or public.can_coach(p_user)
      or exists (select 1 from memberships me where me.user_id = auth.uid() and me.trainer_id = p_user)
      or exists (select 1 from memberships me join memberships them on them.gym_id = me.gym_id
                  where me.user_id = auth.uid() and them.user_id = p_user and them.role = 'trainer')
      or exists (select 1 from memberships me join gyms g on g.id = me.gym_id
                  where me.user_id = auth.uid() and g.owner_id = p_user)
      or exists (select 1 from memberships m join gyms g on g.id = m.gym_id
                  where m.user_id = p_user and g.owner_id = auth.uid())
      or exists (select 1 from memberships me join memberships them on them.gym_id = me.gym_id
                  where me.user_id = auth.uid() and me.role = 'trainer' and them.user_id = p_user)
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function public.new_code() returns text
language sql volatile set search_path = public, extensions as $$
  select upper(encode(extensions.gen_random_bytes(8), 'hex'))
$$;

create or replace function public.require_uid() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public.ensure_profile(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  perform public.require_uid();
  insert into profiles (id, name) values (auth.uid(), coalesce(v_name, 'Utilizador'))
  on conflict (id) do update set name = coalesce(v_name, profiles.name);
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPCs: gyms and people
-- ---------------------------------------------------------------------------------------------

-- First run only: the first person to call this becomes platform admin and owner of a gym.
create or replace function public.bootstrap(p_name text, p_gym_name text) returns public.gyms
language plpgsql security definer set search_path = public as $$
declare v_gym gyms;
begin
  perform public.require_uid();
  lock table platform_admins in exclusive mode;
  if exists (select 1 from platform_admins) then
    raise exception 'already set up' using errcode = '42501';
  end if;
  perform public.ensure_profile(p_name);
  insert into platform_admins (user_id) values (auth.uid());
  insert into gyms (name, owner_id) values (btrim(p_gym_name), auth.uid()) returning * into v_gym;
  return v_gym;
end $$;

-- An owner (or platform admin) adds another gym they own.
create or replace function public.create_gym(p_gym_name text) returns public.gyms
language plpgsql security definer set search_path = public as $$
declare v_gym gyms;
begin
  perform public.require_uid();
  if not (public.is_platform_admin() or exists (select 1 from gyms where owner_id = auth.uid())) then
    raise exception 'only gym owners can add gyms' using errcode = '42501';
  end if;
  insert into gyms (name, owner_id) values (btrim(p_gym_name), auth.uid()) returning * into v_gym;
  return v_gym;
end $$;

-- Owner: change a member between trainer and student. A trainer made student loses their
-- students in that gym (they keep their accounts, without a trainer until reassigned).
create or replace function public.set_member_role(p_gym uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if p_role not in ('trainer', 'student') then raise exception 'bad role' using errcode = '22023'; end if;
  update memberships set role = p_role, trainer_id = case when p_role = 'trainer' then null else trainer_id end
   where gym_id = p_gym and user_id = p_user;
  if not found then raise exception 'not a member' using errcode = 'P0002'; end if;
  if p_role = 'student' then
    update memberships set trainer_id = null where gym_id = p_gym and trainer_id = p_user;
  end if;
end $$;

-- Owner: give a student another trainer (or none), e.g. when a trainer leaves.
create or replace function public.set_student_trainer(p_gym uuid, p_student uuid, p_trainer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if p_trainer is not null and not public.is_trainer_in(p_gym, p_trainer) then
    raise exception 'that person is not a trainer in this gym' using errcode = '22023';
  end if;
  update memberships set trainer_id = p_trainer
   where gym_id = p_gym and user_id = p_student and role = 'student';
  if not found then raise exception 'not a student in this gym' using errcode = 'P0002'; end if;
end $$;

-- Owner removes someone from a gym, or a member leaves. Their account and history stay.
create or replace function public.remove_member(p_gym uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if not (public.owns_gym(p_gym) or p_user = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from memberships where gym_id = p_gym and user_id = p_user;
  update memberships set trainer_id = null where gym_id = p_gym and trainer_id = p_user;
  delete from invites where gym_id = p_gym and trainer_id = p_user and used_by is null;
end $$;

-- Owner hands a gym to another person (who must already have a profile).
create or replace function public.transfer_gym(p_gym uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_uid();
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = p_new_owner) then raise exception 'no such person' using errcode = 'P0002'; end if;
  update gyms set owner_id = p_new_owner where id = p_gym;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPCs: invites
-- ---------------------------------------------------------------------------------------------

-- owner of p_gym: 'trainer' or 'student' (optionally for one of the gym's trainers)
-- trainer in p_gym: 'student' for themselves
-- platform admin: 'owner' with p_gym null and p_gym_name (the redeemer becomes its owner)
create or replace function public.create_invite(p_role text, p_gym uuid default null,
                                               p_trainer uuid default null, p_gym_name text default null)
returns public.invites
language plpgsql security definer set search_path = public as $$
declare v_inv invites; v_trainer uuid := p_trainer;
begin
  perform public.require_uid();
  if p_role = 'owner' then
    if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
    if nullif(btrim(coalesce(p_gym_name, '')), '') is null then raise exception 'gym name required' using errcode = '22023'; end if;
    insert into invites (code, gym_id, role, gym_name, created_by)
    values (public.new_code(), null, 'owner', btrim(p_gym_name), auth.uid()) returning * into v_inv;
    return v_inv;
  end if;
  if p_role not in ('trainer', 'student') or p_gym is null then raise exception 'bad invite' using errcode = '22023'; end if;
  if public.owns_gym(p_gym) then
    if v_trainer is not null and (p_role <> 'student' or not public.is_trainer_in(p_gym, v_trainer)) then
      raise exception 'that person is not a trainer in this gym' using errcode = '22023';
    end if;
  elsif public.is_trainer_in(p_gym) and p_role = 'student' then
    v_trainer := auth.uid();
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into invites (code, gym_id, role, trainer_id, created_by)
  values (public.new_code(), p_gym, p_role, v_trainer, auth.uid()) returning * into v_inv;
  return v_inv;
end $$;

-- Public: what a code is for, so the sign-up screen can say "You're joining <gym> as a student".
create or replace function public.check_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('role', i.role, 'gym', coalesce(g.name, i.gym_name))
                     from invites i left join gyms g on g.id = i.gym_id
                    where i.code = upper(btrim(p_code)) and i.used_by is null), 'null'::jsonb)
$$;

-- Signed in (new or existing account): use a code. Creates the profile if needed, then the
-- membership (or the new gym for an owner invite). An existing trainer joining a second gym
-- uses this too.
create or replace function public.redeem_invite(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_inv invites; v_gym gyms;
begin
  perform public.require_uid();
  select * into v_inv from invites where code = upper(btrim(p_code)) for update;
  if not found or v_inv.used_by is not null then
    raise exception 'invite code is no longer valid' using errcode = 'P0002';
  end if;
  perform public.ensure_profile(p_name);
  if v_inv.role = 'owner' then
    insert into gyms (name, owner_id) values (v_inv.gym_name, auth.uid()) returning * into v_gym;
  else
    select * into v_gym from gyms where id = v_inv.gym_id;
    if v_gym.owner_id = auth.uid() then raise exception 'you own this gym' using errcode = '22023'; end if;
    insert into memberships (gym_id, user_id, role, trainer_id)
    values (v_inv.gym_id, auth.uid(), v_inv.role,
            case when v_inv.role = 'student' and v_inv.trainer_id is distinct from auth.uid() then v_inv.trainer_id end)
    on conflict (gym_id, user_id) do update
      set role = excluded.role, trainer_id = excluded.trainer_id;
  end if;
  update invites set used_by = auth.uid(), used_at = now() where code = v_inv.code;
  return jsonb_build_object('gym_id', v_gym.id, 'gym', v_gym.name, 'role', v_inv.role);
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPCs: sync
-- ---------------------------------------------------------------------------------------------

create or replace function public.touch_usage() returns void
language sql security definer set search_path = public as $$
  insert into usage_months (user_id, month) values (auth.uid(), date_trunc('month', now())::date)
  on conflict do nothing
$$;

-- Optimistic-concurrency save of the small state document. Returns
--   {"ok": true,  "rev": n}                                when p_rev matched
--   {"ok": false, "conflict": true, "rev": n, "doc": {...}} when another device wrote first
create or replace function public.save_state(p_doc jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rev bigint; v_doc jsonb;
begin
  perform public.require_uid();
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'no profile' using errcode = 'P0002'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'state must be a JSON object' using errcode = '22023'; end if;
  if octet_length(p_doc::text) > 2 * 1024 * 1024 then raise exception 'state too large' using errcode = '54000'; end if;
  insert into user_state (user_id) values (auth.uid()) on conflict do nothing;
  select doc, rev into v_doc, v_rev from user_state where user_id = auth.uid() for update;
  -- openGym's guard: a document of nothing but bookkeeping must not replace a real one.
  if not exists (select 1 from jsonb_object_keys(p_doc) k where k not in ('_rev', '_ts'))
     and exists (select 1 from jsonb_object_keys(v_doc) k where k not in ('_rev', '_ts')) then
    raise exception 'refusing to replace state with an empty document' using errcode = '22023';
  end if;
  if v_rev <> p_rev then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', v_rev, 'doc', v_doc);
  end if;
  update user_state set doc = p_doc, rev = rev + 1, updated_at = now() where user_id = auth.uid() returning rev into v_rev;
  perform public.touch_usage();
  return jsonb_build_object('ok', true, 'rev', v_rev);
end $$;

-- Upsert changed workouts (and tombstones) in one call: [{id, day, data, deleted?}, ...].
-- Last write wins per workout, as openGym's per-record stamps already decide on the client.
create or replace function public.save_workouts(p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform public.require_uid();
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'expected an array of at most 500 workouts' using errcode = '22023';
  end if;
  insert into workouts (user_id, id, day, data, deleted, updated_at)
  select auth.uid(), x->>'id', (x->>'day')::date, coalesce(x->'data', '{}'::jsonb),
         coalesce((x->>'deleted')::boolean, false), now()
    from jsonb_array_elements(p_items) x
   where octet_length(coalesce(x->'data', '{}'::jsonb)::text) <= 262144
  on conflict (user_id, id) do update
    set day = excluded.day, data = excluded.data, deleted = excluded.deleted, updated_at = now();
  get diagnostics v_n = row_count;
  perform public.touch_usage();
  return v_n;
end $$;

-- Send a plan to a student in a gym, replacing their pending one there.
create or replace function public.offer_plan(p_gym uuid, p_student uuid, p_name text, p_plan jsonb) returns public.plan_offers
language plpgsql security definer set search_path = public as $$
declare v_offer plan_offers;
begin
  perform public.require_uid();
  if not public.can_coach_in(p_gym, p_student) then raise exception 'not your student' using errcode = '42501'; end if;
  insert into plan_offers (gym_id, from_id, to_id, name, plan)
  values (p_gym, auth.uid(), p_student, coalesce(nullif(btrim(p_name), ''), 'Plano'), p_plan)
  on conflict (gym_id, to_id) do update
    set from_id = excluded.from_id, name = excluded.name, plan = excluded.plan, created_at = now()
  returning * into v_offer;
  return v_offer;
end $$;

-- Owner: active people per month in one of their gyms (anyone who synced that month).
create or replace function public.gym_usage(p_gym uuid, p_months integer default 12)
returns table (month date, trainers bigint, students bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  return query
    select u.month,
           count(*) filter (where m.role = 'trainer'),
           count(*) filter (where m.role = 'student')
      from usage_months u join memberships m on m.user_id = u.user_id and m.gym_id = p_gym
     where u.month >= (date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1))::date
     group by u.month order by u.month desc;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.can_see_profile(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated using (user_id = auth.uid());

drop policy if exists gyms_select on public.gyms;
create policy gyms_select on public.gyms for select to authenticated
  using (owner_id = auth.uid() or public.is_member_of(id));
drop policy if exists gyms_update on public.gyms;
create policy gyms_update on public.gyms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or trainer_id = auth.uid() or public.owns_gym(gym_id) or public.is_trainer_in(gym_id));

drop policy if exists user_state_select on public.user_state;
create policy user_state_select on public.user_state for select to authenticated
  using (user_id = auth.uid() or public.can_coach(user_id));

drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts for select to authenticated
  using (user_id = auth.uid() or public.can_coach(user_id));

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (created_by = auth.uid() or public.owns_gym(gym_id));
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (used_by is null and (created_by = auth.uid() or public.owns_gym(gym_id)));

drop policy if exists plan_offers_select on public.plan_offers;
create policy plan_offers_select on public.plan_offers for select to authenticated
  using (to_id = auth.uid() or from_id = auth.uid() or public.owns_gym(gym_id));
drop policy if exists plan_offers_delete on public.plan_offers;
create policy plan_offers_delete on public.plan_offers for delete to authenticated
  using (to_id = auth.uid() or from_id = auth.uid() or public.owns_gym(gym_id));

drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated
  using (student_id = auth.uid() or author_id = auth.uid() or public.can_coach_in(gym_id, student_id));
drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated
  with check (author_id = auth.uid() and public.can_coach_in(gym_id, student_id));
drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments for update to authenticated
  using (author_id = auth.uid() or public.owns_gym(gym_id))
  with check (public.can_coach_in(gym_id, student_id));
drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments for delete to authenticated
  using (student_id = auth.uid() or author_id = auth.uid() or public.owns_gym(gym_id));

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on public.profiles, public.platform_admins, public.gyms, public.memberships, public.user_state,
              public.workouts, public.usage_months, public.invites, public.plan_offers, public.assessments
  from anon, authenticated;

grant select, update (name)                  on public.profiles        to authenticated;
grant select                                 on public.platform_admins to authenticated;
grant select, update (name)                  on public.gyms            to authenticated;
grant select                                 on public.memberships     to authenticated;
grant select                                 on public.user_state      to authenticated;
grant select                                 on public.workouts        to authenticated;
grant select, delete                         on public.invites         to authenticated;
grant select, delete                         on public.plan_offers     to authenticated;
grant select, insert (gym_id, author_id, student_id, day, weight, "values", note),
      update (day, weight, "values", note), delete
                                             on public.assessments     to authenticated;

revoke execute on all functions in schema public from public, anon;
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
