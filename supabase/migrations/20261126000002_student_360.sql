-- Student register and 360 profile: emergency contacts, documents with expiry, certificates with a
-- serial number, "passed out" status, and a full history of every status change. Nobody is ever
-- deleted: a student who leaves keeps every record, so certificates years later carry real dates.

alter type public.student_status add value if not exists 'passed_out';

alter table public.students add column if not exists left_on date;
alter table public.students add column if not exists leave_reason text;

-- ---------- 1. every status change is recorded, whichever screen made it ----------
alter table public.student_moves drop constraint if exists student_moves_kind_check;
alter table public.student_moves add constraint student_moves_kind_check
  check (kind in ('promote', 'conditional', 'detain', 'leave', 'move', 'pass_out', 'strike_off', 'rejoin', 'status'));

create or replace function app.student_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status::text = 'enrolled' then
      new.left_on := null; new.leave_reason := null;
    elsif old.status::text = 'enrolled' then
      new.left_on := coalesce(new.left_on, (now() at time zone 'Asia/Karachi')::date);
    end if;
    -- a change made outside apply_student_moves still lands in the history
    if coalesce(current_setting('app.moving', true), '') <> '1' then
      insert into student_moves (campus_id, batch_id, student_id, kind, from_section_id, to_section_id, from_roll, to_roll, from_status, to_status, reason, effective_on)
      values (new.campus_id, gen_random_uuid(), new.id, 'status', old.section_id, new.section_id, old.roll_no, new.roll_no, old.status, new.status,
              new.leave_reason, coalesce(new.left_on, (now() at time zone 'Asia/Karachi')::date));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists students_status_change on public.students;
create trigger students_status_change before update of status on public.students
  for each row execute function app.student_status_change();

