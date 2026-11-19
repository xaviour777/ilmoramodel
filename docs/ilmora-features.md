# Ilmora — complete feature guide

Ilmora is a school management app built for Pakistani private schools. It runs in the browser on
phones and computers, installs like an app on a phone, and gives every person at the school their
own screen: owner, principal, accounts office, teacher, parent and student.

This guide lists every feature, who uses it, and how it works step by step. It is written so it can
be used as the source for tutorial videos.

- Live demo: https://ilmoramodel.vercel.app
- Demo password for every demo login: **Ilmora@2026** (capital I). On the login page each demo
  account is a button; one tap signs in.

| Demo login | Email | What you see |
|---|---|---|
| Owner (3 campuses) | owner@demo.ilmora.pk | Group dashboard for all campuses |
| Principal, Johar Town | principal@demo.ilmora.pk | Full campus management |
| Principal, Model Town | principal.mt@demo.ilmora.pk | A second, smaller campus |
| Accounts office | accounts@demo.ilmora.pk | Fee desk, challans, expenses, salaries |
| Teacher (Ayesha) | teacher@demo.ilmora.pk | Attendance, homework, marks, her classes |
| Parent (Zainab and Hamza) | parent@demo.ilmora.pk | Two children, fees, results, requests |
| Student (Hamza) | student@demo.ilmora.pk | Own progress, practice, exams |

---

## 1. Platform basics

### 1.1 One app, a screen for every role
Each person signs in with their own email and password and lands on their own home screen.
What a person can see is enforced inside the database (row-level security), not just hidden in the
screen: a teacher only sees her classes, a parent only sees his own children, a principal only
sees her campus, and the owner sees every campus of the school.

### 1.2 White-label per school
Each school can use its own web address (for example app.myschool.pk). On that address the login
page, app name, logo and button colour are the school's own. People from another school cannot sign
in there.

### 1.3 Install on the phone (PWA)
On Android, an "Install app on phone" button appears; the app then opens from the home screen like a
normal app. On iPhone: Share → Add to Home Screen. A simple page shows when there is no internet.

### 1.4 Urdu
Parents and students have an اردو switch in the menu. Menus, headings and common buttons switch to
Urdu (Nastaliq font).

