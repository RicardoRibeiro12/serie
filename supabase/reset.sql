-- Série — password reset by the gym's owner. Run after schema.sql and app.sql. Safe to re-run.
--
-- A profile made with a name only has no mailbox, so Supabase's own e-mail reset cannot reach it.
-- The owner of a gym the person belongs to makes a one-time code (Admin → the person → Reset
-- password) and hands it over; the person enters it with a new password on the sign-in screen
-- (lib/supa-api.js 'POST /api/login/password-reset'). The code is kept only as a SHA-256 hash, works
-- once, for 24 hours, and dies after 5 wrong tries. Using it signs the person out everywhere.

create table if not exists public.password_resets (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  code_hash   text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null,
  tries       integer not null default 0
);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;

create or replace function public.create_reset_code(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_exp timestamptz := now() + interval '24 hours';
begin
  perform public.require_uid();
  if p_user = auth.uid() then raise exception 'not for yourself' using errcode = '22023'; end if;
  if not (public.is_platform_admin() or exists (
      select 1 from memberships m join gyms g on g.id = m.gym_id where m.user_id = p_user and g.owner_id = auth.uid())) then
    raise exception 'not a member of your gym' using errcode = '42501';
  end if;
  v_code := upper(encode(gen_random_bytes(6), 'hex'));
  insert into password_resets (user_id, code_hash, created_by, expires_at, tries)
  values (p_user, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), v_exp, 0)
  on conflict (user_id) do update set code_hash = excluded.code_hash, created_by = excluded.created_by, expires_at = excluded.expires_at, tries = 0;
  return jsonb_build_object('code', v_code, 'name', (select name from profiles where id = p_user), 'expires', v_exp);
end $$;

-- Anyone may call this (they are signed out): the sign-in e-mail (or the name's own address, which
-- the app works out), the code and the new password. Answers true, or false for any wrong or used
-- code (no hint which part was wrong). False, not an error: an error would roll back the count of tries.
create or replace function public.redeem_reset_code(p_email text, p_code text, p_password text) returns boolean
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_uid uuid; v_reset password_resets;
begin
  if char_length(coalesce(p_password, '')) < 10 then raise exception 'too-short' using errcode = '22023'; end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  select * into v_reset from password_resets where user_id = v_uid for update;
  if v_uid is null or v_reset.user_id is null or v_reset.expires_at < now() or v_reset.tries >= 5 then
    return false;
  end if;
  if v_reset.code_hash <> encode(digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex') then
    update password_resets set tries = tries + 1 where user_id = v_uid;
    return false;
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf', 10)), updated_at = now() where id = v_uid;
  delete from auth.refresh_tokens where user_id::text = v_uid::text;
  delete from auth.sessions where user_id = v_uid;
  delete from password_resets where user_id = v_uid;
  return true;
end $$;

revoke execute on function public.create_reset_code(uuid), public.redeem_reset_code(text, text, text) from public, anon, authenticated;
grant execute on function public.create_reset_code(uuid) to authenticated;
grant execute on function public.redeem_reset_code(text, text, text) to anon, authenticated;
