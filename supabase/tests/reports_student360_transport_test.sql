-- Checks for the Report Center, student 360 and transport (20261124000001..3). Run on a LOCAL Postgres only, never on live:
-- the Supabase shim, every migration, seed.sql + seed_demo_all.sql, demo_users.sql (session_replication_role = replica), then this file.
-- Each check prints ok = t or a NOTICE "ok: ..."; any ERROR or ok = f is a failure.
\set ON_ERROR_STOP 1
grant usage on schema public, app to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on storage.objects to authenticated;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid::text, false); perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false); set role authenticated; end $$;
create temp table ids as select
  (select user_id from profiles where role = 'principal' limit 1) as principal,
  (select user_id from profiles where role = 'teacher' and user_id is not null limit 1) as teacher,
  (select user_id from profiles where role = 'accountant' and user_id is not null limit 1) as accountant,
  (select g.profile_id from family_guardians g join profiles p on p.id = g.profile_id where p.user_id is not null limit 1) as parent_profile;
grant select on ids to authenticated, anon;

-- ================= 1. Report Center =================
select pg_temp.as_user((select principal from ids));
do $$ declare r text; n int; begin
  foreach r in array array['student-roster','class-strength','joiners-leavers','sibling-families','incomplete-profiles','student-withdrawn','age-distribution',
    'enrollment-by-session','promotion-retention','student-churn','new-admissions','birthdays','admissions-pipeline','admissions-list','admissions-by-source',
    'admission-tests','admissions-followup','att-daily-register','att-section-summary','att-student-percent','att-chronic-absent','att-not-marked',
    'att-late-comers','att-monthly','student-leave','fee-collection-class','fee-defaulters','fee-receipts','fee-by-mode','fee-by-head','fee-cashier',
    'fee-concessions','fee-monthly','fee-claims','fee-promises','day-close','cash-book','expenses-list','expenses-by-category','income-expense',
    'expenses-voided','staff-directory','payroll-month','salary-advances','staff-attendance','staff-leave','substitutions','exam-section-results',
    'exam-subject-average','exam-result-sheet','exam-toppers','exam-failures','marks-entry-status','board-results','teacher-load','timetable-coverage',
    'homework-given','transport-routes','transport-students','vehicle-occupancy','trip-log','custody-exceptions','transport-costs',
    'transport-cost-summary','sos-log','vehicle-papers','messages-sent','message-failures','notices-sent','feedback-log','behaviour-notes',
    'behaviour-summary','documents-expiring','documents-missing','certificates-issued'] loop
    select count(*) into n from public.report_rows(r, jsonb_build_object('from', '2025-04-01', 'exam', (select id from exams limit 1)));
  end loop;
  raise notice 'ok: all 75 reports run for the principal';
end $$;
select 'R1 roster has rows' as test, count(*) > 0 as ok from public.report_rows('student-roster', '{}');
select 'R2 section filter narrows' as test,
  (select count(*) from public.report_rows('student-roster', jsonb_build_object('section', (select section_id from students where section_id is not null limit 1))))
  < (select count(*) from public.report_rows('student-roster', '{}')) as ok;
insert into report_runs (report_id, filters, via, row_count) values ('student-roster', '{}', 'view', 1);
insert into report_saved (report_id, name, filters) values ('fee-defaulters', 'Big defaulters', '{"min":"20000"}');
do $$ begin perform public.report_rows('no-such-report', '{}'); raise exception 'unknown report ran!'; exception when others then if sqlerrm like 'Unknown report%' then raise notice 'ok: unknown report refused'; else raise; end if; end $$;
reset role;

-- a teacher runs reports but row-level security still hides money they may not see
select pg_temp.as_user((select teacher from ids));
select 'R3 teacher sees only their own salary line' as test, count(*) <= 1 as ok from public.report_rows('payroll-month', '{}');
select 'R4 teacher cannot read principal''s saved views' as test, count(*) = 0 as ok from report_saved;
select 'R5 teacher cannot read others'' activity' as test, count(*) = 0 as ok from report_runs;
reset role;

-- a parent cannot run reports at all
select pg_temp.as_user((select user_id from profiles where id = (select parent_profile from ids)));
do $$ begin perform public.report_rows('student-roster', '{}'); raise exception 'parent ran a report!'; exception when others then if sqlerrm like 'Reports are for school staff%' then raise notice 'ok: parent blocked from reports'; else raise; end if; end $$;
reset role;

