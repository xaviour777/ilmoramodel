-- Pin search_path on helper and trigger functions (Supabase security advisor 0011).
alter function app.is_staff() set search_path = public;
alter function app.is_admin() set search_path = public;
alter function app.is_accounts() set search_path = public;
alter function app.block_ledger_change() set search_path = public;
alter function app.check_marks() set search_path = public;
