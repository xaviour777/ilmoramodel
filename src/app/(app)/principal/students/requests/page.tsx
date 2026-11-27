import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { PageHead, Row, Empty } from "@/components/ilm";
import { approveSignup, rejectSignup } from "./actions";

type Req = { id: string; kind: "parent" | "student"; full_name: string; phone: string; child_name: string; class_id: string | null; father_name: string | null;
  note: string | null; status: string; created_at: string; decided_at: string | null; decision_note: string | null; classes: { name: string } | null };
type Kid = { id: string; full_name: string; roll_no: string | null; profile_id: string | null; sections: { name: string; class_id: string; classes: { name: string } } | null; families: { name: string } | null };

const words = (s: string) => s.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
// Children in the requested class first, closest name first.
function matches(r: Req, kids: Kid[]) {
  const want = words(r.child_name);
  const score = (k: Kid) => (k.sections?.class_id === r.class_id ? 10 : 0) + words(k.full_name).filter((w) => want.includes(w)).length * 3;
  return kids.map((k) => ({ k, s: score(k) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.k);
}
const mobile = (p: string) => `0${p.slice(2, 5)} ${p.slice(5)}`;

// Parents and students who asked for a login on the school's sign-up page.
export default async function SignupRequests({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: reqs }, { data: kids }, { data: school }] = await Promise.all([
    supabase.from("signup_requests").select("id, kind, full_name, phone, child_name, class_id, father_name, note, status, created_at, decided_at, decision_note, classes(name)")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("students").select("id, full_name, roll_no, profile_id, sections(name, class_id, classes(name)), families(name)").eq("status", "enrolled").limit(10000),
    supabase.from("schools").select("custom_domain").limit(1).maybeSingle(),
  ]);
  const link = school?.custom_domain ? `https://${school.custom_domain}/register` : null;
  const all = (reqs ?? []) as unknown as Req[];
  const pending = all.filter((r) => r.status === "pending");
  const done = all.filter((r) => r.status !== "pending").slice(0, 20);
  const students = (kids ?? []) as unknown as Kid[];

  return (
    <>
      <PageHead kick={<Link href="/principal/students" className="underline">Students</Link>} title="Sign-up requests"
        sub="Parents and students who asked for a login on your sign-up page. Pick the right child, then approve. They sign in with their mobile number and the password they chose." />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "rejected" ? "Request turned down." : `Approved. They can sign in now with ${sp.saved}.`}</div>}
      <div className="card">
        <p className="muted text-[13px]">{link ? <>Share this link with families, for example on WhatsApp: <b className="select-all">{link}</b></> : "Sign-up works once your school has its own web address. Ask Prinqo support to set it."}</p>
      </div>
      <section className="card">
        <h2 className="h2">Waiting · {pending.length}</h2>
        {pending.length === 0 && <div className="mt-2"><Empty>No requests waiting.</Empty></div>}
        {pending.map((r) => {
          const list = matches(r, students);
          return (
            <Row key={r.id} className="items-start">
              <div className="min-w-[220px] flex-1">
                <div className="font-black">{r.full_name} <span className={`tagx ${r.kind === "parent" ? "b" : "v"}`}>{r.kind}</span></div>
                <div className="muted text-[13px]">
                  {mobile(r.phone)} · {r.kind === "parent" ? <>child <b>{r.child_name}</b></> : "student"}{r.classes ? ` · ${r.classes.name}` : ""}
                  {r.father_name ? ` · father ${r.father_name}` : ""}{r.note ? ` · “${r.note}”` : ""} · {shortDate(r.created_at.slice(0, 10))}
                </div>
              </div>
              <form action={approveSignup} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="request_id" value={r.id} />
                <select className="input" style={{ minHeight: 38, maxWidth: 260 }} name="student_id" required defaultValue="" aria-label={`Child for ${r.full_name}`}>
                  <option value="" disabled>{list.length ? "Pick the child" : "No match: add the child first"}</option>
                  {list.map((k) => <option key={k.id} value={k.id} disabled={r.kind === "student" && !!k.profile_id}>
                    {k.full_name} · {k.sections?.classes.name}-{k.sections?.name}{k.roll_no ? ` · roll ${k.roll_no}` : ""}{k.families ? ` · ${k.families.name}` : ""}{r.kind === "student" && k.profile_id ? " (has login)" : ""}</option>)}
                </select>
                <button className="btn" style={{ minHeight: 38, padding: "0 14px" }} type="submit" disabled={!list.length}>Approve</button>
              </form>
              <form action={rejectSignup} className="flex items-center gap-2">
                <input type="hidden" name="request_id" value={r.id} />
                <input className="input w-36" style={{ minHeight: 38 }} name="note" placeholder="Reason (optional)" aria-label="Reason" />
                <button className="btn-ghost" style={{ minHeight: 38, padding: "0 12px", color: "#b91c1c" }} type="submit">Turn down</button>
              </form>
            </Row>
          );
        })}
      </section>
      {done.length > 0 && (
        <section className="card">
          <h2 className="h2">Recently decided</h2>
          {done.map((r) => (
            <Row key={r.id}>
              <span className="flex-1 font-bold">{r.full_name} <span className="muted text-[12px]">· {r.kind} · {r.child_name}</span></span>
              <span className={`tagx ${r.status === "approved" ? "g" : "r"}`}>{r.status === "approved" ? "approved" : "turned down"}</span>
              <span className="muted text-[12px]">{r.decided_at ? shortDate(r.decided_at.slice(0, 10)) : ""}{r.decision_note ? ` · ${r.decision_note}` : ""}</span>
            </Row>
          ))}
        </section>
      )}
    </>
  );
}