### 1.5 Phone alerts (push notifications)
Each person can tap "Turn on phone alerts". They then get free alerts on the phone for: new homework,
new notices, a child marked absent, a leave request decided, a substitution period, and a reply to a
complaint. (Needs the school's notification keys set once.)

### 1.6 IDs
Every student gets an ID like MS-0001 and every staff member MT-0001 (the prefix is set per school).
IDs appear on cards, challans and report cards.

---

## 2. Owner (school group with several campuses)

The owner sees the whole group. Every owner screen has the same filter at the top:
**all campuses or one campus**, and **this week, this month, this term or this year**.

### 2.1 Overview
- Greeting, today's date, and how many requests wait for approval.
- Eight group numbers: students (and seats used), fees billed, fees collected (collection rate),
  outstanding (families owing), costs (with salaries), profit and margin, attendance, results.
- Campus cards: name, principal, profit or loss, students, fee collection, score. Tap a card to filter
  the whole page to that campus.
- Campus comparison table, sortable by score, profit, students or fee collection.
- **Campus score** = results 30% + attendance 20% + fee collection 20% + profit margin 20% +
  parent satisfaction 10%. Parts with no data yet are left out so a new campus isn't punished.
  Parent satisfaction comes from praise vs complaints in the complaints box.
- Money in and out by month (fees collected vs expenses and salaries) for six months.
- Where the money goes: spending by head (salaries, rent, utilities…).
- Net cash vs salaries still to pay.
- Approvals inbox: approve or decline in one tap.
- Notes worked out from the numbers (for example "Model Town collects 69% of fees; Johar Town 91%").
- Principals scorecard, admissions vs target per campus, and the readiness checklist for a campus
  that is still opening.

### 2.2 Campuses
List of every campus with city, principal, opening date, students/seats, sections, staff and status
(running or opening). Add or edit a campus: name, city, status, opening date, seat capacity,
admissions target, principal. A new campus gets a readiness checklist (building, BISE affiliation,
principal hired, teachers hired, admissions open, break-even) that the owner updates.

### 2.3 Approvals
Anything above a principal's limit comes to the owner: payroll transfers, fee concessions, big
expenses, hiring, fee changes. Shows what is waiting, approved/declined totals, average wait, a
decision log, and the "who can approve what" table. The owner can add a note when deciding; the
person who asked gets a phone alert.

### 2.4 Revenue and fees
Billed, collected, outstanding and share paid online, by campus; collection rate by month;
outstanding by age (under 30 days, 30–60, 60–90, over 90); and the monthly fee per class for every
campus side by side.

### 2.5 Expenses and payroll
Spending by head, payroll calendar (paid / due by month), costs by campus, payroll as a share of
income (healthy is under 60%) and cost per student.

### 2.6 Profit and loss
A statement by campus and for the group: fees received, salaries, every expense head, total costs
and net profit, plus margin by campus. Printable.

### 2.7 Academics
Average result, pass rate, attendance and A+ students per campus; subject averages; the weakest
sections and their weakest subject.

### 2.8 Admissions
Funnel per campus: inquiries → tests → offers → joined, against the target; where families heard of
the school.

### 2.9 Principals and staff
Principals scorecard, staff count by role per campus, students per teacher, lesson observations, and
a list of everyone.

### 2.10 Reports
Eight reports, each for the chosen campus and period: board pack, profit and loss, fee aging, payroll
register, academic summary, admissions, tax pack, campus comparison. "PDF" opens a print-ready page;
"Excel" downloads a CSV file. Reports can be scheduled weekly, monthly or termly.

### 2.11 Group settings
Campuses, branding (name, colour, logo), approval limits per role (principal and accounts), fee policy
(due day, late fee, sibling discount, maximum concession, hold results after unpaid days), AI budget,
payment links and the role overview.

---

## 3. Principal (one campus)

### 3.1 Home
Today at a glance: attendance marked so far, fees this month, absent children with a call button,
staff present, admissions in progress, leave requests waiting, upcoming exam and holiday, latest
notices, and messages waiting to send.

### 3.2 Attendance (reports)
Daily, weekly and monthly attendance by class and section, children absent often, and a trend chart.
Parents of absent children get a message automatically when the teacher marks attendance.

### 3.3 Notices and holidays
Write a notice for everyone, one class or one section; it shows in the parents' app and can go out on
WhatsApp/SMS. Holidays are announced the same way.

### 3.4 Classes
Six tabs: classes and sections with health (fill, attendance, results), section workspace, classrooms,
bell timings, promotion to the next class, moves between sections, gaps (missing teachers, subjects or
timetable), and performance.

### 3.5 Timetable
Periods per section with subject and teacher; teachers confirm their timetable.

### 3.6 Exams
Exams with date sheet, marks entry, results; exam-day view; gaps and checks (marks missing, absent
students); filters and views; board-exam target; and a **marks change log** that records every mark
entered, changed or removed and by whom.

### 3.7 Students
Search by name, roll number, B-form or parent phone. Student profile with photo, family, siblings,
attendance, fee balance, results. Print: report card, ID card, character certificate, school leaving
certificate, fee clearance certificate.

### 3.8 Admissions
Inquiry → test → offer → admitted, with the child's photo (upload or camera) and the new student ID.

### 3.9 Staff and pay
Staff list with designation and staff ID, staff attendance, leave requests to approve, substitutes for
absent teachers' periods (the substitute gets an alert), salaries with payslips, and staff ID cards.

### 3.10 School care (Complaints and vans)
- **Complaints box:** what parents, students and staff send (complaint, suggestion, praise; can be
  anonymous). Reply and mark "working on it" or "resolved"; the sender sees the reply.
- **Lesson observations:** score a lesson 1–5 on planning, teaching, involvement and discipline with
  notes; the teacher sees it.
- **Transport:** vans with plate, driver, phone, route, seats and monthly van fee; students and their
  stops; tick who is on the van for the morning and afternoon trip. Parents see their child's van and
  can call the driver.
- **Morning brief:** one message with yesterday's attendance, fees received, staff on leave, open
  complaints, admissions and today's homework; can arrive on WhatsApp every morning.

### 3.11 Ask the owner
Send a request above the principal's limit (expense, concession, hiring, payroll, fee change) with
amount and details; see its status.

### 3.12 AI tools
A catalog of AI features with on/off switches and a daily limit: AI paper checking (scan answer
sheets), homework tutor for students, tutor report, question paper maker, notice writer.

### 3.13 Settings
School year, WhatsApp/SMS connection, AI settings, profile.

### 3.14 Public result check
A public page (/results) where anyone can check a result with the roll number, and a QR on cards and
report cards that proves they are genuine.

---

## 4. Accounts office

### 4.1 Fee desk
Find a family, see what is owed, take a payment (cash, bank, JazzCash, Easypaisa), print a receipt;
the family gets a receipt message.

### 4.2 Fees and challans
Fee heads and fee per class; make the month's challans for all families; print challans.

### 4.3 Online payments
Parents who pay into the school's JazzCash/Easypaisa send the transaction ID from their app; the office
checks and confirms it, which makes the receipt automatically. (Direct JazzCash checkout is built and
can be switched on later with merchant keys.)

### 4.4 Fee reminders
Send reminders to families who owe, on WhatsApp or SMS, choosing the best channel per family.

### 4.5 Defaulters
Who to call today: promises that fell due, families never called, biggest dues first; log each call
and promise.

### 4.6 Late fee forecast
Families likely to pay late this month, from six months of history, with a "remind early" WhatsApp
button. Risk = 60% how often late + 25% if owing now + 15% if owing and nothing paid in 45 days.

### 4.7 Day close and expenses
Close the day's cash; record expenses by category with vouchers.

---

## 5. Teacher

### 5.1 Attendance
Pick a section, everyone starts as present, tap only those absent, late or on leave, submit. Parents of
absent children get a message. Today's timetable and any substitution periods show at the top.

### 5.2 Scan cards (QR attendance)
Scan each student's ID card with the phone camera at the door to mark present or late; or type the ID.

### 5.3 Homework
Give a task once (title, instructions, due date, marks); students see it and parents get one message.
Students can hand in a photo from the app; the teacher checks each one.

### 5.4 Marks
Enter marks for an exam and subject.

### 5.5 My class
- **Gradebook:** every test of the session plus homework handed in; overall = tests 80% + homework 20%.
- **Test analysis:** class average, pass count, highest and lowest, grade spread, change since the last
  test, and the children who need help.
- **Remedial list:** suggested children (below 50% or under half the homework), a plan, and before →
  after marks.
- **Message parents:** a notice to the whole section in the app, or one parent on WhatsApp with
  ready messages (call me, praise, homework).

### 5.6 Lesson plans
Weekly plan per class and subject (topics, aims, homework), compared with what the diary says was
taught; the principal's lesson observations appear here.

### 5.7 Paper checking (AI)
Scan or upload answer sheets; AI suggests marks; the teacher reviews.

### 5.8 Diary and notes
What was taught each day, and praise/concern notes about a child that can be shared with parents.

### 5.9 Leave and pay
Ask for leave, see the leave balance (allowed, taken, left) and monthly payslips.

### 5.10 Parents' requests
Approve or refuse a child's leave (approved days are marked as leave in attendance), open
parent-teacher meeting times and see who booked.

---

## 6. Parent

### 6.1 My children
Each child's attendance, homework due (hand in a photo), results, teacher notes, timetable, and last 30
days.

### 6.2 Fees
What to pay now, the next month's fee, challans to download, payments and receipts, and how to pay by
JazzCash/Easypaisa (send the transaction ID).

### 6.3 Progress and practice
Weak subjects, a target, today's plan, **practice tests** (10 MCQs from the school's question bank,
marked at once with the right answers shown), badges and the class board (first names only).

