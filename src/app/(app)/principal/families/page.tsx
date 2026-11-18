import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees } from "@/lib/format";
import { allRows } from "@/lib/outbox";
import { PageHead, Stats, Stat } from "@/components/ilm";
import { AutoSubmitSelect } from "@/components/auto-submit";

type Search = { q?: string; kids?: string; due?: string; class?: string; sort?: string; page?: string };
type Kid = { id: string; full_name: string; family_id: string; sections: { name: string; class_id: string; classes: { name: string; sort: number } } | null };
type Fam = { id: string; name: string; phone: string | null; reminder_phone: string | null };

const PER_PAGE = 30;

// Every family with the children it has in school, their fee and what is still due.
// One family often has 3 to 6 children in different classes, so the office works family by family.
export default async function FamiliesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const supabase = await createClient();
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "");

  const [kids, bals, { data: classes }, { data: fees }] = await Promise.all([
    allRows<Kid>((a, b) => supabase.from("students")
      .select("id, full_name, family_id, sections(name, class_id, classes(name, sort))")
      .eq("status", "enrolled").order("id").range(a, b) as never),
    allRows<{ family_id: string; balance_paisa: number }>((a, b) => supabase.from("family_balances")
      .select("family_id, balance_paisa").order("family_id").range(a, b) as never),
    supabase.from("classes").select("id, name, sort").order("sort"),
    supabase.from("fee_structures").select("class_id, amount_paisa, monthly"),
  ]);

  // monthly fee of one child = the monthly fee heads of their class
  const monthlyByClass = new Map<string, number>();
  for (const f of fees ?? []) if (f.monthly) monthlyByClass.set(f.class_id, (monthlyByClass.get(f.class_id) ?? 0) + Number(f.amount_paisa));
  const balance = new Map(bals.map((b) => [b.family_id, Number(b.balance_paisa)]));
  const kidsOf = new Map<string, Kid[]>();
  for (const k of kids) kidsOf.set(k.family_id, [...(kidsOf.get(k.family_id) ?? []), k]);
  for (const list of kidsOf.values()) list.sort((a, b) => (b.sections?.classes.sort ?? 0) - (a.sections?.classes.sort ?? 0));
  const monthly = (fid: string) => (kidsOf.get(fid) ?? []).reduce((s, k) => s + (k.sections ? monthlyByClass.get(k.sections.class_id) ?? 0 : 0), 0);

  // search: guardian or family name, phone, or a child's name
  let ids: string[];
  if (q) {
    const [byFam, byGuardian] = await Promise.all([
      supabase.from("families").select("id").or(["name", "phone", "reminder_phone"].map((c) => `${c}.ilike.%${q}%`).join(",")).limit(300),
      supabase.from("family_guardians").select("family_id, profiles!inner(full_name)").ilike("profiles.full_name", `%${q}%`).limit(300),
    ]);
    const lower = q.toLowerCase();
    ids = [...new Set([
      ...(byFam.data ?? []).map((f) => f.id),
      ...(byGuardian.data ?? []).map((g) => g.family_id),
      ...kids.filter((k) => k.full_name.toLowerCase().includes(lower)).map((k) => k.family_id),
    ])];
  } else {
    ids = [...kidsOf.keys()];
  }

  const minKids = Number(sp.kids ?? 0);
  if (minKids) ids = ids.filter((id) => (kidsOf.get(id)?.length ?? 0) >= minKids);
  if (sp.due) ids = ids.filter((id) => (balance.get(id) ?? 0) > 0);
  if (sp.class) ids = ids.filter((id) => kidsOf.get(id)?.some((k) => k.sections?.class_id === sp.class));

  // stats are for every family with a child studying, not just this filter
  const withKids = [...kidsOf.keys()];
  const stats = {
    families: withKids.length,
    two: withKids.filter((id) => kidsOf.get(id)!.length >= 2).length,
    three: withKids.filter((id) => kidsOf.get(id)!.length >= 3).length,
    due: withKids.reduce((s, id) => s + Math.max(0, balance.get(id) ?? 0), 0),
  };

  const sort = sp.sort ?? "kids";
  ids.sort((a, b) =>
    sort === "due" ? (balance.get(b) ?? 0) - (balance.get(a) ?? 0)
    : sort === "fee" ? monthly(b) - monthly(a)
    : (kidsOf.get(b)?.length ?? 0) - (kidsOf.get(a)?.length ?? 0) || (balance.get(b) ?? 0) - (balance.get(a) ?? 0));

  const pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page ?? 1)));
  const pageIds = ids.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const { data: famRows } = pageIds.length
    ? await supabase.from("families").select("id, name, phone, reminder_phone").in("id", pageIds)
    : { data: [] as Fam[] };
  const famById = new Map((famRows ?? []).map((f) => [f.id, f as Fam]));
  const rows = pageIds.map((id) => famById.get(id)).filter((f): f is Fam => !!f);

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams();
    const all = { q: sp.q, kids: sp.kids, due: sp.due, class: sp.class, sort: sp.sort, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return `/principal/families${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold ${on ? "border-[#1f2937] bg-[#1f2937] text-white" : "border-[#e5e7eb] bg-[#f1f5f9]est text-[#6b7280]"}`;
  const phoneOf = (f: Fam) => f.reminder_phone || f.phone;
  const kidLabel = (k: Kid) => `${k.full_name.split(" ")[0]} · ${k.sections ? `${k.sections.classes.name}-${k.sections.name}` : "no class"}`;

  return (
    <>
      <PageHead kick="People" title="Families" sub="Brothers and sisters together: their classes, monthly fee, what is due and results." />

      <Stats>
        <Stat label="Families with a child studying" value={stats.families.toLocaleString("en-PK")} />
        <Stat label="2 or more children" value={stats.two.toLocaleString("en-PK")} />
        <Stat label="3 or more children" value={stats.three.toLocaleString("en-PK")} />
        <Stat label="Due from all families" value={rupees(stats.due)} warn={stats.due > 0} />
      </Stats>

      <div className="card flex flex-col gap-3">
        <form className="flex flex-wrap items-end gap-2" action="/principal/families">
          <label className="relative min-w-0 flex-1 basis-64">
            <span className="sr-only">Search families</span>
            
            <input className="input w-full" name="q" defaultValue={sp.q} placeholder="Father / guardian name, phone or child's name" />
          </label>
          {sp.kids && <input type="hidden" name="kids" value={sp.kids} />}
          {sp.due && <input type="hidden" name="due" value={sp.due} />}
          <AutoSubmitSelect name="class" defaultValue={sp.class ?? ""} className="input w-auto" aria-label="Has a child in class">
            <option value="">Any class</option>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>Has a child in {c.name}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="sort" defaultValue={sort} className="input w-auto" aria-label="Sort">
            <option value="kids">Most children first</option>
            <option value="due">Most due first</option>
            <option value="fee">Highest monthly fee first</option>
          </AutoSubmitSelect>
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Link className={chip(!sp.kids && !sp.due)} href={link({ kids: undefined, due: undefined, page: undefined })}>All</Link>
          <Link className={chip(sp.kids === "2")} href={link({ kids: sp.kids === "2" ? undefined : "2", page: undefined })}>2+ children</Link>
          <Link className={chip(sp.kids === "3")} href={link({ kids: sp.kids === "3" ? undefined : "3", page: undefined })}>3+ children</Link>
          <Link className={chip(!!sp.due)} href={link({ due: sp.due ? undefined : "1", page: undefined })}>Fee due</Link>
          {(sp.q || sp.class) && <Link className="inline-flex min-h-9 items-center px-2 text-[13px] font-semibold text-[#1f2937] underline" href="/principal/families">Clear search</Link>}
        </div>
        <p className="muted text-sm">{ids.length.toLocaleString("en-PK")} {ids.length === 1 ? "family" : "families"}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card muted">No family matches. Try the father&apos;s name, a phone number or a child&apos;s name.</div>
      ) : (
        <>
          {/* phone: cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((f) => {
              const ks = kidsOf.get(f.id) ?? [];
              const due = balance.get(f.id) ?? 0;
              return (
                <li key={f.id} className="card flex flex-col gap-2 !p-3">
                  <div className="flex items-start gap-2">
                    <Link href={`/principal/families/${f.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold text-[#1f2937]">{f.name}</span>
                      <span className="block text-[13px] text-[#6b7280]">{ks.length} {ks.length === 1 ? "child" : "children"} · {rupees(monthly(f.id))}/month</span>
                    </Link>
                    {phoneOf(f) && <a href={`tel:${phoneOf(f)!.replace(/[^\d+]/g, "")}`} aria-label={`Call ${f.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#1f2937]"></a>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ks.map((k) => <span key={k.id} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[12px] text-[#1f2937]">{kidLabel(k)}</span>)}
                  </div>
                  <div className="flex items-center justify-between border-t border-[#e5e7eb] pt-2 text-[13px]">
                    <span className={due > 0 ? "font-bold text-[#dc2626]" : "text-[#15803d]"}>{due > 0 ? `Due ${rupees(due)}` : "Nothing due"}</span>
                    <Link href={`/principal/families/${f.id}`} className="inline-flex items-center gap-0.5 font-semibold text-[#1f2937]">Open</Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* computer: table */}
          <div className="card hidden overflow-x-auto !p-0 md:block">
            <table className="tbl">
              <thead><tr><th>Family</th><th>Children in school</th><th className="text-right">Monthly fee</th><th className="text-right">Due now</th><th>Phone</th></tr></thead>
              <tbody>
                {rows.map((f) => {
                  const ks = kidsOf.get(f.id) ?? [];
                  const due = balance.get(f.id) ?? 0;
                  return (
                    <tr key={f.id}>
                      <td><Link href={`/principal/families/${f.id}`} className="font-bold text-[#1f2937] hover:underline">{f.name}</Link><span className="block text-[13px] text-[#6b7280]">{ks.length} {ks.length === 1 ? "child" : "children"}</span></td>
                      <td><div className="flex max-w-xl flex-wrap gap-1">{ks.map((k) => <span key={k.id} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[12px] text-[#1f2937]">{kidLabel(k)}</span>)}</div></td>
                      <td className="text-right tabular-nums">{rupees(monthly(f.id))}</td>
                      <td className={`text-right tabular-nums ${due > 0 ? "font-bold text-[#dc2626]" : "text-[#15803d]"}`}>{due > 0 ? rupees(due) : "—"}</td>
                      <td>{phoneOf(f) ? <a className="hover:underline" href={`tel:${phoneOf(f)!.replace(/[^\d+]/g, "")}`}>{phoneOf(f)}</a> : <span className="muted">none</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-center gap-3">
              {page > 1 && <Link className="btn-ghost" href={link({ page: String(page - 1) })}>‹ Previous</Link>}
              <span className="muted text-sm">Page {page} of {pages}</span>
              {page < pages && <Link className="btn-ghost" href={link({ page: String(page + 1) })}>Next ›</Link>}
            </nav>
          )}
        </>
      )}
    </>
  );
}
