-- Public result check (/results, no login). Everything goes through two narrow functions:
-- result_card() returns one card only when roll number, exam and date of birth all match a
-- published result; verify_result() confirms a printed card from the code on its QR.
-- Failed lookups are counted per roll number and per IP, so date-of-birth guessing stops fast.

create table if not exists public.result_lookups (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  roll text not null,
  ip_hash text,
  ok boolean not null
);
create index if not exists result_lookups_roll on public.result_lookups (roll, at);
create index if not exists result_lookups_ip on public.result_lookups (ip_hash, at);
alter table public.result_lookups enable row level security;  -- no policies: only the functions below

-- published exams a visitor can pick, for the school of this domain (or every school on a shared address)
create or replace function public.result_exams(p_domain text) returns table (id uuid, name text, school text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, s.name
  from exams e join campuses c on c.id = e.campus_id join schools s on s.id = c.school_id
  where e.status = 'results'
    and (not exists (select 1 from schools x where x.custom_domain = lower(split_part(p_domain, ':', 1)))
         or s.custom_domain = lower(split_part(p_domain, ':', 1)))
  order by e.ends_on desc nulls last, e.created_at desc
  limit 30
$$;
grant execute on function public.result_exams(text) to anon, authenticated;

create or replace function app.result_code(p_student uuid, p_exam uuid) returns text
language sql immutable as $$ select substr(md5(p_student::text || ':' || p_exam::text || ':ilmora-result'), 1, 10) $$;

create or replace function public.result_card(p_roll text, p_exam uuid, p_dob date, p_domain text, p_ip text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r text := upper(trim(coalesce(p_roll, '')));
  ip text := md5(coalesce(p_ip, ''));
  st record; ex record; sch record; card jsonb; subjects jsonb; tot numeric; obt numeric; pos int; n int; att numeric;
begin
  if r = '' or p_dob is null or p_exam is null then return jsonb_build_object('error', 'missing'); end if;
  -- rate limits: 5 failed tries per roll number an hour, 30 tries per address an hour
  if (select count(*) from result_lookups where roll = r and not ok and at > now() - interval '1 hour') >= 5
     or (select count(*) from result_lookups where ip_hash = ip and at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'too_many');
  end if;
  select e.id, e.name, e.total_marks, e.campus_id, e.status into ex from exams e where e.id = p_exam;
  select s.id, s.full_name, s.father_name, s.photo_url, s.section_id, s.admission_no, s.roll_no, s.campus_id into st
  from students s where upper(s.admission_no) = r and s.date_of_birth = p_dob and s.campus_id = ex.campus_id limit 1;
  if ex.id is null or ex.status <> 'results' or st.id is null then
    insert into result_lookups (roll, ip_hash, ok) values (r, ip, false);
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into result_lookups (roll, ip_hash, ok) values (r, ip, true);
  select sc.name as school, sc.logo_url, sc.custom_domain, c.name as campus, c.city,
         (select p.full_name from profiles p where p.campus_id = c.id and p.role = 'principal' and p.is_active order by p.created_at limit 1) as principal
    into sch from campuses c join schools sc on sc.id = c.school_id where c.id = st.campus_id;
  select coalesce(jsonb_agg(jsonb_build_object('subject', sub.name, 'total', ex.total_marks, 'obtained', m.obtained, 'absent', m.is_absent) order by sub.name), '[]')
    into subjects from marks m join subjects sub on sub.id = m.subject_id where m.exam_id = ex.id and m.student_id = st.id;
  select coalesce(sum(case when m.is_absent then 0 else m.obtained end), 0), count(*) * ex.total_marks into obt, tot
    from marks m where m.exam_id = ex.id and m.student_id = st.id;
  -- position in the section on this exam
  with t as (select m.student_id, sum(case when m.is_absent then 0 else coalesce(m.obtained, 0) end) as s
             from marks m join students x on x.id = m.student_id where m.exam_id = ex.id and x.section_id = st.section_id group by m.student_id)
  select (select count(*) + 1 from t where t.s > (select s from t where t.student_id = st.id)), count(*) into pos, n from t;
  select avg(case when a.status in ('present', 'late') then 1 else 0 end) into att from attendance a
    where a.student_id = st.id and a.date >= (select coalesce(min(se.starts_on), current_date - 365) from academic_sessions se where se.campus_id = st.campus_id and se.is_current);
  card := jsonb_build_object(
    'school', sch.school, 'logo_url', sch.logo_url, 'campus', sch.campus, 'city', sch.city, 'domain', sch.custom_domain, 'principal', sch.principal,
    'exam', ex.name, 'student', st.full_name, 'father', st.father_name, 'photo_url', st.photo_url, 'roll', st.admission_no, 'class_roll', st.roll_no,
    'class', (select k.name || '-' || x.name from sections x join classes k on k.id = x.class_id where x.id = st.section_id),
    'class_teacher', (select p.full_name from sections x join profiles p on p.id = x.class_teacher_id where x.id = st.section_id),
    'attendance', att, 'subjects', subjects, 'total', tot, 'obtained', obt, 'position', pos, 'out_of', n,
    'code', app.result_code(st.id, ex.id));
  return card;
end $$;
revoke all on function public.result_card(text, uuid, date, text, text) from public;
grant execute on function public.result_card(text, uuid, date, text, text) to anon, authenticated;

-- Confirms a printed card: the QR carries the roll number and a code only that card has.
create or replace function public.verify_result(p_roll text, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('student', s.full_name, 'roll', s.admission_no, 'exam', e.name,
           'school', sc.name, 'percent', round(100 * sum(case when m.is_absent then 0 else coalesce(m.obtained, 0) end) / nullif(count(*) * e.total_marks, 0), 1))
  from students s join marks m on m.student_id = s.id join exams e on e.id = m.exam_id and e.status = 'results'
  join campuses c on c.id = s.campus_id join schools sc on sc.id = c.school_id
  where upper(s.admission_no) = upper(trim(p_roll)) and app.result_code(s.id, e.id) = p_code
  group by s.full_name, s.admission_no, e.name, e.total_marks, sc.name
  limit 1
$$;
grant execute on function public.verify_result(text, text) to anon, authenticated;
