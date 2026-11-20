-- The school's public website (modelschool.edu.pk) and its online admission enquiry.
--
-- One row per school in school_sites. Staff edit `draft`; the principal or owner publishes,
-- which copies it into `published`. Visitors (no login) only ever reach published content,
-- and only through school_site(), for a domain listed in `domains` while status = 'live'.
-- Nothing here touches student records: the site holds school content only.

create table if not exists public.school_sites (
  school_id uuid primary key references public.schools(id) on delete cascade,
  domains text[] not null default '{}',
  status text not null default 'off' check (status in ('off', 'live')),
  draft jsonb not null default '{}',
  draft_state text not null default 'draft' check (draft_state in ('draft', 'in_review')),
  published jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint school_sites_domains_format check (array_to_string(domains, ',') ~ '^[a-z0-9.,-]*$')
);
alter table public.school_sites enable row level security;
revoke all on public.school_sites from anon;

-- a domain points at one school only
create or replace function app.site_domains_unique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from school_sites s where s.school_id <> new.school_id and s.domains && new.domains) then
    raise exception 'One of these web addresses is already used by another school.';
  end if;
  return new;
end $$;
drop trigger if exists site_domains_unique on public.school_sites;
create trigger site_domains_unique before insert or update of domains on public.school_sites
  for each row execute function app.site_domains_unique();

-- The office can write drafts and send them for review; only the principal or owner changes
-- what the public sees (published content, live/off, web addresses).
create or replace function app.guard_site_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if not app.is_admin() and (
       new.published is distinct from old.published or new.status is distinct from old.status
       or new.domains is distinct from old.domains or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by) then
    raise exception 'Only the principal or owner can publish the website.';
  end if;
  new.updated_at := now();
  new.updated_by := app.me();
  return new;
end $$;
drop trigger if exists guard_site_change on public.school_sites;
create trigger guard_site_change before update on public.school_sites
  for each row execute function app.guard_site_change();

drop policy if exists "office reads own site" on public.school_sites;
create policy "office reads own site" on public.school_sites for select to authenticated
  using (school_id = app.my_school() and app.is_accounts());
drop policy if exists "office edits own site" on public.school_sites;
create policy "office edits own site" on public.school_sites for update to authenticated
  using (school_id = app.my_school() and app.is_accounts())
  with check (school_id = app.my_school() and app.is_accounts());
drop policy if exists "admin starts own site" on public.school_sites;
create policy "admin starts own site" on public.school_sites for insert to authenticated
  with check (school_id = app.my_school() and app.is_admin());

-- Publish the current draft (principal / owner only), or take the site off line.
create or replace function public.site_publish() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz := now();
begin
  if not app.is_admin() then raise exception 'Only the principal or owner can publish the website.'; end if;
  update school_sites set published = draft, published_at = t, published_by = app.me(), status = 'live', draft_state = 'draft'
  where school_id = app.my_school();
  if not found then raise exception 'Save the website once before publishing.'; end if;
  return t;
end $$;
revoke all on function public.site_publish() from public, anon;
grant execute on function public.site_publish() to authenticated;

create or replace function public.site_withdraw() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Only the principal or owner can take the website off line.'; end if;
  update school_sites set status = 'off' where school_id = app.my_school();
end $$;
revoke all on function public.site_withdraw() from public, anon;
grant execute on function public.site_withdraw() to authenticated;

-- What a visitor's browser may see for one web address: the published content, the school's
-- name and logo, and its campuses and classes for the enquiry form. Nothing else.
create or replace function public.school_site(p_domain text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'school_id', s.id,
    'name', s.name,
    'logo_url', s.logo_url,
    'content', st.published,
    'published_at', st.published_at,
    'campuses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'classes', coalesce((
        select jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name) order by cl.sort, cl.name)
        from classes cl where cl.campus_id = c.id), '[]'::jsonb)) order by c.created_at)
      from campuses c where c.school_id = s.id), '[]'::jsonb)
  )
  from school_sites st join schools s on s.id = st.school_id
  where st.status = 'live' and st.published is not null
    and lower(split_part(coalesce(p_domain, ''), ':', 1)) = any (st.domains)
  limit 1
$$;
revoke all on function public.school_site(text) from public;
grant execute on function public.school_site(text) to anon, authenticated;

