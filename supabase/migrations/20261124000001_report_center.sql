-- Report Center: every report in one place, run as the signed-in person (row-level security decides
-- what they see), plus saved views and an activity log. Reports return one JSON object per row; the
-- app's catalogue (src/lib/reports/catalog.ts) names the columns and filters.

create table if not exists public.report_saved (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  profile_id uuid not null references public.profiles(id) on delete cascade default app.me(),
  report_id text not null,
  name text not null check (length(name) between 1 and 80),
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.report_saved enable row level security;
drop policy if exists "own saved reports" on public.report_saved;
create policy "own saved reports" on public.report_saved for all to authenticated
  using (campus_id = app.my_campus() and profile_id = app.me())
  with check (campus_id = app.my_campus() and profile_id = app.me());

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  profile_id uuid references public.profiles(id) on delete set null default app.me(),
  report_id text not null,
  filters jsonb not null default '{}',
  via text not null default 'view' check (via in ('view', 'csv', 'print', 'ask')),
  question text,
  answer text,
  row_count int,
  created_at timestamptz not null default now()
);
create index if not exists report_runs_campus_created on public.report_runs (campus_id, created_at desc);
alter table public.report_runs enable row level security;
drop policy if exists "log own report runs" on public.report_runs;
create policy "log own report runs" on public.report_runs for insert to authenticated
  with check (campus_id = app.my_campus() and profile_id = app.me());
drop policy if exists "read report runs" on public.report_runs;
create policy "read report runs" on public.report_runs for select to authenticated
  using (campus_id = app.my_campus() and (profile_id = app.me() or app.is_admin()));

-- columns the report runner reads (when a student left, and why)
alter table public.students add column if not exists left_on date;
alter table public.students add column if not exists leave_reason text;

-- one row per student with their class, family and phone (as the caller may see them)
create or replace view public.report_students with (security_invoker = true) as
  select s.id, s.campus_id, s.admission_no as gr, s.full_name as name, s.father_name as father, s.gender,
         s.date_of_birth as dob, s.status::text as status, s.admitted_on, s.roll_no, s.b_form, s.family_id,
         s.section_id, sec.name as section, c.id as class_id, c.name as class, coalesce(c.sort, 999) as class_sort,
         f.name as family, coalesce(f.phone, f.reminder_phone) as phone, s.left_on, s.leave_reason
  from public.students s
  left join public.sections sec on sec.id = s.section_id
  left join public.classes c on c.id = sec.class_id
  left join public.families f on f.id = s.family_id;
grant select on public.report_students to authenticated;