### 6.4 Board exam prep
For each subject, how many chapters have been practised and how well (red, orange, green), and a timed
30-minute, 25-question full mock test.

### 6.5 Exams and report card
Date sheet, admit card (held back if fees are owed) and report card download.

### 6.6 Leave and meetings
Ask for a child's leave; book a time with a teacher; see the school van, stop and driver's number.

### 6.7 Complaints and ideas
Send a complaint, suggestion or praise (name can be hidden) and see the school's reply.

### 6.8 Homework tutor (AI)
A tutor that helps the child understand homework step by step without just giving the answer.

---

## 7. Student
Home with today's homework and timetable, homework tutor, my progress (target, plan, practice,
badges, ID card), board exam prep, my exams, and suggestions.

---

## 8. WhatsApp module (premium)

### 8.1 Your own numbers by QR scan
Link 5–6 of the school's own WhatsApp numbers by scanning a QR (WhatsApp → Linked devices). No charge
per message. Each number shows its status and how many messages it sent today.

### 8.2 Safe sending
Messages are shared across the numbers (least-used first), one at a time, with a pause of a few seconds
and "typing…" before each, and a daily limit per number (default 150). A disconnected or blocked number
is marked and the others carry on. (WhatsApp can still block numbers that send a lot; the limits lower
the risk.)

