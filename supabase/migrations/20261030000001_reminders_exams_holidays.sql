-- Fee reminders on WhatsApp or SMS, custom exam types, the holiday calendar and notices
-- sent to parents' phones. Everything here only adds; nothing existing is changed or dropped.

-- ---------- Payment modes: only Cash, JazzCash and Easypaisa ----------
-- Old payments keep whatever mode they were saved with ("not valid" skips checking them),
-- every new payment must be one of the three.
alter table public.payments
  add constraint payments_mode_allowed check (mode in ('cash', 'jazzcash', 'easypaisa')) not valid;

-- ---------- Where and how a family gets reminders ----------
-- reminder_phone: the number the family gave for reminders (often not the same as the
-- father's number on file). reminder_channel: what they asked for; 'auto' lets the system choose.
alter table public.families
  add column reminder_phone text,
  add column reminder_channel text not null default 'auto' check (reminder_channel in ('auto', 'whatsapp', 'sms'));

alter table public.admissions
  add column reminder_phone text,
  add column reminder_channel text not null default 'auto' check (reminder_channel in ('auto', 'whatsapp', 'sms'));

-- ---------- Every WhatsApp or SMS the school sends ----------
-- One row per message. 'queued' waits for a WhatsApp or SMS gateway (or for staff to send it
-- from their phone with one tap); 'sent' once it has gone out.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms')),
  to_phone text not null,
  body text not null,
  kind text not null check (kind in ('fee_reminder', 'notice', 'holiday')),
  notice_id uuid references public.notices(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.messages (campus_id, created_at desc);
create index on public.messages (family_id, kind, created_at desc);

alter table public.messages enable row level security;
create policy "accounts read messages" on public.messages for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "accounts write messages" on public.messages for insert to authenticated
  with check (campus_id = app.my_campus() and app.is_accounts());
create policy "accounts update messages" on public.messages for update to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

-- ---------- Exams with any name ----------
alter type public.exam_kind add value if not exists 'other';

-- ---------- Holiday calendar ----------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  title text not null,
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'holiday' check (kind in ('holiday', 'vacation', 'event')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.holidays (campus_id, starts_on);

alter table public.holidays enable row level security;
create policy "campus read holidays" on public.holidays for select to authenticated
  using (campus_id = app.my_campus());
create policy "admin manage holidays" on public.holidays for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
