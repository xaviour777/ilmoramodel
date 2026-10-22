-- Ilmora demo data: one fictional campus with 3 classes, 6 sections, 6 staff,
-- 30 families, 42 students, four weeks of attendance, homework, exams and fees.
-- Every name and number here is made up. Safe to re-run: it wipes the demo school first.

do $$
declare
  v_school uuid; v_campus uuid; v_session uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;
  v_principal uuid; v_accountant uuid;
  v_ayesha uuid; v_bilal uuid; v_sadia uuid; v_usman uuid; v_rabia uuid; v_kamran uuid;
  v_winter uuid; v_summer uuid; v_scale uuid;
  v_exam_first uuid; v_exam_monthly uuid; v_exam_mid uuid;
  v_tuition uuid; v_lab uuid; v_exam_fee uuid;
  cls record; sec record; stu record; fam record; d date; hw uuid; inv uuid;
  teachers uuid[]; subjects_ids uuid[]; subj_names text[] := array['English','Urdu','Mathematics','Physics','Chemistry','Islamiat'];
  first_names text[] := array['Ahmed','Ayesha','Fatima','Hamza','Hassan','Iqra','Bilal','Noor','Saad','Usama','Zainab','Zara',
                              'Ali','Maryam','Umar','Hira','Abdullah','Sana','Ibrahim','Khadija','Talha','Amna','Hamid','Laiba'];
  surnames text[] := array['Mehmood','Raza','Khan','Qureshi','Butt','Malik','Sheikh','Chaudhry','Javed','Iqbal','Siddiqui','Mirza',
                           'Akhtar','Aslam','Hussain','Rehman','Saleem','Ghani','Anwar','Shah','Abbasi','Baig','Nawaz','Riaz',
                           'Yousaf','Kamal','Farooq','Haider','Latif','Zafar'];
  fam_ids uuid[] := '{}'; f uuid; p uuid; i int; n int := 0; s_idx int;
  periods_ids uuid[] := '{}'; per uuid; start_min int; k int;
  st public.attendance_status; r float;
