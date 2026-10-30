import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";
import { ClassesTabs } from "@/components/classes-tabs";
import { BoardPhotosZip } from "@/components/board-photos-zip";
import { BOARD_GROUPS, BOARD_ROW_COLS, boardMissing, type BoardRow } from "@/lib/board-form";
import { askParentsForMissing, importRegNumbers } from "../actions";

type Search = { class?: string; show?: string; asked?: string; skipped?: string; imported?: string; saved?: string; error?: string };

// A whole class's board registration on one page: who is ready, what is missing, and the files for the board's portal.
export default async function BoardReadinessPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: classRows } = await supabase.from("classes").select("id, name, sort, board, sections(id, name)").order("sort");
  type Cls = { id: string; name: string; sort: number; board: string | null; sections: { id: string; name: string }[] };
  const classes = (classRows ?? []) as unknown as Cls[];
  // Class 9 first: that is when the board registers students
  const cls = classes.find((c) => c.id === sp.class) ?? classes.find((c) => /\b9\b|ix|nine/i.test(c.name)) ?? classes.find((c) => c.board) ?? classes[0];
  const ids = (cls?.sections ?? []).map((s) => s.id);
  const rows = ids.length
    ? await allRows<BoardRow>((a, b) => supabase.from("students").select(BOARD_ROW_COLS).in("section_id", ids).eq("status", "enrolled").order("full_name").order("id").range(a, b) as never)
    : [];
  const checked = rows.map((r) => ({ r, miss: boardMissing(r, r.families?.phone ?? null) }));
  const ready = checked.filter((c) => !c.miss.length);
  const missingCount = new Map<string, number>();
  for (const c of checked) for (const m of c.miss) missingCount.set(m, (missingCount.get(m) ?? 0) + 1);
  const registered = rows.filter((r) => r.board_reg_no).length;
  const shown = sp.show === "all" ? checked : checked.filter((c) => c.miss.length);
  const photos = rows.filter((r) => r.photo_url).map((r) => ({ name: (r.b_form ?? r.roll_no ?? r.full_name).replace(/[^\w-]+/g, "_"), url: r.photo_url! }));
  const famsToAsk = new Set(checked.filter((c) => c.miss.some((m) => m !== "mobile number")).map((c) => c.r.family_id)).size;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Board registration</h1>
          <p className="muted text-base">Every student of the class on one page: who is ready for the board, what is missing, and the files to put on the board&apos;s portal.</p>
        </div>
        <ClassesTabs current="board" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.asked && <div className="notice-ok">Message waiting for {sp.asked} families in Messages sent{Number(sp.skipped) ? ` (${sp.skipped} have no usable mobile number)` : ""}.</div>}
      {sp.saved === "nothing" && <div className="notice-ok">Every family has sent everything. Nothing to ask.</div>}
      {sp.imported && <div className="notice-ok">{sp.imported} registration numbers saved.</div>}

      <div className="flex flex-wrap gap-2">
        {classes.map((c) => (
          <Link key={c.id} href={`/principal/students/board?class=${c.id}`} className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold"
            style={c.id === cls?.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)", background: "#fff" }}>{c.name}</Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><div className="muted text-xs font-extrabold uppercase">Students</div><div className="text-2xl font-black">{rows.length}</div></div>
        <div className="tile"><div className="muted text-xs font-extrabold uppercase">Ready for the board</div><div className="text-2xl font-black">{ready.length}</div></div>
        <div className="tile"><div className="muted text-xs font-extrabold uppercase">Something missing</div><div className="text-2xl font-black">{rows.length - ready.length}</div></div>
        <div className="tile"><div className="muted text-xs font-extrabold uppercase">Board reg. no saved</div><div className="text-2xl font-black">{registered}</div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">What is missing</h2>
          {missingCount.size === 0 && <p className="muted">Nothing. Every student&apos;s board form is complete.</p>}
          {[...missingCount.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
            <div key={m} className="flex items-center gap-3 text-sm font-bold">
              <span className="w-40">{m}</span>
              <span className="h-2.5 rounded-full" style={{ width: `${Math.max(4, (n / Math.max(rows.length, 1)) * 100)}%`, maxWidth: "60%", background: "var(--orange)" }} />
              <span className="tabular-nums">{n}</span>
            </div>
          ))}
          {famsToAsk > 0 && cls && (
            <form action={askParentsForMissing}>
              <input type="hidden" name="class_id" value={cls.id} />
              <button className="btn">Ask {famsToAsk} families on WhatsApp/SMS for what is missing</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="h2">For the board&apos;s portal</h2>
          <p className="muted text-sm">The board&apos;s website takes the data from the school&apos;s own login. These files hold everything in one place to copy in; check the board&apos;s notice for this year&apos;s columns.</p>
          <div className="flex flex-wrap gap-2">
            {cls?.sections.map((s) => (
              <span key={s.id} className="flex gap-1">
                <a className="btn btn-ghost" href={`/principal/students/board-list.csv?section=${s.id}`}>{cls.name}-{s.name} Excel</a>
                <Link className="btn btn-ghost" href={`/print/board-list?section=${s.id}`} target="_blank">Print</Link>
              </span>
            ))}
          </div>
          <BoardPhotosZip photos={photos} fileName={`${(cls?.name ?? "class").replace(/\W+/g, "-")}-board-photos.zip`} />
          {cls && (
            <form action={importRegNumbers} className="flex flex-col gap-2">
              <input type="hidden" name="class_id" value={cls.id} />
              <label className="field">Registration numbers from the board: one student a line, B-form or roll no, then the registration no
                <textarea className="input min-h-24 font-mono text-sm" name="lines" placeholder={"35202-1234567-1, 2027-LHR-123456\n902, 2027-LHR-123457"} />
              </label>
              <button className="btn btn-ghost self-start">Save registration numbers</button>
            </form>
          )}
        </section>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">{sp.show === "all" ? "All students" : "Students with something missing"}</h2>
          <Link className="eyebrow" href={`/principal/students/board?class=${cls?.id ?? ""}${sp.show === "all" ? "" : "&show=all"}`}>{sp.show === "all" ? "Only those missing something" : "Show all"}</Link>
        </div>
        {shown.length === 0 && <p className="muted">Nobody here.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="py-1.5">Student</th><th>Section</th><th>Group</th><th>Board reg. no</th><th>Missing</th></tr></thead>
            <tbody>
              {shown.map(({ r, miss }) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="py-1.5"><Link className="font-extrabold underline" href={`/principal/students/${r.id}`}>{r.full_name}</Link><div className="muted text-xs">{r.father_name ?? ""}</div></td>
                  <td>{r.sections?.name}</td>
                  <td>{r.board_group ? BOARD_GROUPS[r.board_group] : "–"}</td>
                  <td>{r.board_reg_no ?? "–"}</td>
                  <td>{miss.length ? <span className="font-bold" style={{ color: "var(--orange-ink)" }}>{miss.join(", ")}</span> : <span className="pill pill-green">Ready</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
