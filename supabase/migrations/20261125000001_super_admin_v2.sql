-- Super admin v2: plans, platform invoices, announcements, and the numbers
-- behind the new platform screens (overview, onboarding, usage, security).
-- Same rule as v1: new tables have RLS on and no policies; everything goes
-- through security-definer functions that first check app.require_super().

-- Plans the platform sells. Prices are editable on /super/plans.
create table if not exists public.platform_plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,30}$'),
  name text not null,
  price_paisa bigint not null default 0 check (price_paisa >= 0),
  max_students int,
  max_campuses int,
  features jsonb not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.platform_plans enable row level security;

insert into public.platform_plans (id, name, price_paisa, max_students, max_campuses, sort, features) values
  ('basic', 'Basic', 1800000, 300, 1, 1, '{"core":"yes","parent_app":"yes","whatsapp":"no","ai_paper":"no","owner":"no","domain":"no","support":"no"}'),
  ('standard', 'Standard', 4500000, 500, 1, 2, '{"core":"yes","parent_app":"yes","whatsapp":"500 a month","ai_paper":"no","owner":"no","domain":"yes","support":"no"}'),
  ('premium', 'Premium', 9600000, 1500, 2, 3, '{"core":"yes","parent_app":"yes","whatsapp":"3,000 a month","ai_paper":"yes","owner":"no","domain":"yes","support":"yes"}'),
  ('enterprise', 'Enterprise', 0, null, null, 4, '{"core":"yes","parent_app":"yes","whatsapp":"Unlimited","ai_paper":"yes","owner":"yes","domain":"yes","support":"yes + manager"}')
on conflict (id) do nothing;

-- Invoices the platform sends to schools. Paid by cash, JazzCash or Easypaisa.
create sequence if not exists public.platform_invoice_no start 1001;
create table if not exists public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('INV-' || nextval('public.platform_invoice_no')),
  school_id uuid not null references public.schools(id) on delete cascade,
  plan text,
  period text not null,
  amount_paisa bigint not null check (amount_paisa >= 0),
  due_on date not null,
  status text not null default 'due' check (status in ('due', 'paid', 'void')),
  paid_on date,
  method text check (method in ('cash', 'jazzcash', 'easypaisa')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists platform_invoices_school on public.platform_invoices (school_id, due_on desc);
alter table public.platform_invoices enable row level security;

-- Announcements from the platform to schools (shown as a banner to staff).
create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  tone text not null default 'info' check (tone in ('info', 'warn')),
  audience text not null default 'all' check (audience in ('all', 'plan', 'city', 'school')),
  audience_value text,
  starts_on date not null default (now() at time zone 'Asia/Karachi')::date,
  ends_on date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table public.platform_announcements enable row level security;

-- Every school with its numbers, for the Schools list (v1 columns + health inputs).
create or replace function public.super_schools() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare month_start date := date_trunc('month', now() at time zone 'Asia/Karachi')::date;
        today date := (now() at time zone 'Asia/Karachi')::date;
begin
  perform app.require_super();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select s.id, s.name, s.city, s.custom_domain, s.logo_url, s.primary_color, s.support_email, s.status, s.trial_ends_on,
             s.plan, s.max_students, s.notes, s.created_at, s.modules,
             (select count(*) from campuses c where c.school_id = s.id) as campuses,
             (select count(*) from students st join campuses c on c.id = st.campus_id where c.school_id = s.id and st.status = 'enrolled') as students,
             (select count(*) from profiles p join campuses c on c.id = p.campus_id where c.school_id = s.id and p.role in ('teacher','principal','accountant','owner') and p.is_active) as staff,
             (select max(u.last_sign_in_at) from profiles p join campuses c on c.id = p.campus_id join auth.users u on u.id = p.user_id where c.school_id = s.id) as last_login,
             (select p.full_name || ' · ' || coalesce(p.email, '') from profiles p join campuses c on c.id = p.campus_id where c.school_id = s.id and p.role = 'principal' order by p.created_at limit 1) as principal,
             (select count(distinct a.date) from attendance a join campuses c on c.id = a.campus_id where c.school_id = s.id and a.date >= today - 30) as attendance_days_30,
             (select count(*) from payments py join campuses c on c.id = py.campus_id where c.school_id = s.id and py.received_at >= month_start) as payments_month,
             (select count(*) from messages m join campuses c on c.id = m.campus_id where c.school_id = s.id and m.created_at >= month_start)
               + (select count(*) from ai_usage a join campuses c on c.id = a.campus_id where c.school_id = s.id and a.at >= month_start) as extras_month,
             (select count(*) from profiles p join campuses c on c.id = p.campus_id join auth.users u on u.id = p.user_id
                where c.school_id = s.id and u.last_sign_in_at >= now() - interval '7 days') as people_7d,
             (select count(*) from platform_invoices i where i.school_id = s.id and i.status = 'due' and i.due_on < today) as overdue,
             (select max(i.due_on) from platform_invoices i where i.school_id = s.id and i.status = 'due') as next_due
      from schools s) x), '[]'::jsonb);
