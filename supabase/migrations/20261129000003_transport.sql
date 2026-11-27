-- Transport: routes and stops, vehicles with a driver login, per-student allocation, the driver's
-- trip board (boarded / dropped, saved offline and sent later), live location while a trip is open,
-- SOS, and vehicle running costs that also go into expenses. Parents see only their own child's van.

alter type public.user_role add value if not exists 'driver';

create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  name text not null check (length(name) between 1 and 80),
  monthly_fee_paisa bigint not null default 0 check (monthly_fee_paisa >= 0),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.transport_stops (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  route_id uuid not null references public.transport_routes(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort int not null default 0,
  pickup_time time,
  drop_time time,
  lat double precision, lng double precision
);
create index if not exists transport_stops_route on public.transport_stops (route_id, sort);

alter table public.vans
  add column if not exists route_id uuid references public.transport_routes(id) on delete set null,
  add column if not exists driver_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists attendant_name text,
  add column if not exists attendant_phone text,
  add column if not exists fitness_expires_on date,
  add column if not exists insurance_expires_on date,
  add column if not exists route_permit_expires_on date,
  add column if not exists active boolean not null default true;

alter table public.van_students
  add column if not exists stop_id uuid references public.transport_stops(id) on delete set null,
  add column if not exists legs text not null default 'both';
alter table public.van_students drop constraint if exists van_students_legs_check;
alter table public.van_students add constraint van_students_legs_check check (legs in ('both', 'pick', 'drop'));

alter table public.van_trips
  add column if not exists driver_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'closed',
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision,
  add column if not exists last_seen_at timestamptz,
  add column if not exists sharing boolean not null default false;
alter table public.van_trips drop constraint if exists van_trips_status_check;
alter table public.van_trips add constraint van_trips_status_check check (status in ('open', 'closed'));

-- custody: one line each time a child is picked, dropped or marked absent. client_id makes a
-- retry from a phone that was offline harmless.
create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  trip_id uuid not null references public.van_trips(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('boarded', 'dropped', 'absent', 'undo')),
  method text not null default 'driver' check (method in ('driver', 'scan', 'office')),
  at timestamptz not null default now(),
  lat double precision, lng double precision,
  by_profile uuid references public.profiles(id) on delete set null,
  client_id uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists trip_events_trip on public.trip_events (trip_id, student_id, at);

create table if not exists public.trip_positions (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  trip_id uuid not null references public.van_trips(id) on delete cascade,
  at timestamptz not null default now(),
  lat double precision not null, lng double precision not null,
  accuracy real, speed real
);
create index if not exists trip_positions_trip on public.trip_positions (trip_id, at desc);

create table if not exists public.transport_sos (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  trip_id uuid references public.van_trips(id) on delete set null,
  van_id uuid references public.vans(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  lat double precision, lng double precision,
  note text,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  acked_by uuid references public.profiles(id) on delete set null,
  acked_at timestamptz,
  client_id uuid unique,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  van_id uuid not null references public.vans(id) on delete cascade,
  spent_on date not null default (now() at time zone 'Asia/Karachi')::date,
  kind text not null default 'fuel' check (kind in ('fuel', 'maintenance', 'repair', 'token_tax', 'insurance', 'driver_pay', 'other')),
  amount_paisa bigint not null check (amount_paisa > 0),
  liters numeric, odometer int,
  note text,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);

-- ---------- row-level security: office manages; drivers and parents go through the functions below ----------
alter table public.transport_routes enable row level security;
alter table public.transport_stops enable row level security;
alter table public.trip_events enable row level security;
alter table public.trip_positions enable row level security;
alter table public.transport_sos enable row level security;
alter table public.vehicle_costs enable row level security;
do $$ declare t text; begin
  foreach t in array array['transport_routes', 'transport_stops'] loop
    execute format('drop policy if exists "staff read %1$s" on public.%1$s', t);
    execute format('create policy "staff read %1$s" on public.%1$s for select to authenticated using (campus_id = app.my_campus() and app.is_staff())', t);
    execute format('drop policy if exists "admin writes %1$s" on public.%1$s', t);
    execute format('create policy "admin writes %1$s" on public.%1$s for all to authenticated using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin())', t);
  end loop;
  foreach t in array array['trip_events', 'trip_positions', 'transport_sos'] loop
    execute format('drop policy if exists "staff read %1$s" on public.%1$s', t);
    execute format('create policy "staff read %1$s" on public.%1$s for select to authenticated using (campus_id = app.my_campus() and app.is_staff())', t);
  end loop;
end $$;
drop policy if exists "admin answers sos" on public.transport_sos;
create policy "admin answers sos" on public.transport_sos for update to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());
drop policy if exists "office vehicle costs" on public.vehicle_costs;
create policy "office vehicle costs" on public.vehicle_costs for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

-- a driver may read their own vehicles (by text, so this works in the same migration that adds the role)
drop policy if exists "driver reads own vans" on public.vans;
create policy "driver reads own vans" on public.vans for select to authenticated
  using (campus_id = app.my_campus() and driver_profile_id = app.me());

-- ---------- driver functions ----------
create or replace function app.is_my_van(p_van uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vans v where v.id = p_van and v.campus_id = app.my_campus()
    and (v.driver_profile_id = app.me() or coalesce(app.is_admin(), false)))
$$;

-- today's board for the signed-in driver: their vans, open trips, children with stop and last status
create or replace function public.driver_board(p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_date, (now() at time zone 'Asia/Karachi')::date); out jsonb;
begin
  if app.my_role()::text <> 'driver' and not coalesce(app.is_admin(), false) then raise exception 'Only drivers have a trip board.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'name', v.name, 'plate', v.plate, 'seats', v.seats,
    'route', r.name,
    'trips', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'leg', t.leg, 'status', t.status, 'started_at', t.started_at, 'ended_at', t.ended_at, 'sharing', t.sharing) order by t.leg), '[]') from van_trips t where t.van_id = v.id and t.date = d),
    'students', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'gr', s.admission_no, 'name', s.full_name, 'class', c.name || '-' || sec.name, 'stop', coalesce(st.name, vs.stop), 'stop_sort', coalesce(st.sort, 999),
        'pickup', to_char(st.pickup_time, 'HH24:MI'), 'drop', to_char(st.drop_time, 'HH24:MI'), 'legs', vs.legs,
        'phone', coalesce(f.phone, f.reminder_phone), 'photo', s.photo_url,
        'on_leave', exists (select 1 from student_leave l where l.student_id = s.id and l.status = 'approved' and d between l.from_on and l.to_on)
      ) order by coalesce(st.sort, 999), s.full_name), '[]')
      from van_students vs join students s on s.id = vs.student_id and s.status = 'enrolled'
      left join transport_stops st on st.id = vs.stop_id left join sections sec on sec.id = s.section_id left join classes c on c.id = sec.class_id
      left join families f on f.id = s.family_id where vs.van_id = v.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', e.trip_id, 'student_id', e.student_id, 'kind', e.kind, 'at', e.at) order by e.at), '[]')
      from trip_events e join van_trips t on t.id = e.trip_id where t.van_id = v.id and t.date = d)
  ) order by v.name), '[]') into out
  from vans v left join transport_routes r on r.id = v.route_id
  where v.campus_id = app.my_campus() and v.active and (v.driver_profile_id = app.me() or (coalesce(app.is_admin(), false) and app.my_role()::text <> 'driver'));
  return jsonb_build_object('date', d, 'vans', out);
