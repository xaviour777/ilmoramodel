-- AI paper checking (teacher scans a class's answer sheets) and the homework tutor (student).
-- AI output is only ever a suggestion: every written mark is the teacher's, and only the
-- principal can approve a test so students and parents see the result.

-- ---------- Paper checking ----------
create table public.paper_tests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,   -- optional: approved marks are copied into this exam
  title text not null,
  test_date date not null default current_date,
  mcq_key jsonb not null default '[]',          -- ["A","C",...]
  mcq_marks_each numeric(4,2) not null default 1,
  options_per_mcq int not null default 4 check (options_per_mcq between 2 and 5),
  questions jsonb not null default '[]',        -- written questions with rubric points
  status text not null default 'checking' check (status in ('checking', 'submitted', 'approved')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.paper_tests (campus_id, section_id);

-- One answer sheet per student.
create table public.paper_sheets (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  test_id uuid not null references public.paper_tests(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  mcq_answers jsonb,                             -- per question: "A".."E", null (blank) or "*" (two bubbles)
  mcq_score numeric(6,2) not null default 0,
  flags jsonb not null default '[]',
  answers jsonb not null default '[]',           -- written answers: crop image, AI suggestion, teacher's mark
  total numeric(6,2),
  status text not null default 'pending' check (status in ('pending', 'scanned', 'reviewed', 'absent')),
  scanned_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (test_id, student_id)
);
create index on public.paper_sheets (student_id);

-- ---------- Homework tutor ----------
create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  homework_id uuid references public.homework(id) on delete set null,
  subject_name text not null default 'General',
  topic text not null,
  question text not null,
  language text not null default 'ROMAN_URDU' check (language in ('ENGLISH', 'ROMAN_URDU')),
  stage text not null default 'HINT' check (stage in ('HINT', 'STEP', 'ANSWER', 'PRACTICE', 'DONE')),
  attempts int not null default 0,
  messages jsonb not null default '[]',
  practice jsonb,
  practice_score int,
  is_stuck boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, homework_id)
);
create index on public.tutor_sessions (campus_id, created_at);

-- ---------- Who can see and change what ----------
alter table public.paper_tests enable row level security;
alter table public.paper_sheets enable row level security;
alter table public.tutor_sessions enable row level security;

create or replace function app.can_check_test(p_test uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.paper_tests t
    where t.id = p_test and t.campus_id = app.my_campus()
      and (app.is_admin() or app.teaches_section(t.section_id)))
$$;
grant execute on function app.can_check_test(uuid) to authenticated;

create policy "staff read paper tests" on public.paper_tests for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read approved tests" on public.paper_tests for select to authenticated
  using (status = 'approved' and section_id in (select app.my_sections()));
create policy "teachers create tests for own sections" on public.paper_tests for insert to authenticated
  with check (campus_id = app.my_campus() and status = 'checking'
              and (app.is_admin() or app.teaches_section(section_id)));
create policy "teachers update own section tests" on public.paper_tests for update to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or (status <> 'approved' and app.teaches_section(section_id))))
  with check (campus_id = app.my_campus());
create policy "admin delete tests" on public.paper_tests for delete to authenticated
  using (campus_id = app.my_campus() and app.is_admin());

create policy "staff read sheets" on public.paper_sheets for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read approved sheets" on public.paper_sheets for select to authenticated
  using (student_id in (select app.my_students())
         and exists (select 1 from public.paper_tests t where t.id = test_id and t.status = 'approved'));
create policy "checkers write sheets" on public.paper_sheets for all to authenticated
  using (campus_id = app.my_campus() and app.can_check_test(test_id))
  with check (campus_id = app.my_campus() and app.can_check_test(test_id));

-- Only the principal approves, and a submitted or approved test's sheets can't change.
create or replace function app.guard_paper_test() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    if not app.is_admin() then raise exception 'Only the principal can approve results'; end if;
    if old.status <> 'submitted' then raise exception 'The teacher has not submitted this test yet'; end if;
    new.approved_by := app.me();
    new.approved_at := now();
  end if;
  if new.status = 'submitted' and old.status = 'checking' and exists (
    select 1 from public.paper_sheets s where s.test_id = new.id and s.status not in ('reviewed', 'absent')) then
    raise exception 'Some papers still need checking or must be marked absent';
  end if;
  return new;
end $$;
create trigger paper_test_guard before update on public.paper_tests
  for each row execute function app.guard_paper_test();

create or replace function app.guard_paper_sheet() returns trigger
language plpgsql set search_path = public as $$
declare st text;
begin
  select status into st from public.paper_tests where id = coalesce(new.test_id, old.test_id);
  if st <> 'checking' then raise exception 'This test is already submitted'; end if;
  return coalesce(new, old);
end $$;
create trigger paper_sheet_guard before update or delete on public.paper_sheets
  for each row execute function app.guard_paper_sheet();

-- Tutor: a student (or their parent) uses it for their own homework; staff read it for reports.
create policy "staff read tutor sessions" on public.tutor_sessions for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read own tutor sessions" on public.tutor_sessions for select to authenticated
  using (student_id in (select app.my_students()));
create policy "families start tutor sessions" on public.tutor_sessions for insert to authenticated
  with check (student_id in (select app.my_students()));
create policy "families continue tutor sessions" on public.tutor_sessions for update to authenticated
  using (student_id in (select app.my_students()))
  with check (student_id in (select app.my_students()));

alter publication supabase_realtime add table public.paper_sheets;
