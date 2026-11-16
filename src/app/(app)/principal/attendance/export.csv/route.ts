import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";

// Attendance by section and day for a date range, as a CSV that opens in Excel.
export async function GET(req: Request) {
  await requireRole("principal", "owner");
  const u = new URL(req.url);
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = ok(u.searchParams.get("from")) ?? new Date().toISOString().slice(0, 8) + "01";
  const to = ok(u.searchParams.get("to")) ?? new Date().toISOString().slice(0, 10);
  const cls = u.searchParams.get("cls");
  const supabase = await createClient();
  const { data: secs } = await supabase.from("sections").select("id, name, class_id, classes(name, sort)");
  type S = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  const list = ((secs ?? []) as unknown as S[]).filter((s) => !cls || s.class_id === cls);
  const name = new Map(list.map((s) => [s.id, `${s.classes.name}-${s.name}`]));
  type R = { section_id: string; date: string; present: number; marked: number };
  const rows = await fetchAll<R>((f, t) => supabase.from("attendance_by_section_day").select("section_id, date, present, marked")
    .gte("date", from).lte("date", to).order("date").order("section_id").range(f, t) as unknown as PromiseLike<{ data: R[] | null; error: unknown }>);
  const lines = [["Date", "Section", "Present", "Marked", "Attendance %"].join(",")];
  for (const r of rows) if (name.has(r.section_id)) lines.push([r.date, `"${name.get(r.section_id)}"`, r.present, r.marked, r.marked ? Math.round((r.present / r.marked) * 1000) / 10 : ""].join(","));
  return new Response("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="attendance-${from}-to-${to}.csv"` },
  });
}