end $$;

create or replace function public.trip_start(p_van uuid, p_leg text, p_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_date, (now() at time zone 'Asia/Karachi')::date); tid uuid; camp uuid;
begin
  if not app.is_my_van(p_van) then raise exception 'This is not your vehicle.'; end if;
  if p_leg not in ('morning', 'afternoon') then raise exception 'Choose morning or afternoon.'; end if;
  select campus_id into camp from vans where id = p_van;
  insert into van_trips (campus_id, van_id, date, leg, driver_id, status, started_at, marked_by, sharing)
  values (camp, p_van, d, p_leg, app.me(), 'open', now(), app.me(), true)
  on conflict (van_id, date, leg) do update set status = 'open', driver_id = app.me(), sharing = true,
    started_at = coalesce(van_trips.started_at, now()), ended_at = null, marked_by = app.me()
  returning id into tid;
  return tid;
end $$;

-- the trip for a vehicle, day and leg; opened by the first mark if the driver was offline at the start
create or replace function app.trip_for(p_van uuid, p_date date, p_leg text) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid; camp uuid;
begin
  if not app.is_my_van(p_van) then raise exception 'This is not your vehicle.'; end if;
  if p_leg not in ('morning', 'afternoon') then raise exception 'Choose morning or afternoon.'; end if;
  select id into tid from van_trips where van_id = p_van and date = p_date and leg = p_leg;
  if tid is null then
    select campus_id into camp from vans where id = p_van;
    insert into van_trips (campus_id, van_id, date, leg, driver_id, status, started_at, marked_by, sharing)
    values (camp, p_van, p_date, p_leg, app.me(), 'open', now(), app.me(), true)
    on conflict (van_id, date, leg) do nothing returning id into tid;
    if tid is null then select id into tid from van_trips where van_id = p_van and date = p_date and leg = p_leg; end if;
  end if;
  return tid;
