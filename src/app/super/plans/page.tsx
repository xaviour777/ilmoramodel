import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLAN_FEATURES, type Plan, type SchoolRow } from "@/lib/super";
import { rupees } from "@/lib/format";
import { PageHead, Stats, Stat, Row } from "@/components/ilm";
import { savePlan } from "../actions";

const show = (v: string | undefined) => !v || v === "no" ? "—" : v === "yes" ? "✓" : v;

export default async function Plans({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [pl, sc] = await Promise.all([supabase.rpc("super_plans"), supabase.rpc("super_schools")]);
  const plans = (pl.data ?? []) as Plan[];
  const schools = (sc.data ?? []) as (SchoolRow & { modules?: string[] })[];
  const custom = schools.filter((s) => !plans.some((p) => p.id === s.plan));
  const whatsapp = schools.filter((s) => (s.modules ?? []).includes("whatsapp"));

  return (
    <>
      <PageHead kick="Business" title="Plans and features" sub="What each plan costs and includes. Change a price here and new invoices use it." />
      {(sp.error || pl.error) && <div className="notice-bad">{sp.error ?? pl.error?.message}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <Stats>
        <Stat label="Plans" value={plans.length} sub={plans.map((p) => p.name).join(", ")} />
        <Stat label="Custom deals" value={plans.filter((p) => !p.price_paisa).reduce((t, p) => t + p.schools, 0) + custom.length} sub="schools on a price-0 or unknown plan" />
        <Stat label="WhatsApp add-on" value={whatsapp.length} sub="schools with it switched on" />
        <Stat label="Most used" value={[...plans].sort((a, b) => b.schools - a.schools)[0]?.name ?? "—"} sub="plan with most schools" />
      </Stats>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Plan matrix</h2><span className="muted text-[12px]">price per month</span></div>
        <div className="tbl mt-2.5 overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead><tr><th className="text-left">Feature</th>{plans.map((p) => <th key={p.id} className="text-left">{p.name} {p.price_paisa ? rupees(p.price_paisa) : "· custom"}</th>)}</tr></thead>
          <tbody>
            <tr><td className="font-black">Students</td>{plans.map((p) => <td key={p.id}>{p.max_students?.toLocaleString("en-IN") ?? "Unlimited"}</td>)}</tr>
            <tr><td className="font-black">Campuses</td>{plans.map((p) => <td key={p.id}>{p.max_campuses ?? "Unlimited"}</td>)}</tr>
            {PLAN_FEATURES.map(([k, label]) => <tr key={k}><td className="font-black">{label}</td>{plans.map((p) => <td key={p.id}>{show(p.features?.[k])}</td>)}</tr>)}
            <tr><td className="font-black">Schools on it</td>{plans.map((p) => <td key={p.id}>{p.schools} <span className="muted">({p.paying} paying)</span></td>)}</tr>
          </tbody>
        </table></div>
        <p className="muted mt-2 text-[12px]">The matrix is what you sell; the app does not block anything by plan yet. The student limit shows on Usage when a school gets close, and premium modules (WhatsApp automation) are switched on per school.</p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {[...plans, null].map((p) => (
          <details key={p?.id ?? "new"} className="card" open={!p ? false : undefined}>
            <summary className="h2 cursor-pointer">{p ? `Edit ${p.name}` : "New plan"}</summary>
            <form action={savePlan} className="mt-3 flex flex-col gap-3">
              {p && <input type="hidden" name="id" value={p.id} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field">Name<input className="input" name="name" defaultValue={p?.name ?? ""} required /></label>
                <label className="field">Price a month (Rs, 0 = custom)<input className="input" name="price" type="number" min={0} defaultValue={p ? p.price_paisa / 100 : ""} required /></label>
                <label className="field">Student limit (empty = none)<input className="input" name="max_students" type="number" min={1} defaultValue={p?.max_students ?? ""} /></label>
                <label className="field">Campuses (empty = none)<input className="input" name="max_campuses" type="number" min={1} defaultValue={p?.max_campuses ?? ""} /></label>
                {PLAN_FEATURES.map(([k, label]) => (
                  <label key={k} className="field">{label}<input className="input" name={`f_${k}`} defaultValue={p?.features?.[k] ?? "no"} placeholder="yes, no or e.g. 500 a month" /></label>
                ))}
              </div>
              <button className="btn self-start" type="submit">{p ? "Save plan" : "Add plan"}</button>
            </form>
          </details>
        ))}
      </div>

      <section className="card max-w-[720px]">
        <h2 className="h2">Premium modules</h2>
        <Row><span className="ilm-tile t-g text-[13px] font-black">W</span><div className="flex-1"><div className="font-black">WhatsApp automation</div><div className="muted text-[12px]">{whatsapp.length ? whatsapp.map((s) => s.name).join(", ") : "no school yet"}</div></div>
          <span className="muted text-[12px]">switch on from a school&apos;s page</span></Row>
        {custom.length > 0 && <Row><span className="ilm-tile t-o text-[13px] font-black">!</span><div className="flex-1"><div className="font-black">Schools on a plan that is not in this list</div>
          <div className="muted text-[12px]">{custom.map((s) => <Link key={s.id} href={`/super/${s.id}`} className="mr-2 text-[#0369a1] underline">{s.name} ({s.plan})</Link>)}</div></div></Row>}
      </section>
    </>
  );
}
