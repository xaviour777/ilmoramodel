-- My Learning Space (student), My Child Today (parent) and the Model Passport.
--   passport_items  : milestones, projects, achievements, certificates, skills, creative work, reflections.
--                     Families add their own (wait for a teacher); teachers add or approve.
--   learning_goals  : the child's own goals, set by the child, a parent or a teacher.
--   practice_rules  : teachers' rules for "What should I practise today?" suggestions.
--   passport_shares : guardian's consent for a public link; the link uses a random code, never the student id.
-- Private by default: nothing is public until a guardian turns sharing on AND ticks each item.

-- Can the signed-in staff member look after this student (principal/owner, or teaches the student's section)?
create or replace function app.can_teach_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = p_student and s.campus_id = app.my_campus()
                 and (app.is_admin() or (app.my_role() = 'teacher' and app.teaches_section(s.section_id))))
$$;
grant execute on function app.can_teach_student(uuid) to authenticated;

-- ---------- Passport items ----------
create table if not exists public.passport_items (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('milestone', 'project', 'achievement', 'certificate', 'skill', 'creative', 'reflection')),
  title text not null check (length(trim(title)) between 2 and 160),
  body text check (body is null or length(body) <= 2000),
  subject_id uuid references public.subjects(id) on delete set null,
  happened_on date not null default current_date,
  link_url text check (link_url is null or link_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  teacher_note text,
  show_public boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists passport_items_student on public.passport_items (student_id, happened_on desc);
create index if not exists passport_items_pending on public.passport_items (campus_id, status) where status = 'pending';
alter table public.passport_items enable row level security;

drop policy if exists "families read own passport" on public.passport_items;
create policy "families read own passport" on public.passport_items for select to authenticated
  using (student_id in (select app.my_students()));
-- families may add their own work, never a school achievement or certificate (those come from teachers)
drop policy if exists "families add own work" on public.passport_items;
create policy "families add own work" on public.passport_items for insert to authenticated
  with check (student_id in (select app.my_students()) and app.my_role() in ('parent', 'student')
              and kind in ('milestone', 'project', 'skill', 'creative', 'reflection') and status = 'pending');
drop policy if exists "families edit own pending" on public.passport_items;
create policy "families edit own pending" on public.passport_items for update to authenticated
  using (student_id in (select app.my_students()) and created_by = app.me() and status = 'pending')
  with check (student_id in (select app.my_students()) and created_by = app.me() and status = 'pending');
drop policy if exists "families delete own pending" on public.passport_items;
create policy "families delete own pending" on public.passport_items for delete to authenticated
  using (student_id in (select app.my_students()) and created_by = app.me() and status <> 'approved');
drop policy if exists "teachers manage passport" on public.passport_items;
create policy "teachers manage passport" on public.passport_items for all to authenticated
  using (app.can_teach_student(student_id)) with check (app.can_teach_student(student_id));

-- campus comes from the child; only staff approve; the public tick only changes through passport_item_public()
create or replace function app.guard_passport_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select campus_id into new.campus_id from students where id = new.student_id;
  if tg_op = 'INSERT' then
    new.show_public := false;
    if app.can_teach_student(new.student_id) then
      new.status := coalesce(nullif(new.status, 'pending'), 'approved');
    else
      new.status := 'pending';
    end if;
  else
    if new.show_public is distinct from old.show_public and current_setting('app.passport_public', true) is distinct from 'on' then
      new.show_public := old.show_public;
    end if;
    if new.status <> 'approved' then new.show_public := false; end if;
    if not app.can_teach_student(new.student_id) then new.status := old.status; new.teacher_note := old.teacher_note; end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_by := app.me(); new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_passport_item on public.passport_items;
create trigger guard_passport_item before insert or update on public.passport_items for each row execute function app.guard_passport_item();

-- ---------- Learning goals ----------
create table if not exists public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  goal text not null check (length(trim(goal)) between 3 and 200),
  target_on date,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  done_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
create index if not exists learning_goals_student on public.learning_goals (student_id, status);
alter table public.learning_goals enable row level security;
drop policy if exists "families manage own goals" on public.learning_goals;
create policy "families manage own goals" on public.learning_goals for all to authenticated
  using (student_id in (select app.my_students())) with check (student_id in (select app.my_students()));
drop policy if exists "teachers manage goals" on public.learning_goals;
create policy "teachers manage goals" on public.learning_goals for all to authenticated
  using (app.can_teach_student(student_id)) with check (app.can_teach_student(student_id));

create or replace function app.fill_goal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select campus_id into new.campus_id from students where id = new.student_id;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists fill_goal on public.learning_goals;
create trigger fill_goal before insert or update on public.learning_goals for each row execute function app.fill_goal();

-- ---------- Practice rules (teacher-defined) ----------
-- "If a child's average in <subject> (in <class>) is below <below_percent>%, suggest <action>."
create table if not exists public.practice_rules (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade default app.my_campus(),
  class_id uuid references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  below_percent int not null default 60 check (below_percent between 1 and 100),
  chapter text,
  action text not null check (length(trim(action)) between 3 and 300),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
create index if not exists practice_rules_campus on public.practice_rules (campus_id, is_active);
alter table public.practice_rules enable row level security;
drop policy if exists "campus read practice rules" on public.practice_rules;
create policy "campus read practice rules" on public.practice_rules for select to authenticated
  using (campus_id = app.my_campus());
drop policy if exists "teachers manage practice rules" on public.practice_rules;
create policy "teachers manage practice rules" on public.practice_rules for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or (app.my_role() = 'teacher' and created_by = app.me())))
  with check (campus_id = app.my_campus() and (app.is_admin() or (app.my_role() = 'teacher' and created_by = app.me())));