end $$;

create or replace function public.trip_end(p_van uuid, p_date date, p_leg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update van_trips set status = 'closed', ended_at = coalesce(ended_at, now()), sharing = false where id = app.trip_for(p_van, p_date, p_leg);
end $$;

-- one custody mark; safe to send again with the same client id (a phone that was offline retries)
create or replace function public.trip_mark(p_van uuid, p_date date, p_leg text, p_student uuid, p_kind text, p_client uuid default null,
  p_at timestamptz default null, p_lat double precision default null, p_lng double precision default null, p_method text default 'driver')
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid; camp uuid;
begin
  if p_kind not in ('boarded', 'dropped', 'absent', 'undo') then raise exception 'Unknown mark.'; end if;
  if not exists (select 1 from van_students where van_id = p_van and student_id = p_student) then raise exception 'This child is not on this vehicle.'; end if;
  tid := app.trip_for(p_van, p_date, p_leg);
  select campus_id into camp from vans where id = p_van;
  insert into trip_events (campus_id, trip_id, student_id, kind, method, at, lat, lng, by_profile, client_id)
  values (camp, tid, p_student, p_kind, case when p_method in ('driver', 'scan', 'office') then p_method else 'driver' end,
          least(coalesce(p_at, now()), now()), p_lat, p_lng, app.me(), p_client)
  on conflict (client_id) do nothing;
end $$;

create or replace function public.trip_ping(p_van uuid, p_date date, p_leg text, p_lat double precision, p_lng double precision, p_accuracy real default null, p_speed real default null)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Bad location.'; end if;
  select * into t from van_trips where id = app.trip_for(p_van, p_date, p_leg);
  if t.status <> 'open' then return; end if;
  insert into trip_positions (campus_id, trip_id, lat, lng, accuracy, speed) values (t.campus_id, t.id, p_lat, p_lng, p_accuracy, p_speed);
  update van_trips set last_lat = p_lat, last_lng = p_lng, last_seen_at = now() where id = t.id;
end $$;

create or replace function public.trip_sos(p_van uuid, p_trip uuid default null, p_lat double precision default null, p_lng double precision default null,
  p_note text default null, p_client uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; camp uuid;
begin
  if not app.is_my_van(p_van) then raise exception 'This is not your vehicle.'; end if;
  select campus_id into camp from vans where vans.id = p_van;
  insert into transport_sos (campus_id, trip_id, van_id, driver_id, lat, lng, note, client_id)
  values (camp, coalesce(p_trip, (select t.id from van_trips t where t.van_id = p_van and t.status = 'open' order by t.started_at desc nulls last limit 1)),
          p_van, app.me(), p_lat, p_lng, left(p_note, 500), p_client)
  on conflict (client_id) do update set note = coalesce(excluded.note, transport_sos.note)
  returning transport_sos.id into id;
  return id;
end $$;

-- ---------- parents: only their own child's van, and only while a trip is open ----------
create or replace function public.my_child_bus(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record; t record; d date := (now() at time zone 'Asia/Karachi')::date; ev jsonb;
begin
  if p_student not in (select app.my_students()) then return null; end if;
  select vn.id, vn.name, vn.plate, coalesce(p.full_name, vn.driver_name) as driver, coalesce(p.phone, vn.driver_phone) as driver_phone,
         vn.attendant_name, vn.attendant_phone, r.name as route, coalesce(st.name, vs.stop) as stop,
         to_char(st.pickup_time, 'HH24:MI') as pickup, to_char(st.drop_time, 'HH24:MI') as drop_time, st.lat as stop_lat, st.lng as stop_lng
    into v from van_students vs join vans vn on vn.id = vs.van_id left join profiles p on p.id = vn.driver_profile_id
    left join transport_routes r on r.id = vn.route_id left join transport_stops st on st.id = vs.stop_id
    where vs.student_id = p_student;
  if v.id is null then return null; end if;
  select * into t from van_trips where van_id = v.id and date = d order by (status = 'open') desc, started_at desc nulls last limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'leg', tr.leg) order by e.at), '[]') into ev
    from trip_events e join van_trips tr on tr.id = e.trip_id where e.student_id = p_student and tr.date = d and e.kind <> 'undo';
  return jsonb_build_object(
    'van', v.name, 'plate', v.plate, 'driver', v.driver, 'driver_phone', v.driver_phone, 'attendant', v.attendant_name, 'attendant_phone', v.attendant_phone,
    'route', v.route, 'stop', v.stop, 'pickup', v.pickup, 'drop', v.drop_time, 'stop_lat', v.stop_lat, 'stop_lng', v.stop_lng,
    'trip', case when t.id is null then null else jsonb_build_object('leg', t.leg, 'status', t.status, 'started_at', t.started_at, 'ended_at', t.ended_at,
      'lat', case when t.status = 'open' and t.sharing then t.last_lat end, 'lng', case when t.status = 'open' and t.sharing then t.last_lng end,
      'seen_at', case when t.status = 'open' and t.sharing then t.last_seen_at end) end,
    'events', ev);
