-- Model School demo data, on top of supabase/seed.sql and supabase/seed_journey.sql.
-- Renames the demo school to "Model School" and the principal to "Dr Saim", then fills the
-- classes that were empty: Play group and Class 1 to 4 each get a class teacher, their subjects
-- (taught by that class teacher, Quran by the Qari) and 25 students with families. Class 8 and
-- Class 10 sections are topped up to 25. Every name and number is made up.
-- It only adds rows; it runs once (it stops if it finds its own students, admission no. MS-…).

do $$
declare
  v_campus uuid;
  boys text[] := array['Ahmed','Ali','Hamza','Hassan','Usman','Bilal','Saad','Umar','Abdullah','Ibrahim','Talha','Zain',
                       'Haris','Moiz','Rayyan','Arham','Shayan','Fahad','Huzaifa','Daniyal','Muneeb','Waleed','Taha','Subhan'];
  girls text[] := array['Ayesha','Fatima','Zainab','Maryam','Hira','Iqra','Noor','Sana','Amna','Laiba','Khadija','Eman',
                        'Alishba','Mahnoor','Areeba','Rimsha','Hafsa','Javeria','Anaya','Minahil','Dua','Aiman','Mehak','Zoya'];
  surnames text[] := array['Raza','Khan','Qureshi','Butt','Malik','Sheikh','Chaudhry','Javed','Iqbal','Siddiqui','Mirza','Akhtar',
                           'Aslam','Hussain','Rehman','Saleem','Anwar','Shah','Abbasi','Baig','Nawaz','Riaz','Yousaf','Farooq'];
  teachers text[] := array['Sumaira Javed','Bushra Anwar','Asma Rafiq','Nadia Hameed','Saba Kausar'];
  classes text[] := array['play group','Class 1','Class 2','Class 3','Class 4'];
  t uuid; v_quran uuid; sec record; f uuid; i int; k int; have int; n int := 0;
  sex text; fname text; sur text; father text;
begin
  select id into v_campus from public.campuses order by created_at limit 1;
  if v_campus is null then raise exception 'Run supabase/seed.sql first'; end if;
  if exists (select 1 from public.students where campus_id = v_campus and admission_no like 'MS-%') then
    raise notice 'Model School demo data is already there; nothing to do.';
    return;
  end if;
  perform setseed(0.57);

  -- Names
  update public.schools set name = 'Model School'
   where id = (select school_id from public.campuses where id = v_campus);
  update public.profiles set full_name = 'Dr Saim'
   where id = (select id from public.profiles where campus_id = v_campus and role = 'principal' order by created_at limit 1);

  -- Primary subjects
  insert into public.subjects (campus_id, name)
    select v_campus, x from unnest(array['English','Urdu','Mathematics','Islamiat','General Knowledge','Nazra Quran','Art']) x
  on conflict (campus_id, name) do nothing;
  select id into v_quran from public.profiles where campus_id = v_campus and full_name = 'Qari Abdul Basit' limit 1;

  -- One class teacher for each junior class, who also teaches its subjects
  for i in 1 .. 5 loop
    insert into public.profiles (campus_id, role, full_name, phone)
      values (v_campus, 'teacher', teachers[i], '0300222' || lpad((1000 + i)::text, 4, '0'))
      returning id into t;
    update public.sections s set class_teacher_id = t
      from public.classes c
     where c.id = s.class_id and c.campus_id = v_campus and c.name = classes[i] and s.class_teacher_id is null;
    insert into public.section_subjects (campus_id, section_id, subject_id, teacher_id)
      select v_campus, s.id, sb.id, case when sb.name = 'Nazra Quran' and v_quran is not null then v_quran else t end
        from public.sections s join public.classes c on c.id = s.class_id
        cross join public.subjects sb
       where c.campus_id = v_campus and c.name = classes[i]
         and sb.campus_id = v_campus
         and sb.name = any (case when i = 1 then array['English','Urdu','Mathematics','Nazra Quran','Art']
                                 else array['English','Urdu','Mathematics','Islamiat','General Knowledge','Nazra Quran'] end)
         and not exists (select 1 from public.section_subjects x where x.section_id = s.id and x.subject_id = sb.id);
  end loop;

  -- Students: 25 in every junior section, Class 8 and 10 sections topped up to 25
  for sec in select s.id, s.name, c.name as cname, c.sort from public.sections s join public.classes c on c.id = s.class_id
              where c.campus_id = v_campus and (c.name = any (classes) or c.name in ('Class 8', 'Class 10'))
              order by c.sort, s.name loop
    select count(*) into have from public.students where section_id = sec.id;
    for k in have + 1 .. 25 loop
      n := n + 1;
      sex := case when random() < 0.5 then 'M' else 'F' end;
      fname := case sex when 'M' then boys[1 + floor(random() * 24)::int] else girls[1 + floor(random() * 24)::int] end;
      sur := surnames[1 + floor(random() * 24)::int];
      father := boys[1 + floor(random() * 24)::int] || ' ' || sur;
      insert into public.families (campus_id, name, phone, address, reminder_channel)
        values (v_campus, father || ' family', '0333' || lpad((3000000 + n * 7919)::text, 7, '0'),
                'House ' || (1 + floor(random() * 400))::int || ', Model Town, Lahore', 'auto')
        returning id into f;
      insert into public.students (campus_id, family_id, section_id, full_name, roll_no, admission_no, gender,
                                   admitted_on, status, father_name, date_of_birth, religion, nationality)
      values (v_campus, f, sec.id, fname || ' ' || sur,
              (greatest(sec.sort, 0) * 1000 + (ascii(upper(left(sec.name, 1))) - 64) * 100 + k)::text,
              'MS-' || lpad(n::text, 4, '0'), sex, date '2026-04-01', 'enrolled', father,
              make_date(2021 - greatest(sec.sort, 0), 4, 1) + floor(random() * 365)::int, 'Islam', 'Pakistani');
    end loop;
  end loop;

  raise notice 'Model School demo data added: % students.', n;
end $$;
