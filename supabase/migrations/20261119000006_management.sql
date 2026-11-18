-- Complaints & suggestions, teacher observations, transport, morning brief phone.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  from_profile uuid references public.profiles(id) on delete set null default app.me(),
  kind text not null default 'complaint' check (kind in ('complaint', 'suggestion', 'praise')),
  topic text not null default 'other' check (topic in ('teaching', 'fees', 'transport', 'safety', 'facilities', 'other')),
  body text not null check (length(body) between 3 and 2000),
  anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "own feedback" on public.feedback;
create policy "own feedback" on public.feedback for select to authenticated
  using (campus_id = app.my_campus() and (from_profile = app.me() or app.is_admin()));
drop policy if exists "send feedback" on public.feedback;
create policy "send feedback" on public.feedback for insert to authenticated
  with check (campus_id = app.my_campus() and from_profile = app.me() and status = 'open' and reply is null);
drop policy if exists "admin handles feedback" on public.feedback;
create policy "admin handles feedback" on public.feedback for update to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());
-- the principal sees "anonymous" ones without the name
create or replace view public.feedback_inbox with (security_invoker = true) as
  select f.id, f.kind, f.topic, f.body, f.status, f.reply, f.replied_at, f.created_at, f.anonymous,
         case when f.anonymous then null else p.full_name end as from_name,
         case when f.anonymous then null else p.role::text end as from_role
  from public.feedback f left join public.profiles p on p.id = f.from_profile;
grant select on public.feedback_inbox to authenticated;

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  observer_id uuid references public.profiles(id) on delete set null default app.me(),
  section_id uuid references public.sections(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  observed_on date not null default current_date,
  planning int check (planning between 1 and 5),
  delivery int check (delivery between 1 and 5),
  engagement int check (engagement between 1 and 5),
  discipline int check (discipline between 1 and 5),
  strengths text,
  improve text,
  created_at timestamptz not null default now()
);
alter table public.observations enable row level security;
drop policy if exists "read observations" on public.observations;
create policy "read observations" on public.observations for select to authenticated
  using (campus_id = app.my_campus() and (teacher_id = app.me() or app.is_admin()));
drop policy if exists "admin writes observations" on public.observations;
create policy "admin writes observations" on public.observations for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());

create table if not exists public.vans (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  name text not null,
  plate text,
  driver_name text,
  driver_phone text,
  route text,
  seats int,
  monthly_fee_paisa bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.van_students (
  van_id uuid not null references public.vans(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  stop text,
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  primary key (student_id)
);
create table if not exists public.van_trips (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  van_id uuid not null references public.vans(id) on delete cascade,
  date date not null default current_date,
  leg text not null check (leg in ('morning', 'afternoon')),
  missing uuid[] not null default '{}',
  marked_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  unique (van_id, date, leg)
);
alter table public.vans enable row level security;
alter table public.van_students enable row level security;
alter table public.van_trips enable row level security;
drop policy if exists "staff read vans" on public.vans;
create policy "staff read vans" on public.vans for select to authenticated using (campus_id = app.my_campus() and app.is_staff());
drop policy if exists "admin vans" on public.vans;
create policy "admin vans" on public.vans for all to authenticated using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());
drop policy if exists "staff read van students" on public.van_students;
create policy "staff read van students" on public.van_students for select to authenticated using (campus_id = app.my_campus() and (app.is_staff() or student_id in (select app.my_students())));
drop policy if exists "admin van students" on public.van_students;
create policy "admin van students" on public.van_students for all to authenticated using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());
drop policy if exists "staff trips" on public.van_trips;
create policy "staff trips" on public.van_trips for all to authenticated using (campus_id = app.my_campus() and app.is_staff()) with check (campus_id = app.my_campus() and app.is_staff());

-- families can see their child's van and driver
create or replace function public.my_child_van(p_student uuid)
returns table (name text, plate text, driver_name text, driver_phone text, route text, stop text)
language sql stable security definer set search_path = public as $$
  select v.name, v.plate, v.driver_name, v.driver_phone, v.route, vs.stop
  from van_students vs join vans v on v.id = vs.van_id
  where vs.student_id = p_student and p_student in (select app.my_students())
$$;
grant execute on function public.my_child_van(uuid) to authenticated;

alter table public.campus_settings add column if not exists brief_phone text;
alter table public.campus_settings add column if not exists brief_enabled boolean not null default false;