-- ---------- Public sharing consent ----------
create table if not exists public.passport_shares (
  student_id uuid primary key references public.students(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_on boolean not null default false,
  consent_by uuid references public.profiles(id) on delete set null,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.passport_shares enable row level security;
drop policy if exists "families read own share" on public.passport_shares;
create policy "families read own share" on public.passport_shares for select to authenticated
  using (student_id in (select app.my_students()));
drop policy if exists "staff read shares" on public.passport_shares;
create policy "staff read shares" on public.passport_shares for select to authenticated
  using (app.can_teach_student(student_id));
-- no insert/update policies: only the guardian functions below change it

-- Guardian turns the public link on or off (a new link code can be made at any time).
create or replace function public.passport_share(p_student uuid, p_on boolean, p_new_code boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if app.my_role() <> 'parent' or p_student not in (select app.my_students()) then
    raise exception 'Only a parent or guardian of this child can change sharing.';
  end if;
  insert into passport_shares (student_id, campus_id, is_on, consent_by, consent_at)
    select p_student, s.campus_id, p_on, app.me(), case when p_on then now() end from students s where s.id = p_student
  on conflict (student_id) do update set is_on = p_on, consent_by = app.me(), consent_at = case when p_on then now() else passport_shares.consent_at end,
    code = case when p_new_code then replace(gen_random_uuid()::text, '-', '') else passport_shares.code end, updated_at = now()
  returning code into c;
  if not p_on then
    perform set_config('app.passport_public', 'on', true);
    update passport_items set show_public = false where student_id = p_student and show_public;
  end if;
  return c;
end $$;
grant execute on function public.passport_share(uuid, boolean, boolean) to authenticated;

-- Guardian ticks one approved item to show on the public link.
create or replace function public.passport_item_public(p_item uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app.my_role() <> 'parent' then raise exception 'Only a parent or guardian can choose what is shared.'; end if;
  perform set_config('app.passport_public', 'on', true);
  update passport_items set show_public = p_on
   where id = p_item and status = 'approved' and student_id in (select app.my_students());
  if not found then raise exception 'Only approved items of your own child can be shared.'; end if;
end $$;
grant execute on function public.passport_item_public(uuid, boolean) to authenticated;

-- What anyone with the link sees: first name, school, class and the ticked items. No ids, no contacts.
create or replace function public.public_passport(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', split_part(s.full_name, ' ', 1),
    'school', coalesce(sc.name, ''), 'campus', c.name, 'class', cl.name,
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'title', i.title, 'body', i.body, 'on', i.happened_on,
                         'subject', sub.name) order by i.happened_on desc)
                       from passport_items i left join subjects sub on sub.id = i.subject_id
                       where i.student_id = s.id and i.status = 'approved' and i.show_public), '[]'))
  from passport_shares ps join students s on s.id = ps.student_id and s.status = 'enrolled'
  join campuses c on c.id = s.campus_id left join schools sc on sc.id = c.school_id
  left join sections x on x.id = s.section_id left join classes cl on cl.id = x.class_id
  where ps.code = p_code and ps.is_on and length(p_code) = 32
$$;
grant execute on function public.public_passport(text) to anon, authenticated;

-- ---------- Upcoming tests for one child (date sheet papers + class tests), no answer keys ----------
create or replace function public.upcoming_tests(p_student uuid) returns table (on_date date, subject text, title text, kind text)
language sql stable security definer set search_path = public as $$
  with k as (select s.section_id, x.class_id from students s join sections x on x.id = s.section_id
             where s.id = p_student and p_student in (select app.my_students()))
  select t.test_date, sub.name, t.title, 'test'
    from paper_tests t join subjects sub on sub.id = t.subject_id
   where t.section_id = (select section_id from k) and t.test_date >= (now() at time zone 'Asia/Karachi')::date
     and t.test_date <= (now() at time zone 'Asia/Karachi')::date + 45
  union all
  select p.paper_date, sub.name, e.name, 'exam'
    from exam_papers p join exams e on e.id = p.exam_id join subjects sub on sub.id = p.subject_id
   where p.class_id = (select class_id from k) and e.status <> 'draft'
     and p.paper_date >= (now() at time zone 'Asia/Karachi')::date and p.paper_date <= (now() at time zone 'Asia/Karachi')::date + 45
  order by 1, 2
  limit 20
$$;
grant execute on function public.upcoming_tests(uuid) to authenticated;

-- The class leaderboard is no longer shown to families (no public comparison of children).
revoke execute on function public.class_leaderboard(uuid) from public, anon, authenticated;
