-- Tests keep their MCQ question text (so the question paper prints too), and a teacher's own
-- quiz can publish its result to students and parents straight away. Only additions.

alter table public.paper_tests add column mcq_questions jsonb not null default '[]';  -- [{"q": "...", "options": ["...", ...]}]
alter table public.paper_tests add column auto_publish boolean not null default false;

-- Same rules as before, plus: a quiz the teacher marked "publish straight away" and that adds
-- no marks to an exam can go to approved by its own teacher once every paper is checked.
create or replace function app.guard_paper_test() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    if not (old.auto_publish and old.exam_id is null and new.exam_id is null) then
      if not app.is_admin() then raise exception 'Only the principal can approve results'; end if;
      if old.status <> 'submitted' then raise exception 'The teacher has not submitted this test yet'; end if;
    end if;
    if exists (select 1 from public.paper_sheets s where s.test_id = new.id and s.status not in ('reviewed', 'absent')) then
      raise exception 'Some papers still need checking or must be marked absent';
    end if;
    new.approved_by := app.me();
    new.approved_at := now();
  end if;
  if new.status = 'submitted' and old.status = 'checking' and exists (
    select 1 from public.paper_sheets s where s.test_id = new.id and s.status not in ('reviewed', 'absent')) then
    raise exception 'Some papers still need checking or must be marked absent';
  end if;
  return new;
end $$;