end $$;

-- keep the old helper working for screens that still call it
create or replace function public.my_child_van(p_student uuid)
returns table (name text, plate text, driver_name text, driver_phone text, route text, stop text)
language sql stable security definer set search_path = public as $$
  select v.name, v.plate, coalesce(p.full_name, v.driver_name), coalesce(p.phone, v.driver_phone), coalesce(r.name, v.route), coalesce(st.name, vs.stop)
  from van_students vs join vans v on v.id = vs.van_id left join profiles p on p.id = v.driver_profile_id
  left join transport_routes r on r.id = v.route_id left join transport_stops st on st.id = vs.stop_id
  where vs.student_id = p_student and p_student in (select app.my_students())
$$;

do $$ declare f text; begin
  foreach f in array array['driver_board(date)', 'trip_start(uuid, text, date)',
    'trip_end(uuid, date, text)', 'trip_mark(uuid, date, text, uuid, text, uuid, timestamptz, double precision, double precision, text)',
    'trip_ping(uuid, date, text, double precision, double precision, real, real)', 'trip_sos(uuid, uuid, double precision, double precision, text, uuid)',
    'my_child_bus(uuid)', 'my_child_van(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- old position points are not needed after a week (the trip log keeps start, end and custody)
create or replace function public.prune_trip_positions() returns void language sql security definer set search_path = public as $$
  delete from trip_positions where at < now() - interval '7 days'
$$;
revoke all on function public.prune_trip_positions() from public, anon, authenticated;


-- the principal's transport screen refreshes by itself when a trip moves or an SOS comes in
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['transport_sos', 'van_trips', 'trip_events'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- The principal gives a driver a login: the driver signs in with their mobile number and this password
-- (the same phone login the rest of the app uses, see app.phone_login).
create or replace function public.set_driver_login(p_profile uuid, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare p record; em text; uid uuid;
begin
  if not coalesce(app.is_admin(), false) then raise exception 'Only the principal can give a login.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  select * into p from profiles where id = p_profile and campus_id = app.my_campus();
  if p.id is null or p.role::text <> 'driver' then raise exception 'Choose one of your drivers.'; end if;
  uid := p.user_id;
  if uid is null then
    em := app.phone_login(p.phone);
    if em is null then raise exception 'Save the driver''s mobile (03001234567) first.'; end if;
    uid := app.make_login(em, p_password);
    if exists (select 1 from profiles where user_id = uid and id <> p.id) then raise exception 'This mobile already has a login for someone else.'; end if;
    update profiles set user_id = uid where id = p.id;
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  return (select email from auth.users where id = uid);
end $$;
revoke all on function public.set_driver_login(uuid, text) from public, anon;
grant execute on function public.set_driver_login(uuid, text) to authenticated;

-- Phone alerts a driver may trigger: an SOS goes to the principal and owner; a pick-up or drop
-- goes to that child's family. The driver never sees the addresses, only the push service does.
create or replace function public.sos_push_targets(p_sos uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth from push_subscriptions ps join profiles p on p.id = ps.profile_id
  join transport_sos s on s.id = p_sos and s.campus_id = ps.campus_id
  where s.driver_id = app.me() and s.created_at > now() - interval '15 minutes' and p.is_active and p.role::text in ('owner', 'principal')
$$;
create or replace function public.custody_push_targets(p_van uuid, p_student uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth from push_subscriptions ps
  join van_students vs on vs.van_id = p_van and vs.student_id = p_student
  join students s on s.id = p_student and s.campus_id = ps.campus_id
  where app.is_my_van(p_van)
    and ps.profile_id in (select g.profile_id from family_guardians g where g.family_id = s.family_id)
$$;
revoke all on function public.sos_push_targets(uuid) from public, anon;
revoke all on function public.custody_push_targets(uuid, uuid) from public, anon;
grant execute on function public.sos_push_targets(uuid) to authenticated;
grant execute on function public.custody_push_targets(uuid, uuid) to authenticated;
