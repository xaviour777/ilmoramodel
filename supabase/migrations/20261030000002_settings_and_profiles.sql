-- School settings (WhatsApp Business and SMS gateway connections) and each person's own profile
-- (photo, name, phone). Only additions, apart from widening the messages status list.

-- ---------- Messaging settings ----------
create table public.campus_settings (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  whatsapp_phone_number_id text,             -- from Meta: WhatsApp → API setup
  whatsapp_template text,                    -- approved template with one {{1}} body variable; empty = plain text
  whatsapp_template_lang text not null default 'en',
  sms_enabled boolean not null default false,
  sms_method text not null default 'GET' check (sms_method in ('GET', 'POST')),
  sms_url text,                              -- with {to} {message} {sender} {key} placeholders
  sms_body text,                             -- POST body with the same placeholders
  sms_sender text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Tokens and API keys live apart so the settings page never sends them back to a browser.
-- Fee staff can read them because their server actions send the reminders.
create table public.campus_secrets (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  whatsapp_token text,
  sms_api_key text
);

alter table public.campus_settings enable row level security;
alter table public.campus_secrets enable row level security;
create policy "accounts read settings" on public.campus_settings for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "admin write settings" on public.campus_settings for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
create policy "accounts read secrets" on public.campus_secrets for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());
create policy "admin write secrets" on public.campus_secrets for all to authenticated
  using (campus_id = app.my_campus() and app.is_admin())
  with check (campus_id = app.my_campus() and app.is_admin());
revoke all on public.campus_secrets from anon;

-- ---------- Messages: why one failed, and "don't send" apart from failures ----------
alter table public.messages add column error text;
alter table public.messages drop constraint messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'sent', 'failed', 'cancelled'));
update public.messages set status = 'cancelled' where status = 'failed' and error is null;

-- ---------- Everyone edits their own profile ----------
alter table public.profiles add column avatar_url text;

create policy "edit own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- People may change their name, phone and photo, never their role, campus or login.
create or replace function app.guard_profile_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if not coalesce(app.is_admin(), false) and (
       new.role is distinct from old.role or new.campus_id is distinct from old.campus_id
    or new.user_id is distinct from old.user_id or new.is_active is distinct from old.is_active) then
    raise exception 'Only the principal can change a role, campus or login.';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_change();

-- ---------- Profile photos ----------
-- Public bucket so a photo URL works in an <img>; each person writes only inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remove own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
