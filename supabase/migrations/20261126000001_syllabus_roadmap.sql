-- Whole-year syllabus: the teacher gives the book (PDF, photos of the contents page, or the
-- textbook the AI knows), AI lists the chapters and topics, and Ilmora plans one lesson per period
-- up to the date the book must finish, around Sundays, holidays and exams. Teachers mark lessons
-- done; the principal sees every class on or behind track; students and parents see their class's
-- road to the final. Only additions.

create table if not exists public.syllabus_books (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  source text not null default 'ai' check (source in ('pdf', 'photo', 'typed', 'ai', 'demo')),
  starts_on date not null,
  finish_by date not null check (finish_by > starts_on),
  periods_per_week int not null default 6 check (periods_per_week between 1 and 14),
  chapters jsonb not null default '[]',   -- [{n, title, pages, weight, topics: [{title, pages}]}]
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  updated_at timestamptz not null default now(),
  unique (class_id, subject_id)
);

create table if not exists public.syllabus_lessons (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  book_id uuid not null references public.syllabus_books(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  sort int not null,
  chapter_n int not null,
  chapter text not null,
  topic text not null,
  pages text,
  homework text,
  is_test boolean not null default false,
  planned_on date not null,
  done_on date,
  done_by uuid references public.profiles(id) on delete set null
);
create index if not exists syllabus_lessons_book on public.syllabus_lessons (book_id, sort);
create index if not exists syllabus_lessons_class_day on public.syllabus_lessons (class_id, planned_on);

-- Teachers who teach this subject in any section of the class.
create or replace function app.teaches_class_subject(p_class uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.section_subjects ss join public.sections s on s.id = ss.section_id
                 where s.class_id = p_class and ss.subject_id = p_subject and ss.teacher_id = app.me())
$$;

alter table public.syllabus_books enable row level security;
alter table public.syllabus_lessons enable row level security;

drop policy if exists "staff read books" on public.syllabus_books;
create policy "staff read books" on public.syllabus_books for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
drop policy if exists "families read books" on public.syllabus_books;
create policy "families read books" on public.syllabus_books for select to authenticated
  using (class_id in (select s.class_id from public.sections s where s.id in (select app.my_sections())));
drop policy if exists "teacher or admin write books" on public.syllabus_books;
create policy "teacher or admin write books" on public.syllabus_books for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_class_subject(class_id, subject_id)))
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_class_subject(class_id, subject_id)));

drop policy if exists "staff read lessons" on public.syllabus_lessons;
create policy "staff read lessons" on public.syllabus_lessons for select to authenticated
  using (campus_id = app.my_campus() and app.is_staff());
drop policy if exists "families read lessons" on public.syllabus_lessons;
create policy "families read lessons" on public.syllabus_lessons for select to authenticated
  using (class_id in (select s.class_id from public.sections s where s.id in (select app.my_sections())));
drop policy if exists "teacher or admin write lessons" on public.syllabus_lessons;
create policy "teacher or admin write lessons" on public.syllabus_lessons for all to authenticated
  using (campus_id = app.my_campus() and (app.is_admin() or app.teaches_class_subject(class_id, subject_id)))
  with check (campus_id = app.my_campus() and (app.is_admin() or app.teaches_class_subject(class_id, subject_id)));

revoke all on public.syllabus_books, public.syllabus_lessons from anon;
grant select, insert, update, delete on public.syllabus_books, public.syllabus_lessons to authenticated;
revoke all on function app.teaches_class_subject(uuid, uuid) from public, anon;
grant execute on function app.teaches_class_subject(uuid, uuid) to authenticated;

-- One row per book: how many lessons, how many done, how many should be done by today (Pakistan time).
create or replace view public.syllabus_progress with (security_invoker = true) as
  select book_id, class_id, subject_id,
         count(*)::int as total,
         count(done_on)::int as done,
         (count(*) filter (where planned_on < (now() at time zone 'Asia/Karachi')::date))::int as should,
         coalesce(max(chapter_n) filter (where done_on is not null), 0) as at_chapter,
         max(chapter_n) as chapters
  from public.syllabus_lessons group by book_id, class_id, subject_id;
revoke all on public.syllabus_progress from anon;
grant select on public.syllabus_progress to authenticated;
