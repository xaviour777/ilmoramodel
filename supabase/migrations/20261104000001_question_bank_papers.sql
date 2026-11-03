-- Question bank and board-style papers. Teachers build the school's own bank chapter by chapter
-- (typed, or drafted by AI and checked by the teacher), then make a full paper from it in the
-- Punjab board pattern: Section A MCQs, Section B short questions, Section C long questions.
-- Only additions.

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  chapter text not null check (length(trim(chapter)) between 1 and 120),
  kind text not null check (kind in ('mcq', 'short', 'long')),
  question text not null check (length(trim(question)) between 2 and 2000),
  options jsonb not null default '[]',            -- MCQ only: ["...", "...", "...", "..."]
  answer text,                                     -- MCQ: the letter; short/long: model answer
  marks numeric(4, 1),                             -- usual marks; the paper's pattern decides in the end
  source text not null default 'teacher' check (source in ('exercise', 'additional', 'past_paper', 'teacher', 'ai')),
  language text not null default 'en' check (language in ('en', 'ur')),
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  check (kind <> 'mcq' or (jsonb_array_length(options) between 2 and 5 and answer ~ '^[A-E]$'))
);
create index on public.question_bank (campus_id, class_id, subject_id, chapter);

-- A made paper: the pattern and the questions picked, copied in so later bank edits don't change it.
create table public.question_papers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  chapters text[] not null default '{}',
  pattern jsonb not null,                          -- see src/lib/question-paper.ts
  items jsonb not null default '[]',               -- [{section, group, qid, kind, question, options, answer, marks}]
  minutes int,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now()
);
create index on public.question_papers (campus_id, created_at desc);

alter table public.question_bank enable row level security;
alter table public.question_papers enable row level security;

create policy "staff read bank" on public.question_bank for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
create policy "teachers add to bank" on public.question_bank for insert to authenticated
  with check (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
create policy "own or admin edit bank" on public.question_bank for update to authenticated
  using (campus_id = app.my_campus() and (created_by = app.me() or app.is_admin()))
  with check (campus_id = app.my_campus());
create policy "own or admin delete bank" on public.question_bank for delete to authenticated
  using (campus_id = app.my_campus() and (created_by = app.me() or app.is_admin()));

create policy "staff read papers" on public.question_papers for select to authenticated
  using (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
create policy "teachers make papers" on public.question_papers for insert to authenticated
  with check (campus_id = app.my_campus() and app.my_role() in ('owner', 'principal', 'teacher'));
create policy "own or admin edit papers" on public.question_papers for update to authenticated
  using (campus_id = app.my_campus() and (created_by = app.me() or app.is_admin()))
  with check (campus_id = app.my_campus());
create policy "own or admin delete papers" on public.question_papers for delete to authenticated
  using (campus_id = app.my_campus() and (created_by = app.me() or app.is_admin()));
revoke all on public.question_bank, public.question_papers from anon;
