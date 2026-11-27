-- Super admin v2 (20261125000001). LOCAL Postgres only, never live: local shim, every migration, supabase/seed.sql, demo_users.sql, then this file.
\set ON_ERROR_STOP 1
grant usage on schema public, app to anon, authenticated;
grant all on all tables in schema public to authenticated;
create table public.t_school as select id from schools limit 1; grant select on public.t_school to authenticated;
create table public.t_pr as select user_id uid from profiles where role='principal' and user_id is not null limit 1; grant select on public.t_pr to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aaaa', 'admin@ilmora.pk');
insert into super_admins values ('00000000-0000-0000-0000-00000000aaaa');
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid::text, false); set role authenticated; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000aaaa');
select 'plans' t, jsonb_array_length(super_plans()) n;
select super_save_plan('{"id":"standard","name":"Standard","price_paisa":"4000000","max_students":"500","max_campuses":"1","features":{"whatsapp":"600 a month"}}');
select 'plan saved' t, price_paisa = 4000000 and features->>'whatsapp' = '600 a month' and features->>'core' = 'yes' ok from (select * from super_plans() j, jsonb_to_recordset(j) as x(id text, price_paisa bigint, features jsonb) where id='standard') q;
select 'bill' t, super_bill_month('Nov 2026', current_date - 3) n;
select 'bill again skips' t, super_bill_month('Nov 2026', current_date - 3) = 0 ok;
select 'invoices' t, jsonb_array_length(super_invoices()) n;
select super_create_invoice(jsonb_build_object('school_id', (select id from public.t_school), 'amount_paisa', '500000', 'period', 'Setup fee'));
select 'overview' t, super_overview()->>'overdue_paisa' overdue, super_overview()->>'overdue_schools' sch, jsonb_array_length(super_overview()->'by_month') months;
do $$ begin perform super_set_invoice((select (j->>'id')::uuid from jsonb_array_elements(super_invoices()) j where j->>'period'='Setup fee'), '{"status":"paid"}'); raise exception 'should fail'; exception when others then if sqlerrm like 'should%' then raise; end if; raise notice 'ok: paid without method refused: %', sqlerrm; end $$;
select super_set_invoice((select (j->>'id')::uuid from jsonb_array_elements(super_invoices()) j where j->>'period'='Setup fee'), '{"status":"paid","method":"jazzcash","reference":"TID123"}');
select 'collected' t, (super_overview()->>'collected_month')::bigint = 500000 ok;
select 'schools v2' t, (j->>'overdue')::int overdue, j->>'next_due' next_due, j->>'attendance_days_30' att from jsonb_array_elements(super_schools()) j;
select 'onboarding' t, j->>'classes' classes, j->>'students' students, j->>'fee_rows' fees from jsonb_array_elements(super_onboarding()) j;
select 'usage' t, j->>'students' students, j->>'whatsapp' wa, j->>'ai_usd' ai from jsonb_array_elements(super_usage()) j;
select super_save_announcement('{"title":"Maintenance Sunday","body":"1 hour","tone":"warn","audience":"all"}');
select super_save_announcement(jsonb_build_object('title','Lahore only','audience','city','audience_value','Nowhere'));
select super_save_announcement(jsonb_build_object('title','Later','starts_on', (current_date + 3)::text));
select 'announcements' t, jsonb_array_length(super_announcements()) n;
reset role;
-- a principal: sees only matching, current announcements; cannot call super functions
select pg_temp.as_user((select uid from public.t_pr));
select 'principal banner' t, my_announcements() ;
do $$ begin perform super_invoices(); raise exception 'leak'; exception when others then if sqlerrm = 'leak' then raise; end if; raise notice 'ok: principal blocked from super_invoices: %', sqlerrm; end $$;
do $$ begin perform super_save_plan('{"id":"x","name":"x"}'); raise exception 'leak'; exception when others then if sqlerrm = 'leak' then raise; end if; raise notice 'ok: principal blocked from super_save_plan'; end $$;
do $$ begin perform 1 from platform_invoices; raise notice 'rows visible: %', (select count(*) from platform_invoices); end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000aaaa');
select super_end_announcement((select (j->>'id')::uuid from jsonb_array_elements(super_announcements()) j where j->>'title'='Maintenance Sunday'));
reset role;
select pg_temp.as_user((select uid from public.t_pr));
select 'after end' t, my_announcements();
reset role;
select 'audit' t, count(*) from platform_audit;
