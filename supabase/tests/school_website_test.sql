-- Security checks for the school website (20261124000001). Run on a LOCAL Postgres only, never on live:
-- local_shim.sql, then every migration, supabase/seed.sql, demo_users.sql (with session_replication_role = replica), then this file.
-- Each line prints ok = t or a NOTICE "ok: ..."; any ERROR is a failure.
\set ON_ERROR_STOP 1
grant usage on schema public, app to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on storage.objects to authenticated;
-- second school
insert into schools (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Other School');
insert into campuses (id, school_id, name) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Other campus');
insert into classes (id, campus_id, name) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Other class');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
set session_replication_role = replica;
insert into profiles (user_id, campus_id, role, full_name) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'principal', 'Other Principal');
set session_replication_role = origin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid::text, false); set role authenticated; end $$;

-- 1. principal creates the draft
select pg_temp.as_user((select user_id from profiles where role='principal' and full_name <> 'Other Principal' limit 1));
insert into school_sites (school_id, domains, draft) values (app.my_school(), '{modelschool.edu.pk,www.modelschool.edu.pk}', '{"hero":{"title":{"en":"Draft title","ur":""}}}');
reset role;

-- 2. anon sees nothing before publish
set role anon;
select 'T2 anon before publish null' as test, public.school_site('modelschool.edu.pk') is null as ok;
select 'T2b anon cannot read table' as test;
do $$ begin perform 1 from school_sites; raise exception 'anon read school_sites!'; exception when insufficient_privilege then raise notice 'ok: anon blocked'; end $$;
reset role;

-- 3. accountant can edit draft but not publish
select pg_temp.as_user((select user_id from profiles where role='accountant' limit 1));
update school_sites set draft = draft || '{"x":1}';
do $$ begin perform public.site_publish(); raise exception 'accountant published!'; exception when others then if sqlerrm like 'Only the principal%' then raise notice 'ok: accountant cannot publish'; else raise; end if; end $$;
do $$ begin update school_sites set status = 'live'; raise exception 'accountant set live!'; exception when others then if sqlerrm like 'Only the principal%' then raise notice 'ok: accountant cannot set live'; else raise; end if; end $$;
reset role;

-- 4. teacher, parent see no row
select pg_temp.as_user((select user_id from profiles where role='teacher' limit 1));
select 'T4 teacher rows' as test, count(*) = 0 as ok from school_sites;
reset role;
select pg_temp.as_user((select user_id from profiles where role='parent' limit 1));
select 'T4 parent rows' as test, count(*) = 0 as ok from school_sites;
reset role;

-- 5. other school's principal sees nothing and cannot grab the domain
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select 'T5 other school rows' as test, count(*) = 0 as ok from school_sites;
do $$ begin insert into school_sites (school_id, domains) values (app.my_school(), '{modelschool.edu.pk}'); raise exception 'domain stolen!'; exception when others then if sqlerrm like 'One of these web addresses%' then raise notice 'ok: domain unique across schools'; else raise; end if; end $$;
do $$ begin insert into school_sites (school_id, domains) values ((select id from schools where name='Ilmora Demo School'), '{}'); raise exception 'inserted for other school!'; exception when insufficient_privilege or unique_violation then raise notice 'ok: cannot insert for another school (%)', sqlstate; end $$;
reset role;

-- 6. principal publishes; anon sees published only
select pg_temp.as_user((select user_id from profiles where role='principal' and full_name <> 'Other Principal' limit 1));
select 'T6 publish' as test, public.site_publish() is not null as ok;
update school_sites set draft = '{"hero":{"title":{"en":"Newer draft","ur":""}}}';
reset role;
set role anon;
select 'T6 anon sees published title' as test, public.school_site('ModelSchool.edu.pk:443')->'content'->'hero'->'title'->>'en' = 'Draft title' as ok;
select 'T6 wrong domain null' as test, public.school_site('evil.example') is null as ok;
select 'T6 campuses listed' as test, jsonb_array_length(public.school_site('modelschool.edu.pk')->'campuses') = 1 as ok;
select 'T6 branding on site domain' as test, (select name from public.school_branding('www.modelschool.edu.pk')) = 'Ilmora Demo School' as ok;

