-- Who can see and change what (row-level security), money triggers, report views
-- and live updates.

-- ---------- Helper functions about the signed-in person ----------
-- security definer so they can read profiles without tripping profiles' own policies.

create or replace function app.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid() and is_active limit 1
$$;

create or replace function app.my_campus() returns uuid
language sql stable security definer set search_path = public as $$
  select campus_id from public.profiles where user_id = auth.uid() and is_active limit 1
$$;

create or replace function app.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid() and is_active limit 1
$$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner','principal','accountant','teacher'), false) $$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner','principal'), false) $$;

create or replace function app.is_accounts() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner','principal','accountant'), false) $$;

-- Does the signed-in teacher teach this section (class teacher, subject teacher, or on its timetable)?
create or replace function app.teaches_section(p_section uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sections s where s.id = p_section and s.class_teacher_id = app.me())
      or exists (select 1 from public.section_subjects ss where ss.section_id = p_section and ss.teacher_id = app.me())
      or exists (select 1 from public.timetable_slots t where t.section_id = p_section and t.teacher_id = app.me())
$$;

-- Families the signed-in parent belongs to.
create or replace function app.my_families() returns setof uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.family_guardians where profile_id = app.me()
$$;

-- Students the signed-in parent or student may see.
create or replace function app.my_students() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where family_id in (select app.my_families())
  union
  select id from public.students where profile_id = app.me()
$$;

create or replace function app.my_sections() returns setof uuid
language sql stable security definer set search_path = public as $$
  select section_id from public.students where id in (select app.my_students()) and section_id is not null
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------- Turn on row-level security everywhere ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Organisation
create policy "members read their school" on public.schools for select to authenticated
  using (id = (select school_id from public.campuses where id = app.my_campus()));
create policy "members read their campus" on public.campuses for select to authenticated
  using (id = app.my_campus());

-- Profiles: everyone sees themselves; staff see the campus; parents see their children's teachers.
create policy "read own profile" on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy "staff read campus profiles" on public.profiles for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read staff names" on public.profiles for select to authenticated
  using (campus_id = app.my_campus() and role in ('principal','teacher'));
create policy "admin manage profiles" on public.profiles for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

-- Setup tables everyone in the campus may read; only the principal or owner changes them.
do $$
declare t text;
begin
  foreach t in array array['academic_sessions','terms','classes','sections','subjects','section_subjects',
                           'timing_profiles','periods','timetable_slots','grading_scales','exams',
                           'exam_sections','exam_papers','fee_heads'] loop
    execute format($f$create policy "campus read" on public.%I for select to authenticated
                     using (campus_id = app.my_campus())$f$, t);
    execute format($f$create policy "admin write" on public.%I for all to authenticated
                     using (campus_id = app.my_campus() and app.is_admin())
                     with check (campus_id = app.my_campus() and app.is_admin())$f$, t);
  end loop;
end $$;

-- Families and guardians: staff read; principal and accounts manage; parents read their own.
create policy "staff read families" on public.families for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "parents read own family" on public.families for select to authenticated
  using (id in (select app.my_families()));
create policy "accounts manage families" on public.families for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

create policy "staff read guardians" on public.family_guardians for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "parents read own guardians" on public.family_guardians for select to authenticated
  using (family_id in (select app.my_families()));
create policy "accounts manage guardians" on public.family_guardians for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

-- Students
create policy "staff read students" on public.students for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read own students" on public.students for select to authenticated
  using (id in (select app.my_students()));
create policy "office manage students" on public.students for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

-- Attendance: teachers mark their own sections; admin can correct; families read their children.
create policy "staff read attendance" on public.attendance for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read own attendance" on public.attendance for select to authenticated
  using (student_id in (select app.my_students()));
create policy "teachers mark own sections" on public.attendance for insert to authenticated
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)));
create policy "teachers update own sections" on public.attendance for update to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)))
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)));
create policy "admin delete attendance" on public.attendance for delete to authenticated
  using (campus_id = app.my_campus() and app.is_admin());

create policy "staff read staff attendance" on public.staff_attendance for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "admin manage staff attendance" on public.staff_attendance for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

-- Homework
create policy "staff read homework" on public.homework for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read section homework" on public.homework for select to authenticated
  using (section_id in (select app.my_sections()));
