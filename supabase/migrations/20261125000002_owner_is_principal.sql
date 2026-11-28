-- Owner and principal can be the same person (most small schools).
-- The super admin sets it per school. Then the principal is also the owner
-- ("director") everywhere: one dashboard, approves requests themselves,
-- sees all owner screens. Every owner rule goes through app.is_owner(),
-- so changing it here is enough for the database side.
alter table public.schools add column if not exists owner_is_principal boolean not null default false;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() = 'owner'
    or (app.my_role() = 'principal' and exists (select 1 from schools s where s.id = app.my_school() and s.owner_is_principal)), false)
$$;

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
    notes = case when p ? 'notes' then nullif(trim(p->>'notes'), '') else notes end,
    owner_is_principal = case when p ? 'owner_is_principal' then coalesce((p->>'owner_is_principal')::boolean, false) else owner_is_principal end
  where id = p_school;
  perform app.audit(coalesce(p->>'_action', 'school updated'), p_school, p - '_action');
end $$;
grant execute on function public.super_update_school(uuid, jsonb) to authenticated;
