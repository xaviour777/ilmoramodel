-- Which family brought this family to the school (word of mouth is how most admissions come).
alter table public.families
  add column if not exists referred_by_family_id uuid references public.families(id) on delete set null;

alter table public.families
  add constraint families_not_self_referred check (referred_by_family_id is null or referred_by_family_id <> id);

create index if not exists families_referred_by_idx on public.families (referred_by_family_id)
  where referred_by_family_id is not null;
