-- Super admin: every login of a school in one list, and a password reset that works for
-- people who only have a phone number.
--
-- Passwords are never stored or shown: auth keeps only a hash. The super admin resets one,
-- the new password is shown once on screen, and the person changes it later in My profile.
--
-- A person with no email signs in with their mobile number. Their login name is
-- m<92XXXXXXXXXX>@phone.prinqo.app; the login page turns a typed 03xx number into it.

create or replace function app.phone_login(p_phone text) returns text
language sql immutable set search_path = public as $$
  select case when app.mobile_pk(p_phone) is not null then 'm' || app.mobile_pk(p_phone) || '@phone.prinqo.app' end
$$;

-- Everyone at a school (all roles), with what they sign in with. Search by name, email or phone.
create or replace function public.super_school_people(p_school uuid, p_q text default '', p_role text default '')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(btrim(coalesce(p_q, '')));
begin
  perform app.require_super();
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(role, n) from (
        select p.role, count(*) n from profiles p join campuses c on c.id = p.campus_id where c.school_id = p_school group by p.role) x), '{}'),
    'people', coalesce((select jsonb_agg(r order by r->>'role', r->>'name') from (
        select jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'campus', c.name,
                 'email', p.email, 'phone', p.phone, 'active', p.is_active,
                 'login', u.email, 'last_login', u.last_sign_in_at,
                 'can_phone', app.phone_login(p.phone) is not null) r
        from profiles p join campuses c on c.id = p.campus_id left join auth.users u on u.id = p.user_id
        where c.school_id = p_school
          and (coalesce(p_role, '') = '' or p.role = p_role)
          and (q = '' or lower(p.full_name) like '%' || q || '%' or lower(coalesce(p.email, '')) like '%' || q || '%'
               or regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%' and regexp_replace(q, '\D', '', 'g') <> '')
        order by p.role, p.full_name
        limit 300) t), '[]'));
end $$;
revoke all on function public.super_school_people(uuid, text, text) from public, anon;
grant execute on function public.super_school_people(uuid, text, text) to authenticated;

