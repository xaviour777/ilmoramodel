-- Homework handed in from the app: a photo (private bucket) and a note, checked by the teacher.
alter table public.homework_submissions
  add column if not exists photo_path text,
  add column if not exists note text;
create unique index if not exists homework_submissions_one on public.homework_submissions (homework_id, student_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework', 'homework', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- files live in <student id>/<file>; the family uploads, the school's staff and the family read
drop policy if exists "families upload homework" on storage.objects;
create policy "families upload homework" on storage.objects for insert to authenticated
  with check (bucket_id = 'homework' and (storage.foldername(name))[1]::uuid in (select app.my_students()));
drop policy if exists "read homework files" on storage.objects;
create policy "read homework files" on storage.objects for select to authenticated
  using (bucket_id = 'homework' and (
    (storage.foldername(name))[1]::uuid in (select app.my_students())
    or exists (select 1 from public.students s where s.id = (storage.foldername(name))[1]::uuid and s.campus_id = app.my_campus()
               and app.my_role() in ('owner', 'principal', 'teacher'))));

-- a family may replace its own unchecked submission
drop policy if exists "families resubmit" on public.homework_submissions;
create policy "families resubmit" on public.homework_submissions for update to authenticated
  using (student_id in (select app.my_students()) and checked_at is null)
  with check (student_id in (select app.my_students()) and checked_at is null and marks is null);
