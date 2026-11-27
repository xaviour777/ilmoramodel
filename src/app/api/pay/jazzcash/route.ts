import { NextResponse } from "next/server";
import { createClient as createService } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { jazzVerify } from "@/lib/jazzcash";
import { todayPK } from "@/lib/format";

// JazzCash posts the result here. We trust it only if the signature checks out, then record
// the payment once (the gateway reference is the idempotency key) and send the parent back.
export async function POST(req: Request) {
  const form = await req.formData();
  const f = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const back = (q: string) => NextResponse.redirect(new URL(`/parent/fees?${q}`, req.url), 303);
  if (!process.env.JAZZCASH_INTEGRITY_SALT || !jazzVerify(f)) return back("pay=bad");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return back("pay=setup");
  const sb = createService(SUPABASE_URL, key, { auth: { persistSession: false } });
  const ref = f.pp_TxnRefNo;
  const { data: op } = await sb.from("online_payments").select("*").eq("ref", ref).maybeSingle();
  if (!op) return back("pay=bad");
  if (op.status !== "pending") return back(`pay=${op.status}`);
  const ok = f.pp_ResponseCode === "000" && Number(f.pp_Amount) === Number(op.amount_paisa);
  if (!ok) {
    await sb.from("online_payments").update({ status: "failed", response_code: f.pp_ResponseCode ?? null, response_message: f.pp_ResponseMessage ?? null, finished_at: new Date().toISOString() }).eq("id", op.id).eq("status", "pending");
    return back("pay=failed");
  }
  const tag = `R-${todayPK().slice(2, 4)}${todayPK().slice(5, 7)}-`;
  const { data: last } = await sb.from("payments").select("receipt_no").eq("campus_id", op.campus_id).like("receipt_no", `${tag}%`).order("receipt_no", { ascending: false }).limit(1);
  const receipt = `${tag}${String((Number(last?.[0]?.receipt_no?.slice(tag.length)) || 0) + 1).padStart(5, "0")}`;
  const { data: pay, error } = await sb.from("payments").insert({
    campus_id: op.campus_id, family_id: op.family_id, invoice_id: op.invoice_id, amount_paisa: op.amount_paisa, mode: "jazzcash",
    reference: `JazzCash ${f.pp_RetreivalReferenceNo || ref}`, receipt_no: receipt, idempotency_key: `jc-${ref}`,
  }).select("id").maybeSingle();
  if (error && !error.message.includes("idempotency")) return back("pay=error");
  await sb.from("online_payments").update({ status: "paid", payment_id: pay?.id ?? null, response_code: "000", response_message: f.pp_ResponseMessage ?? null, finished_at: new Date().toISOString() }).eq("id", op.id);
  return back("pay=paid");
}
