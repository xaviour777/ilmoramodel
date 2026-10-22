-- Demo logins (password Ilmora@2026) for every seeded profile that has an email.
-- Run in the Supabase SQL editor after seed.sql. Same result as scripts/create-demo-users.mjs.
do $$
declare p record; uid uuid;
begin
  for p in select id, email from public.profiles where email is not null and user_id is null loop
    select id into uid from auth.users where email = p.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p.email,
              extensions.crypt('Ilmora@2026', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', p.email, 'email_verified', true), 'email', now(), now(), now());
    end if;
    update public.profiles set user_id = uid where id = p.id;
  end loop;
end $$;
