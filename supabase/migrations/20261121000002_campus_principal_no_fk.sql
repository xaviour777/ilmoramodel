-- campuses.principal_id -> profiles made a second link between profiles and campuses,
-- so API embeds like profiles.select("campuses(...)") became ambiguous and returned nothing
-- (every login showed "not linked to a school"). Keep the column, drop the foreign key.
alter table public.campuses drop constraint if exists campuses_principal_id_fkey;
