-- Journey demo data, on top of supabase/seed.sql: a full Class 9 for board registration
-- (200 students in four sections, with a few details deliberately missing), Classes 5 to 7,
-- more teachers and subjects, and one student's whole story from admission into Class 9
-- (April 2025) to Class 10 today: entry test, board registration number, Class 9 annual result,
-- every month's fee, attendance and a checked quiz that his parents can see.
-- Every name and number is made up. It only adds rows; it runs once (it stops if it finds its own
-- students). Needs migration 20261031000001. Running supabase/seed.sql again wipes it with the school.

do $$
declare
  v_campus uuid; v_principal uuid; v_accountant uuid; v_scale uuid; v_tuition uuid; v_lab uuid; v_exam_fee uuid;
  v_today date := (now() at time zone 'Asia/Karachi')::date;   -- school days follow Pakistan time
  boys text[] := array['Ahmed','Ali','Hamza','Hassan','Usman','Bilal','Saad','Umar','Abdullah','Ibrahim','Talha','Zain',
                       'Haris','Moiz','Rayyan','Arham','Shayan','Fahad','Huzaifa','Daniyal','Muneeb','Waleed','Taha','Subhan'];
  girls text[] := array['Ayesha','Fatima','Zainab','Maryam','Hira','Iqra','Noor','Sana','Amna','Laiba','Khadija','Eman',
                        'Alishba','Mahnoor','Areeba','Rimsha','Hafsa','Javeria','Anaya','Minahil','Dua','Aiman','Mehak','Zoya'];
  surnames text[] := array['Raza','Khan','Qureshi','Butt','Malik','Sheikh','Chaudhry','Javed','Iqbal','Siddiqui','Mirza','Akhtar',
                           'Aslam','Hussain','Rehman','Saleem','Anwar','Shah','Abbasi','Baig','Nawaz','Riaz','Yousaf','Farooq',
                           'Haider','Latif','Zafar','Bhatti','Gill','Cheema','Warraich','Rana','Ansari','Hashmi','Gondal','Awan'];
  old_schools text[] := array['Govt. Boys Middle School, Township','Govt. Girls Middle School, Johar Town','The Educators, Wapda Town',
                              'Allied School, Johar Town','Dar-e-Arqam School, Township','Same school','Same school','Same school'];
  blocks text[] := array['A','B','C','D','E','F','G','H','J','K','L','N','P','Q','R'];
  t_bio uuid; t_cs uuid; t_pak uuid; t_quran uuid; t_sci uuid; t_sst uuid; t_phy uuid;
  sec record; fam record; stu record; d date; m date; inv uuid; f uuid; p uuid;
  i int; k int; n int := 1; have int; target int; roll int;
  sex text; fname text; sur text; father text; addr text; svg text; grp text;
  jy_fams uuid[] := '{}'; r float; st public.attendance_status;
  v_ali uuid; v_ali_fam uuid; v_old_session uuid; v_old_term uuid; v_annual uuid; v_first_term uuid; v_10a uuid;
  v_quiz uuid; qkey text[]; ans text[]; score int;
