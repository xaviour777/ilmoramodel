-- Past BISE results the school enters once a year, and the school's board target.
create table if not exists public.board_results (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  year int not null check (year between 1990 and 2100),
  class_level int not null default 10 check (class_level in (9, 10, 11, 12)),
  appeared int not null check (appeared >= 0),
  passed int not null check (passed >= 0),
  a_plus int not null default 0 check (a_plus >= 0),
  average numeric(5,2),
  unique (campus_id, year, class_level)
);
alter table public.board_results enable row level security;
drop policy if exists "staff read board results" on public.board_results;
create policy "staff read board results" on public.board_results for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'accountant', 'teacher'));
drop policy if exists "admin write board results" on public.board_results;
create policy "admin write board results" on public.board_results for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin()) with check (campus_id = app.my_campus() and app.is_admin());

alter table public.campus_settings add column if not exists board_target int check (board_target is null or board_target between 1 and 100);
