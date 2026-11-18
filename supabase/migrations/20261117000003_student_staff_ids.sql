-- School-wide IDs: students MS-0001, staff MT-0001 (prefix per school).
-- A per-school counter hands out the next number in one UPDATE ... RETURNING,
-- so two admissions at the same moment can never get the same ID.

alter table public.schools
  add column if not exists student_prefix text not null default 'S',
  add column if not exists staff_prefix text not null default 'T';
-- existing schools: initials of the name (Model School -> MS, staff MT)
update public.schools set
  student_prefix = coalesce(nullif(upper(left(regexp_replace(initcap(name), '[^A-Z]', '', 'g'), 3)), ''), 'S'),
  staff_prefix = coalesce(nullif(upper(left(name, 1)), ''), '') || 'T'
where student_prefix = 'S' and staff_prefix = 'T';

create table if not exists public.id_counters (
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null check (kind in ('student', 'staff')),
  last_value int not null default 0,
  primary key (school_id, kind)
);
alter table public.id_counters enable row level security;  -- no policies: only the functions below touch it

alter table public.students add column if not exists legacy_admission_no text;
alter table public.profiles
  add column if not exists employee_code text,
  add column if not exists legacy_employee_code text;

create or replace function app.next_code(p_campus uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid; pre text; n int;
begin
  select c.school_id, case when p_kind = 'student' then s.student_prefix else s.staff_prefix end into sid, pre
  from campuses c join schools s on s.id = c.school_id where c.id = p_campus;
  insert into id_counters (school_id, kind, last_value) values (sid, p_kind, 1)
  on conflict (school_id, kind) do update set last_value = id_counters.last_value + 1
  returning last_value into n;
  return pre || '-' || lpad(n::text, 4, '0');
end $$;

-- New students and staff always get the next code; anything typed is kept as the old number.
create or replace function app.assign_student_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admission_no is not null and new.admission_no <> '' then new.legacy_admission_no := coalesce(new.legacy_admission_no, new.admission_no); end if;
  new.admission_no := app.next_code(new.campus_id, 'student');
  return new;
end $$;
drop trigger if exists students_code on public.students;
create trigger students_code before insert on public.students for each row execute function app.assign_student_code();

-- the ID never changes after it is given
create or replace function app.keep_student_code() returns trigger
language plpgsql as $$ begin new.admission_no := old.admission_no; return new; end $$;
drop trigger if exists students_code_fixed on public.students;
create trigger students_code_fixed before update of admission_no on public.students for each row execute function app.keep_student_code();

create or replace function app.assign_staff_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('owner', 'principal', 'teacher', 'accountant') and new.employee_code is null then
    new.employee_code := app.next_code(new.campus_id, 'staff');
  end if;
  return new;
end $$;
drop trigger if exists profiles_code on public.profiles;
create trigger profiles_code before insert on public.profiles for each row execute function app.assign_staff_code();

-- Renumber what exists: oldest admission / joining first, old numbers kept.
update public.students set legacy_admission_no = admission_no where legacy_admission_no is null and admission_no is not null;
update public.profiles set legacy_employee_code = employee_code where legacy_employee_code is null and employee_code is not null;

alter table public.students disable trigger students_code_fixed;
with ranked as (
  select st.id, c.school_id, row_number() over (partition by c.school_id order by st.admitted_on nulls last, st.created_at, st.legacy_admission_no, st.id) as n
  from public.students st join public.campuses c on c.id = st.campus_id
)
update public.students st set admission_no = s.student_prefix || '-' || lpad(r.n::text, 4, '0')
from ranked r join public.schools s on s.id = r.school_id where st.id = r.id;
alter table public.students enable trigger students_code_fixed;

with ranked as (
  select p.id, c.school_id, row_number() over (partition by c.school_id order by d.joining_date nulls last, p.created_at, p.full_name, p.id) as n
  from public.profiles p join public.campuses c on c.id = p.campus_id left join public.staff_details d on d.profile_id = p.id
  where p.role in ('owner', 'principal', 'teacher', 'accountant')
)
update public.profiles p set employee_code = s.staff_prefix || '-' || lpad(r.n::text, 4, '0')
from ranked r join public.schools s on s.id = r.school_id where p.id = r.id;

insert into public.id_counters (school_id, kind, last_value)
select c.school_id, 'student', count(*) from public.students st join public.campuses c on c.id = st.campus_id group by c.school_id
on conflict (school_id, kind) do update set last_value = excluded.last_value;
insert into public.id_counters (school_id, kind, last_value)
select c.school_id, 'staff', count(*) from public.profiles p join public.campuses c on c.id = p.campus_id where p.role in ('owner', 'principal', 'teacher', 'accountant') group by c.school_id
on conflict (school_id, kind) do update set last_value = excluded.last_value;

-- no duplicates, ever
create unique index if not exists students_admission_no_unique on public.students (campus_id, admission_no);
create unique index if not exists profiles_employee_code_unique on public.profiles (campus_id, employee_code) where employee_code is not null;

-- What the next student would get (shown on the admission form). Does not use up a number.
create or replace function public.peek_student_code() returns text
language sql stable security definer set search_path = public as $$
  select s.student_prefix || '-' || lpad((coalesce(k.last_value, 0) + 1)::text, 4, '0')
  from campuses c join schools s on s.id = c.school_id left join id_counters k on k.school_id = s.id and k.kind = 'student'
  where c.id = app.my_campus()
$$;
grant execute on function public.peek_student_code() to authenticated;

-- new schools get their prefixes from their name too, unless set
create or replace function app.school_prefixes() returns trigger language plpgsql as $$
begin
  if new.student_prefix = 'S' then new.student_prefix := coalesce(nullif(upper(left(regexp_replace(initcap(new.name), '[^A-Z]', '', 'g'), 3)), ''), 'S'); end if;
  if new.staff_prefix = 'T' then new.staff_prefix := coalesce(nullif(upper(left(new.name, 1)), ''), '') || 'T'; end if;
  return new;
end $$;
drop trigger if exists schools_prefixes on public.schools;
create trigger schools_prefixes before insert on public.schools for each row execute function app.school_prefixes();
