-- WhatsApp module (premium): the school's own numbers linked by QR scan through an
-- Evolution API server, and automatic message flows built on a canvas.

alter table public.schools add column if not exists modules text[] not null default '{}';

-- numbers linked by QR; messages rotate across connected ones
create table if not exists public.wa_numbers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  label text not null,
  instance text not null unique,             -- name on the Evolution API server
  phone text,
  status text not null default 'new' check (status in ('new', 'qr', 'connected', 'disconnected', 'banned')),
  daily_limit int not null default 150 check (daily_limit between 1 and 1000),
  sent_today int not null default 0,
  sent_on date,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.wa_numbers enable row level security;
drop policy if exists "admin wa numbers" on public.wa_numbers;
create policy "admin wa numbers" on public.wa_numbers for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());
drop policy if exists "accounts read wa numbers" on public.wa_numbers;
create policy "accounts read wa numbers" on public.wa_numbers for select to authenticated using (campus_id = app.my_campus() and app.is_accounts());
-- accounts staff send messages too, so they may update the counters
drop policy if exists "accounts count wa numbers" on public.wa_numbers;
create policy "accounts count wa numbers" on public.wa_numbers for update to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

alter table public.messages add column if not exists via_number uuid references public.wa_numbers(id) on delete set null;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('fee_reminder', 'notice', 'holiday', 'receipt', 'payslip', 'absent', 'day_close', 'flow'));

-- flows: a trigger, then steps (wait, check, send) laid out on a canvas
create table if not exists public.wa_flows (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  name text not null,
  trigger text not null check (trigger in ('fee_due', 'absent', 'absent_streak', 'homework', 'result', 'birthday', 'new_admission')),
  nodes jsonb not null default '[]',         -- [{id, type, x, y, data}]
  edges jsonb not null default '[]',         -- [{from, to, branch?}]
  enabled boolean not null default false,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
alter table public.wa_flows enable row level security;
drop policy if exists "admin flows" on public.wa_flows;
create policy "admin flows" on public.wa_flows for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

-- one family (or student) moving through a flow
create table if not exists public.wa_flow_runs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  flow_id uuid not null references public.wa_flows(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  ref text not null,                          -- what started it (invoice id, date…) so it starts once
  node_id text not null,
  next_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'done', 'stopped')),
  log jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (flow_id, ref)
);
create index if not exists wa_flow_runs_due on public.wa_flow_runs (status, next_at);
alter table public.wa_flow_runs enable row level security;
drop policy if exists "admin flow runs" on public.wa_flow_runs;
create policy "admin flow runs" on public.wa_flow_runs for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts()) with check (campus_id = app.my_campus() and app.is_accounts());

-- is the WhatsApp module on for my school?
create or replace function public.has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_module = any(s.modules), false) from schools s where s.id = app.my_school()
$$;
grant execute on function public.has_module(text) to authenticated;

-- the platform admin switches premium modules on or off per school
create or replace function public.super_set_module(p_school uuid, p_module text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_super() then raise exception 'Not allowed.'; end if;
  update schools set modules = case when p_on then array(select distinct unnest(modules || p_module)) else array_remove(modules, p_module) end where id = p_school;
end $$;
grant execute on function public.super_set_module(uuid, text, boolean) to authenticated;
