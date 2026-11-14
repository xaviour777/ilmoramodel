import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { setReferrer } from "../actions";

const STATUS: Record<string, string> = { enrolled: "Studying", left: "Left", struck_off: "Struck off" };
const MODE: Record<string, string> = { cash: "Cash", jazzcash: "JazzCash", easypaisa: "Easypaisa" };

type Kid = { id: string; full_name: string; roll_no: string | null; status: string; section_id: string | null; sections: { name: string; class_id: string; classes: { name: string; sort: number } } | null };
type Mark = { student_id: string; obtained: number | null; is_absent: boolean; exams: { id: string; name: string; total_marks: number; starts_on: string | null } };

// One family on one page: every child with class, attendance, results and fee, plus who brought them.
export default async function FamilyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const canOpenStudent = me.role !== "accountant";
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: fam } = await supabase.from("families")
    .select("id, name, phone, reminder_phone, address, referred_by_family_id, created_at").eq("id", id).maybeSingle();
  if (!fam) notFound();

  const since = new Date(Date.parse(todayPK()) - 29 * 86400000).toISOString().slice(0, 10);
  const [{ data: kidRows }, { data: bal }, { data: guardians }, { data: invoice }, { data: payments }, { data: fees }, { data: brought }, { data: referrer }] = await Promise.all([
    supabase.from("students").select("id, full_name, roll_no, status, section_id, sections(name, class_id, classes(name, sort))").eq("family_id", id),
    supabase.from("family_balances").select("balance_paisa").eq("family_id", id).maybeSingle(),
    supabase.from("family_guardians").select("relation, is_fee_contact, profiles(full_name, phone)").eq("family_id", id),
    supabase.from("invoices").select("id, challan_no, billing_month, due_on, invoice_lines(student_id, description, amount_paisa)").eq("family_id", id).order("billing_month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("id, amount_paisa, mode, received_at, receipt_no").eq("family_id", id).order("received_at", { ascending: false }).limit(6),
    supabase.from("fee_structures").select("class_id, amount_paisa, monthly"),
    supabase.from("families").select("id, name").eq("referred_by_family_id", id).order("name"),
    fam.referred_by_family_id
      ? supabase.from("families").select("id, name, phone").eq("id", fam.referred_by_family_id).maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string; phone: string | null } | null }),
  ]);

  const kids = ((kidRows ?? []) as unknown as Kid[])
    .sort((a, b) => Number(b.status === "enrolled") - Number(a.status === "enrolled") || (b.sections?.classes.sort ?? 0) - (a.sections?.classes.sort ?? 0));
  const studying = kids.filter((k) => k.status === "enrolled");
  const kidIds = kids.map((k) => k.id);

  const [{ data: att }, { data: markRows }] = kidIds.length
    ? await Promise.all([
      supabase.from("attendance").select("student_id, status").in("student_id", kidIds).gte("date", since),
      supabase.from("marks").select("student_id, obtained, is_absent, exams(id, name, total_marks, starts_on)").in("student_id", kidIds),
    ])
    : [{ data: [] }, { data: [] }];

  const monthlyByClass = new Map<string, number>();
  for (const f of fees ?? []) if (f.monthly) monthlyByClass.set(f.class_id, (monthlyByClass.get(f.class_id) ?? 0) + Number(f.amount_paisa));
  // what this month's challan asks for each child (after any concession); falls back to the class fee
  const billed = new Map<string, number>();
  for (const l of (invoice?.invoice_lines ?? []) as { student_id: string | null; amount_paisa: number }[]) {
    if (l.student_id) billed.set(l.student_id, (billed.get(l.student_id) ?? 0) + Number(l.amount_paisa));
  }
  const feeOf = (k: Kid) => billed.get(k.id) ?? (k.sections ? monthlyByClass.get(k.sections.class_id) ?? 0 : 0);
  const monthlyTotal = studying.reduce((s, k) => s + feeOf(k), 0);
  const balance = Number(bal?.balance_paisa ?? 0);

  const attOf = new Map<string, { p: number; n: number }>();
  for (const a of att ?? []) {
    const e = attOf.get(a.student_id) ?? { p: 0, n: 0 };
    e.n += 1; if (a.status === "present" || a.status === "late") e.p += 1;
    attOf.set(a.student_id, e);
  }

  // results: per exam, each child's total as a percentage
  type ExamCol = { id: string; name: string; date: string };
  const exams = new Map<string, ExamCol>();
  const score = new Map<string, { got: number; out: number }>(); // key: exam|student
  for (const m of (markRows ?? []) as unknown as Mark[]) {
    exams.set(m.exams.id, { id: m.exams.id, name: m.exams.name, date: m.exams.starts_on ?? "" });
    const key = `${m.exams.id}|${m.student_id}`;
    const s = score.get(key) ?? { got: 0, out: 0 };
    s.got += m.is_absent ? 0 : Number(m.obtained ?? 0); s.out += m.exams.total_marks;
    score.set(key, s);
  }
  const recentExams = [...exams.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const pctOf = (examId: string, kidId: string) => {
    const s = score.get(`${examId}|${kidId}`);
    return s && s.out ? Math.round((s.got / s.out) * 100) : null;
  };
  const latestPct = (kidId: string) => {
    for (const e of recentExams) { const p = pctOf(e.id, kidId); if (p !== null) return { p, exam: e.name }; }
    return null;
  };

  const phone = fam.reminder_phone || fam.phone;
  const digits = phone?.replace(/[^\d]/g, "") ?? "";
  const wa = digits ? `https://wa.me/${digits.startsWith("0") ? "92" + digits.slice(1) : digits}` : null;
  const tone = (p: number | null) => (p === null ? "text-on-surface-variant" : p >= 80 ? "text-secondary" : p >= 50 ? "text-primary" : "text-error");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/principal/families" className="eyebrow">‹ All families</Link>
          <h1 className="h1">{fam.name}</h1>
          <p className="muted text-base">
            {studying.length} {studying.length === 1 ? "child" : "children"} studying{phone ? ` · ${phone}` : ""}{fam.address ? ` · ${fam.address}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone && <a className="btn-ghost inline-flex items-center gap-1" href={`tel:${digits}`}><span className="msym text-[18px]">call</span>Call</a>}
          {wa && <a className="btn-ghost inline-flex items-center gap-1" href={wa} target="_blank" rel="noreferrer"><span className="msym text-[18px]">forum</span>WhatsApp</a>}
          <Link className="btn inline-flex items-center gap-1" href={`/accounts?family=${fam.id}`}><span className="msym text-[18px]">point_of_sale</span>Take fee</Link>
        </div>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Children studying" value={String(studying.length)} />
        <Stat label="Monthly fee (all children)" value={rupees(monthlyTotal)} />
        <Stat label="Due now" value={balance > 0 ? rupees(balance) : "Nothing"} warn={balance > 0} />
        <Stat label="Last payment" value={payments?.[0] ? `${rupees(Number(payments[0].amount_paisa))}` : "None yet"} note={payments?.[0] ? shortDate(payments[0].received_at.slice(0, 10)) : undefined} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="h2">Children</h2>
        {kids.length === 0 && <div className="card muted">No child is linked to this family.</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {kids.map((k) => {
            const a = attOf.get(k.id);
            const ap = a && a.n ? Math.round((a.p / a.n) * 100) : null;
            const last = latestPct(k.id);
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-title-md font-bold text-primary">{k.full_name}</div>
                    <div className="text-body-sm text-on-surface-variant">{k.sections ? `${k.sections.classes.name}-${k.sections.name}` : "No class"}{k.roll_no ? ` · Roll ${k.roll_no}` : ""}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-label-sm ${k.status === "enrolled" ? "bg-secondary-fixed/50 text-secondary" : "bg-surface-variant text-on-surface-variant"}`}>{STATUS[k.status] ?? k.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Attendance 30 days" value={ap === null ? "—" : `${ap}%`} cls={tone(ap)} />
                  <Mini label={last ? last.exam : "Last result"} value={last ? `${last.p}%` : "—"} cls={tone(last?.p ?? null)} />
                  <Mini label="Fee / month" value={k.status === "enrolled" ? rupees(feeOf(k)) : "—"} cls="text-primary" />
                </div>
              </>
            );
            return canOpenStudent
              ? <Link key={k.id} href={`/principal/students/${k.id}`} className="card block !p-4 transition hover:border-primary">{inner}</Link>
              : <div key={k.id} className="card !p-4">{inner}</div>;
          })}
        </div>
      </section>

      {recentExams.length > 0 && kids.length > 0 && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Results side by side</h2>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Exam</th>{kids.map((k) => <th key={k.id} className="text-right">{k.full_name.split(" ")[0]}</th>)}</tr></thead>
              <tbody>
                {recentExams.map((e) => (
                  <tr key={e.id}>
                    <td><span className="font-semibold">{e.name}</span>{e.date && <span className="block text-body-sm text-on-surface-variant">{shortDate(e.date)}</span>}</td>
                    {kids.map((k) => { const p = pctOf(e.id, k.id); return <td key={k.id} className={`text-right font-bold tabular-nums ${tone(p)}`}>{p === null ? "—" : `${p}%`}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="h2">Fee</h2>
            {invoice && <Link className="text-label-md font-semibold text-primary underline" target="_blank" href={`/print/challans?month=${invoice.billing_month.slice(0, 7)}&family=${fam.id}`}>Print challan</Link>}
          </div>
          {invoice ? (
            <div>
              <div className="text-body-sm text-on-surface-variant">Challan {invoice.challan_no} · due {shortDate(invoice.due_on)}</div>
              <ul className="mt-2 divide-y divide-surface-variant">
                {((invoice.invoice_lines ?? []) as { student_id: string | null; description: string; amount_paisa: number }[]).map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1.5 text-body-md">
                    <span className="min-w-0">{l.description}{l.student_id && <span className="text-on-surface-variant"> · {kids.find((k) => k.id === l.student_id)?.full_name.split(" ")[0] ?? ""}</span>}</span>
                    <span className={`tabular-nums ${Number(l.amount_paisa) < 0 ? "text-secondary" : ""}`}>{rupees(Number(l.amount_paisa))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="muted">No challan yet.</p>}
          <h3 className="text-title-md font-bold text-primary">Recent payments</h3>
          {payments?.length ? (
            <ul className="divide-y divide-surface-variant">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-1.5 text-body-md">
                  <span>{shortDate(p.received_at.slice(0, 10))} · {MODE[p.mode] ?? p.mode}{p.receipt_no ? ` · ${p.receipt_no}` : ""}</span>
                  <span className="font-semibold tabular-nums text-secondary">{rupees(Number(p.amount_paisa))}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No payment yet.</p>}
        </section>

        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-2">
            <h2 className="h2">Parents and guardians</h2>
            {(guardians ?? []).length === 0 && <p className="muted">No parent login linked yet. Phone on file: {phone ?? "none"}.</p>}
            <ul className="divide-y divide-surface-variant">
              {((guardians ?? []) as unknown as { relation: string; is_fee_contact: boolean; profiles: { full_name: string; phone: string | null } | null }[]).map((g, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <span><span className="font-semibold">{g.profiles?.full_name}</span><span className="text-body-sm text-on-surface-variant"> · {g.relation}{g.is_fee_contact ? " · pays the fee" : ""}</span></span>
                  {g.profiles?.phone && <a className="text-primary hover:underline" href={`tel:${g.profiles.phone.replace(/[^\d+]/g, "")}`}>{g.profiles.phone}</a>}
                </li>
              ))}
            </ul>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="h2">Referral</h2>
            <div className="text-body-md">
              Brought by:{" "}
              {referrer ? <Link className="font-semibold text-primary hover:underline" href={`/principal/families/${referrer.id}`}>{referrer.name}</Link> : <span className="muted">not recorded</span>}
            </div>
            <form action={setReferrer} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="family_id" value={fam.id} />
              <label className="field min-w-0 flex-1 basis-48">Phone of the family who brought them
                <input className="input" name="phone" inputMode="tel" defaultValue={referrer?.phone ?? ""} placeholder="03001234567 (empty to clear)" />
              </label>
              <button className="btn-ghost" type="submit">Save</button>
            </form>
            <div className="text-body-md">
              Families they brought: {brought?.length ? <b>{brought.length}</b> : <span className="muted">none yet</span>}
            </div>
            {!!brought?.length && (
              <div className="flex flex-wrap gap-1">
                {brought.map((b) => <Link key={b.id} href={`/principal/families/${b.id}`} className="rounded-full bg-surface-container-low px-2 py-0.5 text-label-md text-primary hover:underline">{b.name}</Link>)}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, warn, note }: { label: string; value: string; warn?: boolean; note?: string }) {
  return (
    <div className="card !p-4">
      <div className="text-label-md text-on-surface-variant">{label}</div>
      <div className={`mt-1 text-headline-sm font-extrabold ${warn ? "text-error" : "text-primary"}`}>{value}</div>
      {note && <div className="text-body-sm text-on-surface-variant">{note}</div>}
    </div>
  );
}

function Mini({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-1 py-2">
      <div className={`text-title-md font-extrabold ${cls}`}>{value}</div>
      <div className="truncate text-[11px] text-on-surface-variant">{label}</div>
    </div>
  );
}
