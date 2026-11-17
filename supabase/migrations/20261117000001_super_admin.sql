-- Super admin (platform owner): add schools, set trials, domains and status.
-- Everything here runs through security-definer functions that first check the
-- caller is in super_admins. The new tables have RLS on and no policies, so
-- nobody can read or write them directly from the app.

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.super_admins enable row level security;

create table if not exists public.platform_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  school_id uuid references public.schools(id) on delete set null,
  detail jsonb not null default '{}'
);
alter table public.platform_audit enable row level security;

alter table public.schools
  add column if not exists status text not null default 'active',
  add column if not exists trial_ends_on date,
  add column if not exists plan text not null default 'standard',
  add column if not exists max_students int,
  add column if not exists notes text;
alter table public.schools drop constraint if exists schools_status_check,
  add constraint schools_status_check check (status in ('trial', 'active', 'suspended'));

create or replace function app.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid())
$$;
grant execute on function app.is_super() to authenticated;

create or replace function app.require_super() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_super() then raise exception 'Only the platform admin can do this.' using errcode = '42501'; end if;
end $$;

create or replace function app.audit(p_action text, p_school uuid, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.platform_audit (actor, action, school_id, detail) values (auth.uid(), p_action, p_school, coalesce(p_detail, '{}'))
$$;

-- Is the signed-in person a platform admin? (safe for anyone to ask about themselves)
create or replace function public.am_i_super() returns boolean
language sql stable security definer set search_path = public as $$ select app.is_super() $$;
grant execute on function public.am_i_super() to authenticated;

-- A login (auth user + email identity), or the existing one for that email.
create or replace function app.make_login(p_email text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is not null then return uid; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(p_email),
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

-- Every school with its numbers, for the dashboard list.
create or replace function public.super_schools() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_super();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select s.id, s.name, s.city, s.custom_domain, s.logo_url, s.primary_color, s.support_email, s.status, s.trial_ends_on,
             s.plan, s.max_students, s.notes, s.created_at,
             (select count(*) from campuses c where c.school_id = s.id) as campuses,
             (select count(*) from students st join campuses c on c.id = st.campus_id where c.school_id = s.id and st.status = 'enrolled') as students,
             (select count(*) from profiles p join campuses c on c.id = p.campus_id where c.school_id = s.id and p.role in ('teacher','principal','accountant','owner') and p.is_active) as staff,
             (select max(u.last_sign_in_at) from profiles p join campuses c on c.id = p.campus_id join auth.users u on u.id = p.user_id where c.school_id = s.id) as last_login,
             (select p.full_name || ' · ' || coalesce(p.email, '') from profiles p join campuses c on c.id = p.campus_id where c.school_id = s.id and p.role = 'principal' order by p.created_at limit 1) as principal
      from schools s) x), '[]'::jsonb);
end $$;
grant execute on function public.super_schools() to authenticated;

-- One school in detail: campuses, people, usage and its audit trail.
create or replace function public.super_school(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare month_start date := date_trunc('month', now() at time zone 'Asia/Karachi')::date;
begin
  perform app.require_super();
  return jsonb_build_object(
    'school', (select row_to_json(s) from schools s where s.id = p_school),
    'campuses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city,
        'students', (select count(*) from students st where st.campus_id = c.id and st.status = 'enrolled'),
        'classes', (select count(*) from classes k where k.campus_id = c.id))) from campuses c where c.school_id = p_school), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role, 'active', p.is_active,
        'last_login', u.last_sign_in_at) order by p.role, p.full_name)
        from profiles p join campuses c on c.id = p.campus_id left join auth.users u on u.id = p.user_id
        where c.school_id = p_school and p.role in ('owner','principal','accountant')), '[]'),
    'usage', jsonb_build_object(
      'teachers', (select count(*) from profiles p join campuses c on c.id = p.campus_id where c.school_id = p_school and p.role = 'teacher' and p.is_active),
      'families', (select count(*) from families f join campuses c on c.id = f.campus_id where c.school_id = p_school),
      'attendance_days_30', (select count(distinct a.date) from attendance a join campuses c on c.id = a.campus_id where c.school_id = p_school and a.date >= current_date - 30),
      'fees_month_paisa', (select coalesce(sum(py.amount_paisa), 0) from payments py join campuses c on c.id = py.campus_id where c.school_id = p_school and py.received_at >= month_start),
      'messages_month', (select count(*) from messages m join campuses c on c.id = m.campus_id where c.school_id = p_school and m.created_at >= month_start),
      'ai_calls_month', (select count(*) from ai_usage a join campuses c on c.id = a.campus_id where c.school_id = p_school and a.at >= month_start)),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'detail', a.detail) order by a.at desc)
        from (select * from platform_audit where school_id = p_school order by at desc limit 30) a), '[]'));
