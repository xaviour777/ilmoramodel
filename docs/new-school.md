# Adding a new school (white-label)

Each school opens Ilmora on its own domain and sees its own name, logo and colour.
Data never mixes: every record belongs to a campus, every database rule checks the
signed-in person's campus, and a campus belongs to exactly one school. On a school's
own domain, only that school's people can sign in.

## 1. Database (Supabase SQL editor)

```sql
-- the school and its branding
insert into public.schools (name, city, custom_domain, logo_url, primary_color, support_email)
values ('Azenu School', 'Lahore', 'lms.azenu.edu.pk', 'https://…/azenu-logo.png', '#2563eb', 'help@azenu.edu.pk')
returning id;

-- at least one campus (use the id returned above)
insert into public.campuses (school_id, name, city) values ('<school id>', 'Main Campus', 'Lahore') returning id;
```

Then create the principal's login (Supabase → Authentication → Add user) and a
`profiles` row with that `user_id`, the new `campus_id` and `role = 'principal'`.
The principal adds classes, staff and students from the app.

- `custom_domain`: lower case, no `https://`, no slash.
- `primary_color`: six-digit hex such as `#2563eb`. It replaces the green on buttons and logo tiles.
- `logo_url`: any public image link (a Supabase Storage public URL works). Square works best.

## 2. Vercel

Project **ilmoramodel** → Settings → Domains → Add → `lms.azenu.edu.pk`.

## 3. DNS (the school's Cloudflare or registrar)

Add the record Vercel shows, normally:

| Type  | Name | Value                |
|-------|------|----------------------|
| CNAME | lms  | cname.vercel-dns.com |

In Cloudflare set the record to **DNS only** (grey cloud) until Vercel shows
"Valid Configuration" and the certificate is issued.

## How it works in the code

- `src/middleware.ts` puts the opened domain in the `x-school-domain` header.
- `src/lib/branding.ts` looks it up with `school_branding(domain)`, a database
  function that returns only the public branding fields, so the login page can
  show it before anyone signs in.
- `src/app/layout.tsx` sets the tab title, icon and the `--brand` colour.
- `src/app/login/actions.ts` and `src/lib/me.ts` refuse a login from another school on a school's domain.
- On a domain that isn't any school's (the `vercel.app` address), the plain Ilmora look and the demo logins show.
