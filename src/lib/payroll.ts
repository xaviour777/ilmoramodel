// Salary sums. Money is in paisa, like the rest of Ilmora.

export type Advance = { id: string; amount_paisa: number; monthly_cut_paisa: number; given_on: string };

// Past salary cuts pay off the oldest advance first. Returns what is still owed on each,
// and how much to take back this month (each advance's monthly part, never more than it still owes).
export function advanceState(advances: Advance[], cutSoFar: number) {
  let paid = cutSoFar;
  const rows = [...advances].sort((a, b) => a.given_on.localeCompare(b.given_on)).map((a) => {
    const back = Math.min(paid, Number(a.amount_paisa));
    paid -= back;
    return { ...a, left: Number(a.amount_paisa) - back };
  });
  const owed = rows.reduce((t, r) => t + r.left, 0);
  const dueNow = rows.reduce((t, r) => t + Math.min(r.left, Number(r.monthly_cut_paisa) || r.left), 0);
  return { rows, owed, dueNow };
}

// Absent days are cut at basic / 30 a day, the usual private-school rule.
export function salaryFor(p: { basic: number; allowance: number; bonus?: number; absentDays: number; cutAbsence: boolean; otherCut?: number; advanceCut: number }) {
  const absence = p.cutAbsence ? Math.round((p.basic / 30) * p.absentDays) : 0;
  const gross = p.basic + p.allowance + (p.bonus ?? 0);
  const net = Math.max(0, gross - absence - (p.otherCut ?? 0) - p.advanceCut);
  return { absence, net };
}

export const PAY_MODE: Record<string, string> = { bank: "Bank transfer", cash: "Cash", jazzcash: "JazzCash", easypaisa: "Easypaisa" };
