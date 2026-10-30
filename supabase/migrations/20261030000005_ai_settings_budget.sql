-- AI settings for each campus: which AI company and model, its key, and a daily spending limit.
-- AI calls run in the "ai" edge function, which reads the key with the service role,
-- so teachers, students and parents never see it. Only additions.

create table public.ai_settings (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  enabled boolean not null default false,
  provider text not null default 'claude'
    check (provider in ('claude', 'openai', 'gemini', 'deepseek', 'qwen', 'mistral', 'grok', 'openrouter')),
  model text not null default 'claude-haiku-5-5',
  price_in_usd numeric(10, 4) not null default 0.10 check (price_in_usd >= 0),    -- per 1M input tokens
  price_out_usd numeric(10, 4) not null default 0.50 check (price_out_usd >= 0),  -- per 1M output tokens
  vision boolean not null default true,                                           -- model can read answer photos
  daily_budget_usd numeric(8, 2) not null default 1.00 check (daily_budget_usd >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- One key per company, so switching back and forth doesn't mean pasting keys again.
create table public.ai_keys (
  campus_id uuid not null references public.campuses(id) on delete cascade,
  provider text not null,
  api_key text not null,
  updated_at timestamptz not null default now(),
  primary key (campus_id, provider)
);

-- Every AI call with its tokens and cost, written only by the edge function.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  at timestamptz not null default now(),
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ok boolean not null default true,
  profile_id uuid references public.profiles(id) on delete set null
);
create index on public.ai_usage (campus_id, at desc);

alter table public.ai_settings enable row level security;
alter table public.ai_keys enable row level security;
alter table public.ai_usage enable row level security;

create policy "admin manage ai settings" on public.ai_settings for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "admin manage ai keys" on public.ai_keys for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "admin read ai usage" on public.ai_usage for select to authenticated
  using (campus_id = app.my_campus() and app.is_admin());
revoke all on public.ai_settings, public.ai_keys, public.ai_usage from anon;

-- Start of today in Pakistan time, which is when the daily budget starts again.
create or replace function app.pk_day_start() returns timestamptz
language sql stable set search_path = public as $$
  select (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi'
$$;

-- Whether real AI is ready for the signed-in person's campus, for showing "Demo AI" or not.
-- Never returns the key.
create or replace function public.ai_status()
returns table (ready boolean, provider text, model text, vision boolean, spent_today numeric, daily_budget numeric)
language sql stable security definer set search_path = public as $$
  select s.enabled and k.api_key is not null and coalesce(u.spent, 0) < s.daily_budget_usd,
         s.provider, s.model, s.vision, coalesce(u.spent, 0), s.daily_budget_usd
    from public.ai_settings s
    left join public.ai_keys k on k.campus_id = s.campus_id and k.provider = s.provider
    left join lateral (select sum(cost_usd) as spent from public.ai_usage
                        where campus_id = s.campus_id and at >= app.pk_day_start()) u on true
   where s.campus_id = app.my_campus()
$$;
revoke all on function public.ai_status() from public, anon;
grant execute on function public.ai_status() to authenticated;

-- Today's AI spend for one campus, for the edge function's budget check (service role only).
create or replace function public.ai_spent_today(p_campus uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from public.ai_usage where campus_id = p_campus and at >= app.pk_day_start()
$$;
revoke all on function public.ai_spent_today(uuid) from public, anon, authenticated;
grant execute on function public.ai_spent_today(uuid) to service_role;