-- ================= 2. Student 360 =================
select pg_temp.as_user((select principal from ids));
create temp table s360 as select id, section_id from students where status = 'enrolled' and section_id is not null order by admission_no limit 1;
grant select on s360 to authenticated;
-- leaving through the promotion screen's function keeps the date and reason, and history
select 'S1 leave' as test, public.apply_student_moves(jsonb_build_array(jsonb_build_object('student_id', (select id from s360), 'kind', 'leave')), 'Family moved', null, '2026-11-15') is not null as ok;
select 'S2 left_on and reason kept' as test, left_on = '2026-11-15' and leave_reason = 'Family moved' and status = 'left' as ok from students where id = (select id from s360);
select 'S3 still in left report' as test, count(*) = 1 as ok from public.report_rows('student-withdrawn', '{}') x where x->>'gr' = (select admission_no from students where id = (select id from s360));
select 'S4 certificate gets a serial' as test, (public.issue_certificate((select id from s360), 'character')).serial_no like 'CH-%' as ok;
select 'S5 second serial differs' as test, count(distinct serial_no) = 2 as ok from (select (public.issue_certificate((select id from s360), 'leaving')).serial_no union all select serial_no from student_certificates where student_id = (select id from s360) and kind = 'character') x;
-- re-join clears the leaving date; history keeps both
select 'S6 rejoin' as test, public.apply_student_moves(jsonb_build_array(jsonb_build_object('student_id', (select id from s360), 'kind', 'rejoin')), 'Re-joined', null, null) is not null as ok;
select 'S7 studying again' as test, status = 'enrolled' and left_on is null as ok from students where id = (select id from s360);
select 'S8 history has leave and rejoin' as test, count(*) = 2 as ok from student_moves where student_id = (select id from s360) and kind in ('leave', 'rejoin');
-- a status change made directly still lands in history
update students set status = 'struck_off' where id = (select id from s360);
select 'S9 direct change logged' as test, count(*) = 1 as ok from student_moves where student_id = (select id from s360) and kind = 'status' and to_status = 'struck_off';
select 'S10 left_on set by trigger' as test, left_on is not null as ok from students where id = (select id from s360);
update students set status = 'enrolled' where id = (select id from s360);
-- pass out
select 'S11 pass out' as test, public.apply_student_moves(jsonb_build_array(jsonb_build_object('student_id', (select id from s360), 'kind', 'pass_out')), 'Completed Class 10', null, null) is not null as ok;
select 'S12 passed_out status' as test, status::text = 'passed_out' as ok from students where id = (select id from s360);
update students set status = 'enrolled' where id = (select id from s360);
-- contacts and documents
insert into student_contacts (student_id, name, relation, phone, is_emergency) values ((select id from s360), 'Uncle Asif', 'uncle', '03001112233', true);
insert into student_documents (student_id, kind, number, expires_on) values ((select id from s360), 'medical', 'M-1', current_date + 10);
select 'S13 expiring document in report' as test, count(*) = 1 as ok from public.report_rows('documents-expiring', '{"days":"30"}');
reset role;

-- a teacher cannot read documents; the student's own parent can read contacts, another parent cannot
select pg_temp.as_user((select teacher from ids));
select 'S14 teacher sees no documents' as test, count(*) = 0 as ok from student_documents;
do $$ begin perform public.issue_certificate((select id from s360), 'character'); raise exception 'teacher issued!'; exception when others then if sqlerrm like 'Only the office%' then raise notice 'ok: teacher cannot issue certificates'; else raise; end if; end $$;
reset role;
select pg_temp.as_user((select user_id from profiles where id = (select parent_profile from ids)));
select 'S15 other parent sees no contacts' as test, count(*) = 0 as ok from student_contacts
  where student_id not in (select s.id from students s join family_guardians g on g.family_id = s.family_id where g.profile_id = (select parent_profile from ids));
reset role;

-- ================= 3. Transport =================
select pg_temp.as_user((select principal from ids));
insert into transport_routes (id, name, monthly_fee_paisa) values ('00000000-0000-0000-0000-00000000aa01', 'Route T', 300000);
insert into transport_stops (id, route_id, name, sort, lat, lng) values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-00000000aa01', 'Stop 1', 1, 31.47, 74.27);
insert into profiles (id, campus_id, role, full_name, phone) values ('00000000-0000-0000-0000-00000000aa03', app.my_campus(), 'driver', 'Test Driver', '03009998877');
select 'T1 driver login' as test, public.set_driver_login('00000000-0000-0000-0000-00000000aa03', 'driver-pass-1') = '03009998877@phone.ilmora.pk' as ok;
insert into vans (id, name, seats, route_id, driver_profile_id) values ('00000000-0000-0000-0000-00000000aa04', 'Van T', 12, '00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa03');
insert into vans (id, name, seats) values ('00000000-0000-0000-0000-00000000aa05', 'Van Other', 12);
create temp table rider as select s.id, s.family_id from students s join family_guardians g on g.family_id = s.family_id where g.profile_id = (select parent_profile from ids) and s.status = 'enrolled' limit 1;
grant select on rider to authenticated;
insert into van_students (van_id, student_id, stop_id) select '00000000-0000-0000-0000-00000000aa04', id, '00000000-0000-0000-0000-00000000aa02' from rider
  on conflict (student_id) do update set van_id = excluded.van_id, stop_id = excluded.stop_id;
