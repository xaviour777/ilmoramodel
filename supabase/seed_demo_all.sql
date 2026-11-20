-- Demo records for every feature at Johar Town (the main demo campus), so each login has
-- something to look at: this month's fees and payments, expenses and salaries, staff attendance,
-- a question bank with practice, complaints, observations, vans, remedial list, lesson plans,
-- a substitution, leave requests, parent meetings, approvals and an auto flow.
-- Run once after seed.sql and seed_owner_group.sql. Safe to re-run (skips if already done).
do $$
declare
  c uuid; sch uuid; today date := (now() at time zone 'Asia/Karachi')::date;
  t_ayesha uuid; t_bilal uuid; t_rabia uuid; pr uuid; acc uuid; par uuid; stu_prof uuid;
  fam uuid; zainab uuid; hamza uuid; sec_z uuid; sec_h uuid; cls8 uuid; cls9 uuid; cls10 uuid;
  s_math uuid; s_eng uuid; s_sci uuid; s_phy uuid;
  r record; i int; k int; d date; v1 uuid; v2 uuid; inv uuid; cat uuid; slot uuid; q text;
  cats text[] := array['Rent','Utilities','Supplies','Repairs','Transport'];
  eng text[][] := array[
    ['The opposite of "ancient" is…','modern','old','early','rare','A'],
    ['Choose the noun: "The girl ran quickly."','girl','ran','quickly','the','A'],
    ['Plural of "child" is…','childs','children','childes','childrens','B'],
    ['Past tense of "go" is…','goed','gone','went','going','C'],
    ['A word that describes a noun is a(n)…','verb','adverb','adjective','pronoun','C'],
    ['"She ___ to school every day."','go','goes','going','gone','B'],
    ['Synonym of "happy" is…','sad','angry','joyful','tired','C'],
    ['Which is a question mark?','.','!','?',',','C'],
    ['"I have ___ apple."','a','an','the','some','B'],
    ['Opposite of "brave" is…','bold','coward','strong','proud','B']];
  sci text[][] := array[
    ['Plants make food by…','respiration','photosynthesis','digestion','evaporation','B'],
    ['Water boils at (sea level)…','50 °C','90 °C','100 °C','120 °C','C'],
    ['The closest star to Earth is…','the Moon','the Sun','Mars','Sirius','B'],
    ['Which gas do we breathe out more of?','oxygen','nitrogen','carbon dioxide','hydrogen','C'],
    ['The unit of force is…','joule','newton','watt','metre','B'],
    ['The heart pumps…','air','food','blood','water','C'],
    ['Ice turning to water is…','melting','freezing','boiling','condensation','A'],
    ['Which is a mammal?','shark','frog','whale','eagle','C'],
    ['Light travels fastest in…','water','glass','vacuum','air','C'],
    ['The basic unit of life is the…','atom','cell','organ','tissue','B']];
  phy text[][] := array[
    ['SI unit of speed is…','m/s','km','s','N','A'],
    ['Acceleration due to gravity on Earth is about…','1 m/s²','5 m/s²','9.8 m/s²','20 m/s²','C'],
    ['Work = force × …','time','mass','distance','speed','C'],
    ['A vector quantity has…','size only','direction only','size and direction','neither','C'],
    ['1 kilowatt equals…','10 W','100 W','1000 W','10000 W','C'],
    ['Pressure = force ÷ …','area','volume','mass','time','A'],
    ['Which is a scalar?','velocity','force','mass','displacement','C'],
    ['Unit of power is…','joule','watt','newton','pascal','B'],
    ['Momentum = mass × …','acceleration','velocity','force','time','B'],
    ['Density = mass ÷ …','area','weight','volume','length','C']];
