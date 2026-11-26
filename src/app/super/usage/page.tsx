import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Stats, Stat, Empty, Insight } from "@/components/ilm";

type U = { id: string; name: string; plan: string; max_students: number | null; students: number; campuses: number; whatsapp: number; sms: number; ai_calls: number; ai_usd: number };
const n = (v: number) => Number(v).toLocaleString("en-IN");

export default async function Usage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_usage");
  const rows = ((data ?? []) as U[]).map((u) => ({ ...u, use: u.max_students ? u.students / u.max_students : 0 }));
  const sum = (k: "whatsapp" | "sms" | "ai_calls" | "ai_usd" | "students") => rows.reduce((t, u) => t + Number(u[k]), 0);
  const near = rows.filter((u) => u.use >= 0.9);
  return (
    <>
      <PageHead kick="Business" title="Usage and limits" sub="Students, messages and AI per school this month, so no bill surprises anyone." />
      {error && <div className="notice-bad">{error.message}</div>}
      <Stats>
        <Stat label="WhatsApp" value={n(sum("whatsapp"))} sub="messages this month" />
        <Stat label="SMS" value={n(sum("sms"))} sub="messages this month" />
        <Stat label="AI" value={`$${sum("ai_usd").toFixed(2)}`} sub={`${n(sum("ai_calls"))} AI tasks this month`} />
        <Stat label="Near student limit" value={near.length} tone={near.length ? "#c2410c" : undefined} sub="90% or more of their limit" />
      </Stats>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Schools by usage</h2><span className="muted text-[12px]">this month, most students first</span></div>
        <div className="tbl mt-2.5 overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr>{["School", "Plan", "Students", "WhatsApp", "SMS", "AI tasks", "AI cost", "Limit"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/super/${u.id}`} className="font-black text-[#0369a1]">{u.name}</Link>{u.campuses > 1 && <span className="muted block text-[12px]">{u.campuses} campuses</span>}</td>
              <td className="text-[13px] font-bold capitalize">{u.plan}</td>
              <td className="tabular-nums">{n(u.students)}{u.max_students ? <span className="muted"> / {n(u.max_students)}</span> : ""}</td>
              <td className="tabular-nums">{n(u.whatsapp)}</td>
              <td className="tabular-nums">{n(u.sms)}</td>
              <td className="tabular-nums">{n(u.ai_calls)}</td>
              <td className="tabular-nums">${Number(u.ai_usd).toFixed(2)}</td>
              <td>{!u.max_students ? <span className="muted text-[13px]">no limit</span> : u.use >= 1 ? <span className="tagx r">Over · {Math.round(u.use * 100)}%</span> : u.use >= 0.9 ? <span className="tagx y">Students {Math.round(u.use * 100)}%</span> : <span className="tagx g">OK</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <Empty>No schools yet.</Empty>}
      </section>
      <div className="max-w-[720px]"><Insight title="Margins">
        {sum("students") ? <>AI costs ${(sum("ai_usd") / Math.max(1, sum("students"))).toFixed(4)} per student this month. </> : null}
        Message counts come from the app&apos;s sent log; your WhatsApp or SMS provider&apos;s bill is the final word on cost. Change a school&apos;s student limit on its page.
      </Insight></div>
    </>
  );
}
