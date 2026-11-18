import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { checkSubmission } from "@/app/(app)/homework/actions";

// One homework: who handed it in, their photo, and marks with a remark.
export default async function CheckHomework({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: hw } = await supabase.from("homework").select("id, title, due_on, section_id, total_marks, subjects(name), sections(name, classes(name))").eq("id", id).maybeSingle();
  if (!hw) notFound();
  const [{ data: kids }, { data: subs }] = await Promise.all([
    supabase.from("students").select("id, full_name, roll_no").eq("section_id", hw.section_id).eq("status", "enrolled").order("roll_no"),
    supabase.from("homework_submissions").select("id, student_id, submitted_at, checked_at, marks, remark, photo_path, note").eq("homework_id", id),
  ]);
  const paths = (subs ?? []).map((s) => s.photo_path).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await supabase.storage.from("homework").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const sub = new Map((subs ?? []).map((s) => [s.student_id, s]));
  const sec = hw.sections as unknown as { name: string; classes: { name: string } } | null;
  const n = (subs ?? []).filter((s) => s.submitted_at).length, c = (subs ?? []).filter((s) => s.checked_at).length;
  return (
    <>
      <div>
        <Link href="/teacher/homework" className="eyebrow">‹ All homework</Link>
        <h1 className="h1">{hw.title}</h1>
        <p className="muted text-base">{(hw.subjects as unknown as { name: string } | null)?.name} · {sec ? `${sec.classes.name}-${sec.name}` : ""} · due {shortDate(hw.due_on)} · {n} of {(kids ?? []).length} handed in · {c} checked</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved. The parent sees the mark and remark.</div>}
      <section className="card">
        {(kids ?? []).map((k) => {
          const s = sub.get(k.id);
          return (
            <form key={k.id} action={checkSubmission} className="row-box flex-wrap">
              <input type="hidden" name="homework_id" value={id} />
              <span className="w-10 font-black">{k.roll_no}</span>
              <div className="min-w-40 flex-1"><div className="font-extrabold">{k.full_name}</div>
                <div className="muted text-xs">{s?.submitted_at ? `handed in ${new Date(s.submitted_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "not handed in"}{s?.note ? ` · "${s.note}"` : ""}</div></div>
              {s?.photo_path && url.get(s.photo_path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={url.get(s.photo_path)} target="_blank" rel="noreferrer"><img src={url.get(s.photo_path)} alt={`${k.full_name}'s homework`} className="h-16 w-16 rounded-lg object-cover" /></a>
              )}
              {s ? <>
                <input type="hidden" name="submission_id" value={s.id} />
                <input className="input min-h-10 w-20 py-1 text-sm" name="marks" type="number" step="0.5" min={0} max={hw.total_marks ?? undefined} defaultValue={s.marks ?? ""} placeholder={hw.total_marks ? `/${hw.total_marks}` : "Marks"} aria-label="Marks" />
                <input className="input min-h-10 w-48 py-1 text-sm" name="remark" defaultValue={s.remark ?? ""} placeholder="Well done / redo Q3" aria-label="Remark" />
                <button className="btn min-h-10 px-3 text-sm" type="submit">{s.checked_at ? "Update" : "Check"}</button>
              </> : <span className="pill pill-gray">Missing</span>}
            </form>
          );
        })}
      </section>
    </>
  );
}
