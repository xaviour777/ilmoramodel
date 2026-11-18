-- A child's photo can be taken at the first visit; admitting the child copies it to the student.
alter table public.admissions add column if not exists photo_url text;
