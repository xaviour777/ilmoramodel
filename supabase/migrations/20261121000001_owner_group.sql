-- Owner of a school group: sees every campus of their school. A principal still sees only their campus.

alter table public.campuses
  add column if not exists principal_id uuid references public.profiles(id) on delete set null,
  add column if not exists seat_capacity int,
  add column if not exists status text not null default 'running' check (status in ('running', 'opening')),
  add column if not exists opened_on date,
  add column if not exists admissions_target int;
alter table public.admissions add column if not exists source text;

create or replace function app.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.campuses where id = app.my_campus()
$$;
create or replace function app.is_owner() returns boolean
language sql stable as $$ select coalesce(app.my_role() = 'owner', false) $$;
-- campuses the signed-in person may see as a group: all of the school for the owner, else their own
create or replace function app.my_group_campuses() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.campuses where app.is_owner() and school_id = app.my_school()
  union select app.my_campus()
$$;

drop policy if exists "owner reads group campuses" on public.campuses;
create policy "owner reads group campuses" on public.campuses for select to authenticated
  using (app.is_owner() and school_id = app.my_school());
drop policy if exists "owner manages group campuses" on public.campuses;
create policy "owner manages group campuses" on public.campuses for all to authenticated
  using (app.is_owner() and school_id = app.my_school()) with check (app.is_owner() and school_id = app.my_school());
drop policy if exists "owner edits school" on public.schools;
create policy "owner edits school" on public.schools for update to authenticated
  using (app.is_owner() and id = app.my_school()) with check (app.is_owner() and id = app.my_school());

-- Requests above a principal's limit
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade default app.my_school(),
  campus_id uuid references public.campuses(id) on delete cascade,   -- null = all campuses
  kind text not null check (kind in ('payroll', 'concession', 'expense', 'hiring', 'fee_change', 'other')),
  title text not null check (length(title) between 3 and 200),
  detail text,
  amount_paisa bigint,
  monthly boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_by uuid references public.profiles(id) on delete set null default app.me(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
alter table public.approvals enable row level security;
drop policy if exists "read approvals" on public.approvals;
create policy "read approvals" on public.approvals for select to authenticated
  using (school_id = app.my_school() and (app.is_owner() or (app.is_accounts() and (campus_id = app.my_campus() or requested_by = app.me()))));
drop policy if exists "ask approval" on public.approvals;
create policy "ask approval" on public.approvals for insert to authenticated
  with check (school_id = app.my_school() and app.is_accounts() and status = 'pending' and requested_by = app.me()
              and (campus_id = app.my_campus() or (app.is_owner() and (campus_id is null or campus_id in (select app.my_group_campuses())))));
drop policy if exists "owner decides" on public.approvals;
create policy "owner decides" on public.approvals for update to authenticated
  using (school_id = app.my_school() and app.is_owner()) with check (school_id = app.my_school() and app.is_owner());

create table if not exists public.approval_limits (
  school_id uuid not null references public.schools(id) on delete cascade default app.my_school(),
  kind text not null check (kind in ('payroll', 'concession', 'expense', 'hiring', 'fee_change', 'other')),
  role text not null default 'principal' check (role in ('principal', 'accountant')),
  limit_paisa bigint,          -- null = always needs the owner
  note text,
  primary key (school_id, kind, role)
);
alter table public.approval_limits enable row level security;
drop policy if exists "read limits" on public.approval_limits;
create policy "read limits" on public.approval_limits for select to authenticated using (school_id = app.my_school() and app.is_accounts());
drop policy if exists "owner sets limits" on public.approval_limits;
create policy "owner sets limits" on public.approval_limits for all to authenticated
  using (school_id = app.my_school() and app.is_owner()) with check (school_id = app.my_school() and app.is_owner());

-- Group-wide settings (fee policy, AI budget) and the new-campus checklist
create table if not exists public.group_settings (
  school_id uuid primary key references public.schools(id) on delete cascade default app.my_school(),
  late_fee_paisa bigint not null default 0,
  due_day int not null default 10 check (due_day between 1 and 28),
  sibling_discount_pct numeric(5,2) not null default 0,
  max_concession_pct numeric(5,2) not null default 10,
  hold_results_days int,
  ai_monthly_budget_paisa bigint,
  updated_at timestamptz not null default now()
);
alter table public.group_settings enable row level security;
drop policy if exists "read group settings" on public.group_settings;
create policy "read group settings" on public.group_settings for select to authenticated using (school_id = app.my_school() and app.is_staff());
drop policy if exists "owner group settings" on public.group_settings;
create policy "owner group settings" on public.group_settings for all to authenticated
  using (school_id = app.my_school() and app.is_owner()) with check (school_id = app.my_school() and app.is_owner());

create table if not exists public.campus_checklist (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  item text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  note text,
  sort int not null default 0
);
alter table public.campus_checklist enable row level security;
drop policy if exists "owner checklist" on public.campus_checklist;
create policy "owner checklist" on public.campus_checklist for all to authenticated
  using (campus_id in (select app.my_group_campuses()) and app.is_admin())
  with check (campus_id in (select app.my_group_campuses()) and app.is_admin());

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade default app.my_school(),
  report text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'termly')),
  send_to text,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
