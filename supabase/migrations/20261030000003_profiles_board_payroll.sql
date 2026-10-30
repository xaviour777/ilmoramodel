-- Full student records (everything the Punjab board's Class 9 registration asks for),
-- full staff records (education, previous schools, bank), salaries and salary advances.
-- Only additions: new columns, new tables, a photos bucket.

-- ---------- Students: the board registration fields ----------
alter table public.students
  add column father_name text,
  add column father_cnic text,
  add column mother_name text,
  add column guardian_occupation text,
  add column religion text,
  add column nationality text not null default 'Pakistani',
  add column address text,
  add column photo_url text,
  add column previous_school text,
  add column last_class_passed text,
  add column blood_group text,
  add column identification_mark text,
  add column disability text,
  add column hafiz_quran boolean not null default false,
  add column board_group text check (board_group in ('science_biology', 'science_computer', 'humanities')),
  add column board_reg_no text;

-- The same details can be taken at the first visit, so admitting the child fills the student record.
alter table public.admissions
  add column father_cnic text,
  add column b_form text,
  add column gender text,
  add column date_of_birth date,
  add column address text,
  add column previous_school text,
  add column last_class_passed text;

-- ---------- Staff: personal, education, experience and bank details ----------
-- Kept apart from profiles because every staff member can read every profile (names on timetables),
-- while CNIC, salary and bank details are only for the office and the person themselves.
create table public.staff_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  designation text,
  cnic text,
  date_of_birth date,
  gender text,
  father_or_husband text,
  marital_status text,
  address text,
  emergency_phone text,
  qualification text,           -- highest: e.g. M.Sc Mathematics
  education text,               -- one line per degree: degree, board/university, year, marks
  experience text,              -- one line per previous school: school, post, years
  joining_date date,
  basic_salary_paisa bigint not null default 0 check (basic_salary_paisa >= 0),
  allowance_paisa bigint not null default 0 check (allowance_paisa >= 0),
  pay_mode text not null default 'bank' check (pay_mode in ('cash', 'bank', 'jazzcash', 'easypaisa')),
  bank_name text,
  account_title text,
  account_no text,              -- IBAN or account number
  wallet_no text,               -- JazzCash / Easypaisa number
  updated_at timestamptz not null default now()
);

-- Money given ahead of salary; it is taken back from salaries in parts.
create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_paisa bigint not null check (amount_paisa > 0),
  monthly_cut_paisa bigint not null default 0 check (monthly_cut_paisa >= 0),
  given_on date not null default current_date,
  reason text,
  given_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.salary_advances (profile_id);

-- One salary slip per person per month.
create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,                         -- first day of the month
  basic_paisa bigint not null default 0,
  allowance_paisa bigint not null default 0,
  bonus_paisa bigint not null default 0,
  absent_days int not null default 0,
  absence_cut_paisa bigint not null default 0,
  other_cut_paisa bigint not null default 0,
  advance_cut_paisa bigint not null default 0,
  net_paisa bigint not null,
  status text not null default 'due' check (status in ('due', 'paid')),
  paid_on date,
  pay_mode text check (pay_mode in ('cash', 'bank', 'jazzcash', 'easypaisa')),
  reference text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, month)
);
create index on public.salary_payments (campus_id, month);

alter table public.staff_details enable row level security;
alter table public.salary_advances enable row level security;
alter table public.salary_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['staff_details', 'salary_advances', 'salary_payments'] loop
    execute format($f$create policy "office manage" on public.%I for all to authenticated
                     using (campus_id = app.my_campus() and app.is_accounts())
                     with check (campus_id = app.my_campus() and app.is_accounts())$f$, t);
    execute format($f$create policy "read own" on public.%I for select to authenticated
                     using (profile_id = app.me())$f$, t);
  end loop;
end $$;
revoke all on public.staff_details, public.salary_advances, public.salary_payments from anon;

-- ---------- Photos of students and staff, taken by the office ----------
-- Public so the photo works on ID cards and board forms; only the office of that campus writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "office upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and app.is_accounts() and (storage.foldername(name))[1] = app.my_campus()::text);
create policy "office replace photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and app.is_accounts() and (storage.foldername(name))[1] = app.my_campus()::text);
create policy "office remove photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and app.is_accounts() and (storage.foldername(name))[1] = app.my_campus()::text);

-- ---------- Messages: payment receipts and payslips go out on WhatsApp/SMS too ----------
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('fee_reminder', 'notice', 'holiday', 'receipt', 'payslip'));