end $$;
grant execute on function public.super_schools() to authenticated;

-- Platform overview: growth, money and what needs attention.
create or replace function public.super_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare month_start date := date_trunc('month', now() at time zone 'Asia/Karachi')::date;
        today date := (now() at time zone 'Asia/Karachi')::date;
begin
  perform app.require_super();
  return jsonb_build_object(
    'students_added_month', (select count(*) from students st where st.created_at >= month_start and st.status = 'enrolled'),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'n',
        (select count(*) from schools s where date_trunc('month', s.created_at at time zone 'Asia/Karachi') = m)) order by m)
        from generate_series(date_trunc('month', month_start) - interval '5 months', month_start, interval '1 month') m), '[]'),
    'collected_month', (select coalesce(sum(amount_paisa), 0) from platform_invoices where status = 'paid' and paid_on >= month_start),
    'billed_month', (select coalesce(sum(amount_paisa), 0) from platform_invoices where status <> 'void' and due_on >= month_start and due_on < month_start + interval '1 month'),
    'overdue_paisa', (select coalesce(sum(amount_paisa), 0) from platform_invoices where status = 'due' and due_on < today),
    'overdue_schools', (select count(distinct school_id) from platform_invoices where status = 'due' and due_on < today),
    'by_method', coalesce((select jsonb_object_agg(method, total) from (select method, sum(amount_paisa) total from platform_invoices
        where status = 'paid' and paid_on >= month_start - interval '2 months' and method is not null group by method) t), '{}'),
    'changes_7d', (select count(*) from platform_audit where at >= now() - interval '7 days'),
    'people_7d', (select count(*) from auth.users u join profiles p on p.user_id = u.id where u.last_sign_in_at >= now() - interval '7 days'),
    'password_resets_30d', (select count(*) from platform_audit where action = 'password set' and at >= now() - interval '30 days'),
    'super_admins', (select count(*) from super_admins)
  );
end $$;
grant execute on function public.super_overview() to authenticated;

-- Setup checklist per school (onboarding).
create or replace function public.super_onboarding() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Karachi')::date;
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
    select s.id, s.name, s.status, s.trial_ends_on, s.created_at,
      (select count(*) from classes k join campuses c on c.id = k.campus_id where c.school_id = s.id) as classes,
      (select count(*) from students st join campuses c on c.id = st.campus_id where c.school_id = s.id and st.status = 'enrolled') as students,
      (select count(*) from profiles p join campuses c on c.id = p.campus_id where c.school_id = s.id and p.role = 'teacher' and p.is_active) as teachers,
      (select count(*) from fee_structures f join campuses c on c.id = f.campus_id where c.school_id = s.id) as fee_rows,
      (select count(distinct a.date) from attendance a join campuses c on c.id = a.campus_id where c.school_id = s.id and a.date >= today - 14) as attendance_days_14,
      (select count(*) from payments py join campuses c on c.id = py.campus_id where c.school_id = s.id) as payments
    from schools s) x), '[]');
end $$;
grant execute on function public.super_onboarding() to authenticated;

