import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { addStudent } from "./actions";

type Search = { q?: string; section?: string; class?: string; status?: string; page?: string; add?: string; error?: string };
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

  const { data: sections } = await supabase.from("sections").select("id, name, class_id, classes(name, sort)");
  type Sec = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));

  // a phone number finds the family's children too
  let familyIds: string[] = [];
  if (q && /\d{4,}/.test(q)) {
    const { data: fams } = await supabase.from("families").select("id").or(`phone.ilike.%${q}%,reminder_phone.ilike.%${q}%`).limit(50);
    familyIds = (fams ?? []).map((f) => f.id);
  }
  let query = supabase.from("students")
    .select("id, full_name, roll_no, admission_no, status, section_id, families(name, phone, reminder_phone), sections(name, classes(name))", { count: "exact" })
    .eq("status", status).order("full_name").range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.section) query = query.eq("section_id", sp.section);
  else if (sp.class) query = query.in("section_id", secs.filter((x) => x.class_id === sp.class).map((x) => x.id).concat("00000000-0000-0000-0000-000000000000"));
  if (q) {
    const ors = [`full_name.ilike.%${q}%`, `roll_no.ilike.%${q}%`, `admission_no.ilike.%${q}%`, `b_form.ilike.%${q}%`];
    if (familyIds.length) ors.push(`family_id.in.(${familyIds.join(",")})`);
    query = query.or(ors.join(","));
  }
  const { data: rows, count } = await query;
  type Row = { id: string; full_name: string; roll_no: string | null; admission_no: string | null; status: string; families: { name: string; phone: string | null; reminder_phone: string | null } | null; sections: { name: string; classes: { name: string } } | null };
  const link = (o: Partial<Search>) => {
    const p = new URLSearchParams();
    const v = { q: sp.q, section: sp.section, class: sp.class, status: status === "enrolled" ? undefined : status, ...o };
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, String(val));
    return `/principal/students?${p}`;
  };
  const total = count ?? 0;

  const list = (rows ?? []) as unknown as Row[];
  // class chips: one per class, then that class's sections once it is picked
  const classChips = [...new Map(secs.map((x) => [x.class_id, x.classes.name])).entries()];
  const pickedClass = sp.class ?? secs.find((x) => x.id === sp.section)?.class_id;
  const phoneOf = (r: Row) => r.families?.reminder_phone || r.families?.phone || null;
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-label-md whitespace-nowrap ${on ? "bg-primary-container text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"}`;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="h1">Students & Classes</h1>
            <p className="muted">Find a student by name, roll no, admission no, B-form or the parent&apos;s phone.</p>
          </div>
          <a href={`${link({ add: "1" })}#add`} className="btn shrink-0"><span className="msym text-[20px]">person_add</span><span className="hidden sm:inline">Add student</span></a>
        </div>
        <ClassesTabs current="students" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2] gap-3">
          <form className="flex gap-2" role="search">
            {sp.section && <input type="hidden" name="section" value={sp.section} />}
            {!sp.section && sp.class && <input type="hidden" name="class" value={sp.class} />}
            {status !== "enrolled" && <input type="hidden" name="status" value={status} />}
            <label className="relative flex-1">
              <span className="msym absolute top-1/2 left-3 -translate-y-1/2 text-[20px] text-outline" aria-hidden="true">search</span>
              <input className="input pl-10" name="q" type="search" defaultValue={sp.q} placeholder="Name, roll no, 0300..." aria-label="Search students" />
            </label>
            <button className="btn-ghost" type="submit">Search</button>
          </form>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Filter by class">
            <Link href={link({ class: undefined, section: undefined, page: undefined })} className={chip(!pickedClass)}>All</Link>
            {[...classChips.filter(([id]) => id === pickedClass), ...classChips.filter(([id]) => id !== pickedClass)].map(([id, name]) => <Link key={id} href={link({ class: id, section: undefined, page: undefined })} className={chip(pickedClass === id)}>{name.replace(/^Class\s+/i, "Class ")}</Link>)}
          </div>
          {pickedClass && (
            <div className="-mt-1 flex gap-1.5 overflow-x-auto pb-1" aria-label="Filter by section">
              {secs.filter((x) => x.class_id === pickedClass).map((x) => (
                <Link key={x.id} href={link({ section: sp.section === x.id ? undefined : x.id, class: pickedClass, page: undefined })}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-label-sm ${sp.section === x.id ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant"}`}>Section {x.name}</Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label-md text-on-surface-variant">{total.toLocaleString("en-IN")} student{total === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-3">
              {sp.section && <Link href={`/print/board-list?section=${sp.section}`} target="_blank" className="eyebrow">Board list</Link>}
              <div className="flex rounded-lg bg-surface-container-low p-0.5 text-label-sm">
                {Object.entries(STATUS).map(([k, [l]]) => (
                  <Link key={k} href={link({ status: k === "enrolled" ? undefined : k, page: undefined })}
                    className={`rounded-md px-2 py-1 ${status === k ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant"}`}>{l}</Link>
                ))}
              </div>
            </div>
          </div>

          {/* phone: cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                <Link href={`/principal/students/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-container text-label-md font-bold text-on-primary">{initials(r.full_name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-title-md text-on-surface">{r.full_name}{r.status !== "enrolled" && <span className={`pill ${STATUS[r.status][1]} ml-2`}>{STATUS[r.status][0]}</span>}</span>
                    <span className="block truncate text-body-sm text-on-surface-variant">{r.sections ? `${r.sections.classes.name}-${r.sections.name}` : "No class"}{r.roll_no ? ` · Roll ${r.roll_no}` : ""}{r.families?.name ? ` · ${r.families.name}` : ""}</span>
                  </span>
                </Link>
                {phoneOf(r) && <a href={`tel:${phoneOf(r)!.replace(/[^\d+]/g, "")}`} aria-label={`Call ${r.full_name}'s family`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-container-lowest text-primary shadow-sm"><span className="msym text-[20px]">call</span></a>}
              </li>
            ))}
          </ul>

          {/* tablet and computer: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="tbl">
              <thead><tr><th scope="col">Name</th><th scope="col">Class</th><th scope="col">Roll</th><th scope="col">Adm. no</th><th scope="col">Family</th><th scope="col">Phone</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/principal/students/${r.id}`} className="font-bold text-primary hover:underline">{r.full_name}</Link>{r.status !== "enrolled" && <span className={`pill ${STATUS[r.status][1]} ml-2`}>{STATUS[r.status][0]}</span>}</td>
                    <td>{r.sections ? `${r.sections.classes.name}-${r.sections.name}` : "No class"}</td>
                    <td>{r.roll_no}</td><td>{r.admission_no}</td>
                    <td>{r.families?.name}</td>
                    <td>{phoneOf(r) && <a href={`tel:${phoneOf(r)!.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:underline"><span className="msym text-[16px] text-secondary">call</span>{phoneOf(r)}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p className="muted">No student matches.</p>}
          <div className="flex justify-between">
            {page > 0 ? <Link href={link({ page: String(page - 1) })} className="btn-ghost">‹ Previous</Link> : <span />}
            {(page + 1) * PAGE < total && <Link href={link({ page: String(page + 1) })} className="btn-ghost">Next ›</Link>}
          </div>
        </section>

        <details id="add" className="card group flex-1 scroll-mt-20" open={sp.add === "1" ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span><span className="h2 block">Add a student</span><span className="muted text-sm">For a child already admitted. New families can also come through Admissions.</span></span>
            <span className="msym text-[20px] text-outline transition-transform group-open:rotate-90">chevron_right</span>
          </summary>
          <form action={addStudent} className="mt-3 flex flex-col gap-3">
            <label className="field">Student&apos;s name<input className="input" name="full_name" required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Class
                <select className="input" name="section_id" required defaultValue={sp.section ?? ""}>
                  {!sp.section && <option value="" disabled>Pick a class</option>}
                  {secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
                </select>
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
            <button className="btn" type="submit">Add student</button>
          </form>
        </details>
      </div>
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
