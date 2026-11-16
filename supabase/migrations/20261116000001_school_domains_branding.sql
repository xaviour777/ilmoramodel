-- White-label: each school gets its own domain and branding.
-- Data isolation stays as it is: every table carries campus_id and every RLS
-- policy checks app.my_campus() (or the reader's own child/record), and a
-- campus belongs to exactly one school, so one school never sees another's data.

alter table public.schools
  add column if not exists custom_domain text,
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists support_email text;

alter table public.schools
  drop constraint if exists schools_custom_domain_format,
  add constraint schools_custom_domain_format check (custom_domain is null or custom_domain ~ '^[a-z0-9.-]+$'),
  drop constraint if exists schools_primary_color_format,
  add constraint schools_primary_color_format check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$');

create unique index if not exists schools_custom_domain_key on public.schools (custom_domain) where custom_domain is not null;

-- Branding for the login page, before anyone signs in. Returns only public
-- branding fields for one domain, never other rows or columns.
create or replace function public.school_branding(p_domain text)
returns table (id uuid, name text, logo_url text, primary_color text, support_email text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.logo_url, s.primary_color, s.support_email
  from public.schools s
  where s.custom_domain = lower(split_part(p_domain, ':', 1))
  limit 1
$$;
revoke all on function public.school_branding(text) from public;
grant execute on function public.school_branding(text) to anon, authenticated;

-- The school the signed-in person belongs to.
create or replace function app.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select c.school_id from public.campuses c where c.id = app.my_campus()
$$;
grant execute on function app.my_school() to authenticated;
