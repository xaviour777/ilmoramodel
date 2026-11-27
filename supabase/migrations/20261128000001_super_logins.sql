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