-- The login page also shows the school's name and logo on its website's address.
create or replace function public.school_branding(p_domain text)
returns table (id uuid, name text, logo_url text, primary_color text, support_email text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.logo_url, s.primary_color, s.support_email
  from public.schools s
  where s.custom_domain = lower(split_part(p_domain, ':', 1))
     or exists (select 1 from public.school_sites st where st.school_id = s.id and lower(split_part(p_domain, ':', 1)) = any (st.domains))
  limit 1
$$;
revoke all on function public.school_branding(text) from public;
grant execute on function public.school_branding(text) to anon, authenticated;

-- ---------- Online admission enquiry ----------
alter table public.admissions
  add column if not exists source text,  -- free text, shared with the owner's admissions sources; the website writes 'website'
  add column if not exists enquiry_ref text,
  add column if not exists visit_wanted_on date;
create unique index if not exists admissions_enquiry_ref on public.admissions (enquiry_ref) where enquiry_ref is not null;

-- every website enquiry attempt, to stop floods (no names or numbers kept here)
create table if not exists public.site_enquiry_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  school_id uuid not null,
  ip_hash text,
  phone_hash text
);
create index if not exists site_enquiry_log_ip on public.site_enquiry_log (ip_hash, at);
create index if not exists site_enquiry_log_phone on public.site_enquiry_log (phone_hash, at);
alter table public.site_enquiry_log enable row level security;  -- no policies: only the function below

-- A parent's enquiry from the website lands in the school's Admissions list as an 'inquiry'.
-- Only for a live site; class must belong to the chosen campus of that school.
-- At most 5 per connection per hour and 3 per phone number per day.
create or replace function public.site_enquiry(
  p_domain text, p_campus uuid, p_class uuid, p_child text, p_guardian text, p_phone text,
  p_visit boolean, p_visit_on date, p_message text, p_ip text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  sch uuid; mob text; ref text; ip text := md5(coalesce(p_ip, '') || ':site'); ph text;
  child text := btrim(coalesce(p_child, '')); guardian text := btrim(coalesce(p_guardian, '')); msg text := btrim(coalesce(p_message, ''));
begin
  select st.school_id into sch from school_sites st
  where st.status = 'live' and lower(split_part(coalesce(p_domain, ''), ':', 1)) = any (st.domains);
  if sch is null then return jsonb_build_object('error', 'site'); end if;
  if not exists (select 1 from campuses c where c.id = p_campus and c.school_id = sch) then return jsonb_build_object('error', 'campus'); end if;
  if p_class is not null and not exists (select 1 from classes cl where cl.id = p_class and cl.campus_id = p_campus) then return jsonb_build_object('error', 'class'); end if;
  if length(child) < 2 or length(child) > 80 or length(guardian) < 2 or length(guardian) > 80 then return jsonb_build_object('error', 'name'); end if;
  mob := app.mobile_pk(p_phone);
  if mob is null then return jsonb_build_object('error', 'phone'); end if;
  if length(msg) > 600 then return jsonb_build_object('error', 'message'); end if;
  if p_visit and p_visit_on is not null and (p_visit_on < (now() at time zone 'Asia/Karachi')::date or p_visit_on > (now() at time zone 'Asia/Karachi')::date + 90) then
    return jsonb_build_object('error', 'date');
  end if;
  ph := md5(mob || ':site');
  if (select count(*) from site_enquiry_log where ip_hash = ip and at > now() - interval '1 hour') >= 5
     or (select count(*) from site_enquiry_log where phone_hash = ph and at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'busy');
  end if;
  insert into site_enquiry_log (school_id, ip_hash, phone_hash) values (sch, ip, ph);
  ref := 'MS-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  insert into admissions (campus_id, child_name, guardian_name, phone, applying_class_id, status, notes, source, enquiry_ref, visit_wanted_on, reminder_phone)
  values (p_campus, child, guardian, '0' || substr(mob, 3), p_class, 'inquiry',
          concat_ws(E'\n', 'From the website' || case when p_visit then ', wants a campus visit' || coalesce(' on ' || to_char(p_visit_on, 'DD Mon YYYY'), '') else '' end || ' · ref ' || ref,
                    nullif(msg, '')),
          'website', ref, case when p_visit then p_visit_on end, mob);
  return jsonb_build_object('ref', ref);
end $$;
revoke all on function public.site_enquiry(text, uuid, uuid, text, text, text, boolean, date, text, text) from public;
grant execute on function public.site_enquiry(text, uuid, uuid, text, text, text, boolean, date, text, text) to anon, authenticated;

-- ---------- Website photos ----------
-- Public (they are on the website); only the school's office writes, into its own school folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "office upload site media" on storage.objects;
create policy "office upload site media" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and app.is_accounts() and (storage.foldername(name))[1] = app.my_school()::text);
drop policy if exists "office replace site media" on storage.objects;
create policy "office replace site media" on storage.objects for update to authenticated
  using (bucket_id = 'site' and app.is_accounts() and (storage.foldername(name))[1] = app.my_school()::text);
drop policy if exists "office remove site media" on storage.objects;
create policy "office remove site media" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and app.is_accounts() and (storage.foldername(name))[1] = app.my_school()::text);
