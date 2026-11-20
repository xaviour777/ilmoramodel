import { NextResponse } from "next/server";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { REPORT } from "@/lib/reports/catalog";
import { readFilters, runReport, toCsv, visibleCols } from "@/lib/reports/run";

// Report Center download: the report as a CSV file (opens in Excel), with the same filters.
export async function GET(req: Request) {
  const me = await getMe();
  if (!["principal", "owner", "accountant"].includes(me.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const r = REPORT.get(sp.r ?? "");
  if (!r || r.link) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const supabase = await createClient();
  const f = readFilters(r, sp);
  const { rows, error } = await runReport(supabase, r, f);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await supabase.from("report_runs").insert({ report_id: r.id, filters: f, via: "csv", row_count: rows.length });
  const stamp = [f.from, f.to ?? f.month?.slice(0, 7)].filter(Boolean).join("_") || new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(visibleCols(r, f, rows), rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.id}-${stamp}.csv"` },
  });
}