-- Usage this month per school: messages, AI and limits.
create or replace function public.super_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare month_start date := date_trunc('month', now() at time zone 'Asia/Karachi')::date;
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(row_to_json(x) order by x.students desc) from (
    select s.id, s.name, s.plan, s.max_students,
      (select count(*) from students st join campuses c on c.id = st.campus_id where c.school_id = s.id and st.status = 'enrolled') as students,
      (select count(*) from campuses c where c.school_id = s.id) as campuses,
      (select count(*) from messages m join campuses c on c.id = m.campus_id where c.school_id = s.id and m.created_at >= month_start and m.channel = 'whatsapp') as whatsapp,
      (select count(*) from messages m join campuses c on c.id = m.campus_id where c.school_id = s.id and m.created_at >= month_start and m.channel = 'sms') as sms,
      (select count(*) from ai_usage a join campuses c on c.id = a.campus_id where c.school_id = s.id and a.at >= month_start) as ai_calls,
      (select coalesce(sum(a.cost_usd), 0) from ai_usage a join campuses c on c.id = a.campus_id where c.school_id = s.id and a.at >= month_start) as ai_usd
    from schools s) x), '[]');
end $$;
grant execute on function public.super_usage() to authenticated;

-- Plans: list and save.
create or replace function public.super_plans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price_paisa', p.price_paisa, 'max_students', p.max_students,
      'max_campuses', p.max_campuses, 'features', p.features, 'sort', p.sort,
      'schools', (select count(*) from schools s where s.plan = p.id),
      'paying', (select count(*) from schools s where s.plan = p.id and s.status = 'active')) order by p.sort, p.name)
    from platform_plans p), '[]');
end $$;
grant execute on function public.super_plans() to authenticated;

create or replace function public.super_save_plan(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare pid text := lower(trim(p->>'id'));
begin
  perform app.require_super();
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Plan name is required.'; end if;
  insert into platform_plans (id, name, price_paisa, max_students, max_campuses, features, sort)
  values (pid, trim(p->>'name'), coalesce(nullif(p->>'price_paisa', '')::bigint, 0), nullif(p->>'max_students', '')::int,
          nullif(p->>'max_campuses', '')::int, coalesce(p->'features', '{}'), coalesce(nullif(p->>'sort', '')::int, 9))
  on conflict (id) do update set name = excluded.name, price_paisa = excluded.price_paisa, max_students = excluded.max_students,
    max_campuses = excluded.max_campuses, features = platform_plans.features || excluded.features;
  perform app.audit('plan saved: ' || pid, null, p);
end $$;
grant execute on function public.super_save_plan(jsonb) to authenticated;

-- Billing: invoices with school names.
create or replace function public.super_invoices() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'school_id', i.school_id, 'school', s.name, 'plan', i.plan,
      'period', i.period, 'amount_paisa', i.amount_paisa, 'due_on', i.due_on, 'status', i.status, 'paid_on', i.paid_on, 'method', i.method,
      'reference', i.reference, 'notes', i.notes, 'created_at', i.created_at) order by i.due_on desc, i.created_at desc)
    from platform_invoices i join schools s on s.id = i.school_id), '[]');
end $$;
grant execute on function public.super_invoices() to authenticated;

