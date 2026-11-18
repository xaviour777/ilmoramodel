-- Admissions desk: where the family heard of us, who referred them, when to call back,
-- and since when the child has been in the current step.
alter table public.admissions
  add column if not exists source text check (source in ('walk_in', 'referral', 'sibling', 'facebook', 'whatsapp', 'banner', 'website', 'other')),
  add column if not exists referred_by_family_id uuid references public.families(id) on delete set null,
  add column if not exists follow_up_on date,
  add column if not exists stage_since timestamptz not null default now();

create index if not exists admissions_follow_up_idx on public.admissions (campus_id, follow_up_on)
  where status in ('inquiry', 'test', 'offered');
