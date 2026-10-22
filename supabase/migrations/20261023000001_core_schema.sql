-- Ilmora core schema: schools, people, academics, attendance, homework, exams,
-- staff leave, admissions, notices and fees.
-- Every school-owned table carries campus_id so row-level security stays simple:
-- people only ever see rows of their own campus, and only the rows their role allows.

create schema if not exists app;

-- ---------- Types ----------
create type public.user_role as enum ('owner', 'principal', 'accountant', 'teacher', 'parent', 'student');
create type public.attendance_status as enum ('present', 'absent', 'late', 'leave');
create type public.period_kind as enum ('class', 'break', 'assembly');
create type public.exam_kind as enum ('class_test', 'monthly', 'term', 'sendup', 'final');
create type public.exam_status as enum ('draft', 'date_sheet', 'marks_entry', 'results');
create type public.student_status as enum ('enrolled', 'struck_off', 'left');
create type public.leave_status as enum ('pending', 'approved', 'rejected');
create type public.admission_status as enum ('inquiry', 'test', 'offered', 'admitted', 'declined');
create type public.payment_mode as enum ('cash', 'cheque', 'bank_deposit', 'onebill', 'raast', 'jazzcash', 'easypaisa', 'card');
create type public.ledger_kind as enum ('charge', 'payment', 'concession', 'fine', 'reversal', 'opening_balance');
create type public.notice_audience as enum ('everyone', 'staff', 'parents', 'class', 'section');
create type public.behaviour_kind as enum ('praise', 'concern');

-- ---------- Organisation ----------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

-- A profile is a person in the school. user_id links it to a login once they have one,
-- so teachers, parents and students can be added before they ever sign in.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.profiles (campus_id, role);

-- ---------- Session, terms, classes ----------
create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);
create unique index one_current_session on public.academic_sessions (campus_id) where is_current;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  sort int not null default 0,
  check (ends_on >= starts_on)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  board text,
  sort int not null default 0,
  unique (campus_id, name)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  capacity int not null default 40,
  class_teacher_id uuid references public.profiles(id) on delete set null,
  unique (class_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  unique (campus_id, name)
);

-- Which teacher teaches which subject in which section.
create table public.section_subjects (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  unique (section_id, subject_id)
);

-- ---------- Timings and timetable ----------
create table public.timing_profiles (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,              -- Summer, Winter, Ramadan
  active_from date,
  active_to date,
  is_active boolean not null default false
);
create unique index one_active_timing on public.timing_profiles (campus_id) where is_active;

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  timing_profile_id uuid not null references public.timing_profiles(id) on delete cascade,
  name text not null,
  kind public.period_kind not null default 'class',
  starts_at time not null,
  ends_at time not null,
  sort int not null,
  check (ends_at > starts_at)
);

create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),   -- 1 = Monday
  period_id uuid not null references public.periods(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  unique (section_id, weekday, period_id),
  -- a teacher cannot be in two rooms at once
  unique (teacher_id, weekday, period_id)
);

-- ---------- Families and students ----------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table public.family_guardians (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  relation text not null default 'guardian',
  is_fee_contact boolean not null default false,
  unique (family_id, profile_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete restrict,
  section_id uuid references public.sections(id) on delete set null,
  profile_id uuid unique references public.profiles(id) on delete set null,  -- the student's own login
  full_name text not null,
  roll_no text,
  admission_no text,
  b_form text,
  gender text,
  date_of_birth date,
  status public.student_status not null default 'enrolled',
  admitted_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.students (section_id) where status = 'enrolled';

-- ---------- Attendance ----------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  status public.attendance_status not null,
  note text,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  client_id uuid unique,   -- set by the phone when marked offline, so a retry never double-posts
  unique (student_id, date)
);
create index on public.attendance (campus_id, date);

create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status public.attendance_status not null,
  unique (profile_id, date)
);

-- ---------- Homework, diary, behaviour ----------
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  title text not null,
  instructions text,
  due_on date not null,
  total_marks int,
  attachment_url text,
  notify_parents boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.homework (section_id, due_on);

create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  submitted_at timestamptz,
  checked_at timestamptz,
  marks numeric(6,2),
  remark text,
  unique (homework_id, student_id)
);

create table public.lesson_diary (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  date date not null default current_date,
  topic text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.behaviour_notes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  kind public.behaviour_kind not null,
  note text not null,
  share_with_parents boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Exams and results ----------
create table public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  -- e.g. [{"grade":"A+","min":90},{"grade":"A","min":80}, ...]
  bands jsonb not null
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  name text not null,
  kind public.exam_kind not null,
  starts_on date,
  ends_on date,
  total_marks int not null default 100,
  weight_percent numeric(5,2) not null default 0,   -- share of the final result
  grading_scale_id uuid references public.grading_scales(id) on delete set null,
  status public.exam_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.exam_sections (
  exam_id uuid not null references public.exams(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  primary key (exam_id, section_id)
);

-- The date sheet: one paper per subject per class.
create table public.exam_papers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  paper_date date not null,
  starts_at time,
  ends_at time,
  invigilator_id uuid references public.profiles(id) on delete set null,
  unique (exam_id, class_id, subject_id)
);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  obtained numeric(6,2),
  is_absent boolean not null default false,
  entered_by uuid references public.profiles(id) on delete set null,
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (exam_id, subject_id, student_id)
);

-- ---------- Staff leave and substitutes ----------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  from_on date not null,
  to_on date not null,
  reason text,
  status public.leave_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_on >= from_on)
);

create table public.substitutions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  date date not null,
  timetable_slot_id uuid not null references public.timetable_slots(id) on delete cascade,
  absent_teacher_id uuid references public.profiles(id) on delete set null,
  substitute_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  unique (date, timetable_slot_id)
);

-- ---------- Admissions and notices ----------
create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  child_name text not null,
  guardian_name text not null,
  phone text not null,
  applying_class_id uuid references public.classes(id) on delete set null,
  status public.admission_status not null default 'inquiry',
  test_on date,
  notes text,
  student_id uuid references public.students(id) on delete set null,  -- set once admitted
  created_at timestamptz not null default now()
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  title text not null,
  body text not null,
  audience public.notice_audience not null default 'everyone',
  class_id uuid references public.classes(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Fees (money is whole paisa, never decimals) ----------
create table public.fee_heads (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  priority int not null default 100,   -- lower is paid first
  unique (campus_id, name)
);

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  fee_head_id uuid not null references public.fee_heads(id) on delete cascade,
  amount_paisa bigint not null check (amount_paisa >= 0),
  monthly boolean not null default true,
  unique (class_id, fee_head_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete restrict,
  billing_month date not null,     -- first day of the month
  due_on date not null,
  challan_no text not null,
  created_at timestamptz not null default now(),
  unique (family_id, billing_month),
  unique (campus_id, challan_no)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  fee_head_id uuid references public.fee_heads(id) on delete set null,
  description text not null,
  amount_paisa bigint not null    -- negative for a concession
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount_paisa bigint not null check (amount_paisa > 0),
  mode public.payment_mode not null,
  reference text,
  receipt_no text,
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz not null default now(),
  idempotency_key text not null unique   -- device UUID or gateway transaction id
);

-- Append-only: a correction is a new 'reversal' entry, never an edit.
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete restrict,
  kind public.ledger_kind not null,
  amount_paisa bigint not null,     -- positive = family owes more, negative = paid or reduced
  invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  reverses_id uuid references public.ledger_entries(id) on delete restrict,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.ledger_entries (family_id);
