-- Card/wallet payments through a gateway (JazzCash hosted page). The parent starts one;
-- only the server's return handler (service key, after checking the gateway's signature) marks it paid.
create table if not exists public.online_payments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  family_id uuid not null references public.families(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount_paisa bigint not null check (amount_paisa >= 100),
  gateway text not null default 'jazzcash' check (gateway in ('jazzcash')),
  ref text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  response_code text,
  response_message text,
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.online_payments enable row level security;
drop policy if exists "read online payments" on public.online_payments;
create policy "read online payments" on public.online_payments for select to authenticated
  using (campus_id = app.my_campus() and (app.is_accounts() or family_id in (select app.my_families())));
drop policy if exists "families start online payments" on public.online_payments;
create policy "families start online payments" on public.online_payments for insert to authenticated
  with check (campus_id = app.my_campus() and family_id in (select app.my_families()) and status = 'pending' and payment_id is null);
