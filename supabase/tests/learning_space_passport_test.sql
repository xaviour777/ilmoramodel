-- Security checks for My Learning Space / Model Passport (20261123000001). LOCAL Postgres only, never live:
-- local_shim.sql, every migration, supabase/seed.sql, demo_users.sql (session_replication_role = replica), then this file.
-- Each check prints ok = t or a NOTICE "ok: ..."; any ERROR is a failure.
\set ON_ERROR_STOP 1
grant usage on schema public, app to anon, authenticated;
grant all on all tables in schema public to authenticated;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid::text, false); set role authenticated; end $$;
create function pg_temp.teaches(p uuid, sec uuid) returns boolean language sql as $$
  select exists (select 1 from sections where id = sec and class_teacher_id = p)
      or exists (select 1 from section_subjects where section_id = sec and teacher_id = p)
      or exists (select 1 from timetable_slots where section_id = sec and teacher_id = p) $$;
-- an extra parent in another family and a teacher with no sections, both with logins
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
set session_replication_role = replica;
insert into profiles (id, user_id, campus_id, role, full_name) select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', campus_id, 'parent', 'Other Parent' from students where profile_id is not null limit 1;
insert into profiles (id, user_id, campus_id, role, full_name) select '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2', campus_id, 'teacher', 'New Teacher' from students where profile_id is not null limit 1;
insert into family_guardians (campus_id, family_id, profile_id)
  select f.campus_id, f.id, '00000000-0000-0000-0000-0000000000a1' from families f
  where f.id <> (select family_id from students where profile_id is not null limit 1) limit 1;
set session_replication_role = origin;
create table public.t_ctx as
  select s.id as kid, s.section_id, p.user_id as student_uid,
    (select pr.user_id from family_guardians g join profiles pr on pr.id = g.profile_id where g.family_id = s.family_id limit 1) as parent_uid,
    (select pr.user_id from family_guardians g join profiles pr on pr.id = g.profile_id where g.family_id <> s.family_id and pr.user_id is not null limit 1) as other_parent_uid,
    (select pr.user_id from profiles pr where pr.role = 'teacher' and pg_temp.teaches(pr.id, s.section_id) limit 1) as teacher_uid,
    (select pr.user_id from profiles pr where pr.role = 'teacher' and not pg_temp.teaches(pr.id, s.section_id) limit 1) as other_teacher_uid
  from students s join profiles p on p.id = s.profile_id where p.role = 'student' limit 1;
grant select on public.t_ctx to authenticated, anon;
select 'T0 context complete' as test, kid is not null and parent_uid is not null and other_parent_uid is not null and teacher_uid is not null and other_teacher_uid is not null as ok from t_ctx;

-- 1. student adds a project: pending, never public, campus filled
select pg_temp.as_user((select student_uid from t_ctx));
insert into passport_items (student_id, campus_id, kind, title, status, show_public)
  values ((select kid from t_ctx), (select campus_id from students where id = (select kid from t_ctx)), 'project', 'Solar oven', 'pending', true);
select 'T1 student project pending + private' as test, status = 'pending' and not show_public as ok from passport_items where title = 'Solar oven';
-- 2. student cannot add a school achievement
do $$ begin
  insert into passport_items (student_id, campus_id, kind, title) values ((select kid from t_ctx), app.my_campus(), 'achievement', 'Fake prize');
  raise exception 'student added an achievement!';
exception when insufficient_privilege then raise notice 'ok: student cannot add achievement'; end $$;
-- 3. student cannot approve their own entry
update passport_items set status = 'approved' where title = 'Solar oven';
select 'T3 still pending' as test, status = 'pending' as ok from passport_items where title = 'Solar oven';
-- 4. student cannot turn on sharing (guardian only)
do $$ begin perform public.passport_share((select kid from t_ctx), true); raise exception 'student shared!';
exception when others then if sqlerrm like 'Only a parent%' then raise notice 'ok: student cannot share'; else raise; end if; end $$;
-- 5. goal: add, reach
insert into learning_goals (student_id, campus_id, goal) values ((select kid from t_ctx), app.my_campus(), 'Read one story a week');
update learning_goals set status = 'done' where goal = 'Read one story a week';
select 'T5 goal done_at set' as test, done_at is not null as ok from learning_goals where goal = 'Read one story a week';
-- 6. student cannot write practice rules but can read them
do $$ begin insert into practice_rules (action) values ('hack'); raise exception 'student wrote a rule!';
exception when insufficient_privilege then raise notice 'ok: student cannot write rules'; end $$;
reset role;