create policy "teachers manage own homework" on public.homework for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or (teacher_id = app.me() and app.teaches_section(section_id))))
  with check (campus_id = app.my_campus() and (app.is_admin() or (teacher_id = app.me() and app.teaches_section(section_id))));

create policy "staff read submissions" on public.homework_submissions for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read own submissions" on public.homework_submissions for select to authenticated
  using (student_id in (select app.my_students()));
create policy "students submit" on public.homework_submissions for insert to authenticated
  with check (student_id in (select app.my_students()) and checked_at is null and marks is null);
create policy "teachers check submissions" on public.homework_submissions for all to authenticated
  using (campus_id = app.my_campus() and exists (
    select 1 from public.homework h where h.id = homework_id and (app.is_admin() or h.teacher_id = app.me())))
  with check (campus_id = app.my_campus() and exists (
    select 1 from public.homework h where h.id = homework_id and (app.is_admin() or h.teacher_id = app.me())));

-- Lesson diary
create policy "staff read diary" on public.lesson_diary for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read section diary" on public.lesson_diary for select to authenticated
  using (section_id in (select app.my_sections()));
create policy "teachers write own diary" on public.lesson_diary for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or teacher_id = app.me()))
  with check (campus_id = app.my_campus() and (app.is_admin() or (teacher_id = app.me() and app.teaches_section(section_id))));

-- Behaviour notes: families only see the ones shared with them.
create policy "staff read behaviour" on public.behaviour_notes for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read shared behaviour" on public.behaviour_notes for select to authenticated
  using (share_with_parents and student_id in (select app.my_students()));
create policy "teachers write own behaviour" on public.behaviour_notes for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or teacher_id = app.me()))
  with check (campus_id = app.my_campus() and (app.is_admin() or teacher_id = app.me()));

-- Marks: teachers enter for sections they teach until locked; families see them once results are out.
create policy "staff read marks" on public.marks for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "families read published marks" on public.marks for select to authenticated
  using (student_id in (select app.my_students())
         and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'results'));
create policy "teachers enter marks" on public.marks for insert to authenticated
  with check (campus_id = app.my_campus() and not locked and (app.is_admin() or exists (
    select 1 from public.students s where s.id = student_id and app.teaches_section(s.section_id))));
create policy "teachers edit unlocked marks" on public.marks for update to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or (not locked and exists (
    select 1 from public.students s where s.id = student_id and app.teaches_section(s.section_id)))))
  with check (campus_id = app.my_campus());

-- Leave: staff ask for their own; principal decides.
create policy "own or admin read leave" on public.leave_requests for select to authenticated
  using (campus_id = app.my_campus() and (profile_id = app.me() or app.is_admin()));
create policy "staff request leave" on public.leave_requests for insert to authenticated
  with check (campus_id = app.my_campus() and profile_id = app.me() and status = 'pending' and app.is_staff());
create policy "admin decide leave" on public.leave_requests for update to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

create policy "staff read substitutions" on public.substitutions for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
create policy "admin manage substitutions" on public.substitutions for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

-- Admissions: front office (accounts) and principal.
create policy "accounts manage admissions" on public.admissions for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

-- Notices: principal writes; each person reads the ones meant for them.
create policy "admin manage notices" on public.notices for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "read notices meant for me" on public.notices for select to authenticated
  using (campus_id = app.my_campus() and (
       audience = 'everyone'
    or (audience = 'staff' and app.is_staff())
    or (audience = 'parents' and app.my_role() in ('parent','student'))
    or (audience in ('class','section') and app.is_staff())
    or (audience = 'section' and section_id in (select app.my_sections()))
    or (audience = 'class' and class_id in (select s.class_id from public.sections s where s.id in (select app.my_sections())))
  ));

-- Fees: accounts staff manage; families read their own.
create policy "accounts manage fee structures" on public.fee_structures for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());
create policy "campus read fee structures" on public.fee_structures for select to authenticated
  using (campus_id = app.my_campus());

do $$
declare t text;
begin
  foreach t in array array['invoices','payments','ledger_entries'] loop
    execute format($f$create policy "accounts read" on public.%I for select to authenticated
                     using (campus_id = app.my_campus() and app.is_accounts())$f$, t);
    execute format($f$create policy "families read own" on public.%I for select to authenticated
                     using (family_id in (select app.my_families()))$f$, t);
    execute format($f$create policy "accounts insert" on public.%I for insert to authenticated
                     with check (campus_id = app.my_campus() and app.is_accounts())$f$, t);
  end loop;
