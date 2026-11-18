-- Teacher tools: remedial lists, weekly lesson plans, notices to own sections, yearly leave allowance.

create table if not exists public.remedial_students (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  section_id uuid references public.sections(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  reason text,
  plan text,
  started_on date not null default current_date,
  ended_on date,
  status text not null default 'active' check (status in ('active', 'done')),
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
alter table public.remedial_students enable row level security;
drop policy if exists "staff read remedial" on public.remedial_students;
create policy "staff read remedial" on public.remedial_students for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
drop policy if exists "teachers manage remedial" on public.remedial_students;
create policy "teachers manage remedial" on public.remedial_students for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)))
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)));

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade default app.me(),
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  week_start date not null,
  topics text not null,
  objectives text,
  homework text,
  created_at timestamptz not null default now(),
  unique (section_id, subject_id, week_start)
);
alter table public.lesson_plans enable row level security;
drop policy if exists "staff read plans" on public.lesson_plans;
create policy "staff read plans" on public.lesson_plans for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
drop policy if exists "teachers write own plans" on public.lesson_plans;
create policy "teachers write own plans" on public.lesson_plans for all to authenticated
  using (campus_id = app.my_campus() and (teacher_id = app.me() or app.is_admin()))
  with check (campus_id = app.my_campus() and (teacher_id = app.me() or app.is_admin()) and (app.is_admin() or app.teaches_section(section_id)));

-- a teacher may post an app notice to a section they teach
drop policy if exists "teachers post section notices" on public.notices;
create policy "teachers post section notices" on public.notices for insert to authenticated
  with check (campus_id = app.my_campus() and audience = 'section' and app.teaches_section(section_id));

alter table public.campus_settings add column if not exists leave_allowance int not null default 12;
-- staff may read their school's leave allowance
create or replace function public.my_leave_allowance() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select leave_allowance from campus_settings where campus_id = app.my_campus()), 12)
$$;
grant execute on function public.my_leave_allowance() to authenticated;
