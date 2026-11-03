-- Timetable review: the principal sends the timetable to teachers, each teacher accepts it or
-- reports a problem, and the principal confirms it. Confirming saves a copy of every section's
-- week that parents and students see, so draft changes don't reach families.
-- Parent payments: parents pay the school's JazzCash or Easypaisa account themselves and send the
-- transaction ID; the fee office checks it and confirms it into a normal payment. Only additions.

create table public.timetable_rounds (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  status text not null default 'review' check (status in ('review', 'confirmed', 'replaced')),  -- replaced: a newer round was sent
  message text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz
);
create index on public.timetable_rounds (campus_id, sent_at desc);

create table public.timetable_acks (
  round_id uuid not null references public.timetable_rounds(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'issue')),
  note text,
  responded_at timestamptz,
  primary key (round_id, teacher_id)
);

-- The confirmed week of one section: [{weekday, period, starts_at, ends_at, sort, subject, teacher}]
create table public.published_timetables (
  section_id uuid primary key references public.sections(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  grid jsonb not null default '[]',
  confirmed_at timestamptz not null default now()
);

alter table public.timetable_rounds enable row level security;
alter table public.timetable_acks enable row level security;
alter table public.published_timetables enable row level security;

create policy "campus read rounds" on public.timetable_rounds for select to authenticated
  using (campus_id = app.my_campus());
create policy "admin write rounds" on public.timetable_rounds for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "admin manage acks" on public.timetable_acks for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "teacher read own ack" on public.timetable_acks for select to authenticated
  using (teacher_id = app.me());
create policy "campus read published timetables" on public.published_timetables for select to authenticated
  using (campus_id = app.my_campus());
create policy "admin write published timetables" on public.published_timetables for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
revoke all on public.timetable_rounds, public.timetable_acks, public.published_timetables from anon;

-- A teacher answers only their own line, and only while the round is still under review.
create or replace function public.answer_timetable(p_round uuid, p_status text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('accepted', 'issue') then raise exception 'Choose accept or report a problem'; end if;
  if p_status = 'issue' and coalesce(trim(p_note), '') = '' then raise exception 'Write what needs to change'; end if;
  update public.timetable_acks a set status = p_status, note = nullif(trim(p_note), ''), responded_at = now()
   where a.round_id = p_round and a.teacher_id = app.me()
     and exists (select 1 from public.timetable_rounds r where r.id = p_round and r.status = 'review');
  return found;
end $$;
revoke all on function public.answer_timetable(uuid, text, text) from public, anon;
grant execute on function public.answer_timetable(uuid, text, text) to authenticated;

-- ---------- Parents paying by wallet ----------
-- The school's own JazzCash and Easypaisa accounts, shown to parents on the Pay screen.
create table public.school_wallets (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  jazzcash_number text,
  jazzcash_title text,
  easypaisa_number text,
  easypaisa_title text,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.school_wallets enable row level security;
create policy "campus read wallets" on public.school_wallets for select to authenticated
  using (campus_id = app.my_campus());
create policy "accounts write wallets" on public.school_wallets for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

-- "I have paid": waits for the fee office, which confirms it into a payment or turns it down.
create table public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount_paisa bigint not null check (amount_paisa > 0),
  mode public.payment_mode not null check (mode in ('jazzcash', 'easypaisa')),
  txn_id text not null check (length(trim(txn_id)) between 4 and 40),
  paid_on date not null default current_date,
  sender_phone text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reason text,
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  unique (campus_id, mode, txn_id)
);
create index on public.payment_claims (campus_id, status, created_at desc);
alter table public.payment_claims enable row level security;
create policy "families read own claims" on public.payment_claims for select to authenticated
  using (family_id in (select app.my_families()));
create policy "families send claims" on public.payment_claims for insert to authenticated
  with check (family_id in (select app.my_families()) and campus_id = app.my_campus()
              and status = 'pending' and payment_id is null and decided_by is null);
create policy "accounts read claims" on public.payment_claims for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "accounts decide claims" on public.payment_claims for update to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());
revoke all on public.school_wallets, public.payment_claims from anon;
