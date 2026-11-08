-- Série — group classes: the owner sets a weekly timetable (each class with its PT and its places),
-- members book a session ahead and can cancel until it starts, and the owner sees who booked and
-- did not come (no check-in at the front desk that day), to have a word with them in person.
-- Run after schema.sql and app.sql, as postgres. Safe to re-run.
-- The app reaches it through frontend/src/lib/supa-api.js (the /api/classes... routes).

create table if not exists public.gym_classes (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  trainer_id  uuid references public.profiles (id) on delete set null,
  weekday     smallint not null check (weekday between 1 and 7),      -- ISO: 1 Monday … 7 Sunday
  starts      time not null,                                          -- Lisbon time
  minutes     smallint not null check (minutes between 10 and 240),
  capacity    smallint not null check (capacity between 1 and 500),
  room        text check (room is null or length(room) <= 40),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists gym_classes_gym_idx on public.gym_classes (gym_id) where active;

create table if not exists public.class_bookings (
  class_id     uuid not null references public.gym_classes (id) on delete cascade,
  on_date      date not null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  booked_at    timestamptz not null default now(),
  cancelled_at timestamptz,
  primary key (class_id, on_date, user_id)
);
create index if not exists class_bookings_user_idx on public.class_bookings (user_id, on_date);

-- A session the owner called off (a holiday, the PT is ill).
create table if not exists public.class_skips (
  class_id uuid not null references public.gym_classes (id) on delete cascade,
  on_date  date not null,
  primary key (class_id, on_date)
);

alter table public.gym_classes enable row level security;
alter table public.class_bookings enable row level security;
alter table public.class_skips enable row level security;
revoke all on public.gym_classes, public.class_bookings, public.class_skips from anon, authenticated;

create or replace function public.lisbon_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Lisbon')::date $$;

-- When a session starts, as a moment in time.
create or replace function public.class_start(p_date date, p_starts time) returns timestamptz
language sql immutable as $$ select (p_date + p_starts) at time zone 'Europe/Lisbon' $$;

-- Who may book in this gym: its owner, or anyone in it but a front desk account.
create or replace function public.can_book_in(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_gym(p_gym)
      or exists (select 1 from memberships where gym_id = p_gym and user_id = auth.uid() and role <> 'desk')
$$;

-- The owner adds (p_id null) or changes a class. The PT has to be a trainer of the gym, or its owner.
create or replace function public.save_class(p_gym uuid, p_id uuid, p_name text, p_trainer uuid, p_weekday integer,
                                             p_starts time, p_minutes integer, p_capacity integer, p_room text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if p_trainer is not null and not public.is_trainer_in(p_gym, p_trainer)
     and not exists (select 1 from gyms where id = p_gym and owner_id = p_trainer) then
    raise exception 'not a trainer of this gym';
  end if;
  if p_id is null then
    insert into gym_classes (gym_id, name, trainer_id, weekday, starts, minutes, capacity, room)
      values (p_gym, btrim(p_name), p_trainer, p_weekday, p_starts, p_minutes, p_capacity, nullif(btrim(coalesce(p_room, '')), ''))
      returning id into v_id;
  else
    update gym_classes set name = btrim(p_name), trainer_id = p_trainer, weekday = p_weekday, starts = p_starts,
                           minutes = p_minutes, capacity = p_capacity, room = nullif(btrim(coalesce(p_room, '')), '')
     where id = p_id and gym_id = p_gym and active returning id into v_id;
    if v_id is null then raise exception 'no such class'; end if;
  end if;
  return v_id;
end $$;

-- The weekly timetable as the owner edits it: every class on it, by weekday and time.
create or replace function public.gym_class_list(p_gym uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'trainerId', c.trainer_id, 'trainer', p.name,
                                                        'weekday', c.weekday, 'starts', to_char(c.starts, 'HH24:MI'), 'minutes', c.minutes,
                                                        'capacity', c.capacity, 'room', c.room) order by c.weekday, c.starts, c.name)
                     from gym_classes c left join profiles p on p.id = c.trainer_id where c.gym_id = p_gym and c.active), '[]'::jsonb);
