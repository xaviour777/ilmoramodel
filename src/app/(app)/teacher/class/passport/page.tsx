import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { Tabs } from "@/components/tabs";
import { Flash } from "@/components/flash";
import { KIND_ICON, KIND_LABEL } from "@/lib/learning";
import { addPassportItem, decidePassportItem } from "@/app/(app)/passport/actions";
import { classExtraTabs } from "../extra-tabs";
import { classSections } from "../sections";

type Item = { id: string; kind: string; title: string; body: string | null; happened_on: string; status: string; link_url: string | null; student_id: string; subjects: { name: string } | null; students: { full_name: string } | null };

// Model Passport for a section: approve what students and parents add, and add school achievements and certificates.
export default async function ClassPassport({ searchParams }: { searchParams: Promise<{ section?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const sections = await classSections(me);
  const sec = sections.find((s) => s.id === sp.section) ?? sections[0];
  const tabs = (id: string) => [["grades", "Gradebook"], ["analysis", "Test analysis"], ["remedial", "Remedial"], ["message", "Message parents"]]
    .map(([t, label]) => ({ id: t, label, href: `/teacher/class?section=${id}&tab=${t}` })).concat(classExtraTabs(id));
  if (!sec) return <><h1 className="h1">My class</h1><p className="muted">You don&apos;t teach any section yet.</p></>;
  const supabase = await createClient();
  const back = `/teacher/class/passport?section=${sec.id}`;
  const { data: kids } = await supabase.from("students").select("id, full_name").eq("section_id", sec.id).eq("status", "enrolled").order("full_name");
  const ids = (kids ?? []).map((k) => k.id);
  const [{ data: pending }, { data: recent }, { data: subs }] = await Promise.all([
    ids.length ? supabase.from("passport_items").select("id, kind, title, body, happened_on, status, link_url, student_id, subjects(name), students(full_name)").in("student_id", ids).eq("status", "pending").order("created_at").limit(100) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("passport_items").select("id, kind, title, body, happened_on, status, link_url, student_id, subjects(name), students(full_name)").in("student_id", ids).eq("status", "approved").order("approved_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    supabase.from("section_subjects").select("subject_id, subjects(name)").eq("section_id", sec.id),
  ]);
  const P = (pending ?? []) as unknown as Item[];
  const R = (recent ?? []) as unknown as Item[];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">My class</h1><p className="muted text-base">Model Passport: approve students&apos; work and add school achievements.</p></div>
        <Tabs current="passport" tabs={tabs(sec.id)} />
      </div>
      <div className="flex flex-wrap gap-2">{sections.map((s) => <Link key={s.id} href={`/teacher/class/passport?section=${s.id}`} className="chip" style={s.id === sec.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)" } : undefined}>{s.label}</Link>)}</div>
      <Flash saved={sp.saved} error={sp.error} ur={false} />
      <section className="card">
        <h2 className="h2">Waiting for approval ({P.length})</h2>
        {P.length === 0 && <p className="muted">Nothing waiting. Students and parents add projects, skills and reflections from their Passport tab.</p>}
        {P.map((i) => (
          <div key={i.id} className="row-box items-start">
            <span aria-hidden className="text-xl">{KIND_ICON[i.kind]}</span>
            <div className="flex-1">
              <div className="font-black">{i.students?.full_name} · {i.title}</div>
              <div className="muted text-xs">{KIND_LABEL[i.kind][0]} · {shortDate(i.happened_on)}{i.subjects ? ` · ${i.subjects.name}` : ""}</div>
              {i.body && <p className="text-sm font-semibold">{i.body}</p>}
              {i.link_url && <a href={i.link_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold underline">Open the work</a>}
              <form action={decidePassportItem} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={i.id} /><input type="hidden" name="back" value={back} />
                <input name="teacher_note" className="input min-h-9 flex-1 py-1 text-sm" placeholder="Note to the student (Urdu or English, optional)" maxLength={300} />
                <button name="status" value="approved" className="btn min-h-9 px-3 text-xs">Approve</button>
                <button name="status" value="rejected" className="btn-ghost min-h-9 px-3 text-xs">Send back</button>
              </form>
            </div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h2">Add a school achievement or certificate</h2>
        <p className="muted text-sm">It is approved at once and shows on the student&apos;s and parents&apos; screens. It stays private unless a parent chooses to share it.</p>
        <form action={addPassportItem} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="back" value={back} />
          <select name="student_id" required className="input"><option value="">Choose a student</option>{(kids ?? []).map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>
          <select name="kind" className="input">{["achievement", "certificate", "milestone", "skill", "project", "creative"].map((k) => <option key={k} value={k}>{KIND_ICON[k]} {KIND_LABEL[k][0]}</option>)}</select>
          <input name="title" required maxLength={160} className="input" placeholder="e.g. 1st prize, district science fair" />
          <select name="subject_id" className="input"><option value="">No subject</option>{((subs ?? []) as unknown as { subject_id: string; subjects: { name: string } | null }[]).map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects?.name}</option>)}</select>
          <input type="date" name="happened_on" defaultValue={todayPK()} max={todayPK()} className="input" aria-label="Date" />
          <input name="link_url" type="url" pattern="https://.*" className="input" placeholder="Link to certificate photo (optional, https://)" />
          <textarea name="body" rows={2} maxLength={2000} className="input sm:col-span-2" placeholder="A line about it (optional)" />
          <button className="btn sm:col-span-2">Add to passport</button>
        </form>
      </section>
      <section className="card">
        <h2 className="h2">Recently approved</h2>
        {R.length === 0 ? <p className="muted">Nothing yet.</p> : R.map((i) => <div key={i.id} className="text-sm font-bold">{KIND_ICON[i.kind]} {i.students?.full_name} · {i.title} <span className="muted text-xs">· {shortDate(i.happened_on)}</span></div>)}
      </section>
    </>
  );
}