-- 7. enquiries
reset role;
select c.id as cmp, (select id from classes where campus_id=c.id limit 1) as cls from campuses c where c.id <> '00000000-0000-0000-0000-0000000000c1' limit 1 \gset
set role anon;
select 'T7 good enquiry' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', :'cls', 'Ayesha Khan', 'Imran Khan', '0300 1234567', true, (now() at time zone 'Asia/Karachi')::date + 3, 'Is transport available?', '1.2.3.4') ? 'ref' as ok;
select 'T7 class of other school refused' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', '00000000-0000-0000-0000-0000000000d1', 'Ali', 'Asad', '03001112223', false, null, '', '1.2.3.5')->>'error' = 'class' as ok;
select 'T7 campus of other school refused' as test, public.site_enquiry('modelschool.edu.pk', '00000000-0000-0000-0000-0000000000c1', null, 'Ali', 'Asad', '03001112223', false, null, '', '1.2.3.5')->>'error' = 'campus' as ok;
select 'T7 bad phone' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', null, 'Ali', 'Asad', '12345', false, null, '', '1.2.3.5')->>'error' = 'phone' as ok;
select 'T7 past date' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', null, 'Ali', 'Asad', '03001112223', true, '2020-01-01', '', '1.2.3.5')->>'error' = 'date' as ok;
select 'T7 off-site domain' as test, public.site_enquiry('evil.example', :'cmp', null, 'Ali', 'Asad', '03001112223', false, null, '', '1.2.3.5')->>'error' = 'site' as ok;
select public.site_enquiry('modelschool.edu.pk', :'cmp', null, 'Kid' || g, 'Parent', '0321 555000' || g, false, null, '', '9.9.9.9') from generate_series(1,6) g;
select 'T7 flood stopped (6th from same IP)' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', null, 'Kid7', 'Parent', '03215550007', false, null, '', '9.9.9.9')->>'error' = 'busy' as ok;
do $$ begin perform 1 from admissions; raise exception 'anon read admissions!'; exception when insufficient_privilege then raise notice 'ok: anon cannot read admissions'; end $$;
reset role;
select 'T7 admissions rows from website' as test, count(*) = 6 as ok from admissions where source = 'website';
select child_name, phone, status, visit_wanted_on, notes from admissions where source='website' order by created_at limit 1;

-- 8. withdraw hides site
select pg_temp.as_user((select user_id from profiles where role='principal' and full_name <> 'Other Principal' limit 1));
select public.site_withdraw();
reset role;
set role anon;
select 'T8 withdrawn site hidden' as test, public.school_site('modelschool.edu.pk') is null as ok;
select 'T8 enquiries closed' as test, public.site_enquiry('modelschool.edu.pk', :'cmp', null, 'Ali', 'Asad', '03001112229', false, null, '', '7.7.7.7')->>'error' = 'site' as ok;
reset role;

-- 9. storage: principal can write only into own school folder
select pg_temp.as_user((select user_id from profiles where role='principal' and full_name <> 'Other Principal' limit 1));
insert into storage.objects (bucket_id, name) values ('site', app.my_school()::text || '/hero.webp');
do $$ begin insert into storage.objects (bucket_id, name) values ('site', '00000000-0000-0000-0000-0000000000b1/x.webp'); raise exception 'wrote other school folder!'; exception when insufficient_privilege then raise notice 'ok: other school folder blocked'; end $$;
reset role;
select pg_temp.as_user((select user_id from profiles where role='teacher' limit 1));
do $$ begin insert into storage.objects (bucket_id, name) values ('site', app.my_school()::text || '/t.webp'); raise exception 'teacher uploaded!'; exception when insufficient_privilege then raise notice 'ok: teacher cannot upload'; end $$;
reset role;