alter table public.report_schedules enable row level security;
drop policy if exists "owner schedules" on public.report_schedules;
create policy "owner schedules" on public.report_schedules for all to authenticated
  using (school_id = app.my_school() and app.is_owner()) with check (school_id = app.my_school() and app.is_owner());

-- ---------- Owner numbers (read-only, owner only, campuses of their school) ----------
create or replace function public.owner_campuses(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not app.is_owner() then raise exception 'Owner only.'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'), '[]') into r from (
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'status', c.status, 'opened_on', c.opened_on, 'target', c.admissions_target,
      'principal', coalesce((select full_name from profiles where id = c.principal_id),
                            (select full_name from profiles where campus_id = c.id and role = 'principal' and is_active order by created_at limit 1)),
      'principal_id', coalesce(c.principal_id, (select id from profiles where campus_id = c.id and role = 'principal' and is_active order by created_at limit 1)),
      'seats', coalesce(c.seat_capacity, (select sum(capacity) from sections where campus_id = c.id)),
      'students', (select count(*) from students where campus_id = c.id and status = 'enrolled'),
      'sections', (select count(*) from sections where campus_id = c.id),
      'staff', (select count(*) from profiles where campus_id = c.id and is_active and role in ('principal', 'accountant', 'teacher')),
      'billed', (select coalesce(sum(l.amount_paisa), 0) from invoice_lines l join invoices i on i.id = l.invoice_id where i.campus_id = c.id and i.billing_month between date_trunc('month', p_from)::date and p_to),
      'collected', (select coalesce(sum(amount_paisa), 0) from payments where campus_id = c.id and received_at >= p_from and received_at < p_to + 1),
      'online', (select coalesce(sum(amount_paisa), 0) from payments where campus_id = c.id and received_at >= p_from and received_at < p_to + 1 and mode in ('jazzcash', 'easypaisa', 'raast', 'card', 'onebill', 'bank_deposit')),
      'concessions', (select coalesce(-sum(amount_paisa), 0) from ledger_entries where campus_id = c.id and kind = 'concession' and created_at >= p_from and created_at < p_to + 1),
      'outstanding', (select coalesce(sum(balance_paisa), 0) from family_balances where campus_id = c.id and balance_paisa > 0),
      'owing_families', (select count(*) from family_balances where campus_id = c.id and balance_paisa > 0),
      'expenses', (select coalesce(sum(amount_paisa), 0) from expenses where campus_id = c.id and not voided and spent_on between p_from and p_to),
      'payroll', (select coalesce(sum(net_paisa), 0) from salary_payments where campus_id = c.id and month between date_trunc('month', p_from)::date and p_to),
      'att_marked', (select count(*) from attendance where campus_id = c.id and date between p_from and p_to),
      'att_present', (select count(*) from attendance where campus_id = c.id and date between p_from and p_to and status in ('present', 'late')),
      'results', (select avg(case when m.is_absent or m.obtained is null then 0 else m.obtained / nullif(e.total_marks, 0) end) from marks m join exams e on e.id = m.exam_id
                  where e.campus_id = c.id and coalesce(e.starts_on, e.created_at::date) between p_from - 120 and p_to),
      'pass', (select avg(case when s.v >= 0.4 then 1.0 else 0 end) from (select m.student_id, avg(case when m.is_absent or m.obtained is null then 0 else m.obtained / nullif(e.total_marks, 0) end) v
                  from marks m join exams e on e.id = m.exam_id where e.campus_id = c.id and coalesce(e.starts_on, e.created_at::date) between p_from - 120 and p_to group by 1) s),
      'praise', (select count(*) from feedback where campus_id = c.id and kind = 'praise' and created_at >= p_from - 90 and created_at < p_to + 1),
      'complaints', (select count(*) from feedback where campus_id = c.id and kind = 'complaint' and created_at >= p_from - 90 and created_at < p_to + 1),
      'inquiries', (select count(*) from admissions where campus_id = c.id and created_at >= p_from and created_at < p_to + 1),
      'tests', (select count(*) from admissions where campus_id = c.id and created_at >= p_from and created_at < p_to + 1 and (test_on is not null or status in ('test', 'offered', 'admitted'))),
      'offers', (select count(*) from admissions where campus_id = c.id and created_at >= p_from and created_at < p_to + 1 and status in ('offered', 'admitted')),
      'joined', (select count(*) from admissions where campus_id = c.id and created_at >= p_from and created_at < p_to + 1 and status = 'admitted'),
      'sources', (select coalesce(jsonb_object_agg(src, n), '{}') from (select coalesce(nullif(source, ''), 'not recorded') src, count(*) n from admissions where campus_id = c.id and status = 'admitted' and created_at >= p_from and created_at < p_to + 1 group by 1) z)
    ) x
    from campuses c where c.school_id = app.my_school()
  ) q;
  return r;