reset role;

select pg_temp.as_user((select user_id from profiles where id = '00000000-0000-0000-0000-00000000aa03'));
select 'T2 driver role' as test, app.my_role()::text = 'driver' as ok;
select 'T3 board shows only own van' as test, jsonb_array_length(public.driver_board(null)->'vans') = 1 and public.driver_board(null)->'vans'->0->>'name' = 'Van T' as ok;
select 'T4 driver sees no students table' as test, count(*) = 0 as ok from students;
-- offline marks: sent twice with the same client id, saved once; the trip opens by itself
select public.trip_mark('00000000-0000-0000-0000-00000000aa04', current_date, 'morning', (select id from rider), 'boarded', '00000000-0000-0000-0000-00000000bb01');
select public.trip_mark('00000000-0000-0000-0000-00000000aa04', current_date, 'morning', (select id from rider), 'boarded', '00000000-0000-0000-0000-00000000bb01');
select 'T5a driver cannot read the event table' as test, count(*) = 0 as ok from trip_events;
select public.trip_ping('00000000-0000-0000-0000-00000000aa04', current_date, 'morning', 31.48, 74.28, 12, 5);
do $$ begin perform public.trip_mark('00000000-0000-0000-0000-00000000aa05', current_date, 'morning', (select id from rider), 'boarded'); raise exception 'marked on another van!'; exception when others then if sqlerrm like 'This child is not on this vehicle%' or sqlerrm like 'This is not your vehicle%' then raise notice 'ok: driver cannot use another van'; else raise; end if; end $$;
do $$ begin perform public.trip_start('00000000-0000-0000-0000-00000000aa05', 'morning'); raise exception 'started another van!'; exception when others then if sqlerrm like 'This is not your vehicle%' then raise notice 'ok: driver cannot start another van'; else raise; end if; end $$;
select 'T6 sos' as test, public.trip_sos('00000000-0000-0000-0000-00000000aa04', null, 31.48, 74.28, 'Tyre burst', '00000000-0000-0000-0000-00000000bb02') is not null as ok;
reset role;
select pg_temp.as_user((select principal from ids));
select 'T5 one mark for two sends' as test, (select count(*) from trip_events where client_id = '00000000-0000-0000-0000-00000000bb01') = 1 as ok;
select 'T7 sos linked to the open trip' as test, count(*) = 1 as ok from transport_sos where client_id = '00000000-0000-0000-0000-00000000bb02' and trip_id is not null;
reset role;

-- the child's parent sees the van live; another family sees nothing
select pg_temp.as_user((select user_id from profiles where id = (select parent_profile from ids)));
select 'T8 parent sees own child''s van' as test, (public.my_child_bus((select id from rider))->>'van') = 'Van T' as ok;
select 'T9 parent sees live location' as test, (public.my_child_bus((select id from rider))->'trip'->>'lat')::float = 31.48 as ok;
select 'T10 parent sees boarded' as test, jsonb_array_length(public.my_child_bus((select id from rider))->'events') = 1 as ok;
select 'T11 not another family''s child' as test, public.my_child_bus((select s.id from students s where s.family_id <> (select family_id from rider) limit 1)) is null as ok;
do $$ begin perform public.driver_board(null); raise exception 'parent got a trip board!'; exception when others then if sqlerrm like 'Only drivers%' then raise notice 'ok: parent has no trip board'; else raise; end if; end $$;
reset role;

-- after the trip closes, the location is no longer shown
select pg_temp.as_user((select user_id from profiles where id = '00000000-0000-0000-0000-00000000aa03'));
select public.trip_end('00000000-0000-0000-0000-00000000aa04', current_date, 'morning');
reset role;
select pg_temp.as_user((select user_id from profiles where id = (select parent_profile from ids)));
select 'T12 location hidden after trip' as test, public.my_child_bus((select id from rider))->'trip'->>'lat' is null as ok;
reset role;
select pg_temp.as_user((select principal from ids));
select 'T13 custody gap reported' as test, count(*) = 1 as ok from public.report_rows('custody-exceptions', jsonb_build_object('from', current_date - 1, 'to', current_date));
select 'T14 sos in log' as test, count(*) = 1 as ok from public.report_rows('sos-log', jsonb_build_object('from', current_date - 1, 'to', current_date));
reset role;
