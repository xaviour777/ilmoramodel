-- Parents ask for a child's leave; the class teacher (or principal) decides; approving marks the days as leave.
create table if not exists public.student_leave (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  section_id uuid references public.sections(id) on delete set null,
  from_on date not null,
  to_on date not null check (to_on >= from_on),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles(id) on delete set null default app.me(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists student_leave_section on public.student_leave (section_id, status);
alter table public.student_leave enable row level security;
drop policy if exists "families read own leave" on public.student_leave;
create policy "families read own leave" on public.student_leave for select to authenticated using (student_id in (select app.my_students()));
drop policy if exists "families ask leave" on public.student_leave;
create policy "families ask leave" on public.student_leave for insert to authenticated
  with check (student_id in (select app.my_students()) and status = 'pending' and decided_by is null);
drop policy if exists "staff read leave" on public.student_leave;
create policy "staff read leave" on public.student_leave for select to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)));
drop policy if exists "staff decide leave" on public.student_leave;
create policy "staff decide leave" on public.student_leave for update to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)))
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_section(section_id)));

-- fill campus and section from the child, so a family can't put a request in another school
create or replace function app.student_leave_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select s.campus_id, s.section_id into new.campus_id, new.section_id from students s where s.id = new.student_id;
  return new;
end $$;
drop trigger if exists student_leave_fill on public.student_leave;
create trigger student_leave_fill before insert on public.student_leave for each row execute function app.student_leave_fill();

-- Approve or refuse; approving marks every school day in the range as leave (unless already marked).
create or replace function public.decide_student_leave(p_id uuid, p_status text) returns void
language plpgsql security invoker set search_path = public as $$
declare r record; d date;
begin
  if p_status not in ('approved', 'rejected') then raise exception 'Choose approve or refuse.'; end if;
  update student_leave set status = p_status, decided_by = app.me(), decided_at = now() where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'This request was already decided.'; end if;
  if p_status = 'approved' and r.section_id is not null then
    for d in select generate_series(r.from_on, r.to_on, interval '1 day')::date loop
      if extract(isodow from d) <= 6 then
        insert into attendance (campus_id, section_id, student_id, date, status, marked_by, marked_at)
        values (r.campus_id, r.section_id, r.student_id, d, 'leave', app.me(), now())
        on conflict (student_id, date) do nothing;
      end if;
    end loop;
  end if;
end $$;
grant execute on function public.decide_student_leave(uuid, text) to authenticated;

-- Parent-teacher meetings: teachers open slots, families book one.
create table if not exists public.ptm_slots (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  minutes int not null default 10 check (minutes between 5 and 120),
  place text,
  student_id uuid references public.students(id) on delete set null,
  booked_by uuid references public.profiles(id) on delete set null,
  booked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (teacher_id, starts_at)
);
alter table public.ptm_slots enable row level security;
drop policy if exists "staff read slots" on public.ptm_slots;
create policy "staff read slots" on public.ptm_slots for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher', 'accountant'));
drop policy if exists "teacher manage own slots" on public.ptm_slots;
create policy "teacher manage own slots" on public.ptm_slots for all to authenticated
  using (campus_id = app.my_campus() and (teacher_id = app.me() or app.is_admin()))
  with check (campus_id = app.my_campus() and (teacher_id = app.me() or app.is_admin()));
-- families see slots of teachers who teach their children, plus their own bookings
drop policy if exists "families read slots" on public.ptm_slots;
create policy "families read slots" on public.ptm_slots for select to authenticated
  using (student_id in (select app.my_students()) or exists (
    select 1 from students s
    left join sections x on x.id = s.section_id
    left join section_subjects ss on ss.section_id = s.section_id
    where s.id in (select app.my_students()) and (x.class_teacher_id = ptm_slots.teacher_id or ss.teacher_id = ptm_slots.teacher_id)));

create or replace function public.book_ptm(p_slot uuid, p_student uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_student not in (select app.my_students()) then raise exception 'That child is not on your account.'; end if;
  update ptm_slots set student_id = p_student, booked_by = app.me(), booked_at = now(), note = nullif(trim(p_note), '')
    where id = p_slot and student_id is null and starts_at > now();
  if not found then raise exception 'That time was just taken. Pick another.'; end if;
end $$;
grant execute on function public.book_ptm(uuid, uuid, text) to authenticated;

create or replace function public.cancel_ptm(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ptm_slots set student_id = null, booked_by = null, booked_at = null, note = null
    where id = p_slot and student_id in (select app.my_students()) and starts_at > now();
end $$;
grant execute on function public.cancel_ptm(uuid) to authenticated;