end $$;
grant execute on function public.owner_campuses(date, date) to authenticated;

-- money in and out per month, last p_months months
create or replace function public.owner_months(p_campus uuid, p_months int)
returns table (month date, collected bigint, expenses bigint, payroll bigint, billed bigint)
language sql stable security definer set search_path = public as $$
  with cs as (select id from campuses where app.is_owner() and school_id = app.my_school() and (p_campus is null or id = p_campus)),
  ms as (select generate_series(date_trunc('month', current_date) - make_interval(months => least(greatest(p_months, 1), 24) - 1), date_trunc('month', current_date), interval '1 month')::date m)
  select ms.m,
    (select coalesce(sum(amount_paisa), 0) from payments where campus_id in (select id from cs) and received_at >= ms.m and received_at < (ms.m + interval '1 month'))::bigint,
    (select coalesce(sum(amount_paisa), 0) from expenses where campus_id in (select id from cs) and not voided and spent_on >= ms.m and spent_on < (ms.m + interval '1 month'))::bigint,
    (select coalesce(sum(net_paisa), 0) from salary_payments where campus_id in (select id from cs) and month = ms.m)::bigint,
    (select coalesce(sum(l.amount_paisa), 0) from invoice_lines l join invoices i on i.id = l.invoice_id where i.campus_id in (select id from cs) and i.billing_month = ms.m)::bigint
  from ms order by ms.m
$$;
grant execute on function public.owner_months(uuid, int) to authenticated;

-- expenses by top-level head and campus
create or replace function public.owner_expense_heads(p_from date, p_to date)
returns table (campus_id uuid, head text, amount bigint)
language sql stable security definer set search_path = public as $$
  select e.campus_id, coalesce(p.name, c.name), sum(e.amount_paisa)::bigint
  from expenses e join expense_categories c on c.id = e.category_id left join expense_categories p on p.id = c.parent_id
  where app.is_owner() and e.campus_id in (select id from campuses where school_id = app.my_school()) and not e.voided and e.spent_on between p_from and p_to
  group by 1, 2
