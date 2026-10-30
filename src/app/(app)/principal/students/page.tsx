import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { addStudent } from "./actions";

type Search = { q?: string; section?: string; status?: string; page?: string; error?: string };
const STATUS: Record<string, [string, string]> = {
  enrolled: ["Studying", "pill-green"], left: ["Left", "pill-gray"], struck_off: ["Struck off", "pill-red"],
};
const PAGE = 50;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const page = Math.max(0, Number(sp.page) || 0);
  const status = sp.status && STATUS[sp.status] ? sp.status : "enrolled";
  const q = (sp.q ?? "").replace(/[%,()]/g, "").trim();

  const { data: sections } = await supabase.from("sections").select("id, name, classes(name, sort)");
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));

  // a phone number finds the family's children too
  let familyIds: string[] = [];
  if (q && /\d{4,}/.test(q)) {
    const { data: fams } = await supabase.from("families").select("id").or(`phone.ilike.%${q}%,reminder_phone.ilike.%${q}%`).limit(50);
    familyIds = (fams ?? []).map((f) => f.id);
  }
  let query = supabase.from("students")
    .select("id, full_name, roll_no, admission_no, status, section_id, families(name, phone), sections(name, classes(name))", { count: "exact" })
    .eq("status", status).order("full_name").range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.section) query = query.eq("section_id", sp.section);
  if (q) {
    const ors = [`full_name.ilike.%${q}%`, `roll_no.ilike.%${q}%`, `admission_no.ilike.%${q}%`, `b_form.ilike.%${q}%`];
    if (familyIds.length) ors.push(`family_id.in.(${familyIds.join(",")})`);
    query = query.or(ors.join(","));
  }
  const { data: rows, count } = await query;
  type Row = { id: string; full_name: string; roll_no: string | null; admission_no: string | null; status: string; families: { name: string; phone: string | null } | null; sections: { name: string; classes: { name: string } } | null };
  const link = (o: Partial<Search>) => {
    const p = new URLSearchParams();
    const v = { q: sp.q, section: sp.section, status, ...o };
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, String(val));
    return `/principal/students?${p}`;
  };
  const total = count ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Students</h1>
          <p className="muted text-base">Find any student by name, roll number, admission number, B-form or the parent&apos;s phone.</p>
        </div>
        <ClassesTabs current="students" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          <form className="grid items-end gap-2 md:grid-cols-[1fr_12rem_10rem_auto]">
            <label className="field">Search<input className="input" name="q" defaultValue={sp.q} placeholder="Name, roll no, 0300..." /></label>
            <label className="field">Class
              <select className="input" name="section" defaultValue={sp.section ?? ""}>
                <option value="">All classes</option>
                {secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
              </select>
            </label>
            <label className="field">Status
              <select className="input" name="status" defaultValue={status}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <button className="btn-ghost" type="submit">Search</button>
          </form>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="muted">{total} student{total === 1 ? "" : "s"}</p>
            {sp.section && <Link href={`/print/board-list?section=${sp.section}`} target="_blank" className="eyebrow">Board list (Class 9 registration)</Link>}
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th scope="col">Name</th><th scope="col">Class</th><th scope="col">Roll</th><th scope="col">Adm. no</th><th scope="col">Family</th><th scope="col">Phone</th></tr></thead>
              <tbody>
                {((rows ?? []) as unknown as Row[]).map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/principal/students/${r.id}`} className="font-black hover:underline">{r.full_name}</Link>{r.status !== "enrolled" && <span className={`pill ${STATUS[r.status][1]} ml-2`}>{STATUS[r.status][0]}</span>}</td>
                    <td>{r.sections ? `${r.sections.classes.name}-${r.sections.name}` : "No class"}</td>
                    <td>{r.roll_no}</td><td>{r.admission_no}</td>
                    <td>{r.families?.name}</td><td>{r.families?.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(rows ?? []).length === 0 && <p className="muted">No student matches.</p>}
          <div className="flex justify-between">
            {page > 0 ? <Link href={link({ page: String(page - 1) })} className="eyebrow">‹ Previous</Link> : <span />}
            {(page + 1) * PAGE < total && <Link href={link({ page: String(page + 1) })} className="eyebrow">Next ›</Link>}
          </div>
        </section>

        <form action={addStudent} className="card flex-1">
          <h2 className="h2">Add a student</h2>
          <p className="muted">For a child already admitted. New families can also come through Admissions.</p>
          <label className="field">Student&apos;s name<input className="input" name="full_name" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class
              <select className="input" name="section_id" required>{secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}</select>
            </label>
            <label className="field">Roll no<input className="input" name="roll_no" /></label>
            <label className="field">Admission no<input className="input" name="admission_no" /></label>
            <label className="field">Gender
              <select className="input" name="gender" defaultValue=""><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select>
            </label>
            <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" /></label>
            <label className="field">Father / guardian<input className="input" name="guardian_name" /></label>
          </div>
          <label className="field">Parent&apos;s mobile (joins the family with this number)<input className="input" name="phone" inputMode="tel" required placeholder="03001234567" /></label>
          <label className="field">Address<input className="input" name="address" /></label>
          <button className="btn self-start" type="submit">Add student</button>
        </form>
      </div>
    </>
  );
}
