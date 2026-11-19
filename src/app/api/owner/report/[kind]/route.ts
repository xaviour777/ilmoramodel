import { NextResponse } from "next/server";
import { getMe } from "@/lib/me";
import { buildReport } from "@/lib/owner-reports";

// Excel download: the report as a CSV file (opens in Excel).
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const me = await getMe();
  if (me.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const u = new URL(req.url);
  const r = await buildReport((await params).kind, { c: u.searchParams.get("c") ?? undefined, p: u.searchParams.get("p") ?? undefined });
  if (!r) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [r.head, ...r.rows].map((row) => row.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.meta.id}-${r.g.from}-${r.g.to}.csv"` } });
}
