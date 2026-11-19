-- Demo for the owner dashboard: an owner login (owner@demo.ilmora.pk / Ilmora@2026) for the
-- Model School group, a second running campus (Model Town) with a few weeks of real-looking
-- records, and a third campus that is still opening (Gulberg). Run once after seed.sql.
do $$
declare
  v_school uuid; v_jt uuid; v_mt uuid; v_gb uuid; v_owner uuid; v_pr uuid; v_acc uuid;
  v_sess uuid; v_term uuid; v_exam uuid; v_head uuid; v_cat_rent uuid; v_cat_util uuid; v_cat_sup uuid;
  v_cls uuid; v_sec uuid; v_fam uuid; v_stu uuid; v_inv uuid; v_sub uuid;
  t record; i int; k int; d date; m date; n int := 0; uid uuid; p record; e text; u_owner uuid; u_pr uuid;
  teachers uuid[] := '{}';
begin
  perform setseed(0.42);
  select s.id, c.id into v_school, v_jt from schools s join campuses c on c.school_id = s.id where s.name = 'Model School' order by c.created_at limit 1;
  if v_school is null then raise exception 'Run seed.sql first.'; end if;
  if exists (select 1 from campuses where school_id = v_school and name = 'Model Town Campus') then raise notice 'Already seeded.'; return; end if;

  -- logins first (password Ilmora@2026), so the profiles can be created already linked
  foreach e in array array['owner@demo.ilmora.pk', 'principal.mt@demo.ilmora.pk'] loop
    select id into uid from auth.users where email = e;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e, extensions.crypt('Ilmora@2026', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
    end if;
    if e like 'owner%' then u_owner := uid; else u_pr := uid; end if;
  end loop;

  -- owner sits on the first campus; sees all campuses of the school
  insert into profiles (campus_id, role, full_name, email, phone, user_id) values (v_jt, 'owner', 'Khalid Aziz', 'owner@demo.ilmora.pk', '03001119999', u_owner) returning id into v_owner;
  update campuses set admissions_target = 80, status = 'running', opened_on = '2016-04-01',
    principal_id = (select id from profiles where campus_id = v_jt and role = 'principal' order by created_at limit 1) where id = v_jt;

  -- second campus
  insert into campuses (school_id, name, city, status, opened_on, admissions_target, seat_capacity) values (v_school, 'Model Town Campus', 'Lahore', 'running', '2012-04-01', 40, 180) returning id into v_mt;
  insert into campus_settings (campus_id) values (v_mt) on conflict do nothing;
  insert into profiles (campus_id, role, full_name, email, phone, user_id) values (v_mt, 'principal', 'Dr Saim Akhtar', 'principal.mt@demo.ilmora.pk', '03001118001', u_pr) returning id into v_pr;
  update campuses set principal_id = v_pr where id = v_mt;
  insert into profiles (campus_id, role, full_name, phone) values (v_mt, 'accountant', 'Hina Javed', '03001118002') returning id into v_acc;
  for i in 1..4 loop
    insert into profiles (campus_id, role, full_name, phone) values (v_mt, 'teacher', (array['Asma Khan','Faisal Raza','Mehwish Ali','Tariq Mehmood'])[i], '0300111801' || i) returning id into uid;
    teachers := teachers || uid;
  end loop;

  insert into academic_sessions (campus_id, name, starts_on, ends_on, is_current) values (v_mt, '2026-27', '2026-04-01', '2027-03-31', true) returning id into v_sess;
  insert into terms (campus_id, session_id, name, starts_on, ends_on, sort) values (v_mt, v_sess, 'First term', '2026-04-01', '2026-12-31', 1) returning id into v_term;
  insert into fee_heads (campus_id, name, priority) values (v_mt, 'Tuition fee', 1) returning id into v_head;
  insert into exams (campus_id, term_id, name, kind, starts_on, ends_on, total_marks, status) values (v_mt, v_term, 'Mid-term', 'term', '2026-10-19', '2026-10-24', 100, 'results') returning id into v_exam;

  for k in 1..3 loop
    insert into subjects (campus_id, name) values (v_mt, (array['English','Mathematics','Science'])[k]);
  end loop;

  for k in 6..8 loop
    insert into classes (campus_id, name, sort) values (v_mt, 'Class ' || k, k) returning id into v_cls;
    insert into fee_structures (campus_id, class_id, fee_head_id, amount_paisa, monthly) values (v_mt, v_cls, v_head, (4200 + (k - 6) * 300) * 100, true);
    for t in select unnest(array['A','B']) as nm loop
      insert into sections (campus_id, class_id, name, capacity, class_teacher_id) values (v_mt, v_cls, t.nm, 30, teachers[1 + (n % 4)]) returning id into v_sec;
      for i in 1..7 loop
        n := n + 1;
        insert into families (campus_id, name, phone) values (v_mt, (array['Ahmed','Butt','Chaudhry','Dar','Ijaz','Khan','Malik','Qureshi','Rana','Sheikh'])[1 + n % 10] || ' family ' || n, '0301' || lpad((7000000 + n)::text, 7, '0')) returning id into v_fam;
        insert into students (campus_id, family_id, section_id, full_name, roll_no, gender, status, admitted_on)
          values (v_mt, v_fam, v_sec, (array['Ali','Ayesha','Hamza','Fatima','Usman','Zainab','Bilal','Maryam','Hassan','Sana'])[1 + n % 10] || ' ' || (array['Ahmed','Raza','Iqbal','Nawaz','Shah'])[1 + n % 5],
                  i::text, case when n % 2 = 0 then 'female' else 'male' end, 'enrolled', '2025-04-01') returning id into v_stu;
        -- October and November challans; most pay October, fewer have paid November so far
        foreach m in array array['2026-10-01'::date, '2026-11-01'::date] loop
          insert into invoices (campus_id, family_id, billing_month, due_on, challan_no) values (v_mt, v_fam, m, m + 9, 'MT-' || to_char(m, 'YYMM') || '-' || lpad(n::text, 4, '0')) returning id into v_inv;
          insert into invoice_lines (campus_id, invoice_id, student_id, fee_head_id, description, amount_paisa) values (v_mt, v_inv, v_stu, v_head, 'Tuition fee', (4200 + (k - 6) * 300) * 100);
          if random() < (case when m = '2026-10-01' then 0.9 else 0.68 end) then
            insert into payments (campus_id, family_id, invoice_id, amount_paisa, mode, receipt_no, received_by, received_at, idempotency_key)
              values (v_mt, v_fam, v_inv, (4200 + (k - 6) * 300) * 100, (array['cash','cash','jazzcash','cash','easypaisa'])[1 + floor(random() * 5)::int]::payment_mode,
                      'MT-R-' || to_char(m, 'YYMM') || lpad(n::text, 4, '0'), v_acc, m + (3 + floor(random() * 12)::int) + interval '10 hours', 'seed-mt-' || n || '-' || to_char(m, 'YYMM'));
          end if;
        end loop;
        -- attendance on school days 2–18 Nov
        for d in select g::date from generate_series('2026-11-02'::date, '2026-11-18'::date, interval '1 day') g where extract(isodow from g) < 6 loop
          insert into attendance (campus_id, section_id, student_id, date, status, marked_at)
            values (v_mt, v_sec, v_stu, d, (case when random() < 0.9 then 'present' when random() < 0.5 then 'late' else 'absent' end)::attendance_status, d + interval '8 hours');
        end loop;
        for v_sub in select id from subjects where campus_id = v_mt loop
          insert into marks (campus_id, exam_id, subject_id, student_id, obtained) values (v_mt, v_exam, v_sub, v_stu, 45 + floor(random() * 50));
        end loop;
      end loop;
    end loop;
  end loop;

  -- expenses and salaries
  insert into expense_categories (campus_id, name, sort) values (v_mt, 'Rent', 1) returning id into v_cat_rent;
  insert into expense_categories (campus_id, name, sort) values (v_mt, 'Utilities', 2) returning id into v_cat_util;
  insert into expense_categories (campus_id, name, sort) values (v_mt, 'Supplies', 3) returning id into v_cat_sup;
  foreach m in array array['2026-10-01'::date, '2026-11-01'::date] loop
    insert into expenses (campus_id, category_id, spent_on, amount_paisa, paid_to, created_by) values
      (v_mt, v_cat_rent, m + 4, 6000000, 'Landlord', v_acc),
      (v_mt, v_cat_util, m + 12, 1850000, 'LESCO', v_acc),
      (v_mt, v_cat_sup, m + 15, 640000, 'Stationers', v_acc);
    for p in select id, role from profiles where campus_id = v_mt loop
      insert into salary_payments (campus_id, profile_id, month, basic_paisa, net_paisa, status, paid_on, created_by)
        values (v_mt, p.id, m, case p.role when 'principal' then 12000000 when 'accountant' then 4500000 else 5500000 end,
                case p.role when 'principal' then 12000000 when 'accountant' then 4500000 else 5500000 end,
                case when m = '2026-10-01' then 'paid' else 'due' end, case when m = '2026-10-01' then m + 31 end, v_acc);
    end loop;
  end loop;

  -- third campus, still opening
  insert into campuses (school_id, name, city, status, opened_on, admissions_target, seat_capacity) values (v_school, 'Gulberg Campus', 'Lahore', 'opening', '2027-04-01', 120, 300) returning id into v_gb;
  insert into campus_settings (campus_id) values (v_gb) on conflict do nothing;
  insert into campus_checklist (campus_id, item, status, note, sort) values
    (v_gb, 'Building and furniture', 'done', null, 1), (v_gb, 'BISE affiliation', 'doing', 'Applied', 2),
    (v_gb, 'Principal hired', 'todo', null, 3), (v_gb, 'Teachers hired', 'todo', '0 of 14', 4),
    (v_gb, 'Admissions open', 'todo', 'Target 120', 5), (v_gb, 'Break-even', 'todo', 'about 160 students', 6);

  insert into approval_limits (school_id, kind, role, limit_paisa, note) values
    (v_school, 'expense', 'principal', 5000000, null), (v_school, 'concession', 'principal', null, 'Up to 10% per family'),
    (v_school, 'hiring', 'principal', null, 'Replacements only'), (v_school, 'payroll', 'principal', null, 'Owner always'),
    (v_school, 'fee_change', 'principal', null, 'Owner always');
  insert into group_settings (school_id, due_day, max_concession_pct) values (v_school, 10, 10) on conflict do nothing;
  insert into approvals (school_id, campus_id, kind, title, detail, amount_paisa, requested_by) values
    (v_school, v_mt, 'payroll', 'November salaries · Model Town', '6 staff', (select sum(net_paisa) from salary_payments where campus_id = v_mt and month = '2026-11-01'), v_acc),
    (v_school, v_mt, 'expense', 'Smart board for Class 8', 'Two quotations attached', 18500000, v_pr);

end $$;
