-- Every change to a mark is recorded: who, when, from what to what. Nobody can edit the log.
create table if not exists public.marks_log (
  id bigint generated always as identity primary key,
  campus_id uuid not null,
  at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  exam_id uuid, subject_id uuid, student_id uuid,
  old_obtained numeric(6,2), new_obtained numeric(6,2),
  old_absent boolean, new_absent boolean
);
create index if not exists marks_log_campus_at on public.marks_log (campus_id, at desc);
create index if not exists marks_log_student on public.marks_log (student_id, at desc);
alter table public.marks_log enable row level security;
drop policy if exists "admin read marks log" on public.marks_log;
create policy "admin read marks log" on public.marks_log for select to authenticated
  using (campus_id = app.my_campus() and app.is_admin());

create or replace function app.log_marks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into marks_log (campus_id, changed_by, action, exam_id, subject_id, student_id, new_obtained, new_absent)
    values (new.campus_id, app.me(), 'insert', new.exam_id, new.subject_id, new.student_id, new.obtained, new.is_absent);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.obtained is distinct from old.obtained or new.is_absent is distinct from old.is_absent then
      insert into marks_log (campus_id, changed_by, action, exam_id, subject_id, student_id, old_obtained, new_obtained, old_absent, new_absent)
      values (new.campus_id, app.me(), 'update', new.exam_id, new.subject_id, new.student_id, old.obtained, new.obtained, old.is_absent, new.is_absent);
    end if;
    return new;
  else
    insert into marks_log (campus_id, changed_by, action, exam_id, subject_id, student_id, old_obtained, old_absent)
    values (old.campus_id, app.me(), 'delete', old.exam_id, old.subject_id, old.student_id, old.obtained, old.is_absent);
    return old;
  end if;
end $$;
drop trigger if exists marks_audit on public.marks;
create trigger marks_audit after insert or update or delete on public.marks for each row execute function app.log_marks();
