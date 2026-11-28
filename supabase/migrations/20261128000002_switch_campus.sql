-- A principal who is also the owner (schools.owner_is_principal) can run
-- several campuses with one login: this moves their own profile to another
-- campus of the same school. Every campus rule follows app.my_campus().
create or replace function public.switch_my_campus(p_campus uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_owner() or app.my_role() <> 'principal' then
    raise exception 'Only a principal who is also the owner can switch campus';
  end if;
  if not exists (select 1 from campuses where id = p_campus and school_id = app.my_school()) then
    raise exception 'Campus not in your school';
  end if;
  update profiles set campus_id = p_campus where user_id = auth.uid() and is_active;
end $$;
revoke all on function public.switch_my_campus(uuid) from public, anon;
grant execute on function public.switch_my_campus(uuid) to authenticated;