end $$;

-- Takes a class off the timetable. Past bookings stay, for the no-show list.
create or replace function public.remove_class(p_gym uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  update gym_classes set active = false where id = p_id and gym_id = p_gym;
  return found;
end $$;

-- Calls off one session (p_skip) or puts it back.
create or replace function public.skip_class(p_id uuid, p_date date, p_skip boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid;
begin
  select gym_id into v_gym from gym_classes where id = p_id;
  if v_gym is null or not public.owns_gym(v_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  if p_skip then insert into class_skips values (p_id, p_date) on conflict do nothing;
  else delete from class_skips where class_id = p_id and on_date = p_date; end if;
  return true;
end $$;

-- The timetable from today for p_days days: one row per session. The owner and the class's PT also get
-- who booked it (roster); a member gets only the count and whether they are in.
create or replace function public.class_schedule(p_gym uuid, p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.lisbon_today(); v_owner boolean := public.owns_gym(p_gym);
begin
  if not (public.can_book_in(p_gym) or public.is_desk_in(p_gym)) then raise exception 'not your gym' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'date', d.d, 'name', c.name, 'room', c.room, 'starts', to_char(c.starts, 'HH24:MI'), 'minutes', c.minutes,
      'capacity', c.capacity, 'trainer', tp.name, 'trainerId', c.trainer_id, 'weekday', c.weekday,
      'booked', (select count(*) from class_bookings b where b.class_id = c.id and b.on_date = d.d and b.cancelled_at is null),
      'mine', exists (select 1 from class_bookings b where b.class_id = c.id and b.on_date = d.d and b.user_id = auth.uid() and b.cancelled_at is null),
      'skipped', exists (select 1 from class_skips s where s.class_id = c.id and s.on_date = d.d),
      'started', public.class_start(d.d, c.starts) <= now(),
      'roster', case when v_owner or c.trainer_id = auth.uid() then
        (select coalesce(jsonb_agg(p.name order by b.booked_at), '[]'::jsonb) from class_bookings b join profiles p on p.id = b.user_id
          where b.class_id = c.id and b.on_date = d.d and b.cancelled_at is null) end
    ) order by d.d, c.starts, c.name)
    from gym_classes c
    cross join lateral (select g::date d from generate_series(v_today, v_today + least(greatest(p_days, 1), 28) - 1, interval '1 day') g) d
    left join profiles tp on tp.id = c.trainer_id
    where c.gym_id = p_gym and c.active and extract(isodow from d.d) = c.weekday
      and public.class_start(d.d, c.starts) + make_interval(mins => c.minutes) > now()
  ), '[]'::jsonb);
end $$;