-- 7. another family sees nothing of this child
select pg_temp.as_user((select other_parent_uid from t_ctx));
select 'T7 other parent items' as test, count(*) = 0 as ok from passport_items where student_id = (select kid from t_ctx);
select 'T7b other parent goals' as test, count(*) = 0 as ok from learning_goals where student_id = (select kid from t_ctx);
select 'T7c other parent upcoming tests' as test, count(*) = 0 as ok from public.upcoming_tests((select kid from t_ctx));
do $$ begin perform public.passport_share((select kid from t_ctx), true); raise exception 'other parent shared!';
exception when others then if sqlerrm like 'Only a parent%' then raise notice 'ok: other parent cannot share'; else raise; end if; end $$;
reset role;

-- 8. a teacher who doesn't teach the section can't see or approve
select pg_temp.as_user((select other_teacher_uid from t_ctx));
select 'T8 other teacher sees nothing' as test, count(*) = 0 as ok from passport_items where student_id = (select kid from t_ctx);
update passport_items set status = 'approved' where title = 'Solar oven';
reset role;
select 'T8b still pending' as test, status = 'pending' as ok from passport_items where title = 'Solar oven';

-- 9. parent cannot make a pending item public
select pg_temp.as_user((select parent_uid from t_ctx));
do $$ begin perform public.passport_item_public((select id from passport_items where title = 'Solar oven'), true); raise exception 'pending made public!';
exception when others then if sqlerrm like 'Only approved%' then raise notice 'ok: pending cannot be public'; else raise; end if; end $$;
reset role;

-- 10. the section's teacher approves and adds a certificate (approved at once)
select pg_temp.as_user((select teacher_uid from t_ctx));
update passport_items set status = 'approved', teacher_note = 'Shabash!' where title = 'Solar oven';
insert into passport_items (student_id, campus_id, kind, title) values ((select kid from t_ctx), app.my_campus(), 'certificate', 'Science fair 1st');
select 'T10 approved with approver' as test, status = 'approved' and approved_by = app.me() as ok from passport_items where title = 'Solar oven';
select 'T10b teacher certificate approved' as test, status = 'approved' as ok from passport_items where title = 'Science fair 1st';
update passport_items set show_public = true where title = 'Science fair 1st';
insert into practice_rules (class_id, below_percent, action) values ((select class_id from sections where id = (select section_id from t_ctx)), 60, 'Do 10 MCQs');
reset role;
select 'T10c teacher cannot make public' as test, not show_public as ok from passport_items where title = 'Science fair 1st';

-- 11. nothing public before consent; anon can't read the consent table at all
select 'T11 no link yet' as test, count(*) = 0 as ok from passport_shares;
set role anon;
do $$ begin perform 1 from passport_shares; raise exception 'anon read shares!'; exception when insufficient_privilege then raise notice 'ok: anon blocked from shares'; end $$;
reset role;

-- 12. parent consents, ticks one item; anon sees only that, first name only, no ids
select pg_temp.as_user((select parent_uid from t_ctx));
select 'T12 parent reads rules' as test, count(*) >= 1 as ok from practice_rules;
select set_config('t.code', public.passport_share((select kid from t_ctx), true), false);
select public.passport_item_public((select id from passport_items where title = 'Science fair 1st'), true);
reset role;
set role anon;
select 'T12b anon sees 1 item' as test, jsonb_array_length(public.public_passport(current_setting('t.code')) -> 'items') = 1 as ok;
select 'T12c first name only, no ids' as test, (public.public_passport(current_setting('t.code')) ->> 'name') !~ ' ' and public.public_passport(current_setting('t.code'))::text !~ 'student_id|"id"' as ok;
select 'T12d wrong code' as test, public.public_passport(md5('x')) is null as ok;
do $$ begin perform 1 from passport_items; raise exception 'anon read items!'; exception when insufficient_privilege then raise notice 'ok: anon blocked from items'; end $$;
reset role;

-- 13. new code kills the old link; turning off hides everything
select pg_temp.as_user((select parent_uid from t_ctx));
select set_config('t.code2', public.passport_share((select kid from t_ctx), true, true), false);
reset role;
set role anon;
select 'T13 old link dead' as test, public.public_passport(current_setting('t.code')) is null and public.public_passport(current_setting('t.code2')) is not null as ok;
reset role;
select pg_temp.as_user((select parent_uid from t_ctx));
select public.passport_share((select kid from t_ctx), false);
reset role;
set role anon;
select 'T13b off = nothing public' as test, public.public_passport(current_setting('t.code2')) is null as ok;
reset role;
select 'T13c ticks cleared' as test, count(*) = 0 as ok from passport_items where show_public;

-- 14. no class leaderboard for families
select pg_temp.as_user((select parent_uid from t_ctx));
do $$ begin perform public.class_leaderboard((select kid from t_ctx)); raise exception 'leaderboard callable!';
exception when insufficient_privilege then raise notice 'ok: leaderboard revoked'; end $$;
reset role;
drop table public.t_ctx;
