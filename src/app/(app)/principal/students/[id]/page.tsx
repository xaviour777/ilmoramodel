import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { Tabs } from "@/components/tabs";
import { Empty } from "@/components/ilm";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";
import { CHOICE_LABEL } from "@/lib/messages";
import { saveFamily, saveStudent, saveStudentDetails } from "../actions";
import { addContact, addDocument, changeStatus, deleteContact, deleteDocument, issueCertificate, openDocument } from "../student360-actions";
import { CERT_LABEL, DOC_KINDS, MOVE_LABEL, STATUS_LABEL } from "@/lib/student360";
import { PhotoUpload } from "@/components/photo-upload";
import { BOARD_GROUPS, boardMissing } from "@/lib/board-form";

type Search = { saved?: string; error?: string; challan?: string; tab?: string };
const TABS = [["overview", "Overview"], ["contacts", "Guardians"], ["history", "Enrolment"], ["fees", "Fees"], ["attendance", "Attendance"], ["results", "Results"], ["documents", "Documents"], ["certificates", "Certificates"], ["profile", "Edit record"], ["status", "Leave / re-join"]] as const;
const d = (v?: string | null) => (v ? new Date(v.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const KIND: Record<string, string> = { charge: "Fee charged", payment: "Payment", concession: "Concession", fine: "Fine", reversal: "Reversal", opening_balance: "Opening balance" };

// One student's full 360 profile: identity, guardians, enrolment history, fees, attendance,
// results, documents and certificates. A student who left keeps everything.
export default async function StudentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "overview";
  const supabase = await createClient();
  const { data: s } = await supabase.from("students")
    .select("*, families(id, name, phone, address, reminder_phone, reminder_channel), sections(name, classes(name))").eq("id", id).maybeSingle();
  if (!s) notFound();
  const fam = s.families as { id: string; name: string; phone: string | null; address: string | null; reminder_phone: string | null; reminder_channel: string };
  const [{ data: year }, { data: bal }, { data: contacts }, { data: docs }, { data: marks }] = await Promise.all([
    supabase.from("academic_sessions").select("name, starts_on, ends_on").eq("is_current", true).maybeSingle(),
    supabase.from("family_balances").select("balance_paisa").eq("family_id", s.family_id).maybeSingle(),
    supabase.from("student_contacts").select("*").eq("student_id", id).order("sort").order("created_at"),
    supabase.from("student_documents").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("marks").select("obtained, is_absent, subjects(name), exams(id, name, total_marks, starts_on, status)").eq("student_id", id),
  ]);
  const since = year?.starts_on ?? new Date(Date.parse(todayPK()) - 365 * 86400000).toISOString().slice(0, 10);
  const { data: att } = await supabase.from("attendance").select("date, status").eq("student_id", id).gte("date", since).order("date");
  const a = att ?? [];
  const present = a.filter((x) => x.status === "present" || x.status === "late").length;
  type M = { obtained: number | null; is_absent: boolean; subjects: { name: string } | null; exams: { id: string; name: string; total_marks: number; starts_on: string | null; status: string } };
  const published = ((marks ?? []) as unknown as M[]).filter((m) => m.exams.status === "results");
  const byExam = new Map<string, { name: string; got: number; out: number; date: string; subjects: { n: string; v: string }[] }>();
  for (const m of published) {
    const e = byExam.get(m.exams.id) ?? { name: m.exams.name, got: 0, out: 0, date: m.exams.starts_on ?? "", subjects: [] };
    e.got += Number(m.obtained ?? 0); e.out += m.exams.total_marks;
    e.subjects.push({ n: m.subjects?.name ?? "", v: m.is_absent ? "Absent" : `${m.obtained ?? "–"}/${m.exams.total_marks}` });
    byExam.set(m.exams.id, e);
  }
  const exams = [...byExam.values()].sort((x, y) => x.date.localeCompare(y.date));
  const avg = exams.length ? exams.reduce((t, e) => t + (e.out ? e.got / e.out : 0), 0) / exams.length : null;
  const today = todayPK();
  const expiring = (docs ?? []).filter((x) => x.expires_on && x.expires_on <= new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10));
  const studying = s.status === "enrolled";
  const pill = studying ? "pill-green" : s.status === "passed_out" ? "pill-blue" : "pill-gray";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.photo_url ? <img src={s.photo_url} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <span className="ilm-tile t-g text-[24px] font-black" style={{ width: 64, height: 64, borderRadius: 18 }}>{s.full_name[0]}</span>}
          <div className="min-w-0">
            <Link href="/principal/students" className="eyebrow">‹ All students</Link>
            <h1 className="h1">{s.full_name}</h1>
            <p className="muted text-base">GR {s.admission_no ?? "—"}{s.legacy_admission_no ? ` (old ${s.legacy_admission_no})` : ""} · {s.sections ? `${s.sections.classes.name}-${s.sections.name}` : "No class"}{s.roll_no ? ` · Roll ${s.roll_no}` : ""} · <span className={`pill ${pill}`}>{STATUS_LABEL[s.status] ?? s.status}</span>{s.left_on ? ` since ${d(s.left_on)}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/student/${id}`} target="_blank" className="btn">Print 360 sheet</Link>
          <ClassesTabs current="" />
        </div>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved === "admitted" && (
        <div className="notice-ok">
          Admitted. Fill the details below for the board form.
          {sp.challan && <> <Link href={`/print/challans?month=${today.slice(0, 7)}&family=${sp.challan}`} target="_blank" className="underline">Print the first challan</Link>.</>}
        </div>
      )}
      {sp.saved && sp.saved !== "admitted" && <div className="notice-ok">Saved.</div>}
      {!studying && <div className="notice-warn">This student is not on the active lists any more ({STATUS_LABEL[s.status]}{s.leave_reason ? `: ${s.leave_reason}` : ""}). Every record is kept, so certificates still carry the real dates.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href={`?tab=attendance`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Attendance {year?.name ? `(${year.name})` : "this year"}</span><b>{a.length ? pct(present / a.length) : "–"}</b><span className="muted text-xs">{present} of {a.length} days</span></Link>
        <Link href={`?tab=fees`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Family fee balance</span><b>{rupees(Number(bal?.balance_paisa ?? 0))}</b><span className="muted text-xs">{Number(bal?.balance_paisa ?? 0) > 0 ? "due" : "nothing due"}</span></Link>
        <Link href={`?tab=results`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Published results</span><b>{avg != null ? pct(avg) : "–"}</b><span className="muted text-xs">{exams.length} exam{exams.length === 1 ? "" : "s"}</span></Link>
        <Link href={`?tab=documents`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Documents</span><b>{(docs ?? []).length}</b><span className="muted text-xs" style={expiring.length ? { color: "var(--orange-ink)" } : undefined}>{expiring.length ? `${expiring.length} expiring or expired` : "on file"}</span></Link>
      </div>

      <Tabs current={tab} tabs={TABS.map(([t, l]) => ({ id: t, label: l, href: `/principal/students/${id}?tab=${t}` }))} />

      {tab === "overview" && <Overview s={s} fam={fam} contacts={contacts ?? []} exams={exams} id={id} />}
      {tab === "contacts" && <Contacts id={id} fam={fam} contacts={contacts ?? []} />}
      {tab === "history" && <History id={id} admitted={s.admitted_on} />}
      {tab === "fees" && <Fees familyId={s.family_id} famName={fam.name} id={id} />}
      {tab === "attendance" && <Attendance rows={a} since={since} />}
      {tab === "results" && <Results exams={exams} id={id} />}
      {tab === "documents" && <Documents id={id} docs={docs ?? []} today={today} />}
      {tab === "certificates" && <Certificates id={id} />}
      {tab === "status" && <StatusTab id={id} status={s.status} />}
      {tab === "profile" && <Profile s={s} fam={fam} id={id} campusId={me.campus_id} />}
    </>
  );
}

type Stu = Record<string, unknown> & { id: string; full_name: string; status: string; admitted_on: string; family_id: string };
type Fam = { id: string; name: string; phone: string | null; address: string | null; reminder_phone: string | null; reminder_channel: string };
type Contact = { id: string; name: string; relation: string; phone: string | null; cnic: string | null; is_emergency: boolean; can_pick_up: boolean; note: string | null };
type Exam = { name: string; got: number; out: number; date: string; subjects: { n: string; v: string }[] };

function Overview({ s, fam, contacts, exams, id }: { s: Stu; fam: Fam; contacts: Contact[]; exams: Exam[]; id: string }) {
  const facts: [string, unknown][] = [["Father", s.father_name], ["Mother", s.mother_name], ["Date of birth", s.date_of_birth ? d(String(s.date_of_birth)) : null], ["Gender", s.gender], ["B-form", s.b_form],
    ["Blood group", s.blood_group], ["Admitted", d(s.admitted_on)], ["Previous school", s.previous_school], ["Address", s.address ?? fam.address]];
  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <section className="card">
        <h2 className="h2">Identity</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {facts.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="muted font-bold">{k}</dt><dd className="font-extrabold">{String(v)}</dd></Fragment>)}
        </dl>
      </section>
      <section className="card">
        <div className="flex items-center justify-between"><h2 className="h2">Guardians & emergency</h2><Link href={`/principal/students/${id}?tab=contacts`} className="btn-ghost" style={{ minHeight: 36 }}>Manage</Link></div>
        <div className="flex justify-between font-extrabold"><span>{fam.name} (family)</span><span className="tabular-nums">{fam.phone ?? "no phone"}</span></div>
        {contacts.map((c) => <div key={c.id} className="flex justify-between text-sm font-bold"><span>{c.name} · {c.relation}{c.is_emergency ? " · emergency" : ""}{c.can_pick_up ? " · may pick up" : ""}</span><span className="tabular-nums">{c.phone ?? ""}</span></div>)}
        {contacts.length === 0 && <p className="muted text-sm">No emergency contact yet. Add one so the school can always reach someone.</p>}
      </section>
      <section className="card xl:col-span-2">
        <div className="flex items-center justify-between"><h2 className="h2">Results</h2><Link href={`/print/report-card/${id}`} className="btn-ghost" style={{ minHeight: 36 }}>Report card</Link></div>
        {exams.length === 0 && <p className="muted">No published results yet.</p>}
        {exams.map((e) => <div key={e.name} className="flex justify-between font-extrabold tabular-nums"><span>{e.name}</span><span>{e.got} / {e.out} · {e.out ? pct(e.got / e.out) : ""}</span></div>)}
      </section>
    </div>
  );
}

function Contacts({ id, fam, contacts }: { id: string; fam: Fam; contacts: Contact[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <section className="card flex flex-col gap-2">
        <h2 className="h2">Guardians and emergency contacts</h2>
        <p className="muted text-sm">The family&apos;s login and fee contact is {fam.name}, {fam.phone ?? "no phone"}. Add others the school may call, and who may collect the child.</p>
        {contacts.length === 0 && <Empty>No contacts added yet.</Empty>}
        {contacts.map((c) => (
          <form key={c.id} action={deleteContact} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="student_id" value={id} />
            <div className="min-w-0 flex-1"><div className="font-black">{c.name} <span className="muted font-bold">· {c.relation}</span></div>
              <div className="text-sm font-bold tabular-nums">{c.phone ?? "no phone"}{c.cnic ? ` · CNIC ${c.cnic}` : ""}</div>
              <div className="flex gap-1.5">{c.is_emergency && <span className="pill pill-orange">Emergency</span>}{c.can_pick_up && <span className="pill pill-green">May pick up</span>}</div>
              {c.note && <div className="muted text-xs">{c.note}</div>}</div>
            {c.phone && <a href={`tel:${c.phone}`} className="btn-ghost" style={{ minHeight: 36 }}>Call</a>}
            <button className="btn-ghost" style={{ minHeight: 36 }} type="submit">Remove</button>
          </form>
        ))}
      </section>
      <form action={addContact} className="card">
        <h2 className="h2">Add a contact</h2>
        <input type="hidden" name="student_id" value={id} />
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Name<input className="input" name="name" required /></label>
          <label className="field">Relation<select className="input" name="relation" defaultValue="guardian">{["father", "mother", "guardian", "uncle", "aunt", "grandparent", "brother", "sister", "driver", "neighbour", "other"].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></label>
          <label className="field">Mobile<input className="input" name="phone" inputMode="tel" placeholder="03001234567" /></label>
          <label className="field">CNIC<input className="input" name="cnic" placeholder="35202-1234567-1" /></label>
        </div>
        <label className="field">Note<input className="input" name="note" placeholder="e.g. call only if parents don't answer" /></label>
        <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="is_emergency" defaultChecked className="h-5 w-5" /> Emergency contact</label>
        <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="can_pick_up" className="h-5 w-5" /> Allowed to pick up the child</label>
        <button className="btn self-start" type="submit">Add contact</button>
      </form>
    </div>
  );
}

async function History({ id, admitted }: { id: string; admitted: string }) {
  const supabase = await createClient();
  const [{ data: moves }, { data: secs }, { data: sessions }] = await Promise.all([
    supabase.from("student_moves").select("id, kind, from_section_id, to_section_id, from_status, to_status, program, reason, note, effective_on, created_at, undone_at, profiles(full_name)").eq("student_id", id).order("effective_on").order("created_at"),
    supabase.from("sections").select("id, name, classes(name), campuses(name)"),
    supabase.from("academic_sessions").select("name, starts_on, ends_on").order("starts_on"),
  ]);
  type S = { id: string; name: string; classes: { name: string }; campuses: { name: string } | null };
  const sec = new Map(((secs ?? []) as unknown as S[]).map((x) => [x.id, `${x.classes.name}-${x.name}`]));
  const sessionOf = (day: string) => (sessions ?? []).find((x) => day >= x.starts_on && day <= x.ends_on)?.name ?? "";
  type Mv = { id: string; kind: string; from_section_id: string | null; to_section_id: string | null; from_status: string; to_status: string; program: string | null; reason: string | null; note: string | null; effective_on: string; undone_at: string | null; profiles: { full_name: string } | null };
  const list = (moves ?? []) as unknown as Mv[];
  const first = list[0]?.from_section_id ? sec.get(list[0].from_section_id) : undefined;
  return (
    <section className="card flex flex-col gap-0">
      <h2 className="h2 mb-2">Enrolment history</h2>
      <ol className="relative ml-2 border-l-2 border-[#e5e7eb]">
        <li className="mb-4 ml-4"><span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-[var(--green)]" />
          <div className="font-black">Admitted{first ? ` to ${first}` : ""}</div><div className="muted text-sm">{d(admitted)}{sessionOf(admitted) ? ` · session ${sessionOf(admitted)}` : ""}</div></li>
        {list.map((m) => (
          <li key={m.id} className="mb-4 ml-4" style={m.undone_at ? { opacity: 0.5 } : undefined}>
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full" style={{ background: m.kind === "leave" || m.kind === "strike_off" ? "var(--red)" : m.kind === "pass_out" ? "var(--blue)" : "var(--orange)" }} />
            <div className="font-black">{MOVE_LABEL[m.kind] ?? m.kind}{m.kind === "status" ? `: ${STATUS_LABEL[m.from_status]} → ${STATUS_LABEL[m.to_status]}` : ""}
              {m.to_section_id && m.to_section_id !== m.from_section_id ? ` · ${sec.get(m.from_section_id ?? "") ?? "—"} → ${sec.get(m.to_section_id) ?? "—"}` : m.from_section_id ? ` · ${sec.get(m.from_section_id) ?? ""}` : ""}
              {m.program ? ` (${m.program})` : ""}{m.undone_at ? " · undone" : ""}</div>
            <div className="muted text-sm">{d(m.effective_on)}{sessionOf(m.effective_on) ? ` · session ${sessionOf(m.effective_on)}` : ""}{m.reason ? ` · ${m.reason}` : ""}{m.note ? ` · ${m.note}` : ""}{m.profiles ? ` · by ${m.profiles.full_name}` : ""}</div>
          </li>
        ))}
      </ol>
      {list.length === 0 && <p className="muted text-sm">No promotions or moves yet.</p>}
    </section>
  );
}

async function Fees({ familyId, famName, id }: { familyId: string; famName: string; id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("ledger_entries").select("id, kind, amount_paisa, note, created_at").eq("family_id", familyId).order("created_at").limit(2000);
  let run = 0;
  const rows = (data ?? []).map((x) => { run += Number(x.amount_paisa); return { ...x, run }; }).reverse();
  return (
    <section className="card flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Fee ledger · {famName}</h2>
        <div className="flex gap-2"><Link href={`/accounts?family=${familyId}`} className="btn-ghost" style={{ minHeight: 36 }}>Open fee desk</Link><Link href={`/print/certificate/${id}?type=fee`} target="_blank" className="btn-ghost" style={{ minHeight: 36 }}>Fee clearance</Link></div>
      </div>
      <p className="muted text-sm">Fees are kept per family, so this shows every child in the family. Plus is money owed, minus is money paid or forgiven.</p>
      {rows.length === 0 ? <Empty>No fee entries yet.</Empty> : (
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Date</th><th>Entry</th><th>Note</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
          <tbody>{rows.slice(0, 300).map((x) => (
            <tr key={x.id}><td className="whitespace-nowrap">{d(new Date(x.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }))}</td><td>{KIND[x.kind] ?? x.kind}</td><td className="muted">{x.note ?? ""}</td>
              <td className="text-right tabular-nums" style={{ color: Number(x.amount_paisa) < 0 ? "var(--green-ink)" : undefined }}>{Number(x.amount_paisa) < 0 ? "−" : "+"}{rupees(Math.abs(Number(x.amount_paisa)))}</td>
              <td className="text-right font-black tabular-nums">{rupees(x.run)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

function Attendance({ rows, since }: { rows: { date: string; status: string }[]; since: string }) {
  const months = new Map<string, Record<string, number>>();
  for (const r of rows) { const k = r.date.slice(0, 7); const m = months.get(k) ?? {}; m[r.status] = (m[r.status] ?? 0) + 1; months.set(k, m); }
  const recent = rows.filter((r) => r.status !== "present").slice(-15).reverse();
  return (
    <div className="grid gap-5 xl:grid-cols-[3fr_2fr] xl:items-start">
      <section className="card overflow-x-auto">
        <h2 className="h2">By month since {d(since)}</h2>
        {months.size === 0 ? <Empty>No attendance marked yet.</Empty> : (
          <table className="tbl"><thead><tr><th>Month</th><th className="text-right">Present</th><th className="text-right">Late</th><th className="text-right">Absent</th><th className="text-right">Leave</th><th className="text-right">Rate</th></tr></thead>
            <tbody>{[...months.entries()].map(([k, m]) => {
              const tot = Object.values(m).reduce((a, b) => a + b, 0);
              return <tr key={k}><td>{new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                {["present", "late", "absent", "leave"].map((s) => <td key={s} className="text-right tabular-nums">{m[s] ?? 0}</td>)}
                <td className="text-right font-black tabular-nums">{pct(((m.present ?? 0) + (m.late ?? 0)) / tot)}</td></tr>;
            })}</tbody></table>
        )}
      </section>
      <section className="card">
        <h2 className="h2">Recent absences and lates</h2>
        {recent.length === 0 && <p className="muted">None.</p>}
        {recent.map((r) => <div key={r.date} className="flex justify-between font-bold"><span>{shortDate(r.date)}</span><span className={`pill ${r.status === "absent" ? "pill-red" : "pill-orange"}`}>{r.status}</span></div>)}
      </section>
    </div>
  );
}

function Results({ exams, id }: { exams: Exam[]; id: string }) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between"><h2 className="h2">Published results</h2><Link href={`/print/report-card/${id}`} className="btn-ghost" style={{ minHeight: 36 }}>Print report card</Link></div>
      {exams.length === 0 && <Empty>No published results yet. Marks show here once the exam&apos;s results are published.</Empty>}
      {exams.map((e) => (
        <div key={e.name} className="rounded-[14px] border-2 border-[#f1f5f9] p-3">
          <div className="flex justify-between font-black tabular-nums"><span>{e.name}</span><span>{e.got} / {e.out} · {e.out ? pct(e.got / e.out) : ""}</span></div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">{e.subjects.map((x) => <span key={x.n}>{x.n}: <span className="tabular-nums">{x.v}</span></span>)}</div>
        </div>
      ))}
    </section>
  );
}

type Doc = { id: string; kind: string; title: string | null; number: string | null; issued_on: string | null; expires_on: string | null; file_path: string | null; verified: boolean };
function Documents({ id, docs, today }: { id: string; docs: Doc[]; today: string }) {
  const soon = new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10);
  return (
    <div className="grid gap-5 xl:grid-cols-[3fr_2fr] xl:items-start">
      <section className="card flex flex-col gap-1">
        <h2 className="h2">Documents on file</h2>
        {docs.length === 0 && <Empty>No documents yet. Add the B-form, birth certificate and a guardian CNIC.</Empty>}
        {docs.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2.5 first:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-black">{DOC_KINDS[x.kind] ?? x.kind}{x.title ? ` · ${x.title}` : ""}{x.verified && <span className="pill pill-green ml-2">Checked</span>}</div>
              <div className="muted text-sm">{x.number ? `No. ${x.number} · ` : ""}{x.issued_on ? `issued ${d(x.issued_on)} · ` : ""}{x.expires_on ? <span style={x.expires_on < today ? { color: "var(--red-ink)" } : x.expires_on <= soon ? { color: "var(--orange-ink)" } : undefined}>{x.expires_on < today ? "expired" : "expires"} {d(x.expires_on)}</span> : "no expiry"}</div>
            </div>
            {x.file_path && <form action={openDocument}><input type="hidden" name="path" value={x.file_path} /><input type="hidden" name="student_id" value={id} /><button className="btn-ghost" style={{ minHeight: 36 }} type="submit">View</button></form>}
            <form action={deleteDocument}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="student_id" value={id} /><button className="btn-ghost" style={{ minHeight: 36 }} type="submit">Remove</button></form>
          </div>
        ))}
      </section>
      <form action={addDocument} className="card">
        <h2 className="h2">Add a document</h2>
        <input type="hidden" name="student_id" value={id} />
        <label className="field">Document<select className="input" name="kind" defaultValue="b_form">{Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Title (optional)<input className="input" name="title" /></label>
          <label className="field">Number<input className="input" name="number" /></label>
          <label className="field">Issued on<input className="input" type="date" name="issued_on" /></label>
          <label className="field">Expires on<input className="input" type="date" name="expires_on" /></label>
        </div>
        <label className="field">Scan or photo (JPG, PNG or PDF, up to 5 MB)<input className="input" type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
        <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="verified" className="h-5 w-5" /> I have checked the original</label>
        <button className="btn self-start" type="submit">Add document</button>
        <p className="muted text-xs">Files are private: only the principal and the office can open them, through a link that works for two minutes.</p>
      </form>
    </div>
  );
}

async function Certificates({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("student_certificates").select("id, kind, serial_no, issued_on, profiles(full_name)").eq("student_id", id).order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as { id: string; kind: string; serial_no: string; issued_on: string; profiles: { full_name: string } | null }[];
  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <section className="card flex flex-col gap-2">
        <h2 className="h2">Issue a certificate</h2>
        <p className="muted text-sm">Each certificate gets its own serial number and is kept here, so it can be checked later. The dates come from the record, even years after the student left.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CERT_LABEL).map(([k, l]) => (
            <form key={k} action={issueCertificate}><input type="hidden" name="student_id" value={id} /><input type="hidden" name="kind" value={k} /><button className="btn-ghost" type="submit">{l}</button></form>
          ))}
        </div>
        <Link href={`/print/id-card/${id}`} target="_blank" className="text-sm font-extrabold underline">Print ID card</Link>
      </section>
      <section className="card flex flex-col gap-1">
        <h2 className="h2">Issued</h2>
        {rows.length === 0 && <p className="muted">None yet.</p>}
        {rows.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-[#f1f5f9] py-2 first:border-0">
            <div><div className="font-black">{CERT_LABEL[c.kind] ?? c.kind} · {c.serial_no}</div><div className="muted text-sm">{d(c.issued_on)}{c.profiles ? ` · by ${c.profiles.full_name}` : ""}</div></div>
            <Link href={`/print/certificate/${id}?cert=${c.id}`} target="_blank" className="btn-ghost" style={{ minHeight: 36 }}>Print again</Link>
          </div>
        ))}
      </section>
    </div>
  );
}

async function StatusTab({ id, status }: { id: string; status: string }) {
  const supabase = await createClient();
  const { data: sections } = status === "enrolled" ? { data: [] } : await supabase.from("sections").select("id, name, classes(name, sort)");
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  return (
    <form action={changeStatus} className="card max-w-2xl">
      <input type="hidden" name="student_id" value={id} />
      {status === "enrolled" ? (
        <>
          <h2 className="h2">Student leaving the school</h2>
          <p className="muted text-sm">The student drops off attendance, marks and class lists. Nothing is deleted: fees, results, attendance and history stay, and certificates can still be issued.</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened">
            {[["leave", "Left (withdrawn)", "v"], ["strike_off", "Struck off", "a"], ["pass_out", "Passed out", "p"]].map(([v, l, c], i) => (
              <label key={v} className={`seg ${c}`}><input type="radio" name="kind" value={v} defaultChecked={i === 0} /><span className="px-3">{l}</span></label>
            ))}
          </div>
          <label className="field">Reason<input className="input" name="reason" required placeholder="e.g. family moved to Karachi / fees unpaid 6 months / completed Class 10" /></label>
        </>
      ) : (
        <>
          <h2 className="h2">Bring back to studying</h2>
          <p className="muted text-sm">For a student who returns. The earlier leaving stays in the history.</p>
          <input type="hidden" name="kind" value="rejoin" />
          <label className="field">Class<select className="input" name="section_id" defaultValue="">{[<option key="" value="">Same class as before</option>, ...secs.map((x) => <option key={x.id} value={x.id}>{x.classes.name}-{x.name}</option>)]}</select></label>
          <input type="hidden" name="reason" value="Re-joined" />
        </>
      )}
      <label className="field">Date<input className="input" type="date" name="effective_on" defaultValue={todayPK()} /></label>
      <label className="field">Note (optional)<input className="input" name="note" /></label>
      <button className="btn self-start" type="submit">{status === "enrolled" ? "Confirm" : "Re-join"}</button>
    </form>
  );
}

async function Profile({ s, fam, id, campusId }: { s: Stu; fam: Fam; id: string; campusId: string }) {
  const supabase = await createClient();
  const [{ data: sections }, { data: siblings }] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("students").select("id, full_name, sections(name, classes(name))").eq("family_id", s.family_id).neq("id", id),
  ]);
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const v = (k: string) => (s[k] as string | null) ?? "";
  const missing = boardMissing(s as never, fam.phone);
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={saveStudent} className="card">
          <h2 className="h2">Student</h2>
          <input type="hidden" name="student_id" value={id} />
          <label className="field">Full name<input className="input" name="full_name" required defaultValue={s.full_name} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class
              <select className="input" name="section_id" defaultValue={v("section_id")}>
                <option value="">No class</option>
                {secs.map((x) => <option key={x.id} value={x.id}>{x.classes.name}-{x.name}</option>)}
              </select>
            </label>
            <label className="field">Roll no<input className="input" name="roll_no" defaultValue={v("roll_no")} /></label>
            <div className="field">GR no (given automatically)<div className="input flex items-center bg-[#f8fafc] font-black">{v("admission_no") || "—"}</div></div>
            <label className="field">Gender
              <select className="input" name="gender" defaultValue={v("gender")}><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select>
            </label>
            <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" defaultValue={v("date_of_birth")} /></label>
          </div>
          <p className="muted">To mark a student as left, struck off or passed out, use the “Leave / re-join” tab, so the date and reason are kept.</p>
          <button className="btn self-start" type="submit">Save student</button>
        </form>

        <form action={saveFamily} className="card">
          <h2 className="h2">Family</h2>
          <input type="hidden" name="student_id" value={id} /><input type="hidden" name="family_id" value={fam.id} />
          <label className="field">Family name<input className="input" name="name" required defaultValue={fam.name} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Parent&apos;s mobile<input className="input" name="phone" inputMode="tel" defaultValue={fam.phone ?? ""} /></label>
            <label className="field">Reminder number<input className="input" name="reminder_phone" inputMode="tel" defaultValue={fam.reminder_phone ?? ""} /></label>
          </div>
          <label className="field">Send reminders by
            <select className="input" name="reminder_channel" defaultValue={fam.reminder_channel}>{Object.entries(CHOICE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Address<input className="input" name="address" defaultValue={fam.address ?? ""} /></label>
          {(siblings ?? []).length > 0 && (
            <p className="text-sm font-bold">Also here: {((siblings ?? []) as unknown as { id: string; full_name: string; sections: { name: string; classes: { name: string } } | null }[]).map((b, i) => (
              <span key={b.id}>{i ? ", " : ""}<Link href={`/principal/students/${b.id}`} className="underline">{b.full_name}</Link>{b.sections ? ` (${b.sections.classes.name}-${b.sections.name})` : ""}</span>
            ))}</p>
          )}
          <button className="btn self-start" type="submit">Save family</button>
        </form>
      </div>

      <form action={saveStudentDetails} className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Full record and board form</h2>
          <span className={`pill ${missing.length ? "pill-orange" : "pill-green"}`}>{missing.length ? `${missing.length} missing for the board form` : "Ready for the board form"}</span>
        </div>
        {missing.length > 0 && <p className="text-sm font-bold" style={{ color: "var(--orange-ink)" }}>Missing: {missing.join(", ")}.</p>}
        <PhotoUpload kind="student" id={id} campusId={campusId} name={s.full_name} url={(s.photo_url as string | null) ?? null} />
        <input type="hidden" name="student_id" value={id} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="field">Father&apos;s name<input className="input" name="father_name" defaultValue={v("father_name")} /></label>
          <label className="field">Father&apos;s CNIC<input className="input" name="father_cnic" defaultValue={v("father_cnic")} placeholder="35202-1234567-1" /></label>
          <label className="field">B-form no<input className="input" name="b_form" defaultValue={v("b_form")} placeholder="35202-1234567-1" /></label>
          <label className="field">Mother&apos;s name<input className="input" name="mother_name" defaultValue={v("mother_name")} /></label>
          <label className="field">Father&apos;s work<input className="input" name="guardian_occupation" defaultValue={v("guardian_occupation")} /></label>
          <label className="field">Religion<input className="input" name="religion" defaultValue={v("religion")} placeholder="Islam" /></label>
          <label className="field">Nationality<input className="input" name="nationality" defaultValue={v("nationality") || "Pakistani"} /></label>
          <label className="field">Group (Class 9)
            <select className="input" name="board_group" defaultValue={v("board_group")}><option value="">Not chosen</option>{Object.entries(BOARD_GROUPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Board registration no<input className="input" name="board_reg_no" defaultValue={v("board_reg_no")} /></label>
          <label className="field">Previous school<input className="input" name="previous_school" defaultValue={v("previous_school")} /></label>
          <label className="field">Last class passed<input className="input" name="last_class_passed" defaultValue={v("last_class_passed")} /></label>
          <label className="field">Blood group<input className="input" name="blood_group" defaultValue={v("blood_group")} placeholder="B+" /></label>
          <label className="field">Identification mark<input className="input" name="identification_mark" defaultValue={v("identification_mark")} placeholder="Mole on left cheek" /></label>
          <label className="field">Disability, if any<input className="input" name="disability" defaultValue={v("disability")} /></label>
        </div>
        <label className="field">Address (as on B-form)<input className="input" name="address" defaultValue={v("address")} /></label>
        <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="hafiz_quran" defaultChecked={Boolean(s.hafiz_quran)} className="h-5 w-5" /> Hafiz-e-Quran</label>
        <button className="btn self-start" type="submit">Save record</button>
        <p className="muted">The board&apos;s own form can change each year; check its notice before sending. The section&apos;s full list is on the Students page (choose the class, then Board list).</p>
      </form>
    </>
  );
}
