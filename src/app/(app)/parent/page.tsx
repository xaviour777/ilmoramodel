import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ChildOverview } from "@/components/child-overview";
import { NoticesList } from "@/components/notices-list";
import { LiveRefresh } from "@/components/live-refresh";
import { rupees, shortDate } from "@/lib/format";

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const me = await requireRole("parent");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: kids }, { data: balances }, { data: invoice }] = await Promise.all([
    supabase.from("students").select("id, full_name, section_id, sections(name, classes(name))").eq("status", "enrolled").order("full_name"),
    supabase.from("family_balances").select("family_id, balance_paisa"),
    supabase.from("invoices").select("challan_no, due_on").order("billing_month", { ascending: false }).limit(1).maybeSingle(),
  ]);
  type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null };
  const list = (kids ?? []) as unknown as Kid[];
  const child = list.find((k) => k.id === sp.child) ?? list[0];
  const due = (balances ?? []).reduce((t, b) => t + Number(b.balance_paisa), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Assalam-o-Alaikum, {me.full_name.split(" ")[0]}</h1><p className="muted text-base">{me.campus_name}</p></div>
        <LiveRefresh tables={["attendance", "homework", "notices", "payments"]} />
      </div>
      <div className="flex flex-wrap gap-2">
        {list.map((k) => (
          <Link key={k.id} href={`/parent?child=${k.id}`} className="inline-flex min-h-11 items-center rounded-xl border-2 bg-white px-4 font-black"
            style={k.id === child?.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)" }}>
            {k.full_name.split(" ")[0]} · {k.sections ? `${k.sections.classes.name.replace("Class ", "")}-${k.sections.name}` : ""}
          </Link>
        ))}
      </div>
      <section className="card">
        <div className="flex items-center justify-between"><h2 className="h2">Fees</h2><span className={`pill ${due > 0 ? "pill-orange" : "pill-green"}`}>{due > 0 ? "Due" : "All paid"}</span></div>
        <div className="text-3xl font-black tabular-nums">{rupees(due)}</div>
        {invoice && <div className="muted">Challan {invoice.challan_no} · due {shortDate(invoice.due_on)} · pay from any banking app with 1Bill, or at the school counter</div>}
      </section>
      {child ? <ChildOverview child={child} /> : <p className="muted">No children linked to your account yet. Please contact the school office.</p>}
      <NoticesList />
    </>
  );
}
