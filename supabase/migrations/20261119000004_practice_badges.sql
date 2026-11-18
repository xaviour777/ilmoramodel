-- Practice tests from the question bank (answers never leave the database before marking)
-- and a class leaderboard that shows only first names and points.

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  chapter text,
  total int not null,
  correct int not null,
  details jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists practice_attempts_student on public.practice_attempts (student_id, created_at desc);
alter table public.practice_attempts enable row level security;
drop policy if exists "families read own practice" on public.practice_attempts;
create policy "families read own practice" on public.practice_attempts for select to authenticated using (student_id in (select app.my_students()));
drop policy if exists "staff read practice" on public.practice_attempts;
create policy "staff read practice" on public.practice_attempts for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));

-- subjects and chapters with MCQs for the child's class
create or replace function public.practice_topics(p_student uuid) returns table (subject_id uuid, subject text, chapter text, questions int)
language sql stable security definer set search_path = public as $$
  select q.subject_id, sub.name, q.chapter, count(*)::int
  from students s join sections x on x.id = s.section_id join question_bank q on q.class_id = x.class_id and q.kind = 'mcq'
  join subjects sub on sub.id = q.subject_id
  where s.id = p_student and p_student in (select app.my_students())
  group by q.subject_id, sub.name, q.chapter order by sub.name, q.chapter
$$;
grant execute on function public.practice_topics(uuid) to authenticated;

-- a random set of MCQs, without answers
create or replace function public.practice_set(p_student uuid, p_subject uuid, p_chapter text, p_n int) returns jsonb
language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options)), '[]')
  from (select q.* from students s join sections x on x.id = s.section_id join question_bank q on q.class_id = x.class_id
        where s.id = p_student and p_student in (select app.my_students()) and q.kind = 'mcq' and q.subject_id = p_subject
          and (p_chapter is null or p_chapter = '' or q.chapter = p_chapter)
        order by random() limit least(greatest(p_n, 1), 30)) q
$$;
grant execute on function public.practice_set(uuid, uuid, text, int) to authenticated;

-- mark the answers {question id: "A"}, save the attempt, return what was right
create or replace function public.practice_submit(p_student uuid, p_subject uuid, p_chapter text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d jsonb; n int; c int; camp uuid;
begin
  if p_student not in (select app.my_students()) then raise exception 'Not your child.'; end if;
  select campus_id into camp from students where id = p_student;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'given', p_answers ->> q.id::text, 'answer', q.answer, 'ok', (p_answers ->> q.id::text) = q.answer)), '[]'),
         count(*), count(*) filter (where (p_answers ->> q.id::text) = q.answer)
    into d, n, c
  from question_bank q where q.id::text in (select jsonb_object_keys(p_answers)) and q.kind = 'mcq';
  if n = 0 then raise exception 'No answers.'; end if;
  insert into practice_attempts (campus_id, student_id, subject_id, chapter, total, correct, details) values (camp, p_student, p_subject, nullif(p_chapter, ''), n, c, d);
  return jsonb_build_object('total', n, 'correct', c, 'details', d);
end $$;
grant execute on function public.practice_submit(uuid, uuid, text, jsonb) to authenticated;

-- class leaderboard for the last 30 days: attendance, homework handed in and practice, first names only
create or replace function public.class_leaderboard(p_student uuid) returns table (name text, points int, me boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select section_id from students where id = p_student and p_student in (select app.my_students())),
  kids as (select s.id, split_part(s.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(s.full_name, ' ', 2), ''), 1) || '.', '') as name
           from students s where s.section_id = (select section_id from mine) and s.status = 'enrolled')
  select k.name,
    (coalesce((select count(*) from attendance a where a.student_id = k.id and a.status = 'present' and a.date >= current_date - 30), 0) * 2
     + coalesce((select count(*) from homework_submissions h where h.student_id = k.id and h.submitted_at >= now() - interval '30 days'), 0) * 5
     + coalesce((select sum(correct) from practice_attempts p where p.student_id = k.id and p.created_at >= now() - interval '30 days'), 0))::int as points,
    k.id = p_student as me
  from kids k order by points desc limit 50
$$;
grant execute on function public.class_leaderboard(uuid) to authenticated;
