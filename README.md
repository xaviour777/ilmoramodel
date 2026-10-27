# Ilmora

School management for Pakistani schools: attendance, homework, classes and timings, exams and results, fees, staff leave, admissions and notices, with a live dashboard for every role.

Built with **Next.js 15** (App Router, server actions) and **Supabase** (Postgres, Auth, Realtime, row-level security).

## What each role gets

| Role | Screens |
| --- | --- |
| Principal / owner | Live "Today" dashboard · classes, sections, subjects, class and subject teachers · bell timings (summer, winter, Ramadan) · weekly timetable with clash check · terms, tests and exams, date sheets, publish results · leave approvals and substitutes · admissions pipeline · notices · fee desk |
| Teacher | Mark attendance (P / A / L / leave) · homework tasks with submission progress · marks entry · lesson diary · praise and concern notes · leave requests · AI paper checking · homework tutor report |
| Accountant | Fee desk: find a family, see the challan, take payment by cash, cheque, bank, 1Bill, Raast, JazzCash or Easypaisa · largest balances · admissions |
| Parent | Each child's attendance today and last 30 days · homework due · published results · teacher notes · fee balance · notices · homework tutor and weekly tutor summary |
| Student | Own attendance, homework, results and notices · homework tutor ("Samjhao") |

## How the data is protected

- Every table has **row-level security**. Each person only gets rows their role allows: a teacher marks attendance only for sections they teach, a parent only sees their own children, and one school never sees another school's data.
- **Money is stored in whole paisa** and the fee ledger is **append-only**: payments and challan lines write ledger entries automatically, and the database refuses edits or deletes (corrections are reversal entries).
- Each payment carries an **idempotency key**, so pressing Save twice records one payment.
- Publishing exam results **locks the marks**.

The rules live in `supabase/migrations/`.

## Set up (about 15 minutes)

### 1. Create the database

1. Open your Supabase project → **SQL Editor**.
2. Paste and run each file in order:
   1. `supabase/migrations/20261023000001_core_schema.sql`
   2. `supabase/migrations/20261023000002_security_and_logic.sql`
   3. `supabase/migrations/20261023000003_pin_search_paths.sql`
   4. `supabase/migrations/20261027000001_ai_paper_check_and_tutor.sql` (paper checking and homework tutor)
   5. `supabase/seed.sql` (dummy school: 6 sections, 8 staff, 29 families, 42 students, 4 weeks of attendance, homework, exams and fees)

With the Supabase CLI instead: `supabase link --project-ref <ref>` then `supabase db push` and `supabase db reset --linked` (careful: reset wipes the database).

### 2. Create the demo logins

Easiest: run `supabase/demo_users.sql` in the SQL Editor. Or with the script:

```bash
cp .env.example .env.local        # fill in URL and anon key from Project Settings → API
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key> node scripts/create-demo-users.mjs
```

The service role key bypasses every security rule. Use it only on your own computer, never commit it and never put it in the app.

Demo logins (password `Ilmora@2026`):

| Role | Email |
| --- | --- |
| Principal | principal@demo.ilmora.pk |
| Teacher | teacher@demo.ilmora.pk |
| Accountant | accounts@demo.ilmora.pk |
| Parent | parent@demo.ilmora.pk |
| Student | student@demo.ilmora.pk |

### 3. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The paper checker and homework tutor use a simple demo AI until you add a key. For real AI marking and tutoring, add `ANTHROPIC_API_KEY=<your key>` to `.env.local` and restart `npm run dev`.

### 4. Turn on live updates

The migration adds attendance, payments, homework, notices, leave and marks to Supabase Realtime. If the "Live" badge stays on "Connecting", check **Database → Publications → supabase_realtime** in Supabase.

## AI paper checking and homework tutor

**Paper checking** (Teacher or Principal → Paper checking):

1. **New test**: pick the section and subject, type the MCQ key (for example `ABDCA`) and up to 6 written questions with marks and a short rubric. Link it to an exam to send the marks to results.
2. **Print** one A4 sheet per student. Each sheet has a QR code with the student's name, MCQ bubbles and boxes for written answers.
3. **Scan** each sheet with the phone camera. MCQs are marked straight away, and the AI suggests marks for each written answer from the rubric.
4. **Review**: the teacher sees each answer next to the AI suggestion, and accepts it or picks another mark. Double-filled or blurry sheets are flagged. The AI never gives final marks.
5. **Submit**, then the principal **approves**. Approved marks go into the linked exam, and parents and students can then see the sheet. After submit the sheets are locked.

**Homework tutor** (Student or Parent → Homework tutor): press **Samjhao** on a homework task. The tutor gives a hint first, then a step, and the full method only after two tries, then 5 practice questions (maths for now). It only talks about school work, hides phone numbers and addresses, and allows 40 messages a day. Parents can read every chat, and the teacher's **Tutor report** shows which topics students got stuck on this week.

## Project layout

```
supabase/migrations/   tables, security rules, money triggers, report views
supabase/seed.sql      dummy school data (safe to re-run)
scripts/               demo login creator
src/app/(app)/         pages for each role (principal, teacher, accounts, parent, student)
src/components/        navigation, live refresh, shared pieces
src/lib/               Supabase clients, signed-in user, formatting
```

## Not built yet

- Phone OTP login (email and password for now; Supabase supports SMS OTP once an SMS provider is connected)
- WhatsApp and SMS sending (messages are recorded, not yet delivered)
- 1Bill / Raast / wallet payment callbacks (payments are entered at the desk for now)
- Report card PDFs, Urdu interface, offline mode on phones, monthly challan generation screen