create or replace function public.super_create_invoice(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; sid uuid := (p->>'school_id')::uuid; pl text;
begin
  perform app.require_super();
  select plan into pl from schools where id = sid;
  if not found then raise exception 'Choose a school.'; end if;
  if coalesce(nullif(p->>'amount_paisa', '')::bigint, 0) <= 0 then raise exception 'Amount must be more than zero.'; end if;
  insert into platform_invoices (school_id, plan, period, amount_paisa, due_on, notes)
  values (sid, pl, coalesce(nullif(trim(p->>'period'), ''), to_char(now() at time zone 'Asia/Karachi', 'Mon YYYY')),
          (p->>'amount_paisa')::bigint, coalesce(nullif(p->>'due_on', '')::date, (now() at time zone 'Asia/Karachi')::date + 7), nullif(trim(p->>'notes'), ''))
  returning id into v;
  perform app.audit('invoice created', sid, p);
  return v;
end $$;
grant execute on function public.super_create_invoice(jsonb) to authenticated;

-- One invoice per active school at its plan price, for a month (skips schools already billed for it).
create or replace function public.super_bill_month(p_period text, p_due date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform app.require_super();
  insert into platform_invoices (school_id, plan, period, amount_paisa, due_on)
  select s.id, s.plan, p_period, pp.price_paisa, p_due
  from schools s join platform_plans pp on pp.id = s.plan
  where s.status = 'active' and pp.price_paisa > 0
    and not exists (select 1 from platform_invoices i where i.school_id = s.id and i.period = p_period and i.status <> 'void');
  get diagnostics n = row_count;
  perform app.audit('billed ' || n || ' schools for ' || p_period, null, jsonb_build_object('due_on', p_due));
  return n;
end $$;
grant execute on function public.super_bill_month(text, date) to authenticated;

create or replace function public.super_set_invoice(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform app.require_super();
  if p->>'status' = 'paid' and coalesce(p->>'method', '') not in ('cash', 'jazzcash', 'easypaisa') then
    raise exception 'Choose how it was paid: cash, JazzCash or Easypaisa.';
  end if;
  update platform_invoices set
    status = coalesce(nullif(p->>'status', ''), status),
    paid_on = case when p->>'status' = 'paid' then coalesce(nullif(p->>'paid_on', '')::date, (now() at time zone 'Asia/Karachi')::date)
                   when p->>'status' in ('due', 'void') then null else paid_on end,
    method = case when p->>'status' = 'paid' then p->>'method' when p->>'status' in ('due', 'void') then null else method end,
    reference = case when p ? 'reference' then nullif(trim(p->>'reference'), '') else reference end
  where id = p_id returning school_id into sid;
  if sid is null then raise exception 'Invoice not found.'; end if;
  perform app.audit('invoice ' || coalesce(p->>'status', 'updated'), sid, p || jsonb_build_object('invoice', p_id));
end $$;
grant execute on function public.super_set_invoice(uuid, jsonb) to authenticated;

-- Announcements.
create or replace function public.super_announcements() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_super();
  return coalesce((select jsonb_agg(row_to_json(a) order by a.starts_on desc, a.created_at desc) from platform_announcements a), '[]');
end $$;
grant execute on function public.super_announcements() to authenticated;

create or replace function public.super_save_announcement(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform app.require_super();
  if coalesce(trim(p->>'title'), '') = '' then raise exception 'Title is required.'; end if;
  insert into platform_announcements (title, body, tone, audience, audience_value, starts_on, ends_on, created_by)
  values (trim(p->>'title'), nullif(trim(p->>'body'), ''), coalesce(nullif(p->>'tone', ''), 'info'), coalesce(nullif(p->>'audience', ''), 'all'),
          nullif(trim(p->>'audience_value'), ''), coalesce(nullif(p->>'starts_on', '')::date, (now() at time zone 'Asia/Karachi')::date),
          nullif(p->>'ends_on', '')::date, auth.uid())
  returning id into v;
  perform app.audit('announcement: ' || trim(p->>'title'), null, p);
  return v;
end $$;
grant execute on function public.super_save_announcement(jsonb) to authenticated;

create or replace function public.super_end_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_super();
  update platform_announcements set ends_on = (now() at time zone 'Asia/Karachi')::date - 1 where id = p_id;
  perform app.audit('announcement ended', null, jsonb_build_object('id', p_id));
end $$;
grant execute on function public.super_end_announcement(uuid) to authenticated;

-- What the signed-in school's staff should see today.
create or replace function public.my_announcements() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'tone', a.tone) order by a.starts_on desc), '[]')
  from platform_announcements a, schools s
  where s.id = app.my_school()
    and a.starts_on <= (now() at time zone 'Asia/Karachi')::date
    and (a.ends_on is null or a.ends_on >= (now() at time zone 'Asia/Karachi')::date)
    and (a.audience = 'all'
      or (a.audience = 'plan' and lower(a.audience_value) = lower(s.plan))
      or (a.audience = 'city' and lower(a.audience_value) = lower(coalesce(s.city, '')))
      or (a.audience = 'school' and a.audience_value = s.id::text))
$$;
grant execute on function public.my_announcements() to authenticated;