-- Set a new password. Creates the login if the person has none yet (email, else mobile number).
-- Returns the login name to tell the person.
drop function if exists public.super_set_password(uuid, text);
create function public.super_set_password(p_profile uuid, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; sid uuid; em text; ph text; login text;
begin
  perform app.require_super();
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  select p.user_id, c.school_id, p.email, p.phone into uid, sid, em, ph
  from profiles p join campuses c on c.id = p.campus_id where p.id = p_profile;
  if sid is null then raise exception 'Person not found.'; end if;
  if uid is null then
    login := coalesce(nullif(lower(btrim(em)), ''), app.phone_login(ph));
    if login is null then raise exception 'This person has no email or valid mobile number to log in with.'; end if;
    uid := app.make_login(login, p_password);
    if exists (select 1 from profiles where user_id = uid and id <> p_profile) then
      raise exception 'That login already belongs to someone else.';
    end if;
    update profiles set user_id = uid where id = p_profile;
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  select email into login from auth.users where id = uid;
  perform app.audit('password set', sid, jsonb_build_object('profile', p_profile, 'login', login));
  return login;
end $$;
revoke all on function public.super_set_password(uuid, text) from public, anon;
grant execute on function public.super_set_password(uuid, text) to authenticated;

-- ---------- Principal gives staff (and families) a login ----------
-- Owner or principal, for a teacher, office person, parent or student of their own school.
create or replace function public.school_set_login(p_profile uuid, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; sid uuid; em text; ph text; r user_role; login text;
begin
  if not app.is_admin() then raise exception 'Only the principal or owner can give logins.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  select p.user_id, c.school_id, p.email, p.phone, p.role into uid, sid, em, ph, r
  from profiles p join campuses c on c.id = p.campus_id where p.id = p_profile;
  if sid is null or sid <> app.my_school() then raise exception 'Person not found at your school.'; end if;
  if r not in ('teacher', 'accountant', 'parent', 'student') then raise exception 'Ask Prinqo support to reset an owner or principal login.'; end if;
  if uid is null then
    login := coalesce(nullif(lower(btrim(em)), ''), app.phone_login(ph));
    if login is null then raise exception 'Add an email or a mobile number for this person first.'; end if;
    uid := app.make_login(login, p_password);
    if exists (select 1 from profiles where user_id = uid and id <> p_profile) then raise exception 'That email or number already has a login for someone else.'; end if;
    update profiles set user_id = uid where id = p_profile;
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  select email into login from auth.users where id = uid;
  return login;
end $$;
revoke all on function public.school_set_login(uuid, text) from public, anon;
grant execute on function public.school_set_login(uuid, text) to authenticated;

-- ---------- Self sign-up by parents and students, approved by the principal ----------
create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  kind text not null check (kind in ('parent', 'student')),
  full_name text not null,             -- the person signing up
  phone text not null,                 -- 92XXXXXXXXXX, also the login
  child_name text not null,
  class_id uuid references public.classes(id) on delete set null,
  father_name text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  student_id uuid references public.students(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists signup_requests_campus on public.signup_requests (campus_id, status, created_at desc);
alter table public.signup_requests enable row level security;
revoke all on public.signup_requests from anon;
drop policy if exists "admin reads own signups" on public.signup_requests;
create policy "admin reads own signups" on public.signup_requests for select to authenticated
  using (school_id = app.my_school() and app.is_admin());

-- The chosen password, as a bcrypt hash only, in a table nobody can read (no policies).
create table if not exists public.signup_secrets (
  request_id uuid primary key references public.signup_requests(id) on delete cascade,
  password_hash text not null
);
alter table public.signup_secrets enable row level security;
revoke all on public.signup_secrets from anon, authenticated;

create table if not exists public.signup_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), ip_hash text, phone_hash text
);
create index if not exists signup_log_ip on public.signup_log (ip_hash, at);
alter table public.signup_log enable row level security;

-- What the sign-up page needs for one web address: the school's campuses and classes.
create or replace function public.signup_info(p_domain text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('school', s.name,
    'campuses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'classes', coalesce((
        select jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name) order by cl.sort, cl.name) from classes cl where cl.campus_id = c.id), '[]'::jsonb))
        order by c.created_at) from campuses c where c.school_id = s.id), '[]'::jsonb))
  from schools s
  where s.status in ('active', 'trial') and s.custom_domain = lower(split_part(coalesce(p_domain, ''), ':', 1))
  limit 1
$$;
revoke all on function public.signup_info(text) from public;
grant execute on function public.signup_info(text) to anon, authenticated;