$$;
grant execute on function public.owner_expense_heads(date, date) to authenticated;

-- unpaid balances by how long they have been unpaid (from the oldest challan not yet covered)
create or replace function public.owner_fee_aging()
returns table (campus_id uuid, bucket text, families int, amount bigint)
language sql stable security definer set search_path = public as $$
  with fb as (select family_id, campus_id, balance_paisa from family_balances where balance_paisa > 0 and app.is_owner() and campus_id in (select id from campuses where school_id = app.my_school())),
  credit as (select family_id, coalesce(-sum(amount_paisa) filter (where amount_paisa < 0), 0) paid from ledger_entries where family_id in (select family_id from fb) group by 1),
  inv as (select i.family_id, i.due_on, sum(sum(l.amount_paisa)) over (partition by i.family_id order by i.billing_month) cum
          from invoices i join invoice_lines l on l.invoice_id = i.id where i.family_id in (select family_id from fb) group by i.id),
  age as (select fb.family_id, fb.campus_id, fb.balance_paisa, current_date - coalesce((select min(due_on) from inv where inv.family_id = fb.family_id and inv.cum > coalesce(cr.paid, 0)), current_date) d
          from fb left join credit cr on cr.family_id = fb.family_id)
  select campus_id, case when d < 30 then '1 · under 30 days' when d < 60 then '2 · 30–60 days' when d < 90 then '3 · 60–90 days' else '4 · over 90 days' end,
         count(*)::int, sum(balance_paisa)::bigint
  from age group by 1, 2
$$;
grant execute on function public.owner_fee_aging() to authenticated;

-- monthly fee per class, per campus
create or replace function public.owner_fee_structure()
returns table (campus_id uuid, class_name text, class_sort int, monthly bigint)
language sql stable security definer set search_path = public as $$
  select f.campus_id, k.name, k.sort, sum(f.amount_paisa) filter (where f.monthly)::bigint
  from fee_structures f join classes k on k.id = f.class_id
  where app.is_owner() and f.campus_id in (select id from campuses where school_id = app.my_school())
  group by 1, 2, 3
$$;
grant execute on function public.owner_fee_structure() to authenticated;

-- academics: subject average and section results
create or replace function public.owner_academics(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select e.campus_id, s.section_id, sub.name subject, m.student_id,
           case when m.is_absent or m.obtained is null then 0 else m.obtained / nullif(e.total_marks, 0) end v
    from marks m join exams e on e.id = m.exam_id join students s on s.id = m.student_id join subjects sub on sub.id = m.subject_id
    where app.is_owner() and e.campus_id in (select id from campuses where school_id = app.my_school())
      and coalesce(e.starts_on, e.created_at::date) between p_from - 120 and p_to)
  select jsonb_build_object(
    'subjects', (select coalesce(jsonb_agg(jsonb_build_object('campus_id', campus_id, 'subject', subject, 'avg', a, 'n', n)), '[]') from (select campus_id, subject, avg(v) a, count(*) n from m group by 1, 2) z),
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('campus_id', z.campus_id, 'section', k.name || '-' || x.name, 'avg', z.a, 'weak', z.weak)), '[]')
                 from (select campus_id, section_id, avg(v) a, (select subject from m m2 where m2.section_id = m.section_id group by subject order by avg(v) limit 1) weak from m group by 1, 2) z
                 join sections x on x.id = z.section_id join classes k on k.id = x.class_id),
    'top', (select count(*) from (select student_id from m group by 1 having avg(v) >= 0.8) t)
  )
$$;
grant execute on function public.owner_academics(date, date) to authenticated;

-- staff overview for the owner: people per campus and role
create or replace function public.owner_staff()
returns table (id uuid, campus_id uuid, full_name text, role text, phone text, is_active boolean, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.campus_id, p.full_name, p.role::text, p.phone, p.is_active, p.email from profiles p
  where app.is_owner() and p.campus_id in (select id from campuses where school_id = app.my_school()) and p.role in ('owner', 'principal', 'accountant', 'teacher')
$$;
grant execute on function public.owner_staff() to authenticated;
