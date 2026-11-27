import { loadGroup, pc, rs, type OwnerSearch } from "@/lib/owner";

export const REPORTS: { id: string; title: string; sub: string }[] = [
  { id: "board", title: "Board pack", sub: "One page per campus: students, money, attendance, results, score" },
  { id: "pl", title: "Profit and loss", sub: "Income, costs and net by campus" },
  { id: "aging", title: "Fee aging", sub: "Who owes, and for how long" },
  { id: "payroll", title: "Payroll register", sub: "Every salary in the period" },
  { id: "academic", title: "Academic summary", sub: "Attendance, results and pass rate" },
  { id: "admissions", title: "Admissions", sub: "Inquiries to joined, against target" },
  { id: "tax", title: "Tax pack", sub: "Income and spending totals by head for the accountant" },
  { id: "comparison", title: "Campus comparison", sub: "All campuses side by side, with the score" },
];

// One report as a table. Used by the print page and the Excel (CSV) download.
export async function buildReport(kind: string, sp: OwnerSearch) {
  const g = await loadGroup(sp);
  const meta = REPORTS.find((r) => r.id === kind);
  if (!meta) return null;
  const name = new Map(g.all.map((c) => [c.id, c.name]));
  const ids = new Set(g.sel.map((c) => c.id));
  let head: string[] = [], rows: (string | number)[][] = [];
  if (kind === "board" || kind === "comparison") {
    head = ["Campus", "Principal", "Status", "Students", "Seats used", "Billed", "Collected", "Collection", "Costs", "Profit", "Margin", "Attendance", "Results", "Score"];
    rows = g.sel.map((c) => [c.name, c.principal ?? "", c.status, c.students, pc(c.fill), rs(c.billed), rs(c.collected), pc(c.colRate), rs(c.costs), rs(c.profit), pc(c.margin), pc(c.att, 1), pc(c.results), c.score ?? ""]);
    if (kind === "board") rows.push(["Group", "", "", g.sum((c) => c.students), "", rs(g.sum((c) => c.billed)), rs(g.sum((c) => c.collected)), "", rs(g.sum((c) => c.costs)), rs(g.sum((c) => c.profit)), "", "", "", ""]);
  } else if (kind === "pl" || kind === "tax") {
    const { data } = await g.supabase.rpc("owner_expense_heads", { p_from: g.from, p_to: g.to });
    const H = ((data ?? []) as { campus_id: string; head: string; amount: number }[]).filter((h) => ids.has(h.campus_id));
    const heads = [...new Set(H.map((h) => h.head))].sort();
    head = ["Line", ...g.sel.map((c) => c.name), "Total"];
    const line = (l: string, f: (cid: string) => number) => [l, ...g.sel.map((c) => rs(f(c.id))), rs(g.sel.reduce((t, c) => t + f(c.id), 0))];
    const c = (id: string) => g.sel.find((x) => x.id === id)!;
    rows = [line("Fees received", (id) => c(id).collected), line("Concessions given", (id) => c(id).concessions), line("Salaries", (id) => c(id).payroll),
      ...heads.map((h) => line(h, (id) => H.filter((x) => x.campus_id === id && x.head === h).reduce((t, x) => t + Number(x.amount), 0))),
      line("Total costs", (id) => c(id).costs), line("Net", (id) => c(id).profit)];
  } else if (kind === "aging") {
    const { data } = await g.supabase.rpc("owner_fee_aging");
    head = ["Campus", "Unpaid for", "Families", "Amount"];
    rows = ((data ?? []) as { campus_id: string; bucket: string; families: number; amount: number }[]).filter((r) => ids.has(r.campus_id)).sort((a, b) => (name.get(a.campus_id) ?? "").localeCompare(name.get(b.campus_id) ?? "") || a.bucket.localeCompare(b.bucket))
      .map((r) => [name.get(r.campus_id) ?? "", r.bucket.slice(4), r.families, rs(Number(r.amount))]);
  } else if (kind === "payroll") {
    const [{ data: pay }, { data: staff }] = await Promise.all([
      g.supabase.from("salary_payments").select("campus_id, profile_id, month, basic_paisa, allowance_paisa, bonus_paisa, absence_cut_paisa, advance_cut_paisa, other_cut_paisa, net_paisa, status, paid_on").gte("month", g.from.slice(0, 8) + "01").lte("month", g.to).order("month"),
      g.supabase.rpc("owner_staff"),
    ]);
    const who = new Map(((staff ?? []) as { id: string; full_name: string; role: string }[]).map((p) => [p.id, p]));
    head = ["Month", "Campus", "Name", "Role", "Basic", "Allowance", "Bonus", "Cuts", "Net", "Status", "Paid on"];
    rows = (pay ?? []).filter((p) => ids.has(p.campus_id)).map((p) => [p.month.slice(0, 7), name.get(p.campus_id) ?? "", who.get(p.profile_id)?.full_name ?? "", who.get(p.profile_id)?.role ?? "",
      rs(p.basic_paisa), rs(p.allowance_paisa), rs(p.bonus_paisa), rs(Number(p.absence_cut_paisa) + Number(p.advance_cut_paisa) + Number(p.other_cut_paisa)), rs(p.net_paisa), p.status, p.paid_on ?? ""]);
  } else if (kind === "academic") {
    head = ["Campus", "Students", "Attendance", "Average result", "Pass rate"];
    rows = g.sel.map((c) => [c.name, c.students, pc(c.att, 1), pc(c.results), pc(c.pass)]);
  } else if (kind === "admissions") {
    head = ["Campus", "Inquiries", "Tests", "Offers", "Joined", "Target", "Reached"];
    rows = g.sel.map((c) => [c.name, c.inquiries, c.tests, c.offers, c.joined, c.target ?? "", c.target ? pc(c.joined / c.target) : ""]);
  }
  return { meta, head, rows, g };
}