create or replace function public.signup_request(p_domain text, p_campus uuid, p_class uuid, p_kind text, p_name text,
  p_phone text, p_child text, p_father text, p_note text, p_password text, p_ip text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sch uuid; mob text; ip text := md5(coalesce(p_ip, '') || ':signup'); ph text; rid uuid;
  nm text := btrim(coalesce(p_name, '')); ch text := btrim(coalesce(p_child, ''));
begin
  select s.id into sch from schools s where s.status in ('active', 'trial') and s.custom_domain = lower(split_part(coalesce(p_domain, ''), ':', 1));
  if sch is null then return jsonb_build_object('error', 'site'); end if;
  if not exists (select 1 from campuses c where c.id = p_campus and c.school_id = sch) then return jsonb_build_object('error', 'campus'); end if;
  if p_class is not null and not exists (select 1 from classes cl where cl.id = p_class and cl.campus_id = p_campus) then return jsonb_build_object('error', 'class'); end if;
  if p_kind not in ('parent', 'student') then return jsonb_build_object('error', 'kind'); end if;
  if length(nm) < 2 or length(nm) > 80 or length(ch) < 2 or length(ch) > 80 then return jsonb_build_object('error', 'name'); end if;
  mob := app.mobile_pk(p_phone);
  if mob is null then return jsonb_build_object('error', 'phone'); end if;
  if length(coalesce(p_password, '')) < 8 or length(p_password) > 72 then return jsonb_build_object('error', 'password'); end if;
  ph := md5(mob || ':signup');
  if (select count(*) from signup_log where ip_hash = ip and at > now() - interval '1 hour') >= 5
     or (select count(*) from signup_log where phone_hash = ph and at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'busy');
  end if;
  insert into signup_log (ip_hash, phone_hash) values (ip, ph);
  insert into signup_requests (school_id, campus_id, kind, full_name, phone, child_name, class_id, father_name, note)
  values (sch, p_campus, p_kind, nm, mob, ch, p_class, nullif(btrim(coalesce(p_father, '')), ''), nullif(left(btrim(coalesce(p_note, '')), 400), ''))
  returning id into rid;
  insert into signup_secrets (request_id, password_hash) values (rid, extensions.crypt(p_password, extensions.gen_salt('bf')));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.signup_request(text, uuid, uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.signup_request(text, uuid, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Approve: link the login to a child already in the school. A parent becomes a guardian of the
-- child's family (one login for all their children); a student gets their own login.
create or replace function public.signup_approve(p_request uuid, p_student uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare rq signup_requests; st students; uid uuid; prof uuid; login text;
begin
  if not app.is_admin() then raise exception 'Only the principal or owner can approve sign-ups.'; end if;
  select * into rq from signup_requests where id = p_request and school_id = app.my_school() and status = 'pending';
  if rq.id is null then raise exception 'This request is not waiting any more.'; end if;
  select s.* into st from students s join campuses c on c.id = s.campus_id where s.id = p_student and c.school_id = rq.school_id;
  if st.id is null then raise exception 'Pick the child from your students.'; end if;
  login := 'm' || rq.phone || '@phone.prinqo.app';
  if rq.kind = 'student' and st.profile_id is not null then raise exception 'This child already has a login.'; end if;

  select id into uid from auth.users where lower(email) = login;
  if uid is null then
    uid := app.make_login(login, md5(gen_random_uuid()::text));
    update auth.users set encrypted_password = (select password_hash from signup_secrets where request_id = rq.id), updated_at = now() where id = uid;
  end if;
  select id into prof from profiles where user_id = uid;
  if prof is null then
    insert into profiles (user_id, campus_id, role, full_name, phone)
    values (uid, st.campus_id, rq.kind::user_role, rq.full_name, '0' || substr(rq.phone, 3)) returning id into prof;
  elsif (select role from profiles where id = prof) <> rq.kind::user_role then
    raise exception 'This mobile number already signs in as someone else at the school.';
  end if;

  if rq.kind = 'parent' then
    insert into family_guardians (campus_id, family_id, profile_id, relation)
    values (st.campus_id, st.family_id, prof, 'guardian') on conflict (family_id, profile_id) do nothing;
  else
    update students set profile_id = prof where id = st.id;
  end if;
  update signup_requests set status = 'approved', student_id = st.id, decided_by = app.me(), decided_at = now() where id = rq.id;
  delete from signup_secrets where request_id = rq.id;
  return '0' || substr(rq.phone, 3);
end $$;
revoke all on function public.signup_approve(uuid, uuid) from public, anon;
grant execute on function public.signup_approve(uuid, uuid) to authenticated;

create or replace function public.signup_reject(p_request uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Only the principal or owner can do this.'; end if;
  update signup_requests set status = 'rejected', decision_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = app.me(), decided_at = now()
  where id = p_request and school_id = app.my_school() and status = 'pending';
  delete from signup_secrets where request_id = p_request and exists (select 1 from signup_requests where id = p_request and status = 'rejected');
end $$;
revoke all on function public.signup_reject(uuid, text) from public, anon;
grant execute on function public.signup_reject(uuid, text) to authenticated;