end $$;
create policy "accounts read lines" on public.invoice_lines for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "families read own lines" on public.invoice_lines for select to authenticated
  using (invoice_id in (select id from public.invoices where family_id in (select app.my_families())));
create policy "accounts insert lines" on public.invoice_lines for insert to authenticated
  with check (campus_id = app.my_campus() and app.is_accounts());

-- ---------- Money rules ----------
-- 1. The ledger is append-only.
create or replace function app.block_ledger_change() returns trigger language plpgsql as $$
begin
  raise exception 'Ledger entries cannot be changed or deleted. Add a reversal entry instead.';
end $$;
create trigger ledger_append_only before update or delete on public.ledger_entries
  for each row execute function app.block_ledger_change();

-- 2. Every invoice line and every payment writes its ledger entry automatically.
create or replace function app.ledger_from_invoice_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_entries (campus_id, family_id, kind, amount_paisa, invoice_line_id, note, created_by)
  select new.campus_id, i.family_id,
         case when new.amount_paisa < 0 then 'concession'::public.ledger_kind else 'charge'::public.ledger_kind end,
         new.amount_paisa, new.id, new.description, app.me()
  from public.invoices i where i.id = new.invoice_id;
  return new;
end $$;
create trigger invoice_line_to_ledger after insert on public.invoice_lines
  for each row execute function app.ledger_from_invoice_line();

create or replace function app.ledger_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_entries (campus_id, family_id, kind, amount_paisa, payment_id, note, created_by)
  values (new.campus_id, new.family_id, 'payment', -new.amount_paisa, new.id,
          new.mode::text || coalesce(' ' || new.reference, ''), coalesce(new.received_by, app.me()));
  return new;
end $$;
create trigger payment_to_ledger after insert on public.payments
  for each row execute function app.ledger_from_payment();

-- 3. Marks can't be entered above the exam's total.
create or replace function app.check_marks() returns trigger language plpgsql as $$
declare t int;
begin
  select total_marks into t from public.exams where id = new.exam_id;
  if new.obtained is not null and (new.obtained < 0 or new.obtained > t) then
    raise exception 'Marks must be between 0 and %', t;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger marks_in_range before insert or update on public.marks
  for each row execute function app.check_marks();

-- ---------- Report views (they follow the reader's own access) ----------
create view public.family_balances with (security_invoker = true) as
  select f.id as family_id, f.campus_id, f.name,
         coalesce(sum(l.amount_paisa), 0)::bigint as balance_paisa
  from public.families f
  left join public.ledger_entries l on l.family_id = f.id
  group by f.id;

create view public.attendance_by_day with (security_invoker = true) as
  select campus_id, date,
         count(*) filter (where status in ('present','late')) as present,
         count(*) filter (where status = 'absent') as absent,
         count(*) filter (where status = 'late') as late,
         count(*) filter (where status = 'leave') as on_leave,
         count(*) as marked,
         round((count(*) filter (where status in ('present','late')))::numeric / nullif(count(*), 0), 4) as rate
  from public.attendance group by campus_id, date;

create view public.attendance_by_section_day with (security_invoker = true) as
  select a.campus_id, a.section_id, a.date,
         count(*) filter (where a.status in ('present','late')) as present,
         count(*) as marked
  from public.attendance a group by a.campus_id, a.section_id, a.date;

create view public.homework_progress with (security_invoker = true) as
  select h.id as homework_id, h.campus_id, h.section_id, h.title, h.due_on, h.teacher_id,
         (select count(*) from public.students s where s.section_id = h.section_id and s.status = 'enrolled') as students,
         count(hs.submitted_at) as submitted,
         count(hs.checked_at) as checked
  from public.homework h
  left join public.homework_submissions hs on hs.homework_id = h.id
  group by h.id;

grant select on public.family_balances, public.attendance_by_day, public.attendance_by_section_day,
  public.homework_progress to authenticated;

-- ---------- Live updates ----------
alter publication supabase_realtime add table
  public.attendance, public.payments, public.homework, public.homework_submissions,
  public.notices, public.leave_requests, public.marks;