begin
  select c.id into v_campus from public.campuses c join public.schools sc on sc.id = c.school_id
   where sc.name = 'Ilmora Demo School' and c.name = 'Johar Town Campus';
  if v_campus is null then raise exception 'Run supabase/seed.sql first'; end if;
  if exists (select 1 from public.students where campus_id = v_campus and admission_no like 'JY-%') then
    raise notice 'Journey demo data is already there; nothing to do.';
    return;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'paper_tests' and column_name = 'auto_publish') then
    raise exception 'Apply migration 20261031000001_quiz_questions_auto_publish.sql first';
  end if;
  perform setseed(0.31);

  select id into v_principal from public.profiles where campus_id = v_campus and role = 'principal' order by created_at limit 1;
  select id into v_accountant from public.profiles where campus_id = v_campus and role = 'accountant' order by created_at limit 1;
  select id into v_scale from public.grading_scales where campus_id = v_campus order by name limit 1;
  select id into v_tuition from public.fee_heads where campus_id = v_campus and name = 'Tuition';
  select id into v_lab from public.fee_heads where campus_id = v_campus and name = 'Lab and computer';
  select id into v_exam_fee from public.fee_heads where campus_id = v_campus and name = 'Exam fee';

  -- More teachers and the subjects the Punjab scheme of studies adds
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Farhan Akhtar', '03001110011') returning id into t_bio;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Mehwish Iqbal', '03001110012') returning id into t_cs;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Tahir Mahmood', '03001110013') returning id into t_pak;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Qari Abdul Basit', '03001110014') returning id into t_quran;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Nazia Parveen', '03001110015') returning id into t_sci;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'teacher', 'Shazia Kanwal', '03001110016') returning id into t_sst;
  insert into public.subjects (campus_id, name)
    select v_campus, x from unnest(array['Science','Social Studies','Biology','Computer Science','Pakistan Studies','Tarjuma-tul-Quran']) x
  on conflict (campus_id, name) do nothing;

  -- Classes 5 to 7, two sections each
  insert into public.classes (campus_id, name, board, sort) values
    (v_campus, 'Class 5', 'Punjab Curriculum', 5), (v_campus, 'Class 6', 'Punjab Curriculum', 6), (v_campus, 'Class 7', 'Punjab Curriculum', 7)
  on conflict (campus_id, name) do nothing;
  insert into public.sections (campus_id, class_id, name, capacity, class_teacher_id)
    select v_campus, c.id, x.name, 40, case x.name when 'A' then t_sci else t_sst end
    from public.classes c cross join (values ('A'), ('B')) as x(name)
    where c.campus_id = v_campus and c.name in ('Class 5', 'Class 6', 'Class 7')
  on conflict (class_id, name) do nothing;
  -- English, Urdu, Maths and Islamiat keep the Class 8 teacher
  insert into public.section_subjects (campus_id, section_id, subject_id, teacher_id)
    select v_campus, s.id, sb.id,
           case sb.name when 'Science' then t_sci when 'Social Studies' then t_sst else
             (select ss.teacher_id from public.section_subjects ss join public.sections s8 on s8.id = ss.section_id
                join public.classes c8 on c8.id = s8.class_id
               where c8.campus_id = v_campus and c8.name = 'Class 8' and s8.name = 'A' and ss.subject_id = sb.id) end
    from public.sections s join public.classes c on c.id = s.class_id
    cross join public.subjects sb
    where c.campus_id = v_campus and c.name in ('Class 5', 'Class 6', 'Class 7')
      and sb.campus_id = v_campus and sb.name in ('English', 'Urdu', 'Mathematics', 'Science', 'Social Studies', 'Islamiat')
  on conflict (section_id, subject_id) do nothing;

  -- Class 9 grows to four sections of 50 (A to C Biology group, D Computer group)
  insert into public.sections (campus_id, class_id, name, capacity, class_teacher_id)
    select v_campus, c.id, x.name, 50, case x.name when 'C' then t_bio else t_cs end
    from public.classes c cross join (values ('C'), ('D')) as x(name)
    where c.campus_id = v_campus and c.name = 'Class 9'
  on conflict (class_id, name) do nothing;
  update public.sections s set capacity = 50 from public.classes c
   where c.id = s.class_id and c.campus_id = v_campus and c.name = 'Class 9';
  insert into public.section_subjects (campus_id, section_id, subject_id, teacher_id)
    select v_campus, s.id, sb.id,
           case sb.name when 'Biology' then t_bio when 'Computer Science' then t_cs when 'Pakistan Studies' then t_pak
                        when 'Tarjuma-tul-Quran' then t_quran else
             (select ss.teacher_id from public.section_subjects ss join public.sections s9 on s9.id = ss.section_id
               where s9.class_id = c.id and s9.name = 'A' and ss.subject_id = sb.id) end
    from public.sections s join public.classes c on c.id = s.class_id
    cross join public.subjects sb
    where c.campus_id = v_campus and c.name in ('Class 9', 'Class 10') and sb.campus_id = v_campus
      and sb.name in ('English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Islamiat', 'Pakistan Studies', 'Tarjuma-tul-Quran',
                      case when s.name = 'D' then 'Computer Science' else 'Biology' end)
  on conflict (section_id, subject_id) do nothing;

  -- Fees for the new classes
  insert into public.fee_structures (campus_id, class_id, fee_head_id, amount_paisa, monthly)
    select v_campus, c.id, v_tuition, (case c.name when 'Class 5' then 5200 when 'Class 6' then 5800 else 6300 end) * 100, true
    from public.classes c where c.campus_id = v_campus and c.name in ('Class 5', 'Class 6', 'Class 7')
  on conflict (class_id, fee_head_id) do nothing;

  -- The Class 9 students already there get their board details (two of them still without a B-form)
  update public.students s set
      father_name = coalesce(s.father_name, boys[1 + (abs(hashtext(s.id::text)) % 24)] || ' ' || split_part(s.full_name, ' ', 2)),
      father_cnic = coalesce(s.father_cnic, '35202-' || lpad((abs(hashtext(s.id::text || 'f')) % 10000000)::text, 7, '0') || '-' || (abs(hashtext(s.id::text)) % 10)),
      b_form = coalesce(s.b_form, case when s.roll_no in ('903', '955') then null else
               '35202-' || lpad((abs(hashtext(s.id::text || 'b')) % 10000000)::text, 7, '0') || '-' || (case s.gender when 'M' then 1 else 2 end + 2 * (abs(hashtext(s.id::text)) % 4)) end),
      date_of_birth = coalesce(s.date_of_birth, date '2010-04-01' + (abs(hashtext(s.id::text)) % 540)),
      religion = coalesce(s.religion, 'Islam'), nationality = coalesce(s.nationality, 'Pakistani'),
      address = coalesce(s.address, 'House ' || (1 + abs(hashtext(s.id::text)) % 400) || ', Block ' || blocks[1 + abs(hashtext(s.id::text)) % 15] || ', Johar Town, Lahore'),
      board_group = coalesce(s.board_group, 'science_biology'),
      last_class_passed = coalesce(s.last_class_passed, 'Class 8'), previous_school = coalesce(s.previous_school, 'Same school')
    from public.sections sc9 join public.classes c on c.id = sc9.class_id
   where sc9.id = s.section_id and c.campus_id = v_campus and c.name = 'Class 9';

  -- New students: Class 9 up to 50 a section, Classes 5 to 7 with 25 a section. Admission numbers
  -- JY-0002 onwards (JY-0001 is Ali Raza below). Some younger children are siblings of a Class 9 child.
  for sec in select s.id, s.name, c.name as cname, c.sort from public.sections s join public.classes c on c.id = s.class_id
             where c.campus_id = v_campus and c.name in ('Class 9', 'Class 5', 'Class 6', 'Class 7')
             order by c.sort desc, s.name loop
    select count(*) into have from public.students where section_id = sec.id;
    target := case when sec.cname = 'Class 9' then 50 else 25 end;
    for k in have + 1 .. target loop
      n := n + 1;
      sex := case when random() < 0.52 then 'M' else 'F' end;
      fname := case sex when 'M' then boys[1 + floor(random() * 24)::int] else girls[1 + floor(random() * 24)::int] end;
      if sec.cname <> 'Class 9' and random() < 0.25 then
        f := jy_fams[1 + floor(random() * array_length(jy_fams, 1))::int];
        select regexp_replace(name, ' family$', ''), address into father, addr from public.families where id = f;
        sur := regexp_replace(father, '^.* ', '');
      else
        sur := surnames[1 + floor(random() * 36)::int];
        father := boys[1 + floor(random() * 24)::int] || ' ' || sur;
        addr := 'House ' || (1 + floor(random() * 400))::int || ', Block ' || blocks[1 + floor(random() * 15)::int] || ', Johar Town, Lahore';
        insert into public.families (campus_id, name, phone, address, reminder_phone, reminder_channel)
          values (v_campus, father || ' family', '03' || (array['00','01','21','33','45'])[1 + n % 5] || lpad((1000000 + n * 7919)::text, 7, '0'),
                  addr, case when random() < 0.3 then '03' || (array['02','22','34'])[1 + n % 3] || lpad((2000000 + n * 6007)::text, 7, '0') end,
                  'auto')
          returning id into f;
        jy_fams := jy_fams || f;
      end if;
      roll := case when sec.cname = 'Class 9' and sec.name in ('A', 'B') then 900 + (case sec.name when 'A' then 0 else 50 end) + k
                   else sec.sort * 1000 + (ascii(sec.name) - 64) * 100 + k end;
      svg := '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#3b6fd8"/>'
          || '<circle cx="150" cy="150" r="72" fill="#e3ebfb"/><rect x="55" y="240" width="190" height="170" rx="85" fill="#e3ebfb"/>'
          || '<text x="150" y="372" font-family="Arial" font-size="44" font-weight="700" text-anchor="middle" fill="#3b6fd8">'
          || left(fname, 1) || left(sur, 1) || '</text></svg>';
      r := random();
      grp := case when sec.cname <> 'Class 9' or random() < 0.05 then null when sec.name = 'D' then 'science_computer' else 'science_biology' end;
      insert into public.students (campus_id, family_id, section_id, full_name, roll_no, admission_no, gender, admitted_on, status,
                                   father_name, father_cnic, b_form, date_of_birth, religion, nationality, address, photo_url,
                                   board_group, previous_school, last_class_passed, hafiz_quran)
      values (v_campus, f, sec.id, fname || ' ' || sur, roll::text, 'JY-' || lpad(n::text, 4, '0'), sex,
              case when sec.cname = 'Class 9' and random() < 0.4 then date '2026-04-01' else date '2023-04-01' + (floor(random() * 3) * 365)::int end,
              'enrolled', father,
              case when random() < 0.08 then null else '35202-' || lpad(floor(random() * 10000000)::int::text, 7, '0') || '-' || floor(random() * 10)::int end,
              case when r < 0.12 then null else '35202-' || lpad(floor(random() * 10000000)::int::text, 7, '0') || '-'
                   || (case sex when 'M' then 1 else 2 end + 2 * floor(random() * 4)::int) end,
              make_date(2019 - sec.sort, 4, 1) + floor(random() * 365)::int,
              'Islam', 'Pakistani', case when sec.cname = 'Class 9' and random() < 0.03 then null else addr end,
              case when sec.cname = 'Class 9' and random() < 0.10 then null
                   else 'data:image/svg+xml;base64,' || replace(encode(convert_to(svg, 'UTF8'), 'base64'), E'\n', '') end,
              grp, old_schools[1 + floor(random() * 8)::int], 'Class ' || (sec.sort - 1), random() < 0.03);
    end loop;
  end loop;

  -- Ali Raza: entry test in March 2025, admitted into 9-A in April 2025, registered with BISE Lahore,
  -- passed the Class 9 annual exam, now in 10-A.
  select s.id into v_10a from public.sections s join public.classes c on c.id = s.class_id
   where c.campus_id = v_campus and c.name = 'Class 10' and s.name = 'A';
  insert into public.families (campus_id, name, phone, address, reminder_phone, reminder_channel)
    values (v_campus, 'Shahid Raza family', '03214567012', 'House 142, Block G, Johar Town, Lahore', '03334567012', 'whatsapp')
    returning id into v_ali_fam;
  jy_fams := jy_fams || v_ali_fam;
  insert into public.profiles (campus_id, role, full_name, phone) values (v_campus, 'parent', 'Shahid Raza', '03214567012') returning id into p;
  insert into public.family_guardians (campus_id, family_id, profile_id, relation, is_fee_contact) values (v_campus, v_ali_fam, p, 'father', true);
  svg := '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#3b6fd8"/>'
      || '<circle cx="150" cy="150" r="72" fill="#e3ebfb"/><rect x="55" y="240" width="190" height="170" rx="85" fill="#e3ebfb"/>'
      || '<text x="150" y="372" font-family="Arial" font-size="44" font-weight="700" text-anchor="middle" fill="#3b6fd8">AR</text></svg>';
  insert into public.students (campus_id, family_id, section_id, full_name, roll_no, admission_no, gender, admitted_on, status,
                               father_name, father_cnic, mother_name, b_form, date_of_birth, religion, nationality, address, photo_url,
                               board_group, board_reg_no, previous_school, last_class_passed, guardian_occupation, blood_group)
  values (v_campus, v_ali_fam, v_10a, 'Ali Raza', '1008', 'JY-0001', 'M', '2025-04-01', 'enrolled',
          'Shahid Raza', '35202-4567012-3', 'Farzana Shahid', '35202-8812345-7', '2010-06-14', 'Islam', 'Pakistani',
          'House 142, Block G, Johar Town, Lahore', 'data:image/svg+xml;base64,' || replace(encode(convert_to(svg, 'UTF8'), 'base64'), E'\n', ''),
          'science_biology', '25-LHR-9-118342', 'Govt. Boys Middle School, Township', 'Class 8', 'Shopkeeper', 'B+')
  returning id into v_ali;
  insert into public.admissions (campus_id, child_name, guardian_name, phone, applying_class_id, status, test_on, notes, student_id,
                                 reminder_phone, reminder_channel, father_cnic, b_form, gender, date_of_birth, address, previous_school,
                                 last_class_passed, created_at)
    select v_campus, 'Ali Raza', 'Shahid Raza', '03214567012', c.id, 'admitted', '2025-03-22',
           'Came through a Facebook ad. Entry test 78%. Admitted into 9-A on 1 April 2025; BISE Lahore registration done in 9th.',
           v_ali, '03334567012', 'whatsapp', '35202-4567012-3', '35202-8812345-7', 'M', '2010-06-14',
           'House 142, Block G, Johar Town, Lahore', 'Govt. Boys Middle School, Township', 'Class 8', '2025-03-10 11:00+05'
    from public.classes c where c.campus_id = v_campus and c.name = 'Class 9';

  -- Last school year and its Class 9 annual exam, with Ali's result
  insert into public.academic_sessions (campus_id, name, starts_on, ends_on, is_current)
    values (v_campus, '2025–26', '2025-04-01', '2026-03-31', false) returning id into v_old_session;
  insert into public.terms (campus_id, session_id, name, starts_on, ends_on, sort)
    values (v_campus, v_old_session, 'Annual 2025–26', '2025-04-01', '2026-03-31', 1) returning id into v_old_term;
  insert into public.exams (campus_id, term_id, name, kind, starts_on, ends_on, total_marks, weight_percent, grading_scale_id, status)
    values (v_campus, v_old_term, 'Class 9 annual exam 2026', 'final', '2026-03-02', '2026-03-14', 100, 100, v_scale, 'results')
    returning id into v_annual;
  insert into public.marks (campus_id, exam_id, subject_id, student_id, obtained, locked, entered_by)
    select v_campus, v_annual, sb.id, v_ali, x.mk, true, v_principal
    from (values ('English', 81), ('Urdu', 77), ('Mathematics', 88), ('Physics', 79), ('Chemistry', 74), ('Biology', 83),
                 ('Islamiat', 90), ('Pakistan Studies', 85), ('Tarjuma-tul-Quran', 92)) as x(name, mk)
    join public.subjects sb on sb.campus_id = v_campus and sb.name = x.name;
  -- and this year's first term exam, like his classmates
  select id into v_first_term from public.exams where campus_id = v_campus and name = 'First term exam';
  insert into public.marks (campus_id, exam_id, subject_id, student_id, obtained, locked, entered_by)
    select v_campus, v_first_term, ss.subject_id, v_ali, x.mk, true, ss.teacher_id
    from (values ('English', 84), ('Urdu', 79), ('Mathematics', 91), ('Physics', 82), ('Chemistry', 77), ('Islamiat', 88)) as x(name, mk)
    join public.subjects sb on sb.campus_id = v_campus and sb.name = x.name
    join public.section_subjects ss on ss.section_id = v_10a and ss.subject_id = sb.id
  on conflict (exam_id, subject_id, student_id) do nothing;

  -- Every month's fee from April 2025 to last month, all paid (Class 9 fee, then Class 10 from April 2026)
  i := 0;
  for m in select x::date from generate_series(date '2025-04-01', date_trunc('month', v_today)::date - 1, interval '1 month') x loop
    i := i + 1;
    insert into public.invoices (campus_id, family_id, billing_month, due_on, challan_no, created_at)
      values (v_campus, v_ali_fam, m, m + 9, 'JY-' || to_char(m, 'YYMM') || '-A001', m + interval '1 hour')
      returning id into inv;
    insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa) values
      (v_campus, inv, v_ali, v_tuition, 'Tuition, Ali Raza', (case when m < date '2026-04-01' then 7400 else 7900 end) * 100),
      (v_campus, inv, v_ali, v_lab, 'Lab and computer, Ali Raza', 800 * 100);
    if extract(month from m) in (9, 2) then
      insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
        values (v_campus, inv, v_ali, v_exam_fee, 'Exam fee, Ali Raza', 1500 * 100);
    end if;
    insert into public.payments (campus_id, family_id, invoice_id, amount_paisa, mode, reference, receipt_no, received_by, received_at, idempotency_key)
      select v_campus, v_ali_fam, inv, sum(amount_paisa), (array['cash', 'jazzcash', 'easypaisa'])[1 + i % 3]::public.payment_mode,
             'DEMO-ALI-' || i, 'R-A' || lpad(i::text, 4, '0'), v_accountant, m + 4 + (i % 5) + interval '11 hours', 'seed-journey-' || inv
      from public.invoice_lines where invoice_id = inv;
  end loop;

  -- This month's challans for every new family (Ali's family has paid; about 65% of the others have)
  n := 0;
  for fam in select fm.id from public.families fm where fm.id = any(jy_fams) order by fm.created_at, fm.id loop
    n := n + 1;
    insert into public.invoices (campus_id, family_id, billing_month, due_on, challan_no)
      values (v_campus, fam.id, date_trunc('month', v_today)::date, date_trunc('month', v_today)::date + 9,
              'JY-' || to_char(v_today, 'YYMM') || '-' || lpad(n::text, 4, '0'))
      returning id into inv;
    insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
      select v_campus, inv, s.id, fs.fee_head_id, h.name || ', ' || s.full_name, fs.amount_paisa
      from public.students s
      join public.sections sec2 on sec2.id = s.section_id
      join public.fee_structures fs on fs.class_id = sec2.class_id
      join public.fee_heads h on h.id = fs.fee_head_id
      where s.family_id = fam.id;
    insert into public.invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
      select v_campus, inv, s.id, v_tuition, 'Sibling concession 10%, ' || s.full_name, -(fs.amount_paisa / 10)
      from (select s.*, row_number() over (order by s.admission_no) rn from public.students s where s.family_id = fam.id) s
      join public.sections sec2 on sec2.id = s.section_id
      join public.fee_structures fs on fs.class_id = sec2.class_id and fs.fee_head_id = v_tuition
      where s.rn > 1;
    if fam.id = v_ali_fam or random() < 0.65 then
      insert into public.payments (campus_id, family_id, invoice_id, amount_paisa, mode, reference, receipt_no, received_by, received_at, idempotency_key)
      select v_campus, fam.id, inv, sum(amount_paisa),
             (array['cash','cash','cash','jazzcash','jazzcash','easypaisa','easypaisa','cash'])[1 + floor(random() * 8)::int]::public.payment_mode,
             'DEMO-JY-' || n, 'R-J' || lpad(n::text, 5, '0'), v_accountant,
             date_trunc('month', v_today) + (floor(random() * least(extract(day from v_today), 20)) || ' days')::interval + interval '10 hours',
             'seed-journey-' || inv
      from public.invoice_lines where invoice_id = inv
      having sum(amount_paisa) > 0;
    end if;
  end loop;

  -- Attendance for the new students, the same last 20 school days as everyone else
  for d in select x::date from generate_series(v_today - 28, v_today - 1, interval '1 day') x
           where extract(isodow from x) between 1 and 5 loop
    for stu in select s.id, s.section_id from public.students s where s.campus_id = v_campus and s.admission_no like 'JY-%' loop
      r := random();
      st := case when stu.id = v_ali then (case when r < 0.95 then 'present' else 'late' end)::public.attendance_status
                 when r < 0.88 then 'present' when r < 0.93 then 'late' when r < 0.98 then 'absent' else 'leave' end;
      insert into public.attendance (campus_id, section_id, student_id, date, status, marked_by)
      values (v_campus, stu.section_id, stu.id, d, st, (select class_teacher_id from public.sections where id = stu.section_id))
      on conflict (student_id, date) do nothing;
    end loop;
  end loop;

  -- A Physics quiz in 10-A: made with the quiz maker, printed, scanned, and published straight to families
  select ss.teacher_id into t_phy from public.section_subjects ss join public.subjects sb on sb.id = ss.subject_id
   where ss.section_id = v_10a and sb.name = 'Physics';
  qkey := array['B', 'C', 'A', 'D', 'B', 'A', 'C', 'B', 'D', 'A'];
  insert into public.paper_tests (campus_id, section_id, subject_id, title, test_date, mcq_key, mcq_marks_each, options_per_mcq,
                                  questions, mcq_questions, auto_publish, status, created_by, approved_by, approved_at)
    select v_campus, v_10a, sb.id, 'Quiz: Chapter 2 Kinematics', v_today - 2, to_jsonb(qkey), 1, 4, '[]',
           '[{"q":"The SI unit of acceleration is:","options":["m/s","m/s²","m²/s","N/kg·s"]},
             {"q":"A body moving with uniform velocity has acceleration:","options":["Positive","Negative","Zero","Increasing"]},
             {"q":"The slope of a distance-time graph gives:","options":["Speed","Acceleration","Displacement","Force"]},
             {"q":"Area under a speed-time graph gives:","options":["Acceleration","Velocity","Force","Distance"]},
             {"q":"Which of these is a vector quantity?","options":["Speed","Displacement","Distance","Time"]},
             {"q":"Value of g near the Earth''s surface is about:","options":["10 m/s²","1 m/s²","100 m/s²","0.1 m/s²"]},
             {"q":"A car starts from rest; its initial velocity is:","options":["10 m/s","1 m/s","0 m/s","Not known"]},
             {"q":"Motion of a swing is an example of:","options":["Random motion","Vibratory motion","Rotatory motion","Translatory motion"]},
             {"q":"Which equation of motion has no time in it?","options":["vf = vi + at","S = vi t + ½at²","S = vt","2aS = vf² − vi²"]},
             {"q":"Deceleration means:","options":["Negative acceleration","Zero velocity","Uniform speed","Positive acceleration"]}]'::jsonb,
           true, 'approved', t_phy, t_phy, now() - interval '1 day'
    from public.subjects sb where sb.campus_id = v_campus and sb.name = 'Physics'
    returning id into v_quiz;
  for stu in select s.id from public.students s where s.section_id = v_10a and s.status = 'enrolled' loop
    if stu.id <> v_ali and random() < 0.05 then
      insert into public.paper_sheets (campus_id, test_id, student_id, status, reviewed_by, reviewed_at)
        values (v_campus, v_quiz, stu.id, 'absent', t_phy, now() - interval '1 day');
      continue;
    end if;
    ans := '{}';
    score := 0;
    for i in 1..10 loop
      r := random();
      if stu.id = v_ali then r := case when i = 9 then 0.99 else 0 end; end if;
      ans := array_append(ans, case when r < 0.74 then qkey[i] when r < 0.97 then (array['A','B','C','D'])[1 + floor(random() * 4)::int] else null end);
      if ans[i] = qkey[i] then score := score + 1; end if;
    end loop;
    insert into public.paper_sheets (campus_id, test_id, student_id, mcq_answers, mcq_score, flags, answers, total, status,
                                     scanned_at, reviewed_by, reviewed_at)
      values (v_campus, v_quiz, stu.id, to_jsonb(ans), score, '[]', '[]', score, 'reviewed',
              now() - interval '1 day 2 hours', t_phy, now() - interval '1 day');
  end loop;

  -- Next year's Class 9 admissions already coming in
  insert into public.admissions (campus_id, child_name, guardian_name, phone, applying_class_id, status, test_on, notes, previous_school, last_class_passed)
    select v_campus, x.child, x.guardian, x.phone, c.id, x.stat::public.admission_status, x.test_on, x.notes, x.school, 'Class 8'
    from (values ('Abdul Rehman', 'Naveed Anjum', '03004561230', 'inquiry', null::date, 'Asked on WhatsApp about Biology group fee', 'Govt. Boys Middle School, Township'),
                 ('Mahnoor Fatima', 'Asif Javed', '03124561231', 'test', v_today + 6, 'Entry test booked', 'Allied School, Johar Town'),
                 ('Rayyan Tariq', 'Tariq Aziz', '03214561232', 'offered', v_today - 4, 'Test 81%, Computer group', 'The Educators, Wapda Town'),
                 ('Hafsa Noor', 'Noor Elahi', '03334561233', 'inquiry', null::date, 'Walk-in, cousin studies here', 'Dar-e-Arqam School, Township')) as x(child, guardian, phone, stat, test_on, notes, school)
    join public.classes c on c.name = 'Class 9' and c.campus_id = v_campus;

  raise notice 'Journey demo data added: % new families.', array_length(jy_fams, 1);
end $$;
