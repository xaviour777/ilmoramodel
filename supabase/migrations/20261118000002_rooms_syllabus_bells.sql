-- Classrooms, periods each subject needs, syllabus plans, and bell schedules built from a few numbers.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  kind text not null default 'classroom' check (kind in ('classroom', 'lab', 'other')),
  capacity int check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  unique (campus_id, name)
);
alter table public.rooms enable row level security;
drop policy if exists "staff read rooms" on public.rooms;
create policy "staff read rooms" on public.rooms for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'accountant', 'teacher'));
drop policy if exists "admin write rooms" on public.rooms;
create policy "admin write rooms" on public.rooms for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());

alter table public.sections add column if not exists room_id uuid references public.rooms(id) on delete set null;
alter table public.section_subjects add column if not exists periods_per_week int check (periods_per_week is null or periods_per_week between 0 and 60);
alter table public.campus_settings add column if not exists room_overhead_paisa bigint not null default 0;

-- How many chapters a subject has in a class, and the dates it should be finished between.
create table if not exists public.syllabus_plans (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  chapters int not null check (chapters > 0),
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  unique (class_id, subject_id)
);
alter table public.syllabus_plans enable row level security;
drop policy if exists "staff read syllabus" on public.syllabus_plans;
create policy "staff read syllabus" on public.syllabus_plans for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'accountant', 'teacher'));
drop policy if exists "admin write syllabus" on public.syllabus_plans;
create policy "admin write syllabus" on public.syllabus_plans for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());

-- Bell schedules: winter, summer, Ramadan, Friday, exam days; the day's periods are worked out from these.
alter table public.timing_profiles
  add column if not exists kind text not null default 'other',
  add column if not exists start_time time,
  add column if not exists period_minutes int,
  add column if not exists periods_per_day int,
  add column if not exists break_after int,
  add column if not exists break_minutes int,
  add column if not exists assembly_minutes int;
alter table public.timing_profiles drop constraint if exists timing_profiles_kind_check,
  add constraint timing_profiles_kind_check check (kind in ('winter', 'summer', 'ramadan', 'friday', 'exam', 'other'));
update public.timing_profiles set kind = case when name ilike '%winter%' then 'winter' when name ilike '%summer%' then 'summer'
  when name ilike '%ramadan%' then 'ramadan' when name ilike '%friday%' then 'friday' when name ilike '%exam%' then 'exam' else 'other' end
  where kind = 'other';