begin
  perform setseed(0.42);
  -- the ledger normally refuses deletes; switch that off only while wiping the demo school
  alter table public.ledger_entries disable trigger ledger_append_only;
  delete from public.schools where name = 'Ilmora Demo School';
  alter table public.ledger_entries enable trigger ledger_append_only;

  insert into public.schools (name, city) values ('Ilmora Demo School', 'Lahore') returning id into v_school;
  insert into public.campuses (school_id, name, city) values (v_school, 'Johar Town Campus', 'Lahore') returning id into v_campus;

  insert into public.academic_sessions (campus_id, name, starts_on, ends_on, is_current)
    values (v_campus, '2026–27', '2026-04-01', '2027-03-31', true) returning id into v_session;
  insert into public.terms (campus_id, session_id, name, starts_on, ends_on, sort) values
    (v_campus, v_session, 'First term', '2026-04-01', '2026-09-30', 1) returning id into v_t1;
  insert into public.terms (campus_id, session_id, name, starts_on, ends_on, sort) values
    (v_campus, v_session, 'Mid-term', '2026-10-01', '2026-11-20', 2) returning id into v_t2;
  insert into public.terms (campus_id, session_id, name, starts_on, ends_on, sort) values
    (v_campus, v_session, 'Second term', '2026-11-21', '2027-02-15', 3) returning id into v_t3;
  insert into public.terms (campus_id, session_id, name, starts_on, ends_on, sort) values
    (v_campus, v_session, 'Send-up and final', '2027-02-16', '2027-03-31', 4) returning id into v_t4;

  -- Staff (logins are linked later by scripts/create-demo-users.mjs using these emails)
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'principal', 'Nadia Rehman', 'principal@demo.ilmora.pk', '03001110001') returning id into v_principal;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'accountant', 'Imran Butt', 'accounts@demo.ilmora.pk', '03001110002') returning id into v_accountant;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Ayesha Siddiqui', 'teacher@demo.ilmora.pk', '03001110003') returning id into v_ayesha;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Bilal Ahmed', 'bilal@demo.ilmora.pk', '03001110004') returning id into v_bilal;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Sadia Malik', 'sadia@demo.ilmora.pk', '03001110005') returning id into v_sadia;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Usman Ghani', 'usman@demo.ilmora.pk', '03001110006') returning id into v_usman;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Rabia Noor', 'rabia@demo.ilmora.pk', '03001110007') returning id into v_rabia;
  insert into public.profiles (campus_id, role, full_name, email, phone) values
    (v_campus, 'teacher', 'Kamran Shah', 'kamran@demo.ilmora.pk', '03001110008') returning id into v_kamran;
  -- teacher for each subject, in subj_names order
  teachers := array[v_bilal, v_rabia, v_ayesha, v_usman, v_sadia, v_kamran];

  for i in 1..array_length(subj_names, 1) loop
    insert into public.subjects (campus_id, name) values (v_campus, subj_names[i]) returning id into p;
    subjects_ids := subjects_ids || p;
  end loop;

  -- Classes and sections
  insert into public.classes (campus_id, name, board, sort) values
    (v_campus, 'Class 8', 'Punjab Curriculum', 8), (v_campus, 'Class 9', 'BISE Lahore', 9), (v_campus, 'Class 10', 'BISE Lahore', 10);
  for cls in select id, name from public.classes where campus_id = v_campus order by sort loop
    insert into public.sections (campus_id, class_id, name, capacity, class_teacher_id) values
      (v_campus, cls.id, 'A', 40, case cls.name when 'Class 9' then v_ayesha when 'Class 10' then v_usman else v_rabia end),
      (v_campus, cls.id, 'B', 40, case cls.name when 'Class 9' then v_sadia when 'Class 10' then v_bilal else v_ayesha end);
  end loop;
  insert into public.section_subjects (campus_id, section_id, subject_id, teacher_id)
    select v_campus, s.id, subjects_ids[g.gi], teachers[g.gi]
    from public.sections s cross join generate_series(1, array_length(subjects_ids, 1)) as g(gi)
    where s.campus_id = v_campus;

  -- Timings: winter (active) and summer
  insert into public.timing_profiles (campus_id, name, active_from, active_to, is_active)
    values (v_campus, 'Winter', '2026-11-01', '2027-02-28', true) returning id into v_winter;
  insert into public.timing_profiles (campus_id, name, active_from, active_to, is_active)
    values (v_campus, 'Summer', '2026-04-01', '2026-10-31', false) returning id into v_summer;
  start_min := 8 * 60;
  for k in 1..8 loop
    if k = 1 then
      insert into public.periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
        values (v_campus, v_winter, 'Assembly', 'assembly', make_time(7, 45, 0), make_time(8, 0, 0), 0);
    end if;
    if k = 5 then
      insert into public.periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
        values (v_campus, v_winter, 'Break', 'break', make_time(start_min / 60, start_min % 60, 0),
                make_time((start_min + 30) / 60, (start_min + 30) % 60, 0), 45);
      start_min := start_min + 30;
    end if;
    insert into public.periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
      values (v_campus, v_winter, 'Period ' || k, 'class', make_time(start_min / 60, start_min % 60, 0),
              make_time((start_min + 40) / 60, (start_min + 40) % 60, 0), k * 10)
      returning id into per;
    periods_ids := periods_ids || per;
    start_min := start_min + 40;
  end loop;
  insert into public.periods (campus_id, timing_profile_id, name, kind, starts_at, ends_at, sort)
    select v_campus, v_summer, name, kind, starts_at - interval '30 minutes', ends_at - interval '30 minutes', sort
    from public.periods where timing_profile_id = v_winter;

  -- Timetable: 6 subjects over 8 periods, Mon–Fri, rotated per section so teachers don't clash
  s_idx := 0;
  for sec in select s.id from public.sections s join public.classes c on c.id = s.class_id
             where s.campus_id = v_campus order by c.sort, s.name loop
    for k in 1..5 loop          -- weekday
      for i in 1..6 loop        -- first 6 periods
        insert into public.timetable_slots (campus_id, section_id, weekday, period_id, subject_id, teacher_id)
        values (v_campus, sec.id, k, periods_ids[i],
                subjects_ids[((i + k + s_idx) % 6) + 1], null);
      end loop;
    end loop;
    s_idx := s_idx + 1;
  end loop;
  -- give each slot its subject teacher only where that teacher is free in that period
  for stu in select t.id, ss.teacher_id as tid, t.weekday, t.period_id
             from public.timetable_slots t
             join public.section_subjects ss on ss.section_id = t.section_id and ss.subject_id = t.subject_id
             where t.campus_id = v_campus order by t.weekday, t.period_id, t.section_id loop
    if not exists (select 1 from public.timetable_slots o where o.teacher_id = stu.tid
                   and o.weekday = stu.weekday and o.period_id = stu.period_id) then
      update public.timetable_slots set teacher_id = stu.tid where id = stu.id;
    end if;
  end loop;

  -- Families, parents and students
  for i in 1..30 loop
    insert into public.families (campus_id, name, phone, address)
      values (v_campus, first_names[(i % 24) + 1] || ' ' || surnames[i] || ' family',
              '0300' || lpad((2000000 + i * 3571)::text, 7, '0'), 'Johar Town, Lahore')
      returning id into f;
    fam_ids := fam_ids || f;
    insert into public.profiles (campus_id, role, full_name, phone, email)
      values (v_campus, 'parent', case when i = 1 then 'Saima Tariq' else 'Parent of ' || surnames[i] || ' family' end,
              '0300' || lpad((2000000 + i * 3571)::text, 7, '0'),
              case when i = 1 then 'parent@demo.ilmora.pk' end)
      returning id into p;
    insert into public.family_guardians (campus_id, family_id, profile_id, relation, is_fee_contact)
      values (v_campus, f, p, case when i = 1 then 'mother' else 'father' end, true);
  end loop;
  update public.families set name = 'Tariq Mehmood family' where id = fam_ids[1];

  i := 0;
  for sec in select s.id, s.name, c.name as cname from public.sections s join public.classes c on c.id = s.class_id
             where s.campus_id = v_campus order by c.sort, s.name loop
    for k in 1..7 loop
      i := i + 1;
      -- first 24 students fill families 1..24; the rest are siblings in families 1..12... except the demo family
      f := case when i <= 30 then fam_ids[i] else fam_ids[((i - 30) % 11) + 2] end;
      insert into public.students (campus_id, family_id, section_id, full_name, roll_no, admission_no, gender, admitted_on)
      values (v_campus, f, sec.id,
              first_names[((i * 7) % 24) + 1] || ' ' || (select split_part(name, ' ', 2) from public.families where id = f),
              (case sec.cname when 'Class 8' then 800 when 'Class 9' then 900 else 1000 end + (case sec.name when 'A' then 0 else 50 end) + k)::text,
              'JT-' || lpad(i::text, 4, '0'),
              case when ((i * 7) % 24) % 2 = 0 then 'M' else 'F' end, '2022-04-01');
    end loop;
  end loop;
  -- Demo family: Hamza in 10-A and Zainab in 8-A
  update public.students set full_name = 'Hamza Tariq', family_id = fam_ids[1]
    where id = (select st2.id from public.students st2 join public.sections s on s.id = st2.section_id
                join public.classes c on c.id = s.class_id where c.name = 'Class 10' and s.name = 'A' and st2.campus_id = v_campus
                order by roll_no limit 1);
  update public.students set full_name = 'Zainab Tariq', family_id = fam_ids[1], gender = 'F'
    where id = (select st2.id from public.students st2 join public.sections s on s.id = st2.section_id
                join public.classes c on c.id = s.class_id where c.name = 'Class 8' and s.name = 'A' and st2.campus_id = v_campus
                order by roll_no limit 1);
  -- drop any family left without a child after the swap above
  delete from public.profiles where id in (select fg.profile_id from public.family_guardians fg
    where fg.campus_id = v_campus and not exists (select 1 from public.students s where s.family_id = fg.family_id));
  delete from public.families fm where fm.campus_id = v_campus
    and not exists (select 1 from public.students s where s.family_id = fm.id);

  -- Student login for Hamza
  insert into public.profiles (campus_id, role, full_name, email) values (v_campus, 'student', 'Hamza Tariq', 'student@demo.ilmora.pk')
    returning id into p;
  update public.students set profile_id = p where full_name = 'Hamza Tariq' and campus_id = v_campus;

  -- Attendance for the last 20 school days (Mon–Fri), about 92% present
  for d in select x::date from generate_series(current_date - 28, current_date - 1, interval '1 day') x
           where extract(isodow from x) between 1 and 5 loop
    for stu in select id, section_id from public.students where campus_id = v_campus loop
      r := random();
      st := case when r < 0.88 then 'present' when r < 0.93 then 'late' when r < 0.98 then 'absent' else 'leave' end;
      insert into public.attendance (campus_id, section_id, student_id, date, status, marked_by)
      values (v_campus, stu.section_id, stu.id, d, st,
              (select class_teacher_id from public.sections where id = stu.section_id));
    end loop;
  end loop;

  -- Homework: three tasks per section this week, with submissions
  for sec in select s.id from public.sections s where s.campus_id = v_campus loop
    for k in 1..3 loop
      insert into public.homework (campus_id, section_id, subject_id, teacher_id, title, instructions, due_on, total_marks)
      select v_campus, sec.id, ss.subject_id, ss.teacher_id,
             (array['Exercise 5.3, questions 1 to 10','Essay: My favourite season','Chapter 4 short questions'])[k],
             'Solve in your copy and show every step.', current_date + (k - 2), 10
      from public.section_subjects ss
      where ss.section_id = sec.id and ss.subject_id = subjects_ids[(array[3,1,5])[k]]
      returning id into hw;
      insert into public.homework_submissions (campus_id, homework_id, student_id, submitted_at, checked_at, marks)
      select v_campus, hw, s.id, now() - interval '1 day',
             case when k = 1 then now() end, case when k = 1 then 6 + floor(random() * 5) end
      from public.students s where s.section_id = sec.id and random() < (array[0.9, 0.6, 0.2])[k];
    end loop;
  end loop;

  -- Lesson diary and behaviour notes
  insert into public.lesson_diary (campus_id, section_id, subject_id, teacher_id, date, topic, notes)
  select v_campus, ss.section_id, ss.subject_id, ss.teacher_id, current_date - 1, 'Chapter 5: factorisation', 'Covered exercise 5.2; 5.3 given as homework.'
  from public.section_subjects ss where ss.campus_id = v_campus and ss.subject_id = subjects_ids[3];
  insert into public.behaviour_notes (campus_id, student_id, teacher_id, kind, note, share_with_parents)
  select v_campus, s.id, v_ayesha, 'praise', 'Helped classmates during the maths test review.', true
  from public.students s where s.campus_id = v_campus and s.full_name = 'Hamza Tariq';

  -- Grading and exams
  insert into public.grading_scales (campus_id, name, bands) values (v_campus, 'Standard',
    '[{"grade":"A+","min":90},{"grade":"A","min":80},{"grade":"B","min":70},{"grade":"C","min":60},{"grade":"D","min":50},{"grade":"F","min":0}]')
    returning id into v_scale;
  insert into public.exams (campus_id, term_id, name, kind, starts_on, ends_on, total_marks, weight_percent, grading_scale_id, status)
    values (v_campus, v_t1, 'First term exam', 'term', '2026-09-14', '2026-09-25', 100, 30, v_scale, 'results') returning id into v_exam_first;
  insert into public.exams (campus_id, term_id, name, kind, starts_on, ends_on, total_marks, weight_percent, grading_scale_id, status)
    values (v_campus, v_t2, 'Monthly test · October', 'monthly', '2026-10-12', '2026-10-16', 25, 10, v_scale, 'marks_entry') returning id into v_exam_monthly;
  insert into public.exams (campus_id, term_id, name, kind, starts_on, ends_on, total_marks, weight_percent, grading_scale_id, status)
    values (v_campus, v_t2, 'Mid-term exam', 'term', '2026-11-02', '2026-11-13', 75, 30, v_scale, 'date_sheet') returning id into v_exam_mid;
  insert into public.exam_sections (exam_id, section_id, campus_id)
    select e, s.id, v_campus from public.sections s, unnest(array[v_exam_first, v_exam_monthly, v_exam_mid]) e where s.campus_id = v_campus;
  insert into public.exam_papers (campus_id, exam_id, class_id, subject_id, paper_date, starts_at, ends_at, invigilator_id)
    select v_campus, v_exam_mid, c.id, subjects_ids[g.gi], date '2026-11-02' + (g.gi - 1) + case when g.gi > 5 then 2 else 0 end,
           '08:30', '11:00', teachers[((g.gi + c.sort) % 6) + 1]
    from public.classes c cross join generate_series(1, 6) as g(gi) where c.campus_id = v_campus;
  -- First term: all marks, locked. October monthly: about 70% entered.
  insert into public.marks (campus_id, exam_id, subject_id, student_id, obtained, locked, entered_by)
    select v_campus, v_exam_first, subjects_ids[g.gi], s.id, least(100, greatest(28, round((62 + random() * 36)::numeric, 0))), true, teachers[g.gi]
    from public.students s cross join generate_series(1, 6) as g(gi) where s.campus_id = v_campus;
  insert into public.marks (campus_id, exam_id, subject_id, student_id, obtained, locked, entered_by)
    select v_campus, v_exam_monthly, subjects_ids[g.gi], s.id, round((12 + random() * 13)::numeric, 0), false, teachers[g.gi]
    from public.students s cross join generate_series(1, 6) as g(gi) where s.campus_id = v_campus and random() < 0.7;

  -- Leave, substitutions, admissions, notices
  insert into public.leave_requests (campus_id, profile_id, from_on, to_on, reason, status) values
    (v_campus, v_bilal, current_date + 3, current_date + 4, 'Family wedding in Gujranwala', 'pending'),
    (v_campus, v_sadia, current_date - 6, current_date - 6, 'Doctor appointment', 'approved');
  insert into public.admissions (campus_id, child_name, guardian_name, phone, applying_class_id, status, test_on, notes)
    select v_campus, x.child, x.guardian, x.phone, c.id, x.st::public.admission_status, x.test_on, x.notes
    from (values ('Areeba Khalid', 'Khalid Mehmood', '03214445566', 'Class 8', 'inquiry', null::date, 'Walk-in, sibling at another school'),
                 ('Muhammad Ahmad', 'Shahid Iqbal', '03335556677', 'Class 9', 'test', current_date + 5, 'Entry test booked'),
                 ('Eman Fatima', 'Rizwan Ali', '03016667788', 'Class 8', 'offered', current_date - 3, 'Passed test, 82%')) as x(child, guardian, phone, cls, st, test_on, notes)
    join public.classes c on c.name = x.cls and c.campus_id = v_campus;
  insert into public.notices (campus_id, title, body, audience, created_by) values
    (v_campus, 'Mid-term exams start 2 November', 'The date sheet is in the app. Students should arrive by 8:15 am on exam days.', 'parents', v_principal),
    (v_campus, 'Winter timing from 1 November', 'School starts at 8:00 am with assembly at 7:45 am.', 'everyone', v_principal),
    (v_campus, 'Staff meeting Saturday 10 am', 'Agenda: mid-term papers and report cards.', 'staff', v_principal);

  -- Fees: heads, class structures, this month's challans and payments
  insert into public.fee_heads (campus_id, name, priority) values (v_campus, 'Tuition', 10) returning id into v_tuition;
  insert into public.fee_heads (campus_id, name, priority) values (v_campus, 'Lab and computer', 20) returning id into v_lab;
  insert into public.fee_heads (campus_id, name, priority) values (v_campus, 'Exam fee', 30) returning id into v_exam_fee;
  insert into public.fee_structures (campus_id, class_id, fee_head_id, amount_paisa, monthly)
    select v_campus, c.id, v_tuition, (case c.name when 'Class 8' then 6800 when 'Class 9' then 7400 else 7900 end) * 100, true
    from public.classes c where c.campus_id = v_campus;
  insert into public.fee_structures (campus_id, class_id, fee_head_id, amount_paisa, monthly)
    select v_campus, c.id, v_lab, 800 * 100, true from public.classes c where c.campus_id = v_campus and c.name <> 'Class 8';

  for fam in select fm.id, row_number() over (order by fm.created_at, fm.id) as rn
             from public.families fm where fm.campus_id = v_campus loop
    n := n + 1;
    insert into public.invoices (campus_id, family_id, billing_month, due_on, challan_no)
      values (v_campus, fam.id, date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 9,
              'JT-' || to_char(current_date, 'YYMM') || '-' || lpad(n::text, 4, '0'))
      returning id into inv;
    insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
      select v_campus, inv, s.id, fs.fee_head_id, h.name || ', ' || s.full_name, fs.amount_paisa
      from public.students s
      join public.sections sec2 on sec2.id = s.section_id
      join public.fee_structures fs on fs.class_id = sec2.class_id
      join public.fee_heads h on h.id = fs.fee_head_id
      where s.family_id = fam.id;
    -- sibling concession: 10% of tuition for every child after the first
    insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
      select v_campus, inv, s.id, v_tuition, 'Sibling concession 10%, ' || s.full_name, -(fs.amount_paisa / 10)
      from (select s.*, row_number() over (order by s.admission_no) rn from public.students s where s.family_id = fam.id) s
      join public.sections sec2 on sec2.id = s.section_id
      join public.fee_structures fs on fs.class_id = sec2.class_id and fs.fee_head_id = v_tuition
      where s.rn > 1;
    -- about 70% have paid, through a mix of channels (the demo family has not)
    if fam.rn > 1 and random() < 0.72 then
      insert into public.payments (campus_id, family_id, invoice_id, amount_paisa, mode, reference, receipt_no, received_by, received_at, idempotency_key)
      select v_campus, fam.id, inv, sum(amount_paisa),
             (array['onebill','onebill','raast','jazzcash','easypaisa','cash','cash','bank_deposit'])[1 + floor(random() * 8)::int]::public.payment_mode,
             'DEMO-' || n, 'R-' || lpad(n::text, 5, '0'), v_accountant,
             date_trunc('month', current_date) + (floor(random() * least(extract(day from current_date), 20)) || ' days')::interval + interval '10 hours',
             'seed-' || inv
      from public.invoice_lines where invoice_id = inv;
    end if;
  end loop;
end $$;
