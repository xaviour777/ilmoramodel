import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { stateOf } from "@/lib/super";
import { todayPK, shortDate } from "@/lib/format";
import { PageHead, Stats, Stat, Empty, Insight } from "@/components/ilm";
import { setStatus } from "../actions";

type O = { id: string; name: string; status: string; trial_ends_on: string | null; created_at: string; classes: number; students: number; teachers: number; fee_rows: number; attendance_days_14: number; payments: number };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_onboarding");
  const today = todayPK();
  const rows = ((data ?? []) as O[]).map((s) => {
    const steps = [s.classes > 0, s.students > 0, s.teachers > 0, s.fee_rows > 0, s.attendance_days_14 > 0];
    return { ...s, st: stateOf(s, today), steps, ready: Math.round((steps.filter(Boolean).length / steps.length) * 100) };
  });
  const trials = rows.filter((s) => s.st.id === "trial" || s.st.id === "expired");
  const stuck = rows.filter((s) => s.students === 0);
  const live = rows.filter((s) => s.ready === 100);
  const tag = (ok: boolean, v: string) => <span className={`tagx ${ok ? "g" : "r"}`}>{v}</span>;
  const btn = { minHeight: 34, padding: "0 10px", fontSize: 12 } as const;

  return (
    <>
      <PageHead kick="Platform" title="Onboarding and trials" sub="From a new school to one that uses Prinqo every day.">
        <Link href="/super/new" className="btn">Add a school</Link>
      </PageHead>
      {(sp.error || error) && <div className="notice-bad">{sp.error ?? error?.message}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <Stats>
        <Stat label="On trial" value={rows.filter((s) => s.st.id === "trial").length} sub={`${rows.filter((s) => s.st.id === "expired").length} trial ended`} />
        <Stat label="Fully set up" value={live.length} tone="#15803d" sub={`of ${rows.length} schools`} />
        <Stat label="Stuck in setup" value={stuck.length} tone={stuck.length ? "#c2410c" : undefined} sub="no students added" />
        <Stat label="Trials to paid" value={rows.filter((s) => s.st.id === "active").length} sub="schools now active" />
      </Stats>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Setup checklist per school</h2><span className="muted text-[12px]">what each school has done</span></div>
        <div className="tbl mt-2.5 overflow-x-auto"><table className="w-full min-w-[860px]">
          <thead><tr>{["School", "Status", "Classes", "Students", "Teachers", "Fee setup", "Attendance (14 days)", "Ready"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td><Link href={`/super/${s.id}`} className="font-black text-[#0369a1]">{s.name}</Link><span className="muted block text-[12px]">added {shortDate(s.created_at.slice(0, 10))}</span></td>
              <td><span className={`tagx ${s.st.tone}`}>{s.st.label}</span></td>
              <td>{tag(s.classes > 0, s.classes > 0 ? "Done" : "No")}</td>
              <td>{tag(s.students > 0, String(s.students))}</td>
              <td>{tag(s.teachers > 0, String(s.teachers))}</td>
              <td>{tag(s.fee_rows > 0, s.fee_rows > 0 ? "Done" : "No")}</td>
              <td>{tag(s.attendance_days_14 > 0, s.attendance_days_14 > 0 ? `${s.attendance_days_14} days` : "No")}</td>
              <td className="font-black">{s.ready}%</td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <Empty>No schools yet.</Empty>}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2">Trials</h2>
          {trials.length === 0 && <div className="mt-2"><Empty>No school is on trial.</Empty></div>}
          {trials.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
              <div className="min-w-0 flex-[1_1_200px]"><Link href={`/super/${s.id}`} className="font-black text-[#0369a1]">{s.name}</Link>
                <div className="muted text-[12px]">{s.trial_ends_on ? `ends ${shortDate(s.trial_ends_on)}` : "no end date"} · {s.ready}% set up</div></div>
              <form action={setStatus}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="status" value="trial" /><input type="hidden" name="days" value="7" />
                <input type="hidden" name="from" value={s.st.id === "trial" ? s.trial_ends_on ?? "" : ""} /><input type="hidden" name="label" value="trial +7 days" /><input type="hidden" name="back" value="/super/onboarding" />
                <button className="btn-ghost" style={btn} type="submit">+7 days</button></form>
              <form action={setStatus}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="status" value="active" /><input type="hidden" name="label" value="activated" /><input type="hidden" name="back" value="/super/onboarding" />
                <button className="btn" style={btn} type="submit">Activate</button></form>
            </div>
          ))}
        </section>
        <Insight title="Convert more trials">
          <ul className="ml-4 list-disc">
            <li>{stuck.length ? `${stuck.length} school${stuck.length === 1 ? " has" : "s have"} no students yet. Help them import the student list first: nothing else works without it.` : "Every school has added students."}</li>
            <li>{rows.filter((s) => s.students > 0 && s.fee_rows === 0).length} school(s) have students but no fee setup. Fee challans are what owners pay for, so set fees up on the first call.</li>
          </ul>
        </Insight>
      </div>
    </>
  );
}
