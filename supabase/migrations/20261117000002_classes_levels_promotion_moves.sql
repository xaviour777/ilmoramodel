-- Classes by level and program, promotion and student moves with history and undo.

-- 1. level and program on classes
alter table public.classes
  add column if not exists level text,
  add column if not exists program text;
alter table public.classes drop constraint if exists classes_level_check,
  add constraint classes_level_check check (level is null or level in ('pre', 'primary', 'middle', 'matric', 'intermediate', 'graduate'));
update public.classes set level = case
    when name ~* '(play|nursery|prep|kg|montessori|reception)' then 'pre'
    when name ~* '(bs|adp|bachelor|semester)' then 'graduate'
    when sort <= 0 then 'pre'
    when sort <= 5 then 'primary'
    when sort <= 8 then 'middle'
    when sort <= 10 then 'matric'
    when sort <= 12 then 'intermediate'
    else 'graduate' end
  where level is null;

-- 2. rules the principal can change
alter table public.campus_settings
  add column if not exists pass_mark int not null default 33,
  add column if not exists promote_min_attendance int not null default 75,
  add column if not exists max_periods_week int not null default 36,
  add column if not exists weight_attendance int not null default 25,
  add column if not exists weight_results int not null default 35,
  add column if not exists weight_fees int not null default 20,
  add column if not exists weight_homework int not null default 20;

-- 3. every promotion and move, so it can be shown and undone
create table if not exists public.student_moves (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  batch_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('promote', 'conditional', 'detain', 'leave', 'move')),
  from_section_id uuid references public.sections(id) on delete set null,
  to_section_id uuid references public.sections(id) on delete set null,
  from_roll text, to_roll text,
  from_status public.student_status not null, to_status public.student_status not null,
  program text,
  reason text, note text,
  effective_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists student_moves_campus_created on public.student_moves (campus_id, created_at desc);
create index if not exists student_moves_batch on public.student_moves (batch_id);
alter table public.student_moves enable row level security;
drop policy if exists "staff read moves" on public.student_moves;
create policy "staff read moves" on public.student_moves for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'accountant', 'teacher'));
drop policy if exists "admin write moves" on public.student_moves;
create policy "admin write moves" on public.student_moves for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

-- Apply many moves at once. Runs as the caller, so row-level security still decides
-- what they may change. p: [{student_id, kind, to_section_id, to_roll, program}], one batch.
create or replace function public.apply_student_moves(p_moves jsonb, p_reason text, p_note text, p_effective date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  b uuid := gen_random_uuid(); m jsonb; s record; new_status public.student_status; new_section uuid; new_roll text; n int := 0;
begin
  if not app.is_admin() then raise exception 'Only the principal can move students.'; end if;
  for m in select * from jsonb_array_elements(p_moves) loop
    select id, campus_id, section_id, roll_no, status into s from students where id = (m->>'student_id')::uuid for update;
    if s.id is null then continue; end if;
    new_status := case when m->>'kind' = 'leave' then 'left'::public.student_status else s.status end;
    new_section := case when m->>'kind' in ('leave', 'detain') then s.section_id else coalesce(nullif(m->>'to_section_id', '')::uuid, s.section_id) end;
    new_roll := case when m ? 'to_roll' then nullif(m->>'to_roll', '') else s.roll_no end;
    if new_section is distinct from s.section_id and not exists (select 1 from sections where id = new_section and campus_id = s.campus_id) then
      raise exception 'That section is not in this school.';
    end if;
    update students set section_id = new_section, roll_no = new_roll, status = new_status where id = s.id;
    insert into student_moves (campus_id, batch_id, student_id, kind, from_section_id, to_section_id, from_roll, to_roll, from_status, to_status, program, reason, note, effective_on)
    values (s.campus_id, b, s.id, m->>'kind', s.section_id, new_section, s.roll_no, new_roll, s.status, new_status, nullif(m->>'program', ''), p_reason, p_note, coalesce(p_effective, current_date));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'No student was chosen.'; end if;
  return b;
end $$;
grant execute on function public.apply_student_moves(jsonb, text, text, date) to authenticated;

-- Undo a batch within 7 days, for students who haven't moved again since.
create or replace function public.undo_student_moves(p_batch uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare r record; n int := 0;
begin
  if not app.is_admin() then raise exception 'Only the principal can undo a move.'; end if;
  for r in select * from student_moves where batch_id = p_batch and undone_at is null loop
    if r.created_at < now() - interval '7 days' then raise exception 'Moves can be undone for 7 days only.'; end if;
    -- skip a student who was moved again later
    if exists (select 1 from student_moves x where x.student_id = r.student_id and x.created_at > r.created_at and x.undone_at is null) then continue; end if;
    update students set section_id = r.from_section_id, roll_no = r.from_roll, status = r.from_status
      where id = r.student_id and section_id is not distinct from r.to_section_id;
    update student_moves set undone_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.undo_student_moves(uuid) to authenticated;