### 8.3 Auto flows: drag-and-drop builder
Build "what message goes when" on a canvas:
- **Start** — when it begins: fee challan unpaid, absent today, absent 3 days in a week, homework given,
  result published, birthday, new admission.
- **Wait** — a number of days, or until a day before/after the due date.
- **Check** — a yes/no question: fee still unpaid? absent today? homework not handed in?
- **Send WhatsApp** — the message, with {parent}, {student}, {class}, {amount}, {due_date}, {exam},
  {school}, {date} filled in for each family.
- **End.**

Ready-made flows: fee reminder (3 days before, the day after if unpaid, 7 days after if still unpaid),
absent today, absent 3 days, homework not handed in, birthday wish. Each family gets a message once per
event. Flows run every morning by themselves or with "Run now". A sent log shows every message and
which number sent it.

---

## 9. Super admin (Ilmora team)
Create a school account (school, first campus, principal login), set its web address and branding,
start or extend a free trial, activate or suspend, reset passwords, switch premium modules on/off, and
see activity across schools.

---

## 10. Suggested tutorial video list
1. Ilmora in 2 minutes — one app for the whole school (tour of each role).
2. Signing in and installing the app on your phone; Urdu and phone alerts.
3. Owner: the group dashboard, campus score and comparison.
4. Owner: approvals, limits and the reports pack (PDF/Excel).
5. Principal: the home screen and the morning brief.
6. Principal: classes, sections, timetable and promotion.
7. Principal: exams from date sheet to report card; the marks change log.
8. Principal: staff attendance, leave and substitutions.
9. Principal: complaints box, lesson observations and transport.
10. Accounts: monthly challans, fee desk and receipts.
11. Accounts: online payments, reminders, defaulters and the late fee forecast.
12. Teacher: attendance in 30 seconds and QR card scanning.
13. Teacher: homework handed in by photo and checking it.
14. Teacher: my class — gradebook, test analysis, remedial list, messages.
15. Teacher: lesson plans, leave balance and payslip.
16. Parent: everything about my child in one place; paying fees.
17. Parent: practice tests, board exam prep and the class board.
18. Parent: leave requests, teacher meetings, van and complaints.
19. WhatsApp module: linking numbers by QR.
20. WhatsApp module: building an auto fee-reminder flow.

## 11. Key selling points
- One app for owner, principal, accounts, teachers, parents and students; installs on any phone.
- Multi-campus group dashboard with a fair campus score and an approvals inbox.
- Fees: challans, desk, online payment confirmation, reminders, defaulters and a late-payment forecast.
- Teachers save time: 30-second attendance, QR scanning, gradebook and test analysis built in.
- Parents see everything: attendance, homework, results, fees, van, and can request leave or a meeting.
- Better results: practice tests, board exam readiness by chapter, remedial lists, observations.
- WhatsApp automation on the school's own numbers, with a drag-and-drop flow builder.
- Urdu, white-label branding per school, and data protected per role inside the database.
