-- Série — Supabase schema (public schema, RLS everywhere).
-- Safe to re-run: tables use IF NOT EXISTS, functions CREATE OR REPLACE, policies/triggers are
-- dropped and recreated. Run as the dashboard SQL Editor's default role (postgres).
--
-- Model
--   gyms          one row per gym
--   profiles      one row per auth user that belongs to a gym (owner | trainer | student)
--   user_state    the openGym client state document (plan, workouts, weigh-ins), one row per user
--   invites       single-use signup codes (owner: any role; trainer: students for themselves)
--   plan_offers   a plan a trainer/owner sends to a student (one pending per student)
--   assessments   physical assessments a trainer/owner records for a student
--
-- Clients never insert into profiles directly: profiles are created only by create_gym() and
-- redeem_invite(). "Automatically expose new tables" is off on this project, so every grant to
-- `authenticated` below is explicit and nothing is granted to `anon` except check_invite().

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  role        text not null default 'student' check (role in ('owner', 'trainer', 'student')),
  gym_id      uuid references public.gyms (id) on delete cascade,
  trainer_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (trainer_id is null or trainer_id <> id)
);
create index if not exists profiles_gym_idx     on public.profiles (gym_id);
create index if not exists profiles_trainer_idx on public.profiles (trainer_id);

create table if not exists public.user_state (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  doc         jsonb not null default '{}'::jsonb,
  rev         bigint not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.invites (
  code        text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  role        text not null check (role in ('trainer', 'student')),
  trainer_id  uuid references public.profiles (id) on delete set null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  used_by     uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  check (role = 'student' or trainer_id is null)
);
create index if not exists invites_gym_idx on public.invites (gym_id);

create table if not exists public.plan_offers (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  from_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  name        text,
  plan        jsonb not null,
  created_at  timestamptz not null default now(),
  constraint plan_offers_one_per_student unique (to_id)
);

create table if not exists public.assessments (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  trainer_id  uuid default auth.uid() references public.profiles (id) on delete set null,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  weight      numeric check (weight is null or (weight > 0 and weight < 1000)),
  "values"    jsonb not null default '{}'::jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists assessments_student_idx on public.assessments (student_id, date desc);

alter table public.gyms        enable row level security;
alter table public.profiles    enable row level security;
alter table public.user_state  enable row level security;
alter table public.invites     enable row level security;
alter table public.plan_offers enable row level security;
alter table public.assessments enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Helper functions (security definer: they read profiles without going through its RLS, so
-- policies that call them never recurse).
-- ---------------------------------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_gym() returns uuid
language sql stable security definer set search_path = public as $$
  select gym_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_trainer() returns uuid
language sql stable security definer set search_path = public as $$
  select trainer_id from public.profiles where id = auth.uid()
$$;

-- True when the caller may coach this student: the student is in the caller's gym and the
-- caller is the gym owner or the student's own trainer.
create or replace function public.can_coach(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles s
      join public.profiles me on me.id = auth.uid()
     where s.id = p_student
       and s.role = 'student'
       and s.gym_id = me.gym_id
       and (me.role = 'owner' or (me.role = 'trainer' and s.trainer_id = me.id))
  )
$$;

-- True when the caller may read this user's state: their own, their student's, or (owner) anyone
-- in the gym.
create or replace function public.can_view_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1
      from public.profiles u
      join public.profiles me on me.id = auth.uid()
     where u.id = p_user
       and u.gym_id = me.gym_id
       and (me.role = 'owner' or (me.role = 'trainer' and u.trainer_id = me.id))
  )
$$;

create or replace function public.is_trainer_in_gym(p_trainer uuid, p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_trainer and gym_id = p_gym and role = 'trainer')
$$;

-- ---------------------------------------------------------------------------------------------
-- profiles guard: role / gym_id / trainer_id / id only change by the gym's owner (or by the
-- database itself: SQL editor, security definer functions), and never to 'owner'.
-- Security INVOKER on purpose: current_user is the role doing the UPDATE.
-- ---------------------------------------------------------------------------------------------

create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;                                   -- postgres / service role / definer functions
  end if;
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'profile id/created_at cannot change' using errcode = '42501';
  end if;
  if new.role is distinct from old.role
     or new.gym_id is distinct from old.gym_id
     or new.trainer_id is distinct from old.trainer_id then
    if public.my_role() is distinct from 'owner' or old.gym_id is distinct from public.my_gym() then
      raise exception 'only the gym owner can change role or trainer' using errcode = '42501';
    end if;
    if new.gym_id is distinct from old.gym_id then
      raise exception 'gym cannot change' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and (old.role = 'owner' or new.role not in ('trainer', 'student')) then
      raise exception 'role can only move between trainer and student' using errcode = '42501';
    end if;
  end if;
  if new.trainer_id is distinct from old.trainer_id and new.trainer_id is not null then
    if new.role <> 'student' then
      raise exception 'only students have a trainer' using errcode = '23514';
    end if;
    if not public.is_trainer_in_gym(new.trainer_id, new.gym_id) then
      raise exception 'trainer must be a trainer of the same gym' using errcode = '23514';
    end if;
  end if;
  if new.role <> 'student' then
    new.trainer_id := null;                       -- a trainer has no trainer
  end if;
  return new;
