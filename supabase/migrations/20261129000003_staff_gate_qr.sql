-- Staff check in at the gate by showing a QR code (printed on their staff card, or on their own phone)
-- to the gate phone. The first scan of the day checks them in (late after the campus time),
-- a scan two or more hours later checks them out.

-- A secret per person for their QR code, in its own table so colleagues cannot read each other's
-- (profiles are readable by all staff). A person sees their own; the principal sees all to print cards.
create table if not exists public.staff_badges (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.staff_badges enable row level security;
create policy "own badge" on public.staff_badges for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));
create policy "admin badges" on public.staff_badges for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());

insert into public.staff_badges (profile_id, campus_id)
  select id, campus_id from public.profiles where role in ('owner', 'principal', 'teacher', 'accountant')
  on conflict do nothing;

-- every new staff member gets a badge straight away
create or replace function app.give_staff_badge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('owner', 'principal', 'teacher', 'accountant') then
    insert into public.staff_badges (profile_id, campus_id) values (new.id, new.campus_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists give_staff_badge on public.profiles;
create trigger give_staff_badge after insert or update of role on public.profiles
  for each row execute function app.give_staff_badge();

alter table public.staff_attendance
  add column if not exists check_in_at timestamptz,
  add column if not exists check_out_at timestamptz,
  add column if not exists method text not null default 'manual' check (method in ('manual', 'qr'));

alter table public.campuses
  add column if not exists staff_late_after time not null default '08:00';

create or replace function public.gate_scan(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus uuid := app.my_campus();
  v_person record;
  v_row record;
  v_now timestamptz := now();
  v_day date := (now() at time zone 'Asia/Karachi')::date;
  v_time time := (now() at time zone 'Asia/Karachi')::time;
  v_late time;
  v_status public.attendance_status;
begin
  -- only the office (principal, owner, accountant) can run the gate phone
  if v_campus is null or not app.is_accounts() then
    return json_build_object('ok', false, 'error', 'This phone is not signed in as the school office.');
  end if;
  select p.id, p.full_name, p.role into v_person from public.staff_badges b join public.profiles p on p.id = b.profile_id
    where b.token = p_token and p.campus_id = v_campus and p.is_active and p.role in ('owner', 'principal', 'teacher', 'accountant');
  if not found then
    return json_build_object('ok', false, 'error', 'This card is not known. Print a new card from Staff.');
  end if;

  select * into v_row from public.staff_attendance where profile_id = v_person.id and date = v_day;
  if not found or v_row.check_in_at is null then
    select staff_late_after into v_late from public.campuses where id = v_campus;
    v_status := case when v_time > coalesce(v_late, '08:00') then 'late' else 'present' end;
    insert into public.staff_attendance (campus_id, profile_id, date, status, check_in_at, method)
      values (v_campus, v_person.id, v_day, v_status, v_now, 'qr')
      on conflict (profile_id, date) do update set status = excluded.status, check_in_at = excluded.check_in_at, method = 'qr';
    return json_build_object('ok', true, 'action', 'in', 'name', v_person.full_name, 'status', v_status, 'at', v_now);
  end if;

  if v_row.check_out_at is null and v_now - v_row.check_in_at >= interval '2 hours' then
    update public.staff_attendance set check_out_at = v_now where id = v_row.id;
    return json_build_object('ok', true, 'action', 'out', 'name', v_person.full_name, 'status', v_row.status, 'at', v_now, 'in_at', v_row.check_in_at);
  end if;

  return json_build_object('ok', true, 'action', 'already', 'name', v_person.full_name, 'status', v_row.status, 'at', v_row.check_in_at, 'out_at', v_row.check_out_at);
end;
$$;

revoke all on function public.gate_scan(text) from public, anon;
grant execute on function public.gate_scan(text) to authenticated;