begin
  select id, school_id into c, sch from campuses where name = 'Johar Town Campus';
  if c is null then raise exception 'Run seed.sql first.'; end if;
  if exists (select 1 from feedback where campus_id = c) then raise notice 'Already seeded.'; return; end if;
  perform setseed(0.7);
  select id into t_ayesha from profiles where email = 'teacher@demo.ilmora.pk';
  select id into t_bilal from profiles where email = 'bilal@demo.ilmora.pk';
  select id into t_rabia from profiles where email = 'rabia@demo.ilmora.pk';
  select id into pr from profiles where email = 'principal@demo.ilmora.pk';
  select id into acc from profiles where email = 'accounts@demo.ilmora.pk';
  select id into par from profiles where email = 'parent@demo.ilmora.pk';
  select id into stu_prof from profiles where email = 'student@demo.ilmora.pk';
  select s.family_id into fam from students s join family_guardians g on g.family_id = s.family_id where g.profile_id = par limit 1;
  select id, section_id into zainab, sec_z from students where family_id = fam and full_name like 'Zainab%';
  select id, section_id into hamza, sec_h from students where family_id = fam and full_name like 'Hamza%';
  select class_id into cls8 from sections where id = sec_z;
  select class_id into cls10 from sections where id = sec_h;
  select id into cls9 from classes where campus_id = c and name = 'Class 9';
  select id into s_math from subjects where campus_id = c and name = 'Mathematics';
  select id into s_eng from subjects where campus_id = c and name = 'English';
  select id into s_sci from subjects where campus_id = c and name = 'Science';
  select id into s_phy from subjects where campus_id = c and name = 'Physics';

  -- 1. November challans (same lines as October) and payments for most families
  for r in select i0.id, i0.family_id, i0.challan_no from invoices i0 where i0.campus_id = c and i0.billing_month = '2026-10-01' loop
    insert into invoices (campus_id, family_id, billing_month, due_on, challan_no) values (c, r.family_id, '2026-11-01', '2026-11-10', replace(r.challan_no, '2610', '2611') || '-N') returning id into inv;
    insert into invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa)
      select c, inv, l.student_id, l.fee_head_id, l.description, l.amount_paisa from invoice_lines l where l.invoice_id = r.id;
    if r.family_id <> fam and random() < 0.72 then
      insert into payments (campus_id, family_id, invoice_id, amount_paisa, mode, receipt_no, received_by, received_at, idempotency_key)
        values (c, r.family_id, inv, (select sum(amount_paisa) from invoice_lines where invoice_id = inv),
                (array['cash','cash','cash','jazzcash','easypaisa','cash'])[1 + floor(random() * 6)::int]::payment_mode,
                'JT-R-2611-' || substr(inv::text, 1, 8), acc,
                timestamp '2026-11-02 10:00' + (floor(random() * 16) || ' days')::interval, 'seed-jt-2611-' || inv);
    end if;
  end loop;
  -- the demo parent sent a JazzCash payment that the office still has to confirm
  insert into payment_claims (campus_id, family_id, invoice_id, amount_paisa, mode, txn_id, paid_on, sender_phone, created_by)
    select c, fam, i2.id, (select sum(amount_paisa) from invoice_lines where invoice_id = i2.id), 'jazzcash', '7741029384', today - 1, '03001234567', par
    from invoices i2 where i2.family_id = fam and i2.billing_month = '2026-11-01' limit 1;

  -- 2. expenses (Oct and Nov) and 3. salaries (Oct paid, Nov due)
  foreach q in array cats loop
    insert into expense_categories (campus_id, name, sort) values (c, q, array_position(cats, q)) returning id into cat;
    foreach d in array array['2026-10-05'::date, '2026-11-05'::date] loop
      insert into expenses (campus_id, category_id, spent_on, amount_paisa, paid_to, created_by)
        values (c, cat, d + (array_position(cats, q) * 2), (array[18000000, 4200000, 950000, 1300000, 2400000])[array_position(cats, q)] + floor(random() * 300000)::bigint,
                (array['Landlord','LESCO / SNGPL','Stationers','Maintenance','Van fuel'])[array_position(cats, q)], acc);
    end loop;
  end loop;
  for r in select id, role from profiles where campus_id = c and is_active and role in ('principal','accountant','teacher') loop
    foreach d in array array['2026-10-01'::date, '2026-11-01'::date] loop
      insert into salary_payments (campus_id, profile_id, month, basic_paisa, allowance_paisa, net_paisa, status, paid_on, pay_mode, created_by)
        values (c, r.id, d, case r.role when 'principal' then 15000000 when 'accountant' then 6000000 else 5000000 end, 500000,
                case r.role when 'principal' then 15500000 when 'accountant' then 6500000 else 5500000 end,
                case when d = '2026-10-01' then 'paid' else 'due' end, case when d = '2026-10-01' then date '2026-11-01' end, case when d = '2026-10-01' then 'bank' end, acc);
    end loop;
  end loop;

  -- 4. staff attendance for the last three weeks
  for r in select id from profiles where campus_id = c and is_active and role in ('principal','accountant','teacher') loop
    for d in select g::date from generate_series(today - 20, today, interval '1 day') g where extract(isodow from g) < 6 loop
      insert into staff_attendance (campus_id, profile_id, date, status) values (c, r.id, d, (case when random() < 0.93 then 'present' when random() < 0.6 then 'late' else 'absent' end)::attendance_status)
      on conflict do nothing;
    end loop;
  end loop;

  -- 5. question bank (MCQs) for the demo children's classes and the board classes; practice attempts
  for r in select x.cls, x.sub, x.kind from (values (cls8, s_math, 'math'), (cls8, s_eng, 'eng'), (cls8, s_sci, 'sci'),
                                                  (cls10, s_math, 'math'), (cls10, s_eng, 'eng'), (cls10, s_phy, 'phy'),
                                                  (cls9, s_math, 'math'), (cls9, s_phy, 'phy')) x(cls, sub, kind) where x.cls is not null and x.sub is not null loop
    for k in 1..2 loop
      for i in 1..10 loop
        if r.kind = 'math' then
          declare a int := 3 + floor(random() * 15)::int; b int := 2 + floor(random() * 12)::int; ans int; pos int := 1 + floor(random() * 4)::int; opts text[];
          begin
            ans := case when k = 1 then a * b else a * b + a end;
            opts := array[(ans + 2)::text, (ans - 1)::text, (ans + 5)::text, (ans - 3)::text];
            opts[pos] := ans::text;
            insert into question_bank (campus_id, class_id, subject_id, chapter, kind, question, options, answer, marks, source)
              values (c, r.cls, r.sub, case when k = 1 then 'Ch 1 · Multiplication' else 'Ch 2 · Order of operations' end, 'mcq',
                      case when k = 1 then format('What is %s × %s?', a, b) else format('What is %s × %s + %s?', a, b, a) end, to_jsonb(opts), (array['A','B','C','D'])[pos], 1, 'teacher');
          end;
        else
          q := r.kind;
          declare m text[];
          begin
            m := case q when 'eng' then array[eng[i][1], eng[i][2], eng[i][3], eng[i][4], eng[i][5], eng[i][6]]
                        when 'sci' then array[sci[i][1], sci[i][2], sci[i][3], sci[i][4], sci[i][5], sci[i][6]]
                        else array[phy[i][1], phy[i][2], phy[i][3], phy[i][4], phy[i][5], phy[i][6]] end;
            insert into question_bank (campus_id, class_id, subject_id, chapter, kind, question, options, answer, marks, source)
              values (c, r.cls, r.sub, case when k = 1 then 'Ch 1 · Basics' else 'Ch 2 · Practice set' end, 'mcq', m[1], to_jsonb(array[m[2], m[3], m[4], m[5]]), m[6], 1,
                      case when k = 2 then 'past_paper' else 'teacher' end);
          end;
        end if;
      end loop;
    end loop;
  end loop;
  insert into practice_attempts (campus_id, student_id, subject_id, chapter, total, correct, created_at) values
    (c, hamza, s_math, 'Ch 1 · Multiplication', 10, 8, now() - interval '3 days'), (c, hamza, s_phy, 'Ch 1 · Basics', 10, 5, now() - interval '2 days'),
    (c, hamza, s_eng, 'Ch 1 · Basics', 10, 9, now() - interval '1 day'), (c, zainab, s_math, 'Ch 1 · Multiplication', 10, 6, now() - interval '2 days'),
    (c, zainab, s_sci, 'Ch 1 · Basics', 10, 7, now() - interval '1 day');
  update students set date_of_birth = date '2014-11-19' where id = zainab and date_of_birth is null;   -- birthday today: try the birthday flow
  update students set date_of_birth = date '2010-03-08' where id = hamza and date_of_birth is null;

  -- 6. complaints and suggestions
  insert into feedback (campus_id, from_profile, kind, topic, body, anonymous, status, reply, replied_at, created_at) values
    (c, par, 'complaint', 'transport', 'The van came 25 minutes late twice this week.', false, 'in_progress', 'We have spoken to the driver; timing will be checked daily.', now() - interval '1 day', now() - interval '3 days'),
    (c, par, 'suggestion', 'facilities', 'Please add a water cooler near the Class 8 block.', false, 'open', null, null, now() - interval '1 day'),
    (c, par, 'praise', 'teaching', 'Ms Ayesha explains maths very well, Zainab enjoys it now.', false, 'resolved', 'Thank you! We have shared this with Ms Ayesha.', now() - interval '5 days', now() - interval '6 days'),
    (c, t_rabia, 'suggestion', 'other', 'A short staff meeting every Monday would help planning.', true, 'open', null, null, now() - interval '2 days');

  -- 7. lesson observations
  insert into observations (campus_id, teacher_id, observer_id, section_id, subject_id, observed_on, planning, delivery, engagement, discipline, strengths, improve) values
    (c, t_ayesha, pr, sec_z, s_math, today - 6, 4, 5, 4, 4, 'Clear examples, good use of the board', 'Give the back benches more questions'),
    (c, t_bilal, pr, null, null, today - 9, 3, 3, 2, 3, 'Well prepared notes', 'Students were passive; try group work'),
    (c, t_rabia, pr, null, null, today - 12, 5, 4, 5, 5, 'Very engaging, students asked questions', 'Keep timing on track');

  -- 8. vans, riders and today's morning trip
  insert into vans (campus_id, name, plate, driver_name, driver_phone, route, seats, monthly_fee_paisa) values
    (c, 'Van 1', 'LEB-4821', 'Akram Masih', '03214567890', 'Johar Town → Wapda Town → School', 14, 350000) returning id into v1;
  insert into vans (campus_id, name, plate, driver_name, driver_phone, route, seats, monthly_fee_paisa) values
    (c, 'Van 2', 'LEC-1190', 'Shahid Iqbal', '03331234567', 'Model Town → Faisal Town → School', 12, 350000) returning id into v2;
  insert into van_students (van_id, student_id, stop, campus_id) values (v1, zainab, 'Block G, Johar Town', c), (v1, hamza, 'Block G, Johar Town', c);
  insert into van_students (van_id, student_id, stop, campus_id)
    select case when rn % 2 = 0 then v1 else v2 end, id, 'Stop ' || (1 + rn % 5), c
    from (select id, row_number() over (order by full_name) rn from students where campus_id = c and status = 'enrolled' and family_id <> fam limit 20) z;
  insert into van_trips (campus_id, van_id, date, leg, missing, marked_by) values (c, v1, today, 'morning', '{}', t_ayesha);

  -- 9. remedial list and 10. lesson plans for the demo teacher
  insert into remedial_students (campus_id, student_id, section_id, subject_id, reason, plan, started_on, created_by)
    select c, s.id, sec_z, s_math, 'marks below 50%', 'Extra class Tue/Thu after school', today - 14, t_ayesha
    from students s where s.section_id = sec_z and s.status = 'enrolled' and s.id <> zainab order by s.roll_no limit 3;
  insert into lesson_plans (campus_id, teacher_id, section_id, subject_id, week_start, topics, objectives, homework)
    select c, t_ayesha, ss.section_id, ss.subject_id, date_trunc('week', today)::date, 'Ch 4: fractions, adding and subtracting', 'Add unlike fractions', 'Ex 4.2 Q1-10'
    from section_subjects ss where ss.teacher_id = t_ayesha limit 3;
  insert into lesson_diary (campus_id, section_id, subject_id, teacher_id, date, topic, notes)
    select c, ss.section_id, ss.subject_id, t_ayesha, today - 1, 'Fractions: like denominators', 'Most students understood'
    from section_subjects ss where ss.teacher_id = t_ayesha limit 3;
  insert into behaviour_notes (campus_id, student_id, teacher_id, kind, note, share_with_parents) values
    (c, zainab, t_ayesha, 'praise', 'Helped a classmate with her maths homework.', true),
    (c, hamza, t_ayesha, 'concern', 'Did not bring his Physics notebook twice this week.', true);

  -- 11. Bilal is on leave today and Ayesha takes one of his periods; Rabia asks for leave
  insert into leave_requests (campus_id, profile_id, from_on, to_on, reason, status, decided_by, decided_at) values (c, t_bilal, today, today, 'Family emergency', 'approved', pr, now());
  insert into leave_requests (campus_id, profile_id, from_on, to_on, reason, status) values (c, t_rabia, today + 7, today + 8, 'Sister''s wedding', 'pending');
  select id into slot from timetable_slots where teacher_id = t_bilal and weekday = extract(isodow from today)::int limit 1;
  if slot is not null then
    insert into substitutions (campus_id, date, timetable_slot_id, absent_teacher_id, substitute_id, created_by) values (c, today, slot, t_bilal, t_ayesha, pr) on conflict do nothing;
  end if;

  -- 12. the demo parent: a pending leave request, an approved one, and a booked teacher meeting
  insert into student_leave (campus_id, student_id, section_id, from_on, to_on, reason, status, requested_by) values
    (c, zainab, sec_z, today + 2, today + 3, 'Family trip to Faisalabad', 'pending', par),
    (c, hamza, sec_h, today - 10, today - 10, 'Fever', 'approved', par);
  for i in 0..5 loop
    insert into ptm_slots (campus_id, teacher_id, starts_at, minutes, place, student_id, booked_by, booked_at, note)
      values (c, t_ayesha, ((today + 2) + time '13:30' + (i * 10 || ' minutes')::interval) at time zone 'Asia/Karachi', 10, 'Class 8 room',
              case when i = 1 then zainab end, case when i = 1 then par end, case when i = 1 then now() end, case when i = 1 then 'About maths progress' end);
  end loop;

  -- 13. requests to the owner and 14. an auto flow
  insert into approvals (school_id, campus_id, kind, title, detail, amount_paisa, monthly, requested_by) values
    (sch, c, 'expense', 'New science lab equipment', 'Physics and Chemistry, 3 quotations', 120000000, false, pr),
    (sch, c, 'concession', 'Sibling concession · 6 families', 'Third child free tuition', 3600000, true, pr);
  insert into approvals (school_id, campus_id, kind, title, amount_paisa, status, requested_by, decided_by, decided_at, decision_note) values
    (sch, c, 'expense', 'Generator repair', 8500000, 'approved', pr, (select id from profiles where email = 'owner@demo.ilmora.pk'), now() - interval '4 days', 'OK, keep the old parts');
  insert into wa_flows (campus_id, name, trigger, enabled, created_by, nodes, edges) values
    (c, 'Absent today', 'absent', false, pr,
     '[{"id":"t","type":"trigger","x":40,"y":40,"data":{}},{"id":"s1","type":"send","x":40,"y":160,"data":{"text":"Assalam-o-Alaikum {parent}. {student} ({class}) is absent today, {date}. If this is a mistake, please tell the class teacher."}}]',
     '[{"from":"t","to":"s1"}]');
  update admissions set source = (array['Parent referral','Facebook','Walk-in','Banner'])[1 + floor(random() * 4)::int] where campus_id = c and source is null;
end $$;
