-- Absent messages to parents, the cashier's day close, the defaulter call list,
-- and the expense ledger with categories. Only additions.

-- ---------- Messages: absent alerts and day-close summaries ----------
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('fee_reminder', 'notice', 'holiday', 'receipt', 'payslip', 'absent', 'day_close'));
-- one absent message per child per day, however many times attendance is saved
alter table public.messages add column dedupe_key text;
create unique index messages_dedupe_key on public.messages (dedupe_key) where dedupe_key is not null;

-- 03001234567 / +92 300 1234567 -> 923001234567, anything else -> null (same rule as mobilePK in the app)
create or replace function app.mobile_pk(raw text) returns text
language sql immutable set search_path = public as $$
  select case when d ~ '^3[0-9]{9}$' then '92' || d end
  from (select regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(raw, ''), '\D', '', 'g'),
          '^0092', ''), '^92(3[0-9]{9})$', '\1'), '^0(3[0-9]{9})$', '\1') as d) x
$$;

-- Called after a teacher saves attendance. Teachers can't write the outbox themselves (it holds
-- every parent's number), so this runs as the owner but only for a section the caller teaches.
-- Queues one message per absent child; a child marked present again loses the unsent message.
create or replace function public.queue_absent_messages(p_section uuid, p_date date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (app.is_admin() or app.teaches_section(p_section)) then
    raise exception 'Not your section';
  end if;
  if exists (select 1 from public.campus_settings where campus_id = app.my_campus() and not absent_alerts) then
    return 0;
  end if;
  update public.messages m set status = 'cancelled'
   where m.status = 'queued' and m.kind = 'absent'
     and m.dedupe_key in (
       select 'absent:' || a.student_id || ':' || p_date from public.attendance a
        where a.section_id = p_section and a.date = p_date and a.status <> 'absent');
  insert into public.messages (campus_id, family_id, channel, to_phone, body, kind, status, dedupe_key)
  select s.campus_id, f.id,
         case when f.reminder_channel = 'sms' then 'sms' else 'whatsapp' end,
         app.mobile_pk(coalesce(f.reminder_phone, f.phone)),
         'Assalam-o-Alaikum. ' || s.full_name || ' (' || c.name || '-' || sec.name || ') aaj '
           || to_char(p_date, 'DD Mon') || ' ko school mein haazir nahi hai. Agar chhutti thi to class teacher ko bata dein. '
           || cp.name,
         'absent', 'queued', 'absent:' || s.id || ':' || p_date
    from public.attendance a
    join public.students s on s.id = a.student_id
    join public.families f on f.id = s.family_id
    join public.sections sec on sec.id = a.section_id
    join public.classes c on c.id = sec.class_id
    join public.campuses cp on cp.id = s.campus_id
   where a.section_id = p_section and a.date = p_date and a.status = 'absent'
     and app.mobile_pk(coalesce(f.reminder_phone, f.phone)) is not null
  on conflict (dedupe_key) where dedupe_key is not null do update
     set status = 'queued' where public.messages.status = 'cancelled';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.queue_absent_messages(uuid, date) from public, anon;
grant execute on function public.queue_absent_messages(uuid, date) to authenticated;

-- Whether this campus wants absent messages at all (on by default).
alter table public.campus_settings add column absent_alerts boolean not null default true;

-- ---------- Cashier's day close ----------
create table public.day_closes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  date date not null,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  cash_received_paisa bigint not null default 0,    -- cash fees taken by this cashier that day
  cash_spent_paisa bigint not null default 0,       -- cash expenses paid by them that day
  jazzcash_paisa bigint not null default 0,
  easypaisa_paisa bigint not null default 0,
  counted_paisa bigint not null,                    -- cash in the drawer when counted
  deposited_paisa bigint not null default 0,        -- taken to the bank or the owner
  deposit_ref text,
  difference_paisa bigint not null,                 -- counted - expected; minus means short
  note text,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (campus_id, date, cashier_id)
);

-- ---------- Defaulter calls and payment promises ----------
create table public.fee_calls (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  result text not null check (result in ('promised', 'no_answer', 'call_later', 'refused', 'wrong_number', 'paid_already')),
  promise_on date,
  promise_paisa bigint check (promise_paisa is null or promise_paisa > 0),
  note text,
  called_by uuid references public.profiles(id) on delete set null,
  called_at timestamptz not null default now()
);
create index on public.fee_calls (family_id, called_at desc);

-- ---------- Expenses ----------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  parent_id uuid references public.expense_categories(id) on delete restrict,  -- null = a main group
  name text not null,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, parent_id, name)
);

-- Append-only like the fee ledger: a wrong entry is voided with a reason, never deleted.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  spent_on date not null default current_date,
  amount_paisa bigint not null check (amount_paisa > 0),
  paid_to text,
  mode text not null default 'cash' check (mode in ('cash', 'bank', 'jazzcash', 'easypaisa', 'cheque')),
  reference text,                                 -- bill no, cheque no, transaction id
  note text,
  voucher_no text,
  voided boolean not null default false,
  void_reason text,
  voided_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.expenses (campus_id, spent_on desc);
create index on public.expenses (category_id);

-- only the void fields may change after an expense is saved
create or replace function app.guard_expense_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.campus_id, new.category_id, new.spent_on, new.amount_paisa, new.mode, new.created_by, new.created_at)
     is distinct from (old.campus_id, old.category_id, old.spent_on, old.amount_paisa, old.mode, old.created_by, old.created_at)
     or (old.voided and not new.voided) then
    raise exception 'An expense can''t be changed. Void it and enter it again.';
  end if;
  return new;
end $$;
create trigger expenses_guard before update on public.expenses
  for each row execute function app.guard_expense_change();

alter table public.day_closes enable row level security;
alter table public.fee_calls enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

do $$
declare t text;
begin
  foreach t in array array['day_closes', 'fee_calls', 'expense_categories'] loop
    execute format($f$create policy "accounts manage" on public.%I for all to authenticated
                     using (campus_id = app.my_campus() and app.is_accounts())
                     with check (campus_id = app.my_campus() and app.is_accounts())$f$, t);
  end loop;
end $$;
create policy "accounts read expenses" on public.expenses for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "accounts add expenses" on public.expenses for insert to authenticated
  with check (campus_id = app.my_campus() and app.is_accounts());
create policy "accounts void expenses" on public.expenses for update to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());
revoke all on public.day_closes, public.fee_calls, public.expense_categories, public.expenses from anon;
