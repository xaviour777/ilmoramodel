-- Optional demo data (run after the syllabus migration): a whole-year syllabus for every class and
-- subject that has a teacher, with lessons done up to today (most on track, a few behind), and the
-- Mid-term exam half-way through marks entry. Safe to run again: it replaces its own demo rows only.
do $$
declare
  p record; v_sess record; v_book uuid; v_titles text[]; v_ch jsonb; v_pages int; v_start int;
  v_days int[]; v_slots date[]; v_d date; v_k int; v_room int; v_total int; v_n int; v_i int; v_lag int; v_should int;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_finish date;
  v_off record;
  v_mid record;
begin
  delete from public.syllabus_books where source = 'demo';

  -- the school year that holds today is the current one (demo campuses only had last year marked)
  update public.academic_sessions s set is_current = false
   where s.is_current and not (s.starts_on <= v_today and s.ends_on >= v_today)
     and exists (select 1 from public.academic_sessions x where x.campus_id = s.campus_id and x.starts_on <= v_today and x.ends_on >= v_today)
     and s.campus_id in (select campus_id from public.section_subjects);
  update public.academic_sessions s set is_current = true
   where s.starts_on <= v_today and s.ends_on >= v_today and s.campus_id in (select campus_id from public.section_subjects)
     and not exists (select 1 from public.academic_sessions x where x.campus_id = s.campus_id and x.is_current);

  for p in
    select distinct on (s.class_id, ss.subject_id) ss.campus_id, s.class_id, ss.subject_id, ss.teacher_id, c.name as class_name, c.sort, sb.name as subject
      from public.section_subjects ss join public.sections s on s.id = ss.section_id
      join public.classes c on c.id = s.class_id join public.subjects sb on sb.id = ss.subject_id
     where ss.teacher_id is not null
     order by s.class_id, ss.subject_id, ss.teacher_id
  loop
    select * into v_sess from public.academic_sessions a where a.campus_id = p.campus_id and a.starts_on <= v_today and a.ends_on >= v_today limit 1;
    if v_sess is null then continue; end if;
    v_finish := v_sess.ends_on - 45;

    v_titles := case
      when p.subject ilike '%physics%' then array['Physical quantities and measurement','Kinematics','Dynamics','Turning effect of forces','Gravitation','Work and energy','Properties of matter','Thermal properties of matter','Transfer of heat']
      when p.subject ilike '%chem%' then array['Fundamentals of chemistry','Structure of atoms','Periodic table and periodicity','Structure of molecules','Physical states of matter','Solutions','Electrochemistry','Chemical reactivity']
      when p.subject ilike '%bio%' then array['Introduction to biology','Solving a biological problem','Biodiversity','Cells and tissues','Cell cycle','Enzymes','Bioenergetics','Nutrition','Transport']
      when p.subject ilike '%math%' then array['Number system','Sets and operations','Fractions and decimals','Ratio and proportion','Algebraic expressions','Factorization','Linear equations','Graphs','Geometry: lines and angles','Area and volume','Information handling']
      when p.subject ilike '%english%' then array['Unit 1 · Reading: our prophet''s kindness','Unit 2 · Patriotism','Unit 3 · Media and its impact','Unit 4 · A great woman','Unit 5 · Poem: Daffodils','Unit 6 · Places of the world','Unit 7 · Hunza valley','Unit 8 · Quaid''s vision','Unit 9 · Festivals','Unit 10 · Rights and duties','Unit 11 · Grammar and writing']
      when p.subject ilike '%urdu%' then array['Hamd o naat','Nasar: mazameen','Nazm','Ghazal','Afsana','Kahani navesi','Khatoot o darkhwast','Mazmoon navesi','Qawaid']
      when p.subject ilike '%islam%' then array['Quran majeed','Iman o ibadaat','Seerat-un-Nabi ﷺ','Akhlaq o adaab','Hidayat ke sarchashme','Mashahir-e-Islam']
      when p.subject ilike '%pak%' then array['Ideological basis of Pakistan','Making of Pakistan','Land and environment','History of Pakistan','Economy of Pakistan','Population, society and culture']
      when p.subject ilike '%computer%' then array['Problem solving','Binary system','Networks','Data and privacy','Designing a website','Programming basics']
      when p.subject ilike '%social%' then array['Our country','Maps and globe','Government','Our history','Culture and people','Natural resources','Good citizens']
      when p.subject ilike '%science%' then array['Living things','Plants','Human body and health','Matter','Force and machines','Energy','Light and sound','Earth and space','Environment']
      when p.subject ilike '%general%' then array['Myself and my family','Our country','Animals','Plants','Science around us','Famous people','Sports and games','Our world']
      when p.subject ilike '%art%' then array['Lines and shapes','Colours','Drawing from nature','Patterns','Craft work','Calligraphy']
      when p.subject ilike '%nazra%' then array['Para 1','Para 2','Para 3','Para 4','Para 5','Para 6','Para 7','Para 8']
      when p.subject ilike '%tarjuma%' then array['Surah Al-Fatiha and Al-Baqarah (part 1)','Al-Baqarah (part 2)','Aal-e-Imran (part 1)','Aal-e-Imran (part 2)','An-Nisa (part 1)','An-Nisa (part 2)']
      else array['Chapter 1','Chapter 2','Chapter 3','Chapter 4','Chapter 5','Chapter 6','Chapter 7','Chapter 8'] end;

    -- chapters with page ranges and three topics each
    v_ch := '[]'; v_start := 1;
    for v_k in 1 .. array_length(v_titles, 1) loop
      v_pages := 14 + (abs(hashtext(p.subject || v_k)) % 12);
      v_ch := v_ch || jsonb_build_array(jsonb_build_object('n', v_k, 'title', v_titles[v_k], 'pages', v_start || '-' || (v_start + v_pages - 1), 'topics', jsonb_build_array(
        jsonb_build_object('title', v_k || '.1 ' || v_titles[v_k] || ': introduction', 'pages', v_start || '-' || (v_start + v_pages / 3 - 1)),
        jsonb_build_object('title', v_k || '.2 Main ideas', 'pages', (v_start + v_pages / 3) || '-' || (v_start + 2 * v_pages / 3 - 1)),
        jsonb_build_object('title', v_k || '.3 Examples and exercise', 'pages', (v_start + 2 * v_pages / 3) || '-' || (v_start + v_pages - 1)))));
      v_start := v_start + v_pages;
    end loop;

    insert into public.syllabus_books (campus_id, class_id, subject_id, title, source, starts_on, finish_by, periods_per_week, chapters, created_by)
    values (p.campus_id, p.class_id, p.subject_id, p.subject || ' · ' || p.class_name, 'demo', v_sess.starts_on, v_finish, 6, v_ch, p.teacher_id)
    on conflict (class_id, subject_id) do update set title = excluded.title, source = 'demo', starts_on = excluded.starts_on, finish_by = excluded.finish_by, chapters = excluded.chapters, updated_at = now()
    returning id into v_book;
    delete from public.syllabus_lessons where book_id = v_book;

    -- teaching days: the timetable of the class's fullest section, else Monday to Saturday
    select array_agg(t.weekday order by t.weekday) into v_days from public.timetable_slots t
     where t.subject_id = p.subject_id and t.section_id = (
       select t2.section_id from public.timetable_slots t2 join public.sections s2 on s2.id = t2.section_id
        where s2.class_id = p.class_id and t2.subject_id = p.subject_id group by t2.section_id order by count(*) desc limit 1);
    if v_days is null then v_days := array[1,2,3,4,5,6]; end if;

    v_slots := '{}';
    v_d := v_sess.starts_on;
    while v_d <= v_finish loop
      if extract(isodow from v_d) < 7
         and not exists (select 1 from public.holidays h where h.campus_id = p.campus_id and h.kind <> 'event' and v_d between h.starts_on and h.ends_on)
         and not exists (select 1 from public.exam_papers e where e.class_id = p.class_id and e.paper_date = v_d) then
        for v_k in 1 .. coalesce(array_length(array_positions(v_days, extract(isodow from v_d)::int), 1), 0) loop
          v_slots := v_slots || v_d;
        end loop;
      end if;
      v_d := v_d + 1;
    end loop;
    if coalesce(array_length(v_slots, 1), 0) = 0 then continue; end if;

    -- periods per topic in proportion to pages, about a tenth kept for revision, a test after each chapter
    v_room := greatest(array_length(v_titles, 1) * 3, floor((array_length(v_slots, 1) - array_length(v_titles, 1)) * 0.9)::int);
    v_total := v_start - 1;
    create temp table if not exists tmp_l (sort int, chapter_n int, chapter text, topic text, pages text, homework text, is_test boolean) on commit drop;
    truncate tmp_l;
    v_i := 0;
    for v_k in 1 .. array_length(v_titles, 1) loop
      declare t jsonb; w int; pg int; j int;
      begin
        for t in select * from jsonb_array_elements(v_ch -> (v_k - 1) -> 'topics') loop
          pg := split_part(t ->> 'pages', '-', 2)::int - split_part(t ->> 'pages', '-', 1)::int + 1;
          w := greatest(1, round(pg::numeric / v_total * v_room)::int);
          for j in 1 .. w loop
            v_i := v_i + 1;
            insert into tmp_l values (v_i, v_k, v_titles[v_k], case when w > 1 then (t ->> 'title') || ' (' || j || '/' || w || ')' else t ->> 'title' end,
              t ->> 'pages', case when j = w then 'Exercise questions on this topic' end, false);
          end loop;
        end loop;
        v_i := v_i + 1;
        insert into tmp_l values (v_i, v_k, v_titles[v_k], 'Chapter ' || v_k || ' test', null, null, true);
      end;
    end loop;
    v_n := v_i;

    -- how far this class really is: most on track, some a few lessons behind, a few far behind
    v_lag := case abs(hashtext(p.class_id::text || p.subject_id::text)) % 10 when 6 then 3 when 7 then 4 when 8 then 8 when 9 then 12 else abs(hashtext(p.subject_id::text)) % 2 end;
    insert into public.syllabus_lessons (campus_id, book_id, class_id, subject_id, sort, chapter_n, chapter, topic, pages, homework, is_test, planned_on)
    select p.campus_id, v_book, p.class_id, p.subject_id, l.sort, l.chapter_n, l.chapter, l.topic, l.pages, l.homework, l.is_test,
           v_slots[least(array_length(v_slots, 1), 1 + floor(((l.sort - 1) * least(array_length(v_slots, 1), greatest(v_n, floor(array_length(v_slots, 1) * 0.9)::int)))::numeric / v_n)::int)]
      from tmp_l l;
    select count(*) into v_should from public.syllabus_lessons where book_id = v_book and planned_on < v_today;
    update public.syllabus_lessons set done_on = least(v_today - 1, planned_on + (v_lag > 0)::int), done_by = p.teacher_id
     where book_id = v_book and sort <= v_should - v_lag;
  end loop;

  -- Mid-term: exams are over, so marks entry is open and about two thirds of the papers are in
  for v_mid in select e.* from public.exams e where e.name = 'Mid-term exam' and e.status = 'date_sheet'
                  and exists (select 1 from public.exam_papers x where x.exam_id = e.id) loop
    update public.exams set status = 'marks_entry' where id = v_mid.id;
    insert into public.marks (campus_id, exam_id, subject_id, student_id, obtained, is_absent, entered_by)
    select v_mid.campus_id, v_mid.id, ep.subject_id, st.id,
           case when abs(hashtext(st.id::text || ep.subject_id::text)) % 25 = 0 then null
                else round(v_mid.total_marks * (0.38 + (abs(hashtext(st.id::text || ep.subject_id::text)) % 58) / 100.0)) end,
           abs(hashtext(st.id::text || ep.subject_id::text)) % 25 = 0,
           ss.teacher_id
      from public.exam_papers ep
      join public.sections s on s.class_id = ep.class_id
      join public.students st on st.section_id = s.id and st.status = 'enrolled'
      left join public.section_subjects ss on ss.section_id = s.id and ss.subject_id = ep.subject_id
     where ep.exam_id = v_mid.id and abs(hashtext(s.id::text || ep.subject_id::text)) % 3 <> 0
       and not exists (select 1 from public.marks m where m.exam_id = v_mid.id and m.student_id = st.id and m.subject_id = ep.subject_id);
  end loop;
end $$;