-- Apply many moves at once (promotion, leaving, strike off, pass out, re-join). Runs as the caller,
-- so row-level security still decides what they may change. p: [{student_id, kind, to_section_id, to_roll, program}].
create or replace function public.apply_student_moves(p_moves jsonb, p_reason text, p_note text, p_effective date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  b uuid := gen_random_uuid(); m jsonb; s record; new_status public.student_status; new_section uuid; new_roll text; n int := 0; k text;
  eff date := coalesce(p_effective, (now() at time zone 'Asia/Karachi')::date);
begin
  if not app.is_admin() then raise exception 'Only the principal can move students.'; end if;
  perform set_config('app.moving', '1', true);
  for m in select * from jsonb_array_elements(p_moves) loop
    k := m->>'kind';
    select id, campus_id, section_id, roll_no, status into s from students where id = (m->>'student_id')::uuid for update;
    if s.id is null then continue; end if;
    new_status := case k when 'leave' then 'left' when 'strike_off' then 'struck_off' when 'pass_out' then 'passed_out'
                         when 'rejoin' then 'enrolled' else s.status::text end::public.student_status;
    new_section := case when k in ('leave', 'detain', 'strike_off', 'pass_out') then s.section_id
                        else coalesce(nullif(m->>'to_section_id', '')::uuid, s.section_id) end;
    new_roll := case when m ? 'to_roll' then nullif(m->>'to_roll', '') else s.roll_no end;
    if new_section is distinct from s.section_id and not exists (select 1 from sections where id = new_section and campus_id = s.campus_id) then
      raise exception 'That section is not in this school.';
    end if;
    update students set section_id = new_section, roll_no = new_roll, status = new_status,
      left_on = case when new_status::text = 'enrolled' then null when k in ('leave', 'strike_off', 'pass_out') then eff else left_on end,
      leave_reason = case when new_status::text = 'enrolled' then null when k in ('leave', 'strike_off', 'pass_out') then coalesce(nullif(p_reason, ''), leave_reason) else leave_reason end
    where id = s.id;
    insert into student_moves (campus_id, batch_id, student_id, kind, from_section_id, to_section_id, from_roll, to_roll, from_status, to_status, program, reason, note, effective_on)
    values (s.campus_id, b, s.id, k, s.section_id, new_section, s.roll_no, new_roll, s.status, new_status, nullif(m->>'program', ''), p_reason, p_note, eff);
    n := n + 1;
  end loop;
  perform set_config('app.moving', '', true);
  if n = 0 then raise exception 'No student was chosen.'; end if;
  return b;
end $$;
grant execute on function public.apply_student_moves(jsonb, text, text, date) to authenticated;

create or replace function public.undo_student_moves(p_batch uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare r record; n int := 0;
begin
  if not app.is_admin() then raise exception 'Only the principal can undo a move.'; end if;
  perform set_config('app.moving', '1', true);
  for r in select * from student_moves where batch_id = p_batch and undone_at is null loop
    if r.created_at < now() - interval '7 days' then raise exception 'Moves can be undone for 7 days only.'; end if;
    if exists (select 1 from student_moves x where x.student_id = r.student_id and x.created_at > r.created_at and x.undone_at is null) then continue; end if;
    update students set section_id = r.from_section_id, roll_no = r.from_roll, status = r.from_status
      where id = r.student_id and section_id is not distinct from r.to_section_id;
    update student_moves set undone_at = now() where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('app.moving', '', true);
  return n;
end $$;
grant execute on function public.undo_student_moves(uuid) to authenticated;

-- students who left before this change: take the date from their leaving move, if there was one
update public.students s set left_on = coalesce((select max(m.effective_on) from public.student_moves m where m.student_id = s.id and m.kind = 'leave' and m.undone_at is null), s.left_on)
where s.status::text <> 'enrolled' and s.left_on is null;

-- ---------- 2. guardians and emergency contacts ----------
create table if not exists public.student_contacts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  relation text not null default 'guardian',
  phone text,
  cnic text,
  is_emergency boolean not null default true,
  can_pick_up boolean not null default false,
  note text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists student_contacts_student on public.student_contacts (student_id);
alter table public.student_contacts enable row level security;
drop policy if exists "read contacts" on public.student_contacts;
create policy "read contacts" on public.student_contacts for select to authenticated
  using (campus_id = app.my_campus() and (app.is_staff() or student_id in (select app.my_students())));
drop policy if exists "office writes contacts" on public.student_contacts;
create policy "office writes contacts" on public.student_contacts for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

-- ---------- 3. documents with expiry ----------
create table if not exists public.student_documents (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null default 'other' check (kind in ('b_form', 'birth_certificate', 'guardian_cnic', 'photo', 'previous_result', 'leaving_certificate', 'medical', 'domicile', 'other')),
  title text,
  number text,
  issued_on date,
  expires_on date,
  file_path text,   -- in the private "student-docs" bucket: <campus_id>/<student_id>/<file>
  verified boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
create index if not exists student_documents_student on public.student_documents (student_id);
create index if not exists student_documents_expiry on public.student_documents (campus_id, expires_on) where expires_on is not null;
alter table public.student_documents enable row level security;
drop policy if exists "office reads documents" on public.student_documents;
create policy "office reads documents" on public.student_documents for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
drop policy if exists "office writes documents" on public.student_documents;
create policy "office writes documents" on public.student_documents for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-docs', 'student-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists "office reads student docs" on storage.objects;
create policy "office reads student docs" on storage.objects for select to authenticated
  using (bucket_id = 'student-docs' and (storage.foldername(name))[1] = app.my_campus()::text and app.is_accounts());
drop policy if exists "office uploads student docs" on storage.objects;
create policy "office uploads student docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-docs' and (storage.foldername(name))[1] = app.my_campus()::text and app.is_accounts());
drop policy if exists "office removes student docs" on storage.objects;
create policy "office removes student docs" on storage.objects for delete to authenticated
  using (bucket_id = 'student-docs' and (storage.foldername(name))[1] = app.my_campus()::text and app.is_accounts());

-- ---------- 4. certificates: each one issued gets a serial number and is kept ----------
create table if not exists public.student_certificates (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('character', 'leaving', 'fee', 'bonafide', 'birth')),
  serial_no text not null,
  issued_on date not null default (now() at time zone 'Asia/Karachi')::date,
  issued_by uuid references public.profiles(id) on delete set null default app.me(),
  snapshot jsonb not null default '{}',   -- class, dates and status as printed
  created_at timestamptz not null default now(),
  unique (campus_id, serial_no)
);
create index if not exists student_certificates_student on public.student_certificates (student_id);
alter table public.student_certificates enable row level security;
drop policy if exists "office reads certificates" on public.student_certificates;
create policy "office reads certificates" on public.student_certificates for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());

create or replace function public.issue_certificate(p_student uuid, p_kind text)
returns public.student_certificates language plpgsql security definer set search_path = public as $$
declare s record; c public.student_certificates; n int;
begin
  if not coalesce(app.is_accounts(), false) then raise exception 'Only the office can issue certificates.'; end if;
  select st.*, sec.name as sec_name, cl.name as class_name into s from students st
    left join sections sec on sec.id = st.section_id left join classes cl on cl.id = sec.class_id
    where st.id = p_student and st.campus_id = app.my_campus();
  if s.id is null then raise exception 'Student not found.'; end if;
  perform pg_advisory_xact_lock(hashtext('cert:' || s.campus_id::text));
  select count(*) + 1 into n from student_certificates where campus_id = s.campus_id and extract(year from issued_on) = extract(year from (now() at time zone 'Asia/Karachi'));
  insert into student_certificates (campus_id, student_id, kind, serial_no, snapshot)
  values (s.campus_id, s.id, p_kind, upper(left(p_kind, 2)) || '-' || to_char(now() at time zone 'Asia/Karachi', 'YYYY') || '-' || lpad(n::text, 4, '0'),
          jsonb_build_object('class', s.class_name, 'section', s.sec_name, 'status', s.status, 'admitted_on', s.admitted_on, 'left_on', s.left_on, 'reason', s.leave_reason))
  returning * into c;
  return c;
end $$;
revoke all on function public.issue_certificate(uuid, text) from public, anon;
grant execute on function public.issue_certificate(uuid, text) to authenticated;