create or replace function public.report_rows(p_report text, p_f jsonb default '{}')
returns setof jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Karachi')::date;
  v_from date := coalesce(nullif(p_f->>'from', '')::date, date_trunc('month', (now() at time zone 'Asia/Karachi'))::date);
  v_to date := coalesce(nullif(p_f->>'to', '')::date, (now() at time zone 'Asia/Karachi')::date);
  sec uuid := nullif(p_f->>'section', '')::uuid;
  cls uuid := nullif(p_f->>'class', '')::uuid;
  st text := nullif(p_f->>'status', '');
  gen text := nullif(p_f->>'gender', '');
  ex uuid := nullif(p_f->>'exam', '')::uuid;
  van uuid := nullif(p_f->>'van', '')::uuid;
  rte uuid := nullif(p_f->>'route', '')::uuid;
  cat uuid := nullif(p_f->>'category', '')::uuid;
  days int := coalesce(nullif(p_f->>'days', '')::int, 30);
  mon date := coalesce(nullif(p_f->>'month', '')::date, date_trunc('month', (now() at time zone 'Asia/Karachi'))::date);
  t_from timestamptz; t_to timestamptz;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'Reports are for school staff.'; end if;
  if v_to < v_from then v_to := v_from; end if;
  t_from := (v_from::timestamp at time zone 'Asia/Karachi');
  t_to := ((v_to + 1)::timestamp at time zone 'Asia/Karachi');

  case p_report
  -- ================= Students & enrolment =================
  when 'student-roster' then return query
    select to_jsonb(t) from (
      select gr, name, father, class, section, roll_no as roll, gender, dob, phone, status, admitted_on as admitted
      from report_students where status = coalesce(st, 'enrolled')
        and (sec is null or section_id = sec) and (cls is null or class_id = cls) and (gen is null or lower(left(gender, 1)) = lower(left(gen, 1)))
      order by class_sort, section, nullif(regexp_replace(roll_no, '\D', '', 'g'), '')::int nulls last, name limit 5000) t;

  when 'class-strength' then return query
    select to_jsonb(t) from (
      select c.name as class, s.name as section,
             count(st.id) filter (where lower(left(st.gender, 1)) = 'm') as boys, count(st.id) filter (where lower(left(st.gender, 1)) = 'f') as girls,
             count(st.id) as total, s.capacity,
             case when s.capacity > 0 then round(count(st.id)::numeric / s.capacity, 3) end as used
      from sections s join classes c on c.id = s.class_id
      left join students st on st.section_id = s.id and st.status = 'enrolled'
      where (cls is null or c.id = cls)
      group by c.name, c.sort, s.name, s.capacity order by c.sort, s.name) t;

  when 'joiners-leavers' then return query
    select to_jsonb(t) from (
      select class, count(*) filter (where admitted_on between v_from and v_to) as joined,
             count(*) filter (where status = 'left' and left_on between v_from and v_to) as left_school,
             count(*) filter (where status = 'struck_off' and left_on between v_from and v_to) as struck_off,
             count(*) filter (where status = 'passed_out' and left_on between v_from and v_to) as passed_out,
             count(*) filter (where admitted_on between v_from and v_to) - count(*) filter (where status <> 'enrolled' and left_on between v_from and v_to) as net
      from report_students where class is not null and (cls is null or class_id = cls)
      group by class, class_sort order by class_sort) t
    where joined + left_school + struck_off + passed_out > 0;

  when 'sibling-families' then return query
    select to_jsonb(t) from (
      select family, phone, count(*) as children, string_agg(name || coalesce(' (' || class || '-' || section || ')', ''), ', ' order by class_sort) as names
      from report_students where status = 'enrolled' and family_id is not null
      group by family_id, family, phone having count(*) >= 2 order by count(*) desc, family limit 5000) t;

  when 'incomplete-profiles' then return query
    select to_jsonb(t) from (
      select gr, name, class, section, phone,
             concat_ws(', ', case when dob is null then 'date of birth' end, case when coalesce(b_form, '') = '' then 'B-form' end,
                       case when coalesce(phone, '') = '' then 'parent phone' end, case when coalesce(father, '') = '' then 'father''s name' end,
                       case when coalesce(gender, '') = '' then 'gender' end) as missing
      from report_students where status = 'enrolled' and (sec is null or section_id = sec) and (cls is null or class_id = cls)
        and (dob is null or coalesce(b_form, '') = '' or coalesce(phone, '') = '' or coalesce(father, '') = '' or coalesce(gender, '') = '')
      order by class_sort, section, name limit 5000) t;

  when 'student-withdrawn' then return query
    select to_jsonb(t) from (
      select gr, name, father, class, section, status, admitted_on as admitted, left_on, leave_reason as reason, phone
      from report_students where status <> 'enrolled' and (st is null or status = st)
        and (left_on is null or left_on between v_from and v_to or p_f->>'from' is null)
        and (cls is null or class_id = cls)
      order by left_on desc nulls last, name limit 5000) t;

  when 'age-distribution' then return query
    select to_jsonb(t) from (
      select extract(year from age(today, dob))::int as age, count(*) filter (where lower(left(gender, 1)) = 'm') as boys,
             count(*) filter (where lower(left(gender, 1)) = 'f') as girls, count(*) as total
      from report_students where status = 'enrolled' and dob is not null and (cls is null or class_id = cls) and (sec is null or section_id = sec)
      group by 1 order by 1) t;

  when 'enrollment-by-session' then return query
    select to_jsonb(t) from (
      select a.name as session, a.starts_on, a.ends_on,
             (select count(*) from students s where s.admitted_on between a.starts_on and a.ends_on) as admitted,
             (select count(*) from students s where s.status <> 'enrolled' and s.left_on between a.starts_on and a.ends_on) as left_school,
             (select count(*) from students s where s.admitted_on <= a.ends_on and (s.status = 'enrolled' or s.left_on is null or s.left_on > a.ends_on)) as on_roll_at_end
      from academic_sessions a order by a.starts_on desc) t;

  when 'promotion-retention' then return query
    select to_jsonb(t) from (
      select c.name as class, s.name as section,
             count(*) filter (where m.kind = 'promote') as promoted, count(*) filter (where m.kind = 'conditional') as conditional,
             count(*) filter (where m.kind = 'detain') as retained, count(*) filter (where m.kind = 'pass_out') as passed_out,
             count(*) filter (where m.kind in ('leave', 'strike_off')) as left_school
      from student_moves m left join sections s on s.id = m.from_section_id left join classes c on c.id = s.class_id
      where m.undone_at is null and m.kind in ('promote', 'conditional', 'detain', 'pass_out', 'leave', 'strike_off')
        and m.effective_on between v_from and v_to and (cls is null or c.id = cls)
      group by c.name, c.sort, s.name order by c.sort, s.name) t;

  when 'student-churn' then return query
    select to_jsonb(t) from (
      select to_char(m, 'Mon YYYY') as month,
             (select count(*) from students s where date_trunc('month', s.admitted_on) = m) as joined,
             (select count(*) from students s where s.status <> 'enrolled' and date_trunc('month', s.left_on) = m) as left_school,
             (select count(*) from students s where s.admitted_on < m + interval '1 month' and (s.status = 'enrolled' or s.left_on is null or s.left_on >= m + interval '1 month')) as on_roll
      from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') m order by m) t;

  when 'new-admissions' then return query
    select to_jsonb(t) from (
      select admitted_on as admitted, gr, name, father, class, section, gender, phone
      from report_students where admitted_on between v_from and v_to and (cls is null or class_id = cls)
      order by admitted_on desc, name limit 5000) t;

  when 'birthdays' then return query
    select to_jsonb(t) from (
      select to_char(dob, 'DD Mon') as birthday, name, class, section, extract(year from age(mon + interval '1 month' - interval '1 day', dob))::int as turns, phone
      from report_students where status = 'enrolled' and dob is not null and extract(month from dob) = extract(month from mon)
        and (cls is null or class_id = cls) and (sec is null or section_id = sec)
      order by extract(day from dob), name) t;

  -- ================= Admissions =================
  when 'admissions-pipeline' then return query
    select to_jsonb(t) from (
      select coalesce(c.name, 'Not chosen') as class, count(*) filter (where a.status = 'inquiry') as inquiry,
             count(*) filter (where a.status = 'test') as test, count(*) filter (where a.status = 'offered') as offered,
             count(*) filter (where a.status = 'admitted') as admitted, count(*) filter (where a.status = 'declined') as declined,
             count(*) as total, round(count(*) filter (where a.status = 'admitted')::numeric / nullif(count(*), 0), 3) as conversion
      from admissions a left join classes c on c.id = a.applying_class_id
      where a.created_at >= t_from and a.created_at < t_to
      group by c.name, c.sort order by c.sort nulls last) t;

  when 'admissions-list' then return query
    select to_jsonb(t) from (
      select (a.created_at at time zone 'Asia/Karachi')::date as date, a.child_name as child, a.guardian_name as guardian, a.phone,
             c.name as class, a.status::text as status, a.source, a.test_on
      from admissions a left join classes c on c.id = a.applying_class_id
      where a.created_at >= t_from and a.created_at < t_to and (st is null or a.status::text = st) and (cls is null or c.id = cls)
      order by a.created_at desc limit 5000) t;

  when 'admissions-by-source' then return query
    select to_jsonb(t) from (
      select coalesce(nullif(a.source, ''), 'Not recorded') as source, count(*) as inquiries,
             count(*) filter (where a.status = 'admitted') as admitted,
             round(count(*) filter (where a.status = 'admitted')::numeric / nullif(count(*), 0), 3) as conversion
      from admissions a where a.created_at >= t_from and a.created_at < t_to
      group by 1 order by 2 desc) t;

  when 'admission-tests' then return query
    select to_jsonb(t) from (
      select a.test_on, a.child_name as child, a.guardian_name as guardian, a.phone, c.name as class, a.status::text as status
      from admissions a left join classes c on c.id = a.applying_class_id
      where a.test_on between v_from and v_to order by a.test_on, a.child_name) t;

  when 'admissions-followup' then return query
    select to_jsonb(t) from (
      select (a.created_at at time zone 'Asia/Karachi')::date as date, (today - (a.created_at at time zone 'Asia/Karachi')::date) as days_waiting,
             a.child_name as child, a.guardian_name as guardian, a.phone, c.name as class, a.status::text as status, a.notes
      from admissions a left join classes c on c.id = a.applying_class_id
      where a.status in ('inquiry', 'test', 'offered') and a.created_at < now() - make_interval(days => least(days, 365))
      order by a.created_at limit 5000) t;

  -- ================= Attendance =================
  when 'att-daily-register' then return query
    select to_jsonb(t) from (
      select c.name as class, s.name as section,
             count(a.id) filter (where a.status = 'present') as present, count(a.id) filter (where a.status = 'absent') as absent,
             count(a.id) filter (where a.status = 'late') as late, count(a.id) filter (where a.status = 'leave') as on_leave,
             (select count(*) from students x where x.section_id = s.id and x.status = 'enrolled') as on_roll,
             round(count(a.id) filter (where a.status in ('present', 'late'))::numeric / nullif(count(a.id), 0), 3) as rate,
             case when count(a.id) = 0 then 'Not marked' else 'Marked' end as marked
      from sections s join classes c on c.id = s.class_id
      left join attendance a on a.section_id = s.id and a.date = v_to
      where (cls is null or c.id = cls) group by c.name, c.sort, s.id, s.name order by c.sort, s.name) t;

  when 'att-section-summary' then return query
    select to_jsonb(t) from (
      select c.name as class, s.name as section, count(distinct a.date) as days,
             count(*) filter (where a.status = 'absent') as absences, count(*) filter (where a.status = 'late') as lates,
             round(count(*) filter (where a.status in ('present', 'late'))::numeric / nullif(count(*), 0), 3) as rate
      from attendance a join sections s on s.id = a.section_id join classes c on c.id = s.class_id
      where a.date between v_from and v_to and (cls is null or c.id = cls)
      group by c.name, c.sort, s.name order by c.sort, s.name) t;

  when 'att-student-percent' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section, r.roll_no as roll,
             count(a.id) filter (where a.status = 'present') as present, count(a.id) filter (where a.status = 'absent') as absent,
             count(a.id) filter (where a.status = 'late') as late, count(a.id) filter (where a.status = 'leave') as on_leave,
             round(count(a.id) filter (where a.status in ('present', 'late'))::numeric / nullif(count(a.id), 0), 3) as rate
      from report_students r left join attendance a on a.student_id = r.id and a.date between v_from and v_to
      where r.status = 'enrolled' and (sec is null or r.section_id = sec) and (cls is null or r.class_id = cls)
      group by r.gr, r.name, r.class, r.class_sort, r.section, r.roll_no
      order by r.class_sort, r.section, nullif(regexp_replace(r.roll_no, '\D', '', 'g'), '')::int nulls last, r.name limit 5000) t;

  when 'att-chronic-absent' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section, r.phone, count(*) as absent_days,
             max(a.date) as last_absent
      from attendance a join report_students r on r.id = a.student_id
      where a.status = 'absent' and a.date between v_from and v_to and r.status = 'enrolled'
        and (sec is null or r.section_id = sec) and (cls is null or r.class_id = cls)
      group by r.gr, r.name, r.class, r.section, r.phone having count(*) >= coalesce(nullif(p_f->>'min', '')::int, 3)
      order by count(*) desc, r.name limit 5000) t;

  when 'att-not-marked' then return query
    select to_jsonb(t) from (
      select d.date, c.name as class, s.name as section, p.full_name as class_teacher
      from (select distinct date from attendance where date between v_from and v_to) d
      cross join sections s join classes c on c.id = s.class_id left join profiles p on p.id = s.class_teacher_id
      where exists (select 1 from students x where x.section_id = s.id and x.status = 'enrolled')
        and not exists (select 1 from attendance a where a.section_id = s.id and a.date = d.date)
        and (cls is null or c.id = cls)
      order by d.date desc, c.sort, s.name limit 5000) t;

  when 'att-late-comers' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section, count(*) as late_days, max(a.date) as last_late
      from attendance a join report_students r on r.id = a.student_id
      where a.status = 'late' and a.date between v_from and v_to and (sec is null or r.section_id = sec) and (cls is null or r.class_id = cls)
      group by r.gr, r.name, r.class, r.section order by count(*) desc, r.name limit 5000) t;

  when 'att-monthly' then return query
    select to_jsonb(t) from (
      select to_char(date_trunc('month', a.date), 'Mon YYYY') as month, count(distinct a.date) as days,
             round(count(*) filter (where a.status in ('present', 'late'))::numeric / nullif(count(*), 0), 3) as rate,
             count(*) filter (where a.status = 'absent') as absences
      from attendance a left join sections s on s.id = a.section_id
      where a.date between v_from and v_to and (cls is null or s.class_id = cls) and (sec is null or a.section_id = sec)
      group by date_trunc('month', a.date) order by date_trunc('month', a.date)) t;

  when 'student-leave' then return query
    select to_jsonb(t) from (
      select l.from_on, l.to_on, r.name, r.class, r.section, l.reason, l.status
      from student_leave l join report_students r on r.id = l.student_id
      where l.from_on <= v_to and l.to_on >= v_from and (cls is null or r.class_id = cls) and (sec is null or r.section_id = sec)
      order by l.from_on desc limit 5000) t;

  -- ================= Fees & collections =================
  when 'fee-collection-class' then return query
    with lines as (
      select l.amount_paisa, l.invoice_id, c.name as class, c.sort, c.id as class_id
      from invoice_lines l join invoices i on i.id = l.invoice_id
      left join students s on s.id = l.student_id left join sections x on x.id = s.section_id left join classes c on c.id = x.class_id
      where i.billing_month between date_trunc('month', v_from)::date and v_to),
    inv as (select invoice_id, sum(amount_paisa) as due from lines group by 1),
    paid as (select p.invoice_id, sum(p.amount_paisa) as paid from payments p where p.invoice_id in (select invoice_id from inv) group by 1)
    select to_jsonb(t) from (
      select coalesce(class, 'No class') as class, sum(l.amount_paisa) as billed,
             round(sum(l.amount_paisa * least(1, coalesce(pd.paid, 0)::numeric / nullif(i.due, 0)))) as collected,
             round(sum(l.amount_paisa * least(1, coalesce(pd.paid, 0)::numeric / nullif(i.due, 0))) / nullif(sum(l.amount_paisa), 0), 3) as rate
      from lines l join inv i on i.invoice_id = l.invoice_id left join paid pd on pd.invoice_id = l.invoice_id
      where (cls is null or l.class_id = cls)
      group by class, sort order by sort nulls last) t;

  when 'fee-defaulters' then return query
    select to_jsonb(t) from (
      select f.name as family, coalesce(f.phone, f.reminder_phone) as phone, b.balance_paisa as balance,
             (select string_agg(s.full_name, ', ') from students s where s.family_id = f.id and s.status = 'enrolled') as children,
             (select max((p.received_at at time zone 'Asia/Karachi')::date) from payments p where p.family_id = f.id) as last_paid,
             (select c.result || coalesce(' ' || to_char(c.promise_on, 'DD Mon'), '') from fee_calls c where c.family_id = f.id order by c.called_at desc limit 1) as last_call
      from family_balances b join families f on f.id = b.family_id
      where b.balance_paisa >= coalesce(nullif(p_f->>'min', '')::bigint * 100, 1)
        and (cls is null or exists (select 1 from students s join sections x on x.id = s.section_id where s.family_id = f.id and x.class_id = cls and s.status = 'enrolled'))
      order by b.balance_paisa desc limit 5000) t;

  when 'fee-receipts' then return query
    select to_jsonb(t) from (
      select (p.received_at at time zone 'Asia/Karachi')::date as date, to_char(p.received_at at time zone 'Asia/Karachi', 'HH24:MI') as time,
             p.receipt_no as receipt, f.name as family, p.mode::text as mode, p.reference, p.amount_paisa as amount, pr.full_name as received_by
      from payments p join families f on f.id = p.family_id left join profiles pr on pr.id = p.received_by
      where p.received_at >= t_from and p.received_at < t_to and (st is null or p.mode::text = st)
      order by p.received_at limit 5000) t;

  when 'fee-by-mode' then return query
    select to_jsonb(t) from (
      select p.mode::text as mode, count(*) as receipts, sum(p.amount_paisa) as amount
      from payments p where p.received_at >= t_from and p.received_at < t_to group by 1 order by 3 desc) t;

  when 'fee-by-head' then return query
    select to_jsonb(t) from (
      select coalesce(h.name, l.description, 'Other') as head, count(*) as lines, sum(l.amount_paisa) as billed
      from invoice_lines l join invoices i on i.id = l.invoice_id left join fee_heads h on h.id = l.fee_head_id
      where i.billing_month between date_trunc('month', v_from)::date and v_to
      group by 1 order by 3 desc) t;

  when 'fee-cashier' then return query
    select to_jsonb(t) from (
      select coalesce(pr.full_name, 'Online') as cashier, count(*) as receipts,
             sum(p.amount_paisa) filter (where p.mode = 'cash') as cash, sum(p.amount_paisa) filter (where p.mode <> 'cash') as online,
             sum(p.amount_paisa) as amount
      from payments p left join profiles pr on pr.id = p.received_by
      where p.received_at >= t_from and p.received_at < t_to group by 1 order by 5 desc) t;

  when 'fee-concessions' then return query
    select to_jsonb(t) from (
      select (l.created_at at time zone 'Asia/Karachi')::date as date, f.name as family, l.kind::text as kind, -l.amount_paisa as amount, l.note, pr.full_name as by_whom
      from ledger_entries l join families f on f.id = l.family_id left join profiles pr on pr.id = l.created_by
      where l.kind in ('concession', 'reversal') and l.created_at >= t_from and l.created_at < t_to
      order by l.created_at desc limit 5000) t;

  when 'fee-monthly' then return query
    select to_jsonb(t) from (
      select to_char(m, 'Mon YYYY') as month,
             (select coalesce(sum(l.amount_paisa), 0) from invoice_lines l join invoices i on i.id = l.invoice_id where i.billing_month = m::date) as billed,
             (select coalesce(sum(p.amount_paisa), 0) from payments p where p.received_at >= (m::timestamp at time zone 'Asia/Karachi') and p.received_at < ((m + interval '1 month')::timestamp at time zone 'Asia/Karachi')) as collected
      from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') m order by m) t;

  when 'fee-claims' then return query
    select to_jsonb(t) from (
      select c.paid_on, f.name as family, c.mode::text as mode, c.txn_id, c.sender_phone, c.amount_paisa as amount, c.status, c.reason
      from payment_claims c join families f on f.id = c.family_id
      where c.created_at >= t_from and c.created_at < t_to and (st is null or c.status = st)
      order by c.created_at desc limit 5000) t;

  when 'fee-promises' then return query
    select to_jsonb(t) from (
      select (c.called_at at time zone 'Asia/Karachi')::date as called, f.name as family, c.result, c.promise_on, c.promise_paisa as promised,
             b.balance_paisa as balance_now, pr.full_name as called_by
      from fee_calls c join families f on f.id = c.family_id left join family_balances b on b.family_id = f.id left join profiles pr on pr.id = c.called_by
      where c.called_at >= t_from and c.called_at < t_to order by c.called_at desc limit 5000) t;

  -- ================= Finance =================
  when 'day-close' then return query
    select to_jsonb(t) from (
      select d.date, p.full_name as cashier, d.cash_received_paisa as cash_in, d.cash_spent_paisa as cash_out,
             d.jazzcash_paisa as jazzcash, d.easypaisa_paisa as easypaisa, d.counted_paisa as counted, d.difference_paisa as difference, d.deposited_paisa as deposited
      from day_closes d left join profiles p on p.id = d.cashier_id
      where d.date between v_from and v_to order by d.date desc) t;

  when 'expenses-list' then return query
    select to_jsonb(t) from (
      select e.spent_on as date, e.voucher_no as voucher, coalesce(pc.name || ' › ', '') || c.name as category, e.paid_to, e.mode, e.amount_paisa as amount, e.note
      from expenses e left join expense_categories c on c.id = e.category_id left join expense_categories pc on pc.id = c.parent_id
      where not e.voided and e.spent_on between v_from and v_to and (cat is null or c.id = cat or c.parent_id = cat)
      order by e.spent_on, e.created_at limit 5000) t;

  when 'expenses-by-category' then return query
    select to_jsonb(t) from (
      select coalesce(pc.name, c.name, 'Other') as category, count(*) as entries, sum(e.amount_paisa) as amount
      from expenses e left join expense_categories c on c.id = e.category_id left join expense_categories pc on pc.id = c.parent_id
      where not e.voided and e.spent_on between v_from and v_to group by 1 order by 3 desc) t;

  when 'income-expense' then return query
    select to_jsonb(t) from (
      select to_char(m, 'Mon YYYY') as month, x.fees, x.salaries, x.expenses, x.fees - x.salaries - x.expenses as net
      from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') m
      cross join lateral (select
        (select coalesce(sum(p.amount_paisa), 0) from payments p where p.received_at >= (m::timestamp at time zone 'Asia/Karachi') and p.received_at < ((m + interval '1 month')::timestamp at time zone 'Asia/Karachi')) as fees,
        (select coalesce(sum(s.net_paisa), 0) from salary_payments s where s.status = 'paid' and date_trunc('month', s.paid_on) = m) as salaries,
        (select coalesce(sum(e.amount_paisa), 0) from expenses e where not e.voided and date_trunc('month', e.spent_on) = m) as expenses) x
      order by m) t;

  when 'cash-book' then return query
    select to_jsonb(t) from (select * from (
      select d::date as date,
             (select coalesce(sum(p.amount_paisa), 0) from payments p where p.mode = 'cash' and (p.received_at at time zone 'Asia/Karachi')::date = d::date) as cash_in,
             (select coalesce(sum(p.amount_paisa), 0) from payments p where p.mode <> 'cash' and (p.received_at at time zone 'Asia/Karachi')::date = d::date) as online_in,
             (select coalesce(sum(e.amount_paisa), 0) from expenses e where not e.voided and e.mode = 'cash' and e.spent_on = d::date) as cash_out
      from generate_series(v_from, v_to, interval '1 day') d) z where z.cash_in + z.online_in + z.cash_out > 0 order by date) t;

  when 'expenses-voided' then return query
    select to_jsonb(t) from (
      select e.spent_on as date, e.voucher_no as voucher, c.name as category, e.paid_to, e.amount_paisa as amount, e.void_reason as reason, p.full_name as voided_by
      from expenses e left join expense_categories c on c.id = e.category_id left join profiles p on p.id = e.voided_by
      where e.voided and e.spent_on between v_from and v_to order by e.spent_on desc) t;

  -- ================= Payroll & HR =================
  when 'staff-directory' then return query
    select to_jsonb(t) from (
      select p.employee_code as code, p.full_name as name, p.role::text as role, d.designation, p.phone, d.cnic, d.joining_date, d.qualification,
             coalesce(d.basic_salary_paisa, 0) + coalesce(d.allowance_paisa, 0) as salary
      from profiles p left join staff_details d on d.profile_id = p.id
      where p.is_active and p.role::text not in ('parent', 'student') and (st is null or p.role::text = st)
      order by p.role, p.full_name) t;

  when 'payroll-month' then return query
    select to_jsonb(t) from (
      select p.employee_code as code, p.full_name as name, s.basic_paisa as basic, s.allowance_paisa as allowance, s.bonus_paisa as bonus,
             s.absent_days, s.absence_cut_paisa + s.other_cut_paisa + s.advance_cut_paisa as cuts, s.net_paisa as net, s.status, s.pay_mode, s.paid_on
      from salary_payments s join profiles p on p.id = s.profile_id
      where s.month = mon order by p.full_name) t;

  when 'salary-advances' then return query
    select to_jsonb(t) from (
      select a.given_on, p.full_name as name, a.amount_paisa as amount, a.monthly_cut_paisa as monthly_cut, a.reason
      from salary_advances a join profiles p on p.id = a.profile_id
      where a.given_on between v_from and v_to order by a.given_on desc) t;

  when 'staff-attendance' then return query
    select to_jsonb(t) from (
      select p.full_name as name, p.role::text as role,
             count(a.*) filter (where a.status = 'present') as present, count(a.*) filter (where a.status = 'absent') as absent,
             count(a.*) filter (where a.status = 'late') as late, count(a.*) filter (where a.status = 'leave') as on_leave,
             round(count(a.*) filter (where a.status in ('present', 'late'))::numeric / nullif(count(a.*), 0), 3) as rate
      from profiles p left join staff_attendance a on a.profile_id = p.id and a.date between v_from and v_to
      where p.is_active and p.role::text in ('principal', 'teacher', 'accountant', 'driver')
      group by p.id, p.full_name, p.role order by p.full_name) t;

  when 'staff-leave' then return query
    select to_jsonb(t) from (
      select l.from_on, l.to_on, (l.to_on - l.from_on + 1) as days, p.full_name as name, l.reason, l.status::text as status, d.full_name as decided_by
      from leave_requests l join profiles p on p.id = l.profile_id left join profiles d on d.id = l.decided_by
      where l.from_on <= v_to and l.to_on >= v_from order by l.from_on desc) t;

  when 'substitutions' then return query
    select to_jsonb(t) from (
      select s.date, a.full_name as absent_teacher, b.full_name as substitute, c.name || '-' || x.name as section, sub.name as subject, pe.name as period
      from substitutions s left join profiles a on a.id = s.absent_teacher_id left join profiles b on b.id = s.substitute_id
      left join timetable_slots ts on ts.id = s.timetable_slot_id left join sections x on x.id = ts.section_id left join classes c on c.id = x.class_id
      left join subjects sub on sub.id = ts.subject_id left join periods pe on pe.id = ts.period_id
      where s.date between v_from and v_to order by s.date desc, pe.sort) t;

  -- ================= Exams & results =================
  when 'exam-section-results' then return query
    select to_jsonb(t) from (
      select c.name as class, x.name as section, count(distinct m.student_id) as students,
             round(avg(m.obtained / nullif(e.total_marks, 0)), 3) as average,
             round(count(*) filter (where m.obtained * 100 >= e.total_marks * coalesce(cs.pass_mark, 33))::numeric / nullif(count(*), 0), 3) as pass_rate,
             round(max(m.obtained / nullif(e.total_marks, 0)), 3) as best
      from marks m join exams e on e.id = m.exam_id join students s on s.id = m.student_id
      join sections x on x.id = s.section_id join classes c on c.id = x.class_id
      left join campus_settings cs on cs.campus_id = e.campus_id
      where m.exam_id = ex and not m.is_absent and m.obtained is not null and (cls is null or c.id = cls)
      group by c.name, c.sort, x.name order by c.sort, x.name) t;

  when 'exam-subject-average' then return query
    select to_jsonb(t) from (
      select sub.name as subject, count(*) as papers, round(avg(m.obtained / nullif(e.total_marks, 0)), 3) as average,
             round(count(*) filter (where m.obtained * 100 >= e.total_marks * coalesce(cs.pass_mark, 33))::numeric / nullif(count(*), 0), 3) as pass_rate,
             count(*) filter (where m.is_absent) as absent
      from marks m join exams e on e.id = m.exam_id join subjects sub on sub.id = m.subject_id
      join students s on s.id = m.student_id left join sections x on x.id = s.section_id left join campus_settings cs on cs.campus_id = e.campus_id
      where m.exam_id = ex and (m.obtained is not null or m.is_absent) and (sec is null or x.id = sec) and (cls is null or x.class_id = cls)
      group by sub.name order by 3 desc nulls last) t;

  when 'exam-result-sheet' then return query
    select to_jsonb(t) from (
      select r.gr, r.roll_no as roll, r.name, r.class, r.section, sum(m.obtained) as obtained, count(*) * max(e.total_marks) as out_of,
             round(sum(m.obtained) / nullif(count(*) * max(e.total_marks), 0), 3) as percent,
             count(*) filter (where m.is_absent) as absent_papers,
             rank() over (partition by r.section_id order by sum(m.obtained) desc nulls last) as position
      from marks m join exams e on e.id = m.exam_id join report_students r on r.id = m.student_id
      where m.exam_id = ex and (sec is null or r.section_id = sec) and (cls is null or r.class_id = cls)
      group by r.id, r.gr, r.roll_no, r.name, r.class, r.class_sort, r.section, r.section_id
      order by r.class_sort, r.section, position limit 5000) t;

  when 'exam-toppers' then return query
    select to_jsonb(t) from (
      select * from (
        select r.name, r.class, r.section, round(avg(m.obtained / nullif(e.total_marks, 0)), 3) as percent,
               rank() over (order by avg(m.obtained / nullif(e.total_marks, 0)) desc) as position
        from marks m join exams e on e.id = m.exam_id join report_students r on r.id = m.student_id
        where m.exam_id = ex and not m.is_absent and m.obtained is not null and (cls is null or r.class_id = cls) and (sec is null or r.section_id = sec)
        group by r.id, r.name, r.class, r.section) z
      where position <= coalesce(nullif(p_f->>'top', '')::int, 20) order by position) t;

  when 'exam-failures' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section, r.phone,
             string_agg(sub.name || ' ' || m.obtained || '/' || e.total_marks, ', ' order by sub.name) as failed_in, count(*) as subjects_failed
      from marks m join exams e on e.id = m.exam_id join subjects sub on sub.id = m.subject_id join report_students r on r.id = m.student_id
      left join campus_settings cs on cs.campus_id = e.campus_id
      where m.exam_id = ex and not m.is_absent and m.obtained is not null and m.obtained * 100 < e.total_marks * coalesce(cs.pass_mark, 33)
        and (cls is null or r.class_id = cls) and (sec is null or r.section_id = sec)
      group by r.gr, r.name, r.class, r.class_sort, r.section, r.phone order by count(*) desc, r.class_sort, r.name limit 5000) t;

  when 'marks-entry-status' then return query
    select to_jsonb(t) from (
      select c.name as class, x.name as section, sub.name as subject, p.full_name as teacher,
             (select count(*) from students s where s.section_id = x.id and s.status = 'enrolled') as students,
             (select count(*) from marks m join students s on s.id = m.student_id where m.exam_id = ex and m.subject_id = ss.subject_id and s.section_id = x.id and (m.obtained is not null or m.is_absent)) as entered
      from exam_sections es join sections x on x.id = es.section_id join classes c on c.id = x.class_id
      join section_subjects ss on ss.section_id = x.id join subjects sub on sub.id = ss.subject_id left join profiles p on p.id = ss.teacher_id
      where es.exam_id = ex and (cls is null or c.id = cls)
      order by c.sort, x.name, sub.name) t;

  when 'board-results' then return query
    select to_jsonb(t) from (
      select year, class_level as class, appeared, passed, round(passed::numeric / nullif(appeared, 0), 3) as pass_rate, a_plus, average
      from board_results order by year desc, class_level) t;

  -- ================= Timetable & teaching =================
  when 'teacher-load' then return query
    select to_jsonb(t) from (
      select p.full_name as teacher, count(ts.id) as periods_week, count(distinct ts.section_id) as sections,
             string_agg(distinct sub.name, ', ') as subjects
      from profiles p left join timetable_slots ts on ts.teacher_id = p.id left join subjects sub on sub.id = ts.subject_id
      where p.is_active and p.role = 'teacher' group by p.id, p.full_name order by 2 desc, 1) t;

  when 'timetable-coverage' then return query
    select to_jsonb(t) from (
      select c.name as class, x.name as section, count(ts.id) as periods_set,
             count(ts.id) filter (where ts.teacher_id is null) as no_teacher,
             (select coalesce(sum(ss.periods_per_week), 0) from section_subjects ss where ss.section_id = x.id) as periods_needed
      from sections x join classes c on c.id = x.class_id left join timetable_slots ts on ts.section_id = x.id
      where (cls is null or c.id = cls) group by c.name, c.sort, x.id, x.name order by c.sort, x.name) t;

  when 'homework-given' then return query
    select to_jsonb(t) from (
      select c.name as class, x.name as section, sub.name as subject, p.full_name as teacher, count(h.id) as homework, max(h.created_at at time zone 'Asia/Karachi')::date as last_given
      from homework h join sections x on x.id = h.section_id join classes c on c.id = x.class_id
      left join subjects sub on sub.id = h.subject_id left join profiles p on p.id = h.teacher_id
      where h.created_at >= t_from and h.created_at < t_to and (cls is null or c.id = cls) and (sec is null or x.id = sec)
      group by c.name, c.sort, x.name, sub.name, p.full_name order by c.sort, x.name, sub.name) t;

  -- ================= Transport =================
  when 'transport-routes' then return query
    select to_jsonb(t) from (
      select r.name as route, (select count(*) from transport_stops s where s.route_id = r.id) as stops,
             (select string_agg(v.name, ', ') from vans v where v.route_id = r.id) as vehicles,
             (select count(*) from van_students vs join vans v on v.id = vs.van_id join students s on s.id = vs.student_id where v.route_id = r.id and s.status = 'enrolled') as students,
             r.monthly_fee_paisa as fee
      from transport_routes r where r.active order by r.name) t;

  when 'transport-students' then return query
    select to_jsonb(t) from (
      select rs.gr, rs.name, rs.class, rs.section, r.name as route, coalesce(ts.name, vs.stop) as stop, v.name as vehicle, vs.legs, rs.phone
      from van_students vs join report_students rs on rs.id = vs.student_id join vans v on v.id = vs.van_id
      left join transport_routes r on r.id = v.route_id left join transport_stops ts on ts.id = vs.stop_id
      where rs.status = 'enrolled' and (van is null or v.id = van) and (rte is null or v.route_id = rte) and (cls is null or rs.class_id = cls)
      order by r.name, ts.sort, rs.name limit 5000) t;

  when 'vehicle-occupancy' then return query
    select to_jsonb(t) from (
      select v.name as vehicle, v.plate, r.name as route, coalesce(p.full_name, v.driver_name) as driver, v.seats,
             count(s.id) as riders, round(count(s.id)::numeric / nullif(v.seats, 0), 3) as used
      from vans v left join transport_routes r on r.id = v.route_id left join profiles p on p.id = v.driver_profile_id
      left join van_students vs on vs.van_id = v.id left join students s on s.id = vs.student_id and s.status = 'enrolled'
      group by v.id, v.name, v.plate, r.name, p.full_name, v.driver_name, v.seats order by v.name) t;

  when 'trip-log' then return query
    select to_jsonb(t) from (
      select tr.date, v.name as vehicle, tr.leg, coalesce(p.full_name, v.driver_name) as driver,
             to_char(tr.started_at at time zone 'Asia/Karachi', 'HH24:MI') as started, to_char(tr.ended_at at time zone 'Asia/Karachi', 'HH24:MI') as ended,
             (select count(distinct e.student_id) from trip_events e where e.trip_id = tr.id and e.kind = 'boarded') as boarded,
             (select count(distinct e.student_id) from trip_events e where e.trip_id = tr.id and e.kind = 'dropped') as dropped,
             (select count(distinct e.student_id) from trip_events e where e.trip_id = tr.id and e.kind = 'absent') + coalesce(array_length(tr.missing, 1), 0) as absent,
             tr.status
      from van_trips tr join vans v on v.id = tr.van_id left join profiles p on p.id = tr.driver_id
      where tr.date between v_from and v_to and (van is null or v.id = van) order by tr.date desc, v.name, tr.leg) t;

  when 'custody-exceptions' then return query
    select to_jsonb(t) from (
      select tr.date, v.name as vehicle, tr.leg, s.full_name as student, 'Boarded, no drop recorded' as problem,
             to_char(b.at at time zone 'Asia/Karachi', 'HH24:MI') as boarded_at
      from van_trips tr join vans v on v.id = tr.van_id
      join trip_events b on b.trip_id = tr.id and b.kind = 'boarded' join students s on s.id = b.student_id
      where tr.date between v_from and v_to and tr.status = 'closed'
        and not exists (select 1 from trip_events d where d.trip_id = tr.id and d.student_id = b.student_id and d.kind = 'dropped')
      order by tr.date desc, v.name) t;

  when 'transport-costs' then return query
    select to_jsonb(t) from (
      select c.spent_on as date, v.name as vehicle, c.kind, c.liters, c.odometer, c.amount_paisa as amount, c.note
      from vehicle_costs c join vans v on v.id = c.van_id
      where c.spent_on between v_from and v_to and (van is null or v.id = van) order by c.spent_on desc) t;

  when 'transport-cost-summary' then return query
    select to_jsonb(t) from (
      select v.name as vehicle,
             coalesce(sum(c.amount_paisa) filter (where c.kind = 'fuel'), 0) as fuel,
             coalesce(sum(c.amount_paisa) filter (where c.kind in ('maintenance', 'repair')), 0) as maintenance,
             coalesce(sum(c.amount_paisa) filter (where c.kind not in ('fuel', 'maintenance', 'repair')), 0) as other,
             coalesce(sum(c.amount_paisa), 0) as total_cost,
             (select count(*) from van_students vs join students s on s.id = vs.student_id where vs.van_id = v.id and s.status = 'enrolled') * coalesce(r.monthly_fee_paisa, v.monthly_fee_paisa, 0)
               * greatest(1, (extract(year from age(v_to, v_from)) * 12 + extract(month from age(v_to, v_from)))::int + 1) as fee_income
      from vans v left join transport_routes r on r.id = v.route_id
      left join vehicle_costs c on c.van_id = v.id and c.spent_on between v_from and v_to
      group by v.id, v.name, r.monthly_fee_paisa, v.monthly_fee_paisa order by v.name) t;

  when 'sos-log' then return query
    select to_jsonb(t) from (
      select (s.created_at at time zone 'Asia/Karachi')::date as date, to_char(s.created_at at time zone 'Asia/Karachi', 'HH24:MI') as time,
             v.name as vehicle, p.full_name as driver, s.note, s.status, a.full_name as handled_by,
             to_char(s.acked_at at time zone 'Asia/Karachi', 'HH24:MI') as answered_at
      from transport_sos s left join vans v on v.id = s.van_id left join profiles p on p.id = s.driver_id left join profiles a on a.id = s.acked_by
      where s.created_at >= t_from and s.created_at < t_to order by s.created_at desc) t;

  when 'vehicle-papers' then return query
    select to_jsonb(t) from (
      select v.name as vehicle, v.plate, v.fitness_expires_on as fitness, v.insurance_expires_on as insurance, v.route_permit_expires_on as route_permit,
             least(v.fitness_expires_on, v.insurance_expires_on, v.route_permit_expires_on) - today as days_left
      from vans v order by least(v.fitness_expires_on, v.insurance_expires_on, v.route_permit_expires_on) nulls last) t;

  -- ================= Communication & discipline =================
  when 'messages-sent' then return query
    select to_jsonb(t) from (
      select m.kind, m.channel, count(*) as messages, count(*) filter (where m.status = 'sent') as sent,
             count(*) filter (where m.status = 'failed') as failed, count(*) filter (where m.status not in ('sent', 'failed')) as waiting
      from messages m where m.created_at >= t_from and m.created_at < t_to group by 1, 2 order by 3 desc) t;

  when 'message-failures' then return query
    select to_jsonb(t) from (
      select (m.created_at at time zone 'Asia/Karachi')::date as date, f.name as family, m.to_phone as phone, m.channel, m.kind, m.error
      from messages m left join families f on f.id = m.family_id
      where m.status = 'failed' and m.created_at >= t_from and m.created_at < t_to order by m.created_at desc limit 5000) t;

  when 'notices-sent' then return query
    select to_jsonb(t) from (
      select (n.created_at at time zone 'Asia/Karachi')::date as date, n.title, n.audience::text as audience,
             coalesce(c.name, c2.name || '-' || x.name) as for_class, p.full_name as by_whom
      from notices n left join classes c on c.id = n.class_id left join sections x on x.id = n.section_id left join classes c2 on c2.id = x.class_id
      left join profiles p on p.id = n.created_by
      where n.created_at >= t_from and n.created_at < t_to order by n.created_at desc) t;

  when 'feedback-log' then return query
    select to_jsonb(t) from (
      select (f.created_at at time zone 'Asia/Karachi')::date as date, f.kind, f.topic, f.status, left(f.body, 140) as message,
             case when f.replied_at is null then null else (f.replied_at::date - f.created_at::date) end as days_to_reply
      from feedback f where f.created_at >= t_from and f.created_at < t_to and (st is null or f.status = st) order by f.created_at desc) t;

  when 'behaviour-notes' then return query
    select to_jsonb(t) from (
      select (b.created_at at time zone 'Asia/Karachi')::date as date, r.name, r.class, r.section, b.kind::text as kind, b.note, p.full_name as teacher
      from behaviour_notes b join report_students r on r.id = b.student_id left join profiles p on p.id = b.teacher_id
      where b.created_at >= t_from and b.created_at < t_to and (st is null or b.kind::text = st)
        and (cls is null or r.class_id = cls) and (sec is null or r.section_id = sec)
      order by b.created_at desc limit 5000) t;

  when 'behaviour-summary' then return query
    select to_jsonb(t) from (
      select r.class, r.section, count(*) filter (where b.kind = 'praise') as praise, count(*) filter (where b.kind = 'concern') as concerns,
             count(distinct b.student_id) filter (where b.kind = 'concern') as students_with_concerns
      from behaviour_notes b join report_students r on r.id = b.student_id
      where b.created_at >= t_from and b.created_at < t_to and (cls is null or r.class_id = cls)
      group by r.class, r.class_sort, r.section order by r.class_sort, r.section) t;

  -- ================= Documents & certificates =================
  when 'documents-expiring' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section, d.kind, d.title, d.number, d.expires_on, d.expires_on - today as days_left
      from student_documents d join report_students r on r.id = d.student_id
      where d.expires_on is not null and d.expires_on <= today + days and r.status = 'enrolled'
      order by d.expires_on, r.name) t;

  when 'documents-missing' then return query
    select to_jsonb(t) from (
      select r.gr, r.name, r.class, r.section,
             concat_ws(', ', case when not exists (select 1 from student_documents d where d.student_id = r.id and d.kind = 'b_form') then 'B-form copy' end,
                             case when not exists (select 1 from student_documents d where d.student_id = r.id and d.kind = 'birth_certificate') then 'birth certificate' end,
                             case when not exists (select 1 from student_documents d where d.student_id = r.id and d.kind = 'guardian_cnic') then 'guardian CNIC' end) as missing
      from report_students r where r.status = 'enrolled' and (cls is null or r.class_id = cls) and (sec is null or r.section_id = sec)
      order by r.class_sort, r.section, r.name limit 5000) t
    where to_jsonb(t)->>'missing' <> '';

  when 'certificates-issued' then return query
    select to_jsonb(t) from (
      select c.issued_on, c.serial_no as serial, c.kind, r.gr, r.name, r.status, p.full_name as issued_by
      from student_certificates c join report_students r on r.id = c.student_id left join profiles p on p.id = c.issued_by
      where c.issued_on between v_from and v_to and (st is null or c.kind = st) order by c.issued_on desc, c.serial_no desc) t;

  else raise exception 'Unknown report: %', p_report;
  end case;
end $$;
revoke all on function public.report_rows(text, jsonb) from public, anon;
grant execute on function public.report_rows(text, jsonb) to authenticated;
