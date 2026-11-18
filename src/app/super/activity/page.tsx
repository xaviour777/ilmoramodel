import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Empty, Row } from "@/components/ilm";

export default async function SuperActivity() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("super_audit", { p_limit: 200 });
  const rows = (data ?? []) as { at: string; action: string; school: string | null; school_id: string | null }[];
  return (
    <>
      <PageHead kick="Platform" title="Activity" sub="Every change made from this dashboard, newest first." />
      <section className="card">
        {rows.length === 0 && <Empty>No changes yet.</Empty>}
        {rows.map((r, i) => (
          <Row key={i}>
            <span className="w-40 text-[13px] font-bold text-[#6b7280]">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="flex-1 font-black">{r.action}</span>
            {r.school_id ? <Link href={`/super/${r.school_id}`} className="font-black text-[#0369a1]">{r.school}</Link> : <span className="muted">—</span>}
          </Row>
        ))}
      </section>
    </>
  );
}