end $$;
grant execute on function public.super_school(uuid) to authenticated;

-- A new school, ready to use: campus, session and terms, bell timings,
-- Class 1–10 with section A, subjects, grading, fee heads and the principal's login.
create or replace function public.super_create_school(p jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_school uuid; v_campus uuid; v_session uuid; v_timing uuid; v_uid uuid; v_cls uuid;
  y int := extract(year from now() at time zone 'Asia/Karachi')::int;
  start_year int; m int; i int; t int; subj text;
  trial_days int := coalesce(nullif(p->>'trial_days', '')::int, 0);
begin
  perform app.require_super();
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'School name is required.'; end if;
  if coalesce(trim(p->>'principal_email'), '') = '' then raise exception 'Principal email is required.'; end if;
  if exists (select 1 from profiles where lower(email) = lower(trim(p->>'principal_email'))) then
    raise exception 'That principal email is already used at a school.';
  end if;

  insert into schools (name, city, custom_domain, logo_url, primary_color, support_email, status, trial_ends_on, plan, max_students, notes)
  values (trim(p->>'name'), nullif(trim(p->>'city'), ''), nullif(lower(trim(p->>'custom_domain')), ''), nullif(trim(p->>'logo_url'), ''),
          nullif(trim(p->>'primary_color'), ''), nullif(trim(p->>'support_email'), ''),
          case when trial_days > 0 then 'trial' else 'active' end,
          case when trial_days > 0 then (now() at time zone 'Asia/Karachi')::date + trial_days end,
          coalesce(nullif(p->>'plan', ''), 'standard'), nullif(p->>'max_students', '')::int, nullif(trim(p->>'notes'), ''))
  returning id into v_school;

  insert into campuses (school_id, name, city) values (v_school, coalesce(nullif(trim(p->>'campus_name'), ''), 'Main Campus'), nullif(trim(p->>'city'), ''))
  returning id into v_campus;
  insert into campus_settings (campus_id) values (v_campus) on conflict do nothing;

  -- school year April to March
  m := extract(month from now() at time zone 'Asia/Karachi')::int;
  start_year := case when m >= 4 then y else y - 1 end;
  insert into academic_sessions (campus_id, name, starts_on, ends_on, is_current)
  values (v_campus, start_year || '–' || right((start_year + 1)::text, 2), make_date(start_year, 4, 1), make_date(start_year + 1, 3, 31), true)
  returning id into v_session;
  insert into terms (campus_id, session_id, name, starts_on, ends_on, sort) values
    (v_campus, v_session, 'First term', make_date(start_year, 4, 1), make_date(start_year, 9, 30), 1),
    (v_campus, v_session, 'Second term', make_date(start_year, 10, 1), make_date(start_year + 1, 3, 31), 2);

  -- bell timings: assembly, 8 periods of 40 minutes, a break after period 4
  insert into timing_profiles (campus_id, name, is_active) values (v_campus, 'Regular', true) returning id into v_timing;
  insert into periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
    values (v_campus, v_timing, 'Assembly', 'assembly', '07:45', '08:00', 0);
  t := 8 * 60;
  for i in 1..8 loop
    if i = 5 then
      insert into periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
        values (v_campus, v_timing, 'Break', 'break', make_time(t / 60, t % 60, 0), make_time((t + 30) / 60, (t + 30) % 60, 0), 45);
      t := t + 30;
    end if;
    insert into periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
      values (v_campus, v_timing, 'Period ' || i, 'class', make_time(t / 60, t % 60, 0), make_time((t + 40) / 60, (t + 40) % 60, 0), i * 10);
    t := t + 40;
  end loop;

  for i in 1..10 loop
    insert into classes (campus_id, name, sort) values (v_campus, 'Class ' || i, i) returning id into v_cls;
    insert into sections (campus_id, class_id, name, capacity) values (v_campus, v_cls, 'A', 40);
  end loop;
  foreach subj in array array['English', 'Urdu', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'Computer'] loop
    insert into subjects (campus_id, name) values (v_campus, subj);
  end loop;
  insert into grading_scales (campus_id, name, bands) values (v_campus, 'Standard',
    '[{"grade":"A+","min":90},{"grade":"A","min":80},{"grade":"B","min":70},{"grade":"C","min":60},{"grade":"D","min":50},{"grade":"F","min":0}]');
  insert into fee_heads (campus_id, name, priority) values (v_campus, 'Tuition', 10), (v_campus, 'Admission', 5), (v_campus, 'Exam fee', 30);

  v_uid := app.make_login(trim(p->>'principal_email'), p->>'principal_password');
  insert into profiles (user_id, campus_id, role, full_name, email, phone)
  values (v_uid, v_campus, 'principal', coalesce(nullif(trim(p->>'principal_name'), ''), 'Principal'), lower(trim(p->>'principal_email')), nullif(trim(p->>'principal_phone'), ''));

  perform app.audit('school created', v_school, p - 'principal_password');
  return v_school;
end $$;
grant execute on function public.super_create_school(jsonb) to authenticated;

-- Change branding, domain, plan, status or trial.
create or replace function public.super_update_school(p_school uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_super();
  update schools set
    name = coalesce(nullif(trim(p->>'name'), ''), name),
    city = case when p ? 'city' then nullif(trim(p->>'city'), '') else city end,
    custom_domain = case when p ? 'custom_domain' then nullif(lower(trim(p->>'custom_domain')), '') else custom_domain end,
    logo_url = case when p ? 'logo_url' then nullif(trim(p->>'logo_url'), '') else logo_url end,
    primary_color = case when p ? 'primary_color' then nullif(trim(p->>'primary_color'), '') else primary_color end,
    support_email = case when p ? 'support_email' then nullif(trim(p->>'support_email'), '') else support_email end,
    status = coalesce(nullif(p->>'status', ''), status),
    trial_ends_on = case when p ? 'trial_ends_on' then nullif(p->>'trial_ends_on', '')::date else trial_ends_on end,
    plan = coalesce(nullif(p->>'plan', ''), plan),
    max_students = case when p ? 'max_students' then nullif(p->>'max_students', '')::int else max_students end,
    notes = case when p ? 'notes' then nullif(trim(p->>'notes'), '') else notes end
  where id = p_school;
  perform app.audit(coalesce(p->>'_action', 'school updated'), p_school, p - '_action');
end $$;
grant execute on function public.super_update_school(uuid, jsonb) to authenticated;

-- Set a new password for one of a school's people (the principal forgot theirs).
create or replace function public.super_set_password(p_profile uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; sid uuid; em text;
begin
  perform app.require_super();
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  select p.user_id, c.school_id, p.email into uid, sid, em from profiles p join campuses c on c.id = p.campus_id where p.id = p_profile;
  if uid is null then
    if em is null then raise exception 'This person has no email to log in with.'; end if;
    uid := app.make_login(em, p_password);
    update profiles set user_id = uid where id = p_profile;
  else
    update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  end if;
  perform app.audit('password set', sid, jsonb_build_object('profile', p_profile, 'email', em));
end $$;
grant execute on function public.super_set_password(uuid, text) to authenticated;

-- Recent activity across all schools.
create or replace function public.super_audit(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'school', s.name, 'school_id', a.school_id, 'detail', a.detail) order by a.at desc)
    from (select * from platform_audit order by at desc limit least(p_limit, 500)) a left join schools s on s.id = a.school_id), '[]');
end $$;
grant execute on function public.super_audit(int) to authenticated;

revoke execute on function app.make_login(text, text) from public, authenticated, anon;
revoke execute on function app.audit(text, uuid, jsonb) from public, authenticated, anon;