-- Books (p_on) or cancels a place. Booking needs a free place and a session that has not started,
-- within four weeks; cancelling works until it starts. Returns the session's count and the caller's place.
create or replace function public.book_class(p_id uuid, p_date date, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_c gym_classes; v_n integer;
begin
  select * into v_c from gym_classes where id = p_id and active for update;   -- one booking at a time per class
  if not found then raise exception 'no such class'; end if;
  if not public.can_book_in(v_c.gym_id) then raise exception 'not your gym' using errcode = '42501'; end if;
  if extract(isodow from p_date) <> v_c.weekday or p_date > public.lisbon_today() + 28 then raise exception 'no such session'; end if;
  if public.class_start(p_date, v_c.starts) <= now() then raise exception 'class started'; end if;
  if p_on then
    if exists (select 1 from class_skips where class_id = p_id and on_date = p_date) then raise exception 'class called off'; end if;
    if not exists (select 1 from class_bookings where class_id = p_id and on_date = p_date and user_id = auth.uid() and cancelled_at is null) then
      select count(*) into v_n from class_bookings where class_id = p_id and on_date = p_date and cancelled_at is null;
      if v_n >= v_c.capacity then raise exception 'class full'; end if;
      insert into class_bookings (class_id, on_date, user_id) values (p_id, p_date, auth.uid())
        on conflict (class_id, on_date, user_id) do update set cancelled_at = null, booked_at = now();
    end if;
  else
    update class_bookings set cancelled_at = now() where class_id = p_id and on_date = p_date and user_id = auth.uid() and cancelled_at is null;
  end if;
  return jsonb_build_object('booked', (select count(*) from class_bookings where class_id = p_id and on_date = p_date and cancelled_at is null),
                            'mine', p_on);
end $$;

-- The caller's own bookings still to come, for Home.
create or replace function public.my_classes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'date', b.on_date, 'name', c.name, 'starts', to_char(c.starts, 'HH24:MI'),
                                               'minutes', c.minutes, 'room', c.room, 'trainer', tp.name, 'gym', g.name,
                                               'skipped', exists (select 1 from class_skips s where s.class_id = c.id and s.on_date = b.on_date))
                            order by b.on_date, c.starts), '[]'::jsonb)
    from class_bookings b join gym_classes c on c.id = b.class_id join gyms g on g.id = c.gym_id
    left join profiles tp on tp.id = c.trainer_id
   where b.user_id = auth.uid() and b.cancelled_at is null and c.active
     and public.class_start(b.on_date, c.starts) + make_interval(mins => c.minutes) > now()
$$;

-- For the owner: who booked a class in the last p_days days and did not come (no entry at the desk
-- that day), most misses first, so they can have a word with them.
create or replace function public.class_no_shows(p_gym uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_gym(p_gym) then raise exception 'not your gym' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'misses')::int desc, row->>'last' desc) from (
      select jsonb_build_object('id', p.id, 'name', p.name,
               'misses', count(*) filter (where not x.came), 'kept', count(*) filter (where x.came),
               'last', max(x.on_date) filter (where not x.came),
               'classes', (array_agg(distinct x.name) filter (where not x.came))) row
        from (select b.user_id, b.on_date, c.name,
                     exists (select 1 from visits v where v.gym_id = c.gym_id and v.user_id = b.user_id
                               and (v.in_at at time zone 'Europe/Lisbon')::date = b.on_date) came
                from class_bookings b join gym_classes c on c.id = b.class_id
               where c.gym_id = p_gym and b.cancelled_at is null
                 and b.on_date >= public.lisbon_today() - least(greatest(p_days, 1), 365)
                 and public.class_start(b.on_date, c.starts) + make_interval(mins => c.minutes) <= now()
                 and not exists (select 1 from class_skips s where s.class_id = c.id and s.on_date = b.on_date)) x
        join profiles p on p.id = x.user_id
       group by p.id, p.name
      having count(*) filter (where not x.came) > 0
    ) t
  ), '[]'::jsonb);
end $$;

revoke execute on function public.lisbon_today(), public.class_start(date, time), public.can_book_in(uuid),
  public.save_class(uuid, uuid, text, uuid, integer, time, integer, integer, text), public.remove_class(uuid, uuid), public.gym_class_list(uuid),
  public.skip_class(uuid, date, boolean), public.class_schedule(uuid, integer), public.book_class(uuid, date, boolean),
  public.my_classes(), public.class_no_shows(uuid, integer)
from public, anon;
grant execute on function public.lisbon_today(), public.class_start(date, time), public.can_book_in(uuid),
  public.save_class(uuid, uuid, text, uuid, integer, time, integer, integer, text), public.remove_class(uuid, uuid), public.gym_class_list(uuid),
  public.skip_class(uuid, date, boolean), public.class_schedule(uuid, integer), public.book_class(uuid, date, boolean),
  public.my_classes(), public.class_no_shows(uuid, integer)
to authenticated;
