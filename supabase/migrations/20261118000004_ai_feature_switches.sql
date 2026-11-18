-- On/off switch for each AI feature, per campus. Missing = on.
alter table public.campus_settings add column if not exists ai_features jsonb not null default '{}'::jsonb;

-- Anyone at the campus may ask whether a feature is on (teachers and parents can't read campus_settings).
create or replace function public.ai_feature_enabled(p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.ai_features ->> p_feature)::boolean from campus_settings s where s.campus_id = app.my_campus()), true)
$$;
grant execute on function public.ai_feature_enabled(text) to authenticated;
