import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_MODES } from "@/lib/expense-categories";
import { loadCategories, loadExpenses, monthRange } from "@/lib/expenses";

// The month's expense ledger as a CSV that opens in Excel.
export async function GET(req: Request) {
  await requireRole("accountant", "principal", "owner");
  const m = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return new Response("Choose a month", { status: 400 });
  const supabase = await createClient();
  const [from, to] = monthRange(m);
  const [cats, list] = await Promise.all([loadCategories(supabase), loadExpenses(supabase, from, to)]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "Voucher", "Group", "Category", "Paid to", "Paid by", "Reference", "Amount (Rs)", "Note", "Voided", "Void reason"];
  const lines = [...list].reverse().map((e) => {
    const c = cats.byId.get(e.category_id);
    const g = c?.parent_id ? cats.byId.get(c.parent_id) : c;
    return [e.spent_on, e.voucher_no, g?.name, c?.parent_id ? c.name : "", e.paid_to, EXPENSE_MODES[e.mode], e.reference,
      (Number(e.amount_paisa) / 100).toFixed(0), e.note, e.voided ? "Yes" : "", e.void_reason].map(esc).join(",");
  });
  return new Response("﻿" + [head.map(esc).join(","), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="expenses-${m}.csv"` },
  });
}
