-- Phone push notifications (Web Push). Each device a person turns alerts on for is one row.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade default app.me(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own devices" on public.push_subscriptions;
create policy "own devices" on public.push_subscriptions for all to authenticated
  using (profile_id = app.me()) with check (profile_id = app.me() and campus_id = app.my_campus());

-- Devices to alert, for staff sending something: the given people, plus the parents and
-- student accounts of the given students. Only people in the caller's campus.
create or replace function public.push_targets(p_profiles uuid[], p_students uuid[], p_sections uuid[])
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  with who as (
    select unnest(coalesce(p_profiles, '{}')) as pid
    union select g.profile_id from family_guardians g join students s on s.family_id = g.family_id
      where s.id = any(coalesce(p_students, '{}')) or (s.section_id = any(coalesce(p_sections, '{}')) and s.status = 'enrolled')
    union select s.profile_id from students s
      where s.profile_id is not null and (s.id = any(coalesce(p_students, '{}')) or (s.section_id = any(coalesce(p_sections, '{}')) and s.status = 'enrolled'))
  )
  select ps.endpoint, ps.p256dh, ps.auth from push_subscriptions ps
  where app.is_staff() and ps.campus_id = app.my_campus() and ps.profile_id in (select pid from who)
$$;
grant execute on function public.push_targets(uuid[], uuid[], uuid[]) to authenticated;

-- a device that the push service says is gone is removed by whoever tried to reach it
create or replace function public.push_forget(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and campus_id = app.my_campus() and app.is_staff()
$$;
grant execute on function public.push_forget(text) to authenticated;