end $$;

-- When a trainer stops being a trainer, their students are left without one (the owner then
-- assigns a new PT). Definer: it updates other people's rows.
create or replace function public.profiles_after_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'trainer' and new.role <> 'trainer' then
    update public.profiles set trainer_id = null where trainer_id = new.id;
    delete from public.invites where trainer_id = new.id and used_by is null;
  end if;
  return null;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

drop trigger if exists profiles_after_role_change on public.profiles;
create trigger profiles_after_role_change after update of role on public.profiles
  for each row execute function public.profiles_after_role_change();

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- First owner: an authenticated user with no profile yet creates a gym and becomes its owner.
create or replace function public.create_gym(p_name text, p_owner_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'user already has a profile' using errcode = '23505';
  end if;
  insert into public.gyms (name) values (btrim(p_name)) returning id into v_gym;
  insert into public.profiles (id, name, role, gym_id)
    values (v_uid, btrim(p_owner_name), 'owner', v_gym) returning * into v_profile;
  insert into public.user_state (user_id) values (v_uid) on conflict do nothing;
  return v_profile;
end $$;

-- Signup screen: what an invite is for, before the account exists. Reveals only role + gym name.
create or replace function public.check_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', i.role, 'gym', g.name, 'trainer', t.name)
    from public.invites i
    join public.gyms g on g.id = i.gym_id
    left join public.profiles t on t.id = i.trainer_id
   where i.code = upper(btrim(p_code)) and i.used_by is null
$$;

-- Called right after supabase.auth.signUp by the new user: burns the code and creates the profile.
create or replace function public.redeem_invite(p_code text, p_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invites;
  v_trainer uuid;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'user already has a profile' using errcode = '23505';
  end if;
  select * into v_inv from public.invites
   where code = upper(btrim(p_code)) and used_by is null
   for update;
  if not found then raise exception 'invalid or used invite' using errcode = 'P0002'; end if;
  v_trainer := v_inv.trainer_id;
  if v_trainer is not null and not public.is_trainer_in_gym(v_trainer, v_inv.gym_id) then
    v_trainer := null;                            -- that trainer has left since
  end if;
  insert into public.profiles (id, name, role, gym_id, trainer_id)
    values (v_uid, btrim(p_name), v_inv.role, v_inv.gym_id,
            case when v_inv.role = 'student' then v_trainer end)
    returning * into v_profile;
  update public.invites set used_by = v_uid, used_at = now() where code = v_inv.code;
  insert into public.user_state (user_id) values (v_uid) on conflict do nothing;
  return v_profile;
end $$;

-- Create an invite with a server-generated code. Security INVOKER: the invites insert policy
-- decides who may create what.
create or replace function public.create_invite(p_role text, p_trainer_id uuid default null) returns public.invites
language plpgsql security invoker set search_path = public as $$
declare v_inv public.invites;
begin
  insert into public.invites (gym_id, role, trainer_id, created_by)
    values (public.my_gym(), p_role,
            case when p_role = 'student' then coalesce(p_trainer_id, case when public.my_role() = 'trainer' then auth.uid() end) end,
            auth.uid())
    returning * into v_inv;
  return v_inv;
end $$;

-- Optimistic-concurrency save of the caller's state document. Returns
--   {"ok": true,  "rev": <new rev>}                         when p_rev matched
--   {"ok": false, "conflict": true, "rev": n, "doc": {...}} when someone else wrote first
create or replace function public.save_state(p_doc jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_doc jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > 20 * 1024 * 1024 then
    raise exception 'state too large' using errcode = '54000';
  end if;
  insert into public.user_state (user_id) values (v_uid) on conflict do nothing;
  select doc, rev into v_doc, v_rev from public.user_state where user_id = v_uid for update;
  -- Same guard as openGym's PUT /api/data: a document with nothing but bookkeeping in it would
  -- wipe every workout while keeping the counter, so it is refused over a non-empty one.
  if not exists (select 1 from jsonb_object_keys(p_doc) k where k not in ('_rev', '_ts'))
     and exists (select 1 from jsonb_object_keys(v_doc) k where k not in ('_rev', '_ts')) then
    raise exception 'refusing to replace state with an empty document' using errcode = '22023';
  end if;
  if v_rev <> p_rev then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', v_rev, 'doc', v_doc);
  end if;
  update public.user_state set doc = p_doc, rev = rev + 1, updated_at = now()
   where user_id = v_uid returning rev into v_rev;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end $$;

-- Send a plan to a student, replacing any pending offer for them (whoever sent it).
create or replace function public.offer_plan(p_student uuid, p_name text, p_plan jsonb) returns public.plan_offers
language plpgsql security definer set search_path = public as $$
declare v_offer public.plan_offers;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.can_coach(p_student) then
    raise exception 'not your student' using errcode = '42501';
  end if;
  if p_plan is null then raise exception 'plan required' using errcode = '22023'; end if;
  delete from public.plan_offers where to_id = p_student;
  insert into public.plan_offers (gym_id, from_id, to_id, name, plan)
    values (public.my_gym(), auth.uid(), p_student, p_name, p_plan)
    returning * into v_offer;
  return v_offer;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------

-- gyms: members read their gym; the owner renames it.
drop policy if exists gyms_select on public.gyms;
create policy gyms_select on public.gyms for select to authenticated
  using (id = public.my_gym());
drop policy if exists gyms_update on public.gyms;
create policy gyms_update on public.gyms for update to authenticated
  using (id = public.my_gym() and public.my_role() = 'owner')
  with check (id = public.my_gym());

-- profiles: own row; a trainer's students; the student's own trainer (name); the owner's whole gym.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or trainer_id = auth.uid()
    or id = public.my_trainer()
    or (public.my_role() = 'owner' and gym_id = public.my_gym())
  );
-- Updates: own row (the guard trigger keeps it to `name`) or, for the owner, rows of their gym.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or (public.my_role() = 'owner' and gym_id = public.my_gym()))
  with check (id = auth.uid() or (public.my_role() = 'owner' and gym_id = public.my_gym()));
-- No insert/delete policy: profiles come from create_gym() / redeem_invite() only.

-- user_state: read own / students' / (owner) gym's. All writes go through save_state().
drop policy if exists user_state_select on public.user_state;
create policy user_state_select on public.user_state for select to authenticated
  using (public.can_view_user(user_id));

-- invites
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (created_by = auth.uid() or (public.my_role() = 'owner' and gym_id = public.my_gym()));
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (
    created_by = auth.uid()
    and gym_id = public.my_gym()
    and used_by is null and used_at is null
    and (
      (public.my_role() = 'owner'
         and (trainer_id is null or (role = 'student' and public.is_trainer_in_gym(trainer_id, gym_id))))
      or
      (public.my_role() = 'trainer' and role = 'student' and trainer_id = auth.uid())
    )
  );
-- Revoke an unused invite: its creator, or the gym owner.
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (used_by is null and (created_by = auth.uid() or (public.my_role() = 'owner' and gym_id = public.my_gym())));

-- plan_offers
drop policy if exists plan_offers_select on public.plan_offers;
create policy plan_offers_select on public.plan_offers for select to authenticated
  using (to_id = auth.uid() or from_id = auth.uid());
drop policy if exists plan_offers_insert on public.plan_offers;
create policy plan_offers_insert on public.plan_offers for insert to authenticated
  with check (from_id = auth.uid() and gym_id = public.my_gym() and public.can_coach(to_id));
drop policy if exists plan_offers_delete on public.plan_offers;
create policy plan_offers_delete on public.plan_offers for delete to authenticated
  using (to_id = auth.uid() or from_id = auth.uid());

-- assessments
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated
  using (student_id = auth.uid() or trainer_id = auth.uid() or public.can_coach(student_id));
drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated
  with check (trainer_id = auth.uid() and gym_id = public.my_gym() and public.can_coach(student_id));
drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments for update to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid() and gym_id = public.my_gym() and public.can_coach(student_id));
drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments for delete to authenticated
  using (student_id = auth.uid() or trainer_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Grants (auto-expose is off: nothing reaches the Data API unless granted here)
-- ---------------------------------------------------------------------------------------------

revoke all on public.gyms, public.profiles, public.user_state, public.invites,
              public.plan_offers, public.assessments from anon, authenticated;

grant select, update (name)               on public.gyms        to authenticated;
grant select, update (name, role, trainer_id) on public.profiles to authenticated;
grant select                              on public.user_state  to authenticated;
grant select, insert, delete              on public.invites     to authenticated;
grant select, insert, delete              on public.plan_offers to authenticated;
grant select, insert, update, delete      on public.assessments to authenticated;

-- Functions are executable by PUBLIC by default in Postgres; narrow that down.
revoke all on function
  public.my_role(), public.my_gym(), public.my_trainer(), public.can_coach(uuid),
  public.can_view_user(uuid), public.is_trainer_in_gym(uuid, uuid),
  public.profiles_guard(), public.profiles_after_role_change(),
  public.create_gym(text, text), public.check_invite(text), public.redeem_invite(text, text),
  public.create_invite(text, uuid), public.save_state(jsonb, bigint), public.offer_plan(uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function
  public.my_role(), public.my_gym(), public.my_trainer(), public.can_coach(uuid),
  public.can_view_user(uuid), public.is_trainer_in_gym(uuid, uuid),
  public.create_gym(text, text), public.check_invite(text), public.redeem_invite(text, text),
  public.create_invite(text, uuid), public.save_state(jsonb, bigint), public.offer_plan(uuid, text, jsonb)
  to authenticated;

grant execute on function public.check_invite(text) to anon;
